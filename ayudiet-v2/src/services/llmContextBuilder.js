const toArray = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  const text = String(value || "").trim();
  if (!text) return [];

  return text
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeRiskFlags = (riskConditions = []) => {
  if (!Array.isArray(riskConditions) || riskConditions.length === 0) {
    return ["none"];
  }

  const normalized = riskConditions
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);

  return normalized.length ? [...new Set(normalized)] : ["none"];
};

const buildLlmContext = ({ userProfile = {}, healthProfile = {} } = {}) => {
  const planningInputs = userProfile?.planningInputs || {};
  const schedule = planningInputs?.mealTimings || {};
  const risks = normalizeRiskFlags(healthProfile?.riskConditions || []);

  return {
    calories: healthProfile?.targets?.calorieTargetKcal ?? null,
    protein: healthProfile?.targets?.proteinTargetGrams ?? null,
    goal:
      planningInputs?.primaryGoal ||
      healthProfile?.inputs?.goal ||
      "general wellness",
    conditions: {
      medical: toArray(userProfile?.conditions),
      riskFlags: risks,
      allergies: toArray(userProfile?.allergies),
      medications: toArray(userProfile?.medications),
    },
    preferences: {
      dietType: userProfile?.dietType ?? null,
      foods: Array.isArray(userProfile?.preferences) ? userProfile.preferences : [],
      dominantDosha: userProfile?.dominantDosha ?? null,
      bloodGroup: userProfile?.bloodGroup ?? null,
      budgetTier: planningInputs?.budgetTier ?? "low",
      localRegion: planningInputs?.localRegion ?? null,
    },
    schedule: {
      mealPattern: planningInputs?.mealPattern ?? null,
      timings: {
        wakeUpTime: schedule?.wakeUpTime ?? null,
        breakfastTime: schedule?.breakfastTime ?? null,
        lunchTime: schedule?.lunchTime ?? null,
        eveningSnackTime: schedule?.eveningSnackTime ?? null,
        dinnerTime: schedule?.dinnerTime ?? null,
        bedTime: schedule?.bedTime ?? null,
      },
      sleepHours: planningInputs?.sleepHours ?? null,
      stressLevel: planningInputs?.stressLevel ?? null,
      waterIntakeLiters: planningInputs?.waterIntakeLiters ?? null,
      activityLevel: userProfile?.activityLevel?.level ?? null,
      activityMultiplier: userProfile?.activityLevel?.multiplier ?? null,
    },
    body: {
      age: userProfile?.age ?? null,
      gender: userProfile?.gender ?? null,
      heightCm: userProfile?.heightCm ?? null,
      weightKg: userProfile?.weightKg ?? null,
      bmi: healthProfile?.metrics?.bmi ?? userProfile?.bmi ?? null,
      bmiCategory: healthProfile?.metrics?.bmiCategory ?? null,
      bmrKcal: healthProfile?.metrics?.bmrKcal ?? null,
      tdeeKcal: healthProfile?.metrics?.tdeeKcal ?? null,
    },
    targets: {
      targetWeightKg: planningInputs?.targetWeightKg ?? null,
      timeframeWeeks: planningInputs?.timeframeWeeks ?? null,
    },
    metadata: {
      dataCompleteness: healthProfile?.dataCompleteness ?? null,
      generatedAt: new Date().toISOString(),
    },
  };
};

module.exports = {
  buildLlmContext,
};
