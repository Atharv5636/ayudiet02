const Patient = require("../models/patient.model");
const Plan = require("../models/plan.model");
const ProgressLog = require("../models/progressLog.model");

const MAX_PLAN_HISTORY = 40;
const MAX_PREFERENCE_HISTORY = 40;
const MAX_ADHERENCE_HISTORY = 80;

const safeMeal = (value = "") => String(value || "").trim().slice(0, 120);

const compactMealsPreview = (meals = []) => {
  const first = Array.isArray(meals) && meals.length ? meals[0] : {};
  return {
    breakfast: safeMeal(first?.breakfast),
    lunch: safeMeal(first?.lunch),
    dinner: safeMeal(first?.dinner),
  };
};

const trimHistory = (arr = [], max = 20) => {
  if (!Array.isArray(arr)) return [];
  if (arr.length <= max) return arr;
  return arr.slice(arr.length - max);
};

const trackPreferenceSnapshot = async ({
  patientId,
  patientData = {},
  source = "profile_update",
}) => {
  if (!patientId) return;

  const entry = {
    dietType: patientData?.dietType || undefined,
    activityLevel: patientData?.activityLevel || undefined,
    preferences: Array.isArray(patientData?.preferences) ? patientData.preferences : [],
    planningInputs: {
      primaryGoal: patientData?.planningInputs?.primaryGoal || undefined,
      targetWeight: patientData?.planningInputs?.targetWeight || undefined,
      timeframeWeeks: patientData?.planningInputs?.timeframeWeeks || undefined,
      mealPattern: patientData?.planningInputs?.mealPattern || undefined,
      sleepHours: patientData?.planningInputs?.sleepHours || undefined,
      stressLevel: patientData?.planningInputs?.stressLevel || undefined,
      waterIntakeLiters: patientData?.planningInputs?.waterIntakeLiters || undefined,
      budgetTier: patientData?.planningInputs?.budgetTier || undefined,
      localRegion: patientData?.planningInputs?.localRegion || undefined,
    },
    source,
    trackedAt: new Date(),
  };

  const patient = await Patient.findById(patientId).select("preferenceHistory");
  if (!patient) return;

  patient.preferenceHistory = trimHistory(
    [...(patient.preferenceHistory || []), entry],
    MAX_PREFERENCE_HISTORY
  );
  await patient.save();
};

const trackPlanSnapshot = async ({
  patientId,
  plan = {},
  source = "plan_saved",
  generationSource = "",
}) => {
  if (!patientId) return;

  const entry = {
    planId: plan?._id || undefined,
    title: String(plan?.title || "").trim() || undefined,
    goal: String(plan?.goal || "").trim() || undefined,
    doshaType: String(plan?.doshaType || "").trim() || undefined,
    generationSource: String(generationSource || source || "").trim() || undefined,
    status: String(plan?.status || "").trim() || undefined,
    isActive: Boolean(plan?.isActive),
    mealsPreview: compactMealsPreview(plan?.meals || []),
    trackedAt: new Date(),
  };

  const patient = await Patient.findById(patientId).select("planHistory");
  if (!patient) return;

  patient.planHistory = trimHistory(
    [...(patient.planHistory || []), entry],
    MAX_PLAN_HISTORY
  );
  await patient.save();
};

const trackAdherenceFeedback = async ({ patientId, progressLog = {} }) => {
  if (!patientId) return;

  const entry = {
    planId: progressLog?.plan || undefined,
    adherence:
      typeof progressLog?.adherence === "number" ? progressLog.adherence : undefined,
    energyLevel:
      typeof progressLog?.energyLevel === "number" ? progressLog.energyLevel : undefined,
    digestion: String(progressLog?.digestion || "").trim() || undefined,
    digestionDetail: String(progressLog?.digestionDetail || "").trim() || undefined,
    note: String(progressLog?.notes || "").trim() || undefined,
    recordedAt: progressLog?.recordedAt || new Date(),
  };

  const patient = await Patient.findById(patientId).select("adherenceHistory");
  if (!patient) return;

  patient.adherenceHistory = trimHistory(
    [...(patient.adherenceHistory || []), entry],
    MAX_ADHERENCE_HISTORY
  );
  await patient.save();
};

const topMealsFromPlans = (plans = [], limit = 6) => {
  const frequency = new Map();
  plans.forEach((plan) => {
    (plan?.meals || []).forEach((day) => {
      ["breakfast", "lunch", "dinner"].forEach((slot) => {
        const meal = String(day?.[slot] || "").trim();
        if (!meal) return;
        const key = meal.toLowerCase();
        frequency.set(key, (frequency.get(key) || 0) + 1);
      });
    });
  });

  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
};

const average = (values = []) =>
  values.length
    ? Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2))
    : null;

const buildPatientHistoryProfile = async (patientId) => {
  if (!patientId) {
    return {
      hasHistory: false,
      summaryText: "No prior history available.",
    };
  }

  const [recentPlans, recentLogs, patient] = await Promise.all([
    Plan.find({ patient: patientId })
      .sort({ createdAt: -1 })
      .limit(8)
      .select("goal doshaType meals createdAt status isActive")
      .lean(),
    ProgressLog.find({ patient: patientId })
      .sort({ recordedAt: -1, createdAt: -1 })
      .limit(20)
      .select("adherence energyLevel digestion digestionDetail notes recordedAt")
      .lean(),
    Patient.findById(patientId)
      .select("preferences dietType planningInputs preferenceHistory planHistory adherenceHistory")
      .lean(),
  ]);

  const avgAdherence = average(
    recentLogs
      .map((log) => log?.adherence)
      .filter((value) => typeof value === "number")
  );
  const avgEnergy = average(
    recentLogs
      .map((log) => log?.energyLevel)
      .filter((value) => typeof value === "number")
  );
  const digestionIssues = recentLogs.filter((log) =>
    ["bad", "bloating", "acidity", "constipation", "loose stools", "mixed"].includes(
      String(log?.digestionDetail || log?.digestion || "").toLowerCase()
    )
  ).length;

  const frequentMeals = topMealsFromPlans(recentPlans, 6);
  const activePreferences = Array.isArray(patient?.preferences) ? patient.preferences : [];
  const primaryGoal = String(patient?.planningInputs?.primaryGoal || "").trim();
  const budgetTier = String(patient?.planningInputs?.budgetTier || "low").trim();
  const localRegion = String(patient?.planningInputs?.localRegion || "pan_india").trim();

  const summaryText = [
    `History snapshot: ${recentPlans.length} prior plans, ${recentLogs.length} recent feedback logs.`,
    `Average adherence: ${avgAdherence ?? "n/a"}%. Average energy: ${avgEnergy ?? "n/a"}.`,
    `Recent digestion issue count: ${digestionIssues}.`,
    `Top recurring meals: ${
      frequentMeals.length
        ? frequentMeals.map((item) => `${item.name} (${item.count})`).join(", ")
        : "none"
    }.`,
    `Current stored preferences: ${
      activePreferences.length ? activePreferences.join(", ") : "none"
    }.`,
    `Budget/local preference: ${budgetTier}/${localRegion}.`,
    `Primary goal trend: ${primaryGoal || "not set"}.`,
  ].join(" ");

  return {
    hasHistory: Boolean(recentPlans.length || recentLogs.length),
    stats: {
      previousPlansCount: recentPlans.length,
      recentFeedbackCount: recentLogs.length,
      avgAdherence,
      avgEnergy,
      digestionIssues,
    },
    frequentMeals,
    activePreferences,
    summaryText,
  };
};

module.exports = {
  buildPatientHistoryProfile,
  trackAdherenceFeedback,
  trackPlanSnapshot,
  trackPreferenceSnapshot,
};
