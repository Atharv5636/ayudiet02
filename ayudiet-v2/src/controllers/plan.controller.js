const mongoose = require("mongoose");
const Plan = require("../models/plan.model");
const Patient = require("../models/patient.model");
const ProgressLog = require("../models/progressLog.model");
const ApiError = require("../utils/ApiError");
const { validatePlan, fixPlan } = require("../utils/planValidation");
const {
  modifyPlanBasedOnProgress,
} = require("../services/adaptivePlanService");
const foods = require("../data/foods.json");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const normalizeMeals = (meals = []) =>
  meals.map((meal, index) => ({
    day: meal?.day?.trim() || `Day ${index + 1}`,
    breakfast: meal?.breakfast?.trim() || "",
    lunch: meal?.lunch?.trim() || "",
    dinner: meal?.dinner?.trim() || "",
  }));

const hasAtLeastOneMeal = (mealDay) =>
  Boolean(mealDay.breakfast || mealDay.lunch || mealDay.dinner);

const validatePlanPayload = ({
  patient,
  title,
  doshaType,
  reviewDueDate,
  meals,
  requirePatient = true,
}) => {
  if (
    (requirePatient && !patient) ||
    !title ||
    !doshaType ||
    !reviewDueDate ||
    meals === undefined
  ) {
    throw new ApiError(400, "All fields are required");
  }

  if (requirePatient && !isValidObjectId(patient)) {
    throw new ApiError(400, "Invalid patient id");
  }

  if (!title.trim()) {
    throw new ApiError(400, "Title is required");
  }

  if (!Array.isArray(meals) || meals.length === 0) {
    throw new ApiError(400, "At least one day is required");
  }

  const normalizedMeals = normalizeMeals(meals);
  if (normalizedMeals.some((mealDay) => !hasAtLeastOneMeal(mealDay))) {
    throw new ApiError(400, "Each day must include at least one meal");
  }

  const parsedReviewDueDate = new Date(reviewDueDate);
  if (Number.isNaN(parsedReviewDueDate.getTime())) {
    throw new ApiError(400, "Invalid review due date");
  }

  return {
    title: title.trim(),
    doshaType,
    reviewDueDate: parsedReviewDueDate,
    meals: normalizedMeals,
  };
};

const getRelevantFoods = (goal, doshaType) => {
  const normalizedGoal = goal.trim().toLowerCase();
  const matches = foods.filter(
    (food) =>
      food.dosha.includes(doshaType) &&
      (food.goals.includes(normalizedGoal) ||
        food.goals.includes("general wellness"))
  );

  return matches.slice(0, 5);
};

const buildFoodGrounding = (relevantFoods) =>
  relevantFoods
    .map(
      (food) =>
        `- ${food.name} (${food.mealTypes.join(", ")}): ${food.notes}`
    )
    .join("\n");

const buildPatientSummary = (patient, goal, doshaType) => ({
  age: patient.age || "Not recorded",
  weight: patient.weight || "Not recorded",
  gender: patient.gender || "Not recorded",
  conditions: patient.healthConditions || "None reported",
  allergies: patient.allergies || "None reported",
  dominantDosha: patient.prakriti?.dominantDosha || patient.dosha || "Not recorded",
  goal,
  doshaType,
});

const getRecentProgressLogs = async (patientId, doctorId, patient) => {
  const collectionLogs = await ProgressLog.find({
    patient: patientId,
    doctor: doctorId,
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  if (collectionLogs.length) {
    return collectionLogs;
  }

  return [...(patient.progressLogs || [])]
    .sort(
      (left, right) =>
        new Date(right.recordedAt || 0).getTime() -
        new Date(left.recordedAt || 0).getTime()
    )
    .slice(0, 5);
};

const average = (values = []) =>
  values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;

const buildProgressInsights = (progressLogs = [], goal = "") => {
  if (!progressLogs.length) {
    return {
      insights: ["No recent progress logs available"],
      adjustments: ["Use standard balanced meals and monitor progress closely"],
    };
  }

  const orderedLogs = [...progressLogs].sort(
    (left, right) =>
      new Date(left.createdAt || left.recordedAt || 0).getTime() -
      new Date(right.createdAt || right.recordedAt || 0).getTime()
  );
  const weightLogs = orderedLogs.filter((log) => typeof log.weight === "number");
  const firstWeight = weightLogs[0]?.weight;
  const lastWeight = weightLogs[weightLogs.length - 1]?.weight;
  const directWeightDelta =
    typeof firstWeight === "number" && typeof lastWeight === "number"
      ? Number((lastWeight - firstWeight).toFixed(1))
      : null;
  const recentWeightLogs = weightLogs.slice(-3);
  const previousWeightLogs =
    weightLogs.length > 3 ? weightLogs.slice(0, Math.max(weightLogs.length - 3, 1)) : weightLogs.slice(0, -1);
  const avgRecentWeight = average(recentWeightLogs.map((log) => log.weight));
  const avgPreviousWeight = average(previousWeightLogs.map((log) => log.weight));
  const smoothedWeightDelta =
    typeof avgRecentWeight === "number" && typeof avgPreviousWeight === "number"
      ? Number((avgRecentWeight - avgPreviousWeight).toFixed(1))
      : directWeightDelta;

  const energyLogs = orderedLogs.filter(
    (log) => typeof log.energyLevel === "number"
  );
  const previousEnergyLogs =
    energyLogs.length > 3 ? energyLogs.slice(0, Math.max(energyLogs.length - 3, 1)) : energyLogs.slice(0, -1);
  const recentEnergyLogs = energyLogs.slice(-3);
  const adherenceLogs = orderedLogs.filter(
    (log) => typeof log.adherence === "boolean"
  );

  const averageEnergy = average(energyLogs.map((log) => log.energyLevel));
  const previousAverageEnergy = average(
    previousEnergyLogs.map((log) => log.energyLevel)
  );
  const recentAverageEnergy = average(
    recentEnergyLogs.map((log) => log.energyLevel)
  );
  const adherenceRate = adherenceLogs.length
    ? adherenceLogs.filter((log) => log.adherence).length / adherenceLogs.length
    : null;

  const insights = [];
  const adjustments = [];

  if (smoothedWeightDelta !== null) {
    if (smoothedWeightDelta > 1) {
      insights.push("Patient is gaining weight unexpectedly");
    } else if (smoothedWeightDelta < -1) {
      insights.push("Weight is decreasing");
    } else if (goal === "weight loss") {
      insights.push("Weight loss is slow");
    }
  }

  if (recentAverageEnergy !== null) {
    if (recentAverageEnergy <= 2.5) {
      insights.push("Energy levels are low");
      adjustments.push("Add more balanced meals with steady energy");
    } else if (
      previousAverageEnergy !== null &&
      recentAverageEnergy > previousAverageEnergy
    ) {
      insights.push("Energy levels are improving");
    } else if (averageEnergy >= 4) {
      insights.push("Energy levels are stable");
    }
  }

  if (adherenceRate !== null) {
    if (adherenceRate < 0.5) {
      insights.push("Patient not following plan consistently");
      adjustments.push("Simplify meals and reduce preparation complexity");
    } else if (adherenceRate < 0.8) {
      insights.push("Adherence is moderate");
      adjustments.push("Keep meals simple and easy to repeat");
    } else {
      insights.push("Adherence is strong");
    }
  }

  if (insights.includes("Weight loss is slow")) {
    adjustments.push("Reduce refined carbs and increase protein");
  }

  if (!insights.length) {
    insights.push("Progress signals are limited");
  }

  if (!adjustments.length) {
    adjustments.push("Keep the plan balanced and easy to follow");
  }

  return { insights, adjustments };
};

const buildPersonalizedPrompt = (
  patient,
  goal,
  doshaType,
  relevantFoods,
  progressSummary
) => {
  const summary = buildPatientSummary(patient, goal, doshaType);

  return `
Generate a 3-day Ayurvedic diet plan for:

Age: ${summary.age}
Weight: ${summary.weight} kg
Gender: ${summary.gender}
Goal: ${summary.goal}
Dosha: ${summary.doshaType}
Conditions: ${summary.conditions}
Allergies: ${summary.allergies}

Recent progress insights:
${progressSummary.insights.map((insight) => `- ${insight}`).join("\n")}

Adjust diet based on:
${progressSummary.adjustments.map((adjustment) => `- ${adjustment}`).join("\n")}

Use ONLY the following foods:
${buildFoodGrounding(relevantFoods)}

Rules:
- Balanced meals
- Include protein daily
- Avoid repetition across days
- Follow dosha-specific restrictions strictly
- Keep the plan Ayurvedic compliant
- Do NOT introduce foods outside the provided list
- Return exactly 3 days

Output format:
Return STRICT JSON only:
[
  {
    "day": "Day 1",
    "breakfast": "...",
    "lunch": "...",
    "dinner": "..."
  }
]`.trim();
};

const getPersonalizationSeed = (patient, goal, doshaType) =>
  [
    patient.age || "",
    patient.weight || "",
    patient.gender || "",
    patient.healthConditions || "",
    patient.allergies || "",
    goal || "",
    doshaType || "",
  ]
    .join("|")
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0);

const createMockMeals = (patient, goal, doshaType, relevantFoods) => {
  const picks = relevantFoods.length ? relevantFoods : getRelevantFoods(goal, doshaType);
  const personalizationSeed = getPersonalizationSeed(patient, goal, doshaType);
  const choose = (index, mealType) => {
    const offset = (personalizationSeed + index) % Math.max(picks.length, 1);
    return (
      picks.find(
        (food) =>
          food.mealTypes.includes(mealType) &&
          food.name !== picks[offset % picks.length]?.name
      ) || picks[offset % picks.length]
    );
  };

  return [0, 1, 2].map((index) => ({
    day: `Day ${index + 1}`,
    breakfast: choose(index, "breakfast")?.name || "stewed fruit",
    lunch: choose(index + 1, "lunch")?.name || "moong dal khichdi",
    dinner: choose(index + 2, "dinner")?.name || "moong soup",
  }));
};

const parseAiMeals = (content) => {
  try {
    const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const normalizedMeals = normalizeMeals(parsed);

    if (
      !Array.isArray(parsed) ||
      normalizedMeals.length === 0 ||
      normalizedMeals.some((mealDay) => !hasAtLeastOneMeal(mealDay))
    ) {
      return null;
    }

    return normalizedMeals;
  } catch {
    return null;
  }
};

const generateMealsWithAi = async (patient, goal, doshaType, progressSummary) => {
  const relevantFoods = getRelevantFoods(goal, doshaType);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!relevantFoods.length) {
    return createMockMeals(patient, goal, doshaType, []);
  }

  if (!apiKey) {
    return createMockMeals(patient, goal, doshaType, relevantFoods);
  }

  const prompt = buildPersonalizedPrompt(
    patient,
    goal,
    doshaType,
    relevantFoods,
    progressSummary
  );

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are an Ayurvedic diet planner. Return valid JSON only, keep formatting consistent, and use only the supplied foods while tailoring the meals to the patient profile.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      return createMockMeals(patient, goal, doshaType, relevantFoods);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    return parseAiMeals(content) || createMockMeals(patient, goal, doshaType, relevantFoods);
  } catch {
    return createMockMeals(patient, goal, doshaType, relevantFoods);
  }
};

const buildAiResponse = (
  meals,
  patient,
  goal,
  doshaType,
  relevantFoods,
  progressSummary
) => ({
  success: true,
  foods: relevantFoods,
  meals,
  validation: validatePlan(meals, doshaType),
  patientContext: buildPatientSummary(patient, goal, doshaType),
  progressInsights: progressSummary.insights,
});

const ensureAnalysisInResponse = (plan) => {
  if (!plan) {
    return plan;
  }

  const normalizedPlan =
    typeof plan.toObject === "function" ? plan.toObject() : { ...plan };

  if (!normalizedPlan.analysis) {
    normalizedPlan.analysis = null;
  }

  return normalizedPlan;
};

const logOutgoingPlan = (plan) => {
  console.log("Sending plan:", plan);
};

const isValidAnalysisCache = (analysis) =>
  Boolean(
    analysis &&
      typeof analysis === "object" &&
      analysis.effectiveness &&
      typeof analysis.effectiveness.score === "number" &&
      typeof analysis.effectiveness.level === "string" &&
      analysis.effectivenessTrend &&
      typeof analysis.effectivenessTrend.trend === "string" &&
      typeof analysis.primaryIssue === "string" &&
      analysis.computedAt
  );

const ANALYSIS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const isAnalysisStale = (analysis) => {
  const computedAt = analysis?.computedAt
    ? new Date(analysis.computedAt).getTime()
    : Number.NaN;

  if (!Number.isFinite(computedAt)) {
    return true;
  }

  return computedAt < Date.now() - ANALYSIS_MAX_AGE_MS;
};

const persistPlanAnalysis = async (planId, analysis) => {
  if (!planId || !analysis) {
    return null;
  }

  return Plan.findByIdAndUpdate(
    planId,
    {
      $set: {
        analysis,
      },
    },
    {
      new: true,
      strict: false,
    }
  );
};

const computeAndPersistPlanAnalysis = async (plan) => {
  if (!plan) {
    return plan;
  }

  const normalizedPlan =
    typeof plan.toObject === "function" ? plan.toObject() : { ...plan };
  const patientId = normalizedPlan.patient?._id || normalizedPlan.patient;

  if (!patientId) {
    normalizedPlan.analysis = normalizedPlan.analysis || null;
    return normalizedPlan;
  }

  console.log("Computing new analysis");
  const analysisResult = await modifyPlanBasedOnProgress(patientId);
  const analysisWithTimestamp = {
    ...(analysisResult?.analysis || {}),
    computedAt: new Date(),
  };

  normalizedPlan.analysis = analysisWithTimestamp;
  await persistPlanAnalysis(normalizedPlan._id, analysisWithTimestamp);
  console.log("Sending plan analysis:", normalizedPlan.analysis);

  return normalizedPlan;
};

const attachAnalysisToPlan = async (
  plan,
  { forceCompute = false } = {}
) => {
  if (!plan) {
    return plan;
  }

  const normalizedPlan =
    typeof plan.toObject === "function" ? plan.toObject() : { ...plan };

  if (
    !forceCompute &&
    isValidAnalysisCache(normalizedPlan.analysis) &&
    !isAnalysisStale(normalizedPlan.analysis)
  ) {
    console.log("Using cached analysis");
    console.log("Sending plan analysis:", normalizedPlan.analysis);
    return normalizedPlan;
  }

  if (
    !forceCompute &&
    normalizedPlan.analysis &&
    (!isValidAnalysisCache(normalizedPlan.analysis) ||
      isAnalysisStale(normalizedPlan.analysis))
  ) {
    console.log("Computing new analysis");
    return computeAndPersistPlanAnalysis(normalizedPlan);
  }

  try {
    return computeAndPersistPlanAnalysis(normalizedPlan);
  } catch (error) {
    normalizedPlan.analysis = normalizedPlan.analysis || null;
    console.log("Sending plan analysis:", normalizedPlan.analysis);
    return normalizedPlan;
  }
};

const attachAnalysisToPlans = async (plans = [], options = {}) =>
  Promise.all(plans.map((plan) => attachAnalysisToPlan(plan, options)));

const getPendingPlans = async (req, res, next) => {
  try {
    const plans = await Plan.find({
      doctor: req.user.id,
      status: "pending",
    })
      .populate("patient", "name age gender")
      .sort({ reviewDueDate: 1 });

    const plansWithAnalysis = (await attachAnalysisToPlans(plans)).map(
      ensureAnalysisInResponse
    );
    plansWithAnalysis.forEach(logOutgoingPlan);

    res.status(200).json({
      success: true,
      count: plansWithAnalysis.length,
      plans: plansWithAnalysis,
    });
  } catch (error) {
    next(error);
  }
};

const generateAiPlan = async (req, res, next) => {
  try {
    const { patientId, goal, doshaType } = req.body;

    if (!patientId || !goal || !doshaType) {
      return next(
        new ApiError(400, "patientId, goal, and doshaType are required")
      );
    }

    if (!isValidObjectId(patientId)) {
      return next(new ApiError(400, "Invalid patient id"));
    }

    const patient = await Patient.findOne({
      _id: patientId,
      doctor: req.user.id,
    });

    if (!patient) {
      return next(new ApiError(404, "Patient not found"));
    }

    const normalizedGoal = goal.trim();
    const relevantFoods = getRelevantFoods(normalizedGoal, doshaType);
    const progressLogs = await getRecentProgressLogs(patientId, req.user.id, patient);
    const progressSummary = buildProgressInsights(progressLogs, normalizedGoal);
    const meals = await generateMealsWithAi(
      patient,
      normalizedGoal,
      doshaType,
      progressSummary
    );

    res
      .status(200)
      .json(
        buildAiResponse(
          meals,
          patient,
          normalizedGoal,
          doshaType,
          relevantFoods,
          progressSummary
        )
      );
  } catch (error) {
    next(error);
  }
};

const generateAiDay = async (req, res, next) => {
  try {
    const { dayNumber, patientId, goal, doshaType } = req.body;

    if (!dayNumber || !patientId || !goal || !doshaType) {
      return next(
        new ApiError(
          400,
          "dayNumber, patientId, goal, and doshaType are required"
        )
      );
    }

    if (!isValidObjectId(patientId)) {
      return next(new ApiError(400, "Invalid patient id"));
    }

    const patient = await Patient.findOne({
      _id: patientId,
      doctor: req.user.id,
    });

    if (!patient) {
      return next(new ApiError(404, "Patient not found"));
    }

    const normalizedGoal = goal.trim();
    const relevantFoods = getRelevantFoods(normalizedGoal, doshaType);
    const progressLogs = await getRecentProgressLogs(patientId, req.user.id, patient);
    const progressSummary = buildProgressInsights(progressLogs, normalizedGoal);
    const meals = await generateMealsWithAi(
      patient,
      normalizedGoal,
      doshaType,
      progressSummary
    );
    const dayIndex = Number(dayNumber) - 1;
    const fallbackDay = {
      day: `Day ${dayNumber}`,
      breakfast: "",
      lunch: "",
      dinner: "",
    };
    const dayMeal = meals[dayIndex] || { ...fallbackDay, ...meals[0] };

    res.status(200).json({
      success: true,
      foods: relevantFoods,
      day: {
        day: dayMeal.day || fallbackDay.day,
        breakfast: dayMeal.breakfast || "",
        lunch: dayMeal.lunch || "",
        dinner: dayMeal.dinner || "",
      },
      validation: validatePlan(
        [
          {
            day: dayMeal.day || fallbackDay.day,
            breakfast: dayMeal.breakfast || "",
            lunch: dayMeal.lunch || "",
            dinner: dayMeal.dinner || "",
          },
        ],
        doshaType
      ),
    });
  } catch (error) {
    next(error);
  }
};

const fixAiPlan = async (req, res, next) => {
  try {
    const { meals, doshaType } = req.body;

    if (!Array.isArray(meals) || !meals.length || !doshaType) {
      return next(new ApiError(400, "meals and doshaType are required"));
    }

    const normalizedMeals = normalizeMeals(meals);
    if (normalizedMeals.some((mealDay) => !hasAtLeastOneMeal(mealDay))) {
      return next(new ApiError(400, "Each day must include at least one meal"));
    }

    const validation = validatePlan(normalizedMeals, doshaType);
    const { improvedMeals, changes, validation: improvedValidation } = fixPlan(
      normalizedMeals,
      validation.issues,
      doshaType
    );

    res.status(200).json({
      success: true,
      improvedMeals,
      changes,
      validation: improvedValidation,
    });
  } catch (error) {
    next(error);
  }
};

const approvePlan = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return next(new ApiError(400, "Invalid plan id"));
    }

    const plan = await Plan.findOne({
      _id: req.params.id,
      doctor: req.user.id,
    });

    if (!plan) {
      return next(new ApiError(404, "Plan not found"));
    }

    await Plan.updateMany(
      { patient: plan.patient, isActive: true },
      { $set: { isActive: false } }
    );

    plan.status = "approved";
    plan.isActive = true;

    await plan.save();
    await plan.populate("patient", "name age gender");
    const planWithAnalysis = ensureAnalysisInResponse(
      await attachAnalysisToPlan(plan, {
        forceCompute: true,
      })
    );
    logOutgoingPlan(planWithAnalysis);

    res.status(200).json({
      success: true,
      message: "Plan approved successfully",
      plan: planWithAnalysis,
    });
  } catch (error) {
    next(error);
  }
};

const createPlan = async (req, res, next) => {
  try {
    const doctorId = req.user.id;
    const { patient, title, startDate, doshaType, reviewDueDate, meals } =
      req.body;

    const validatedPayload = validatePlanPayload({
      patient,
      title,
      doshaType,
      reviewDueDate,
      meals,
      requirePatient: true,
    });

    const parsedStartDate = startDate ? new Date(startDate) : new Date();
    if (Number.isNaN(parsedStartDate.getTime())) {
      return next(new ApiError(400, "Invalid start date"));
    }

    const plan = await Plan.create({
      doctor: doctorId,
      patient,
      startDate: parsedStartDate,
      status: "pending",
      isActive: false,
      ...validatedPayload,
    });

    await plan.populate("patient", "name age gender");
    const planWithAnalysis = ensureAnalysisInResponse(
      await attachAnalysisToPlan(plan, {
        forceCompute: true,
      })
    );
    logOutgoingPlan(planWithAnalysis);

    res.status(201).json({
      success: true,
      plan: planWithAnalysis,
    });
  } catch (error) {
    next(error);
  }
};

const updatePlan = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return next(new ApiError(400, "Invalid plan id"));
    }

    const plan = await Plan.findOne({
      _id: req.params.id,
      doctor: req.user.id,
    });

    if (!plan) {
      return next(new ApiError(404, "Plan not found"));
    }

    const { title, doshaType, reviewDueDate, meals } = req.body;
    const validatedPayload = validatePlanPayload({
      title,
      doshaType,
      reviewDueDate,
      meals,
      requirePatient: false,
    });

    plan.title = validatedPayload.title;
    plan.doshaType = validatedPayload.doshaType;
    plan.reviewDueDate = validatedPayload.reviewDueDate;
    plan.meals = validatedPayload.meals;

    await plan.save();
    await plan.populate("patient", "name age gender");
    const planWithAnalysis = ensureAnalysisInResponse(
      await attachAnalysisToPlan(plan, {
        forceCompute: true,
      })
    );
    logOutgoingPlan(planWithAnalysis);

    res.status(200).json({
      success: true,
      message: "Plan updated successfully",
      plan: planWithAnalysis,
    });
  } catch (error) {
    next(error);
  }
};

const rejectPlan = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return next(new ApiError(400, "Invalid plan id"));
    }

    const plan = await Plan.findOneAndUpdate(
      {
        _id: req.params.id,
        doctor: req.user.id,
      },
      {
        $set: {
          status: "rejected",
          isActive: false,
        },
      },
      { new: true, runValidators: true }
    );

    if (!plan) {
      return next(new ApiError(404, "Plan not found"));
    }
    const planWithAnalysis = ensureAnalysisInResponse(
      await attachAnalysisToPlan(plan, {
        forceCompute: true,
      })
    );
    logOutgoingPlan(planWithAnalysis);

    res.status(200).json({
      success: true,
      message: "Plan rejected successfully",
      plan: planWithAnalysis,
    });
  } catch (error) {
    next(error);
  }
};

const applyPlanAdjustments = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return next(new ApiError(400, "Invalid plan id"));
    }

    const plan = await Plan.findOne({
      _id: req.params.id,
      doctor: req.user.id,
    }).populate("patient", "name age gender");

    if (!plan) {
      return next(new ApiError(404, "Plan not found"));
    }

    if (plan.adjustmentsApplied) {
      return res.status(200).json({
        success: true,
        message: "Plan adjustments already applied",
        plan: ensureAnalysisInResponse(plan),
      });
    }

    plan.adjustmentsApplied = true;
    plan.appliedAt = new Date();

    await plan.save();

    const normalizedPlan = ensureAnalysisInResponse(plan);
    logOutgoingPlan(normalizedPlan);

    res.status(200).json({
      success: true,
      message: "Plan adjustments applied successfully",
      plan: normalizedPlan,
    });
  } catch (error) {
    next(error);
  }
};

const getPlansByPatient = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    if (!isValidObjectId(patientId)) {
      return next(new ApiError(400, "Invalid patient id"));
    }

    const plans = await Plan.find({
      patient: patientId,
      doctor: req.user.id,
    })
      .populate("patient", "name age gender")
      .sort({ isActive: -1, createdAt: -1 });

    const plansWithAnalysis = (await attachAnalysisToPlans(plans)).map(
      ensureAnalysisInResponse
    );
    plansWithAnalysis.forEach(logOutgoingPlan);

    res.status(200).json({
      success: true,
      plans: plansWithAnalysis,
    });
  } catch (error) {
    next(error);
  }
};

const getAdaptivePlanModifications = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    if (!isValidObjectId(patientId)) {
      return next(new ApiError(400, "Invalid patient id"));
    }

    const patient = await Patient.findOne({
      _id: patientId,
      doctor: req.user.id,
    }).select("_id");

    if (!patient) {
      return next(new ApiError(404, "Patient not found"));
    }

    const result = await modifyPlanBasedOnProgress(patientId);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  attachAnalysisToPlan,
  computeAndPersistPlanAnalysis,
  getPendingPlans,
  generateAiPlan,
  generateAiDay,
  fixAiPlan,
  approvePlan,
  createPlan,
  updatePlan,
  rejectPlan,
  applyPlanAdjustments,
  getPlansByPatient,
  getAdaptivePlanModifications,
};
