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
const debugLogsEnabled = process.env.DEBUG_LOGS === "true";
const debugLog = (...args) => {
  if (debugLogsEnabled) {
    console.log(...args);
  }
};

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

const normalizeGoalForFoods = (goal = "") => {
  const normalizedGoal = String(goal).trim().toLowerCase();

  if (!normalizedGoal) return "general wellness";
  if (
    normalizedGoal.includes("diabetes") ||
    normalizedGoal.includes("blood sugar")
  ) {
    return "weight loss";
  }
  if (normalizedGoal.includes("pcos")) {
    return "weight loss";
  }
  if (
    normalizedGoal.includes("hypertension") ||
    normalizedGoal.includes("high blood pressure") ||
    normalizedGoal.includes("blood pressure")
  ) {
    return "better digestion";
  }
  if (normalizedGoal.includes("thyroid")) {
    return "general wellness";
  }
  if (
    normalizedGoal.includes("weight loss") ||
    normalizedGoal.includes("fat loss") ||
    normalizedGoal.includes("slim")
  ) {
    return "weight loss";
  }
  if (
    normalizedGoal.includes("muscle gain") ||
    normalizedGoal.includes("weight gain") ||
    normalizedGoal.includes("bulk")
  ) {
    return "muscle gain";
  }
  if (
    normalizedGoal.includes("digest") ||
    normalizedGoal.includes("acidity") ||
    normalizedGoal.includes("bloat") ||
    normalizedGoal.includes("constipation")
  ) {
    return "better digestion";
  }

  return "general wellness";
};

const getRelevantFoods = (goal, doshaType) => {
  const canonicalGoal = normalizeGoalForFoods(goal);
  const doshaMatchedFoods = foods.filter((food) => food.dosha.includes(doshaType));

  const specificGoalFoods = doshaMatchedFoods.filter((food) =>
    food.goals.includes(canonicalGoal)
  );
  const generalWellnessFoods = doshaMatchedFoods.filter(
    (food) =>
      food.goals.includes("general wellness") &&
      !specificGoalFoods.some((selectedFood) => selectedFood.name === food.name)
  );
  const remainingDoshaFoods = doshaMatchedFoods.filter(
    (food) =>
      !specificGoalFoods.some((selectedFood) => selectedFood.name === food.name) &&
      !generalWellnessFoods.some((selectedFood) => selectedFood.name === food.name)
  );

  if (canonicalGoal !== "general wellness" && specificGoalFoods.length >= 3) {
    return specificGoalFoods.slice(0, 5);
  }

  // Prioritize foods that match the explicit goal, then wellness-safe fillers.
  return [...specificGoalFoods, ...generalWellnessFoods, ...remainingDoshaFoods].slice(0, 5);
};

const buildFoodPools = (goal, doshaType, relevantFoods = []) => {
  const canonicalGoal = normalizeGoalForFoods(goal);
  const pool = relevantFoods.length ? relevantFoods : getRelevantFoods(goal, doshaType);
  const goalFoods = pool.filter((food) => food.goals.includes(canonicalGoal));

  return {
    canonicalGoal,
    pool,
    goalFoods,
  };
};

const chooseFoodFromPool = (pool, mealType, offset = 0) => {
  if (!Array.isArray(pool) || pool.length === 0) {
    return null;
  }

  const typeMatched = pool.filter((food) => food.mealTypes.includes(mealType));
  const source = typeMatched.length ? typeMatched : pool;
  return source[offset % source.length] || null;
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
  height: patient.height || "Not recorded",
  bloodGroup: patient.bloodGroup || "Not recorded",
  gender: patient.gender || "Not recorded",
  conditions: patient.healthConditions || "None reported",
  medications: patient.currentMedications || "None reported",
  allergies: patient.allergies || "None reported",
  dietType: patient.dietType || "Not recorded",
  activityLevel: patient.activityLevel || "Not recorded",
  preferences: Array.isArray(patient.preferences) ? patient.preferences.join(", ") : "None reported",
  planningInputs: patient.planningInputs || {},
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
    (log) => typeof log.adherence === "number" || typeof log.adherence === "boolean"
  );

  const averageEnergy = average(energyLogs.map((log) => log.energyLevel));
  const previousAverageEnergy = average(
    previousEnergyLogs.map((log) => log.energyLevel)
  );
  const recentAverageEnergy = average(
    recentEnergyLogs.map((log) => log.energyLevel)
  );
  const adherenceValues = adherenceLogs
    .map((log) => (typeof log.adherence === "boolean" ? (log.adherence ? 100 : 0) : log.adherence))
    .filter((value) => typeof value === "number" && !Number.isNaN(value));
  const adherenceRate = adherenceValues.length ? average(adherenceValues) / 100 : null;

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
  const planningInputs = summary.planningInputs || {};

  return `
Generate a 3-day Ayurvedic diet plan for:

Age: ${summary.age}
Height: ${summary.height} cm
Weight: ${summary.weight} kg
Blood group: ${summary.bloodGroup}
Gender: ${summary.gender}
Diet type: ${summary.dietType}
Activity level (1-5): ${summary.activityLevel}
Preferences: ${summary.preferences}
Goal: ${summary.goal}
Dosha: ${summary.doshaType}
Dominant dosha (profile): ${summary.dominantDosha}
Conditions: ${summary.conditions}
Medications: ${summary.medications}
Allergies: ${summary.allergies}
Target weight (kg): ${planningInputs.targetWeight ?? "Not recorded"}
Timeframe (weeks): ${planningInputs.timeframeWeeks ?? "Not recorded"}
Meal pattern: ${planningInputs.mealPattern || "Not recorded"}
Sleep (hours/night): ${planningInputs.sleepHours ?? "Not recorded"}
Stress level (1-5): ${planningInputs.stressLevel ?? "Not recorded"}
Water intake (liters/day): ${planningInputs.waterIntakeLiters ?? "Not recorded"}

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
- Use lighter dinner if stress is high or digestion is weak
- Prefer easier-to-prepare meals if adherence is low
- Keep hydration-supportive meals if water intake is low
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
    patient.height || "",
    patient.bloodGroup || "",
    patient.gender || "",
    patient.healthConditions || "",
    patient.allergies || "",
    patient.dietType || "",
    patient.activityLevel || "",
    patient.planningInputs?.targetWeight || "",
    patient.planningInputs?.timeframeWeeks || "",
    patient.planningInputs?.mealPattern || "",
    patient.planningInputs?.sleepHours || "",
    patient.planningInputs?.stressLevel || "",
    patient.planningInputs?.waterIntakeLiters || "",
    goal || "",
    doshaType || "",
  ]
    .join("|")
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0);

const createMockMeals = (patient, goal, doshaType, relevantFoods) => {
  const { canonicalGoal, pool, goalFoods } = buildFoodPools(goal, doshaType, relevantFoods);
  const picks = pool;
  const personalizationSeed = getPersonalizationSeed(patient, goal, doshaType);
  const choose = (index, mealType, preferGoalFoods = false) => {
    const offset = (personalizationSeed + index) % Math.max(picks.length, 1);
    const basePool =
      preferGoalFoods && goalFoods.length ? goalFoods : picks;
    return chooseFoodFromPool(basePool, mealType, offset);
  };

  return [0, 1, 2].map((index) => ({
    day: `Day ${index + 1}`,
    breakfast:
      choose(index, "breakfast", canonicalGoal !== "general wellness")?.name ||
      "stewed fruit",
    lunch:
      choose(index + 1, "lunch", true)?.name ||
      "moong dal khichdi",
    dinner:
      choose(index + 2, "dinner", true)?.name ||
      "moong soup",
  }));
};

const mealContainsFood = (mealText = "", foodName = "") =>
  String(mealText).toLowerCase().includes(String(foodName).toLowerCase());

const enforceGoalSpecificMeals = (meals, goal, doshaType, relevantFoods, patient) => {
  const normalizedMeals = normalizeMeals(meals);
  const { canonicalGoal, goalFoods } = buildFoodPools(goal, doshaType, relevantFoods);

  if (
    canonicalGoal === "general wellness" ||
    !goalFoods.length ||
    !normalizedMeals.length
  ) {
    return normalizedMeals;
  }

  const personalizationSeed = getPersonalizationSeed(patient, goal, doshaType);

  return normalizedMeals.map((mealDay, index) => {
    const breakfastFood = chooseFoodFromPool(
      goalFoods,
      "breakfast",
      personalizationSeed + index
    );
    const lunchFood = chooseFoodFromPool(
      goalFoods,
      "lunch",
      personalizationSeed + index + 1
    );
    const dinnerFood = chooseFoodFromPool(
      goalFoods,
      "dinner",
      personalizationSeed + index + 2
    );

    return {
      ...mealDay,
      breakfast:
        mealContainsFood(mealDay.breakfast, breakfastFood?.name) || !breakfastFood
          ? mealDay.breakfast
          : breakfastFood.name,
      lunch:
        mealContainsFood(mealDay.lunch, lunchFood?.name) || !lunchFood
          ? mealDay.lunch
          : lunchFood.name,
      dinner:
        mealContainsFood(mealDay.dinner, dinnerFood?.name) || !dinnerFood
          ? mealDay.dinner
          : dinnerFood.name,
    };
  });
};

const getMealsCandidateFromParsed = (parsed) => {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const candidates = [
    parsed.meals,
    parsed.days,
    parsed.plan,
    parsed.dietPlan,
    parsed.diet_plan,
    parsed.data?.meals,
    parsed.result?.meals,
  ];

  return candidates.find((candidate) => Array.isArray(candidate)) || null;
};

const tryParseJson = (value = "") => {
  try {
    return JSON.parse(String(value || "").trim());
  } catch {
    return null;
  }
};

const extractBalancedJsonSegments = (text = "") => {
  const source = String(text || "");
  const segments = [];
  const openings = new Set(["{", "["]);
  const closings = {
    "{": "}",
    "[": "]",
  };

  for (let i = 0; i < source.length; i += 1) {
    const first = source[i];
    if (!openings.has(first)) continue;

    const stack = [first];
    let inString = false;
    let escaped = false;

    for (let j = i + 1; j < source.length; j += 1) {
      const char = source[j];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }

      if (openings.has(char)) {
        stack.push(char);
        continue;
      }

      const current = stack[stack.length - 1];
      if (char === closings[current]) {
        stack.pop();
        if (stack.length === 0) {
          segments.push(source.slice(i, j + 1));
          i = j;
          break;
        }
      }
    }
  }

  return segments;
};

const parseMealsFromTextBlocks = (content = "") => {
  const text = String(content || "");
  if (!text.trim()) return null;

  const dayPattern = /day\s*(\d+)\s*[:\-]?\s*([\s\S]*?)(?=day\s*\d+\s*[:\-]?|$)/gi;
  const meals = [];
  let dayMatch;

  while ((dayMatch = dayPattern.exec(text)) !== null) {
    const dayNumber = Number(dayMatch[1]);
    const chunk = dayMatch[2] || "";
    const breakfastMatch = chunk.match(/breakfast\s*[:\-]\s*([^\n\r]+)/i);
    const lunchMatch = chunk.match(/lunch\s*[:\-]\s*([^\n\r]+)/i);
    const dinnerMatch = chunk.match(/dinner\s*[:\-]\s*([^\n\r]+)/i);

    meals.push({
      day: Number.isFinite(dayNumber) ? `Day ${dayNumber}` : "Day 1",
      breakfast: (breakfastMatch?.[1] || "").trim(),
      lunch: (lunchMatch?.[1] || "").trim(),
      dinner: (dinnerMatch?.[1] || "").trim(),
    });
  }

  const normalizedMeals = normalizeMeals(meals);
  if (
    normalizedMeals.length > 0 &&
    normalizedMeals.every((mealDay) => hasAtLeastOneMeal(mealDay))
  ) {
    return normalizedMeals;
  }

  return null;
};

const parseAiMeals = (content) => {
  const cleaned = String(content || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const parsedCandidates = [
    tryParseJson(cleaned),
    ...extractBalancedJsonSegments(cleaned).map((segment) => tryParseJson(segment)),
  ].filter(Boolean);

  for (const parsed of parsedCandidates) {
    const mealsCandidate = getMealsCandidateFromParsed(parsed);
    const normalizedMeals = normalizeMeals(mealsCandidate || []);

    if (
      Array.isArray(mealsCandidate) &&
      normalizedMeals.length > 0 &&
      normalizedMeals.every((mealDay) => hasAtLeastOneMeal(mealDay))
    ) {
      return normalizedMeals;
    }
  }

  return parseMealsFromTextBlocks(cleaned);
};

const sanitizeReasonToken = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

const ensureChatCompletionsEndpoint = (baseUrl = "") => {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/g, "");
  if (!trimmed) return "";
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
};

const inferOpenAiCompatibleProvider = (baseUrl = "") => {
  const normalized = String(baseUrl || "").toLowerCase();
  if (normalized.includes("groq")) return "groq";
  if (normalized.includes("openrouter")) return "openrouter";
  if (normalized.includes("openai")) return "openai";
  return "openai_compatible";
};

const requestMealsFromOpenAiCompatible = async ({
  endpoint,
  apiKey,
  model,
  prompt,
  provider,
  timeoutMs = 20000,
  useJsonResponseFormat = false,
}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = {
      model,
      temperature: 0.4,
      ...(useJsonResponseFormat ? { response_format: { type: "json_object" } } : {}),
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
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const providerErrorCode = sanitizeReasonToken(
        errorData?.error?.code || errorData?.error?.type || ""
      );
      return {
        meals: null,
        errorReason: `${provider}_http_${response.status}${
          providerErrorCode ? `_${providerErrorCode}` : ""
        }`,
      };
    }

    const data = await response.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content || "";
    const parsedMeals = parseAiMeals(content);

    if (!parsedMeals) {
      return {
        meals: null,
        errorReason: `${provider}_parse_failed`,
      };
    }

    return {
      meals: parsedMeals,
      errorReason: null,
    };
  } catch (error) {
    return {
      meals: null,
      errorReason:
        error?.name === "AbortError"
          ? `${provider}_timeout`
          : `${provider}_request_failed`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const requestChatFromOpenAiCompatible = async ({
  endpoint,
  apiKey,
  model,
  message,
  timeoutMs = 20000,
  sessionId = "",
}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are AyuDiet clinical assistant. Reply briefly, clearly, and practically for doctor workflows on nutrition follow-up, adherence, digestion, and plan adjustments.",
          },
          {
            role: "user",
            content: String(message || "").trim(),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const providerErrorCode = sanitizeReasonToken(
        errorData?.error?.code || errorData?.error?.type || ""
      );
      return {
        reply: "",
        session_id: sessionId || null,
        errorReason: `chat_http_${response.status}${
          providerErrorCode ? `_${providerErrorCode}` : ""
        }`,
      };
    }

    const data = await response.json().catch(() => null);
    const reply = String(data?.choices?.[0]?.message?.content || "").trim();

    if (!reply) {
      return {
        reply: "",
        session_id: sessionId || null,
        errorReason: "chat_empty_reply",
      };
    }

    return {
      reply,
      session_id: sessionId || null,
      errorReason: null,
    };
  } catch (error) {
    return {
      reply: "",
      session_id: sessionId || null,
      errorReason:
        error?.name === "AbortError" ? "chat_timeout" : "chat_request_failed",
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const generateMealsWithAi = async (patient, goal, doshaType, progressSummary) => {
  const relevantFoods = getRelevantFoods(goal, doshaType);
  const model = MEALS_LLM_MODEL;
  const endpoint = ensureChatCompletionsEndpoint(MEALS_LLM_BASE_URL);
  const provider = inferOpenAiCompatibleProvider(endpoint);
  const apiKey = MEALS_LLM_API_KEY;

  if (!relevantFoods.length) {
    return {
      meals: createMockMeals(patient, goal, doshaType, []),
      generationSource: "fallback_mock",
      generationFallbackReason: "no_relevant_foods",
      generationModel: null,
    };
  }

  if (!endpoint) {
    return {
      meals: createMockMeals(patient, goal, doshaType, relevantFoods),
      generationSource: "fallback_mock",
      generationFallbackReason: "missing_meals_llm_base_url",
      generationModel: null,
    };
  }

  if (!apiKey) {
    return {
      meals: createMockMeals(patient, goal, doshaType, relevantFoods),
      generationSource: "fallback_mock",
      generationFallbackReason: "missing_meals_llm_api_key",
      generationModel: null,
    };
  }

  const prompt = buildPersonalizedPrompt(
    patient,
    goal,
    doshaType,
    relevantFoods,
    progressSummary
  );

  const llmResult = await requestMealsFromOpenAiCompatible({
    provider,
    endpoint,
    apiKey,
    model,
    prompt,
    timeoutMs: MEALS_LLM_TIMEOUT_MS,
    useJsonResponseFormat: false,
  });

  if (llmResult.meals) {
    return {
      meals: enforceGoalSpecificMeals(
        llmResult.meals,
        goal,
        doshaType,
        relevantFoods,
        patient
      ),
      generationSource: provider,
      generationFallbackReason: null,
      generationModel: model,
    };
  }

  return {
    meals: createMockMeals(patient, goal, doshaType, relevantFoods),
    generationSource: "fallback_mock",
    generationFallbackReason: llmResult.errorReason || `${provider}_failed`,
    generationModel: model,
  };
};

const buildAiResponse = (
  meals,
  patient,
  goal,
  doshaType,
  relevantFoods,
  progressSummary,
  generationMetadata = {}
) => ({
  success: true,
  foods: relevantFoods,
  meals,
  validation: validatePlan(meals, doshaType),
  patientContext: buildPatientSummary(patient, goal, doshaType),
  progressInsights: progressSummary.insights,
  generationSource: generationMetadata.generationSource || "unknown",
  generationFallbackReason: generationMetadata.generationFallbackReason || null,
  generationModel: generationMetadata.generationModel || null,
});

const parseStrictBaseUrls = () => {
  const fromList = String(process.env.STRICT_LLM_BASE_URLS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const fromSingle = [
    process.env.STRICT_LLM_BASE_URL,
    process.env.LLM_BACKEND_URL,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  // Prefer local endpoints during development, then hosted fallback.
  const defaults = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "https://ayudiet-llm-model.onrender.com",
  ];

  return [...new Set([...fromList, ...fromSingle, ...defaults])];
};

const STRICT_LLM_BASE_URLS = parseStrictBaseUrls();

const STRICT_LLM_TIMEOUT_MS = Number(process.env.STRICT_LLM_TIMEOUT_MS || 25000);
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 20000);
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || "gemini-2.0-flash").trim();
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "").trim();
const GROQ_TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS || 20000);
const GROQ_MODEL = String(process.env.GROQ_MODEL || "llama-3.1-8b-instant").trim();
const GROQ_API_KEY = String(process.env.GROQ_API_KEY || "").trim();
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const MEALS_LLM_MODEL = String(
  process.env.MEALS_LLM_MODEL || GROQ_MODEL || OPENAI_MODEL || "llama-3.1-8b-instant"
).trim();
const MEALS_LLM_API_KEY = String(
  process.env.MEALS_LLM_API_KEY || GROQ_API_KEY || OPENAI_API_KEY || ""
).trim();
const MEALS_LLM_BASE_URL = String(
  process.env.MEALS_LLM_BASE_URL || process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1"
).trim();
const MEALS_LLM_TIMEOUT_MS = Number(
  process.env.MEALS_LLM_TIMEOUT_MS || process.env.GROQ_TIMEOUT_MS || 20000
);
const PROFILE_ALLOWED_RISK_FLAGS = new Set([
  "none",
  "diabetes",
  "high_blood_pressure",
  "obesity",
  "thyroid",
  "pcos",
  "high_cholesterol",
  "digestive_issues",
]);

const normalizeProfileRiskFlags = (flags) => {
  if (!Array.isArray(flags)) {
    return ["none"];
  }

  const cleaned = flags
    .map((flag) => String(flag || "").trim().toLowerCase())
    .filter(Boolean)
    .filter((flag) => PROFILE_ALLOWED_RISK_FLAGS.has(flag));

  return cleaned.length ? [...new Set(cleaned)] : ["none"];
};

const normalizeProfileDosha = (value, fallback = "pitta") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "vata" || normalized === "pitta" || normalized === "kapha") {
    return normalized;
  }
  return fallback;
};

const normalizeProfileConfidence = (value, fallback = 0.2) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
};

const extractJsonObject = (text = "") => {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    // Continue trying common wrappers.
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // Continue to bracket matching fallback.
    }
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  return null;
};

const generateProfileWithGemini = async ({ symptoms, preferredDosha }) => {
  if (!GEMINI_API_KEY) {
    return null;
  }

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "Return ONLY valid JSON (no markdown) with keys:",
              "risk_flags (array), primary_dosha (vata|pitta|kapha), confidence (0..1), fallback (boolean).",
              "Allowed risk_flags: none, diabetes, high_blood_pressure, obesity, thyroid, pcos, high_cholesterol, digestive_issues.",
              `Symptoms: ${String(symptoms || "").trim()}`,
              `Preferred dosha: ${String(preferredDosha || "").trim() || "pitta"}`,
            ].join("\n"),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 256,
      responseMimeType: "application/json",
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const normalizedModelName = GEMINI_MODEL.replace(/^models\//i, "");
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      normalizedModelName
    )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json().catch(() => null);
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts.map((part) => String(part?.text || "")).join("\n").trim()
      : "";
    const parsed = extractJsonObject(text);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      risk_flags: normalizeProfileRiskFlags(parsed.risk_flags),
      primary_dosha: normalizeProfileDosha(parsed.primary_dosha, preferredDosha || "pitta"),
      confidence: normalizeProfileConfidence(parsed.confidence, 0.65),
      fallback: false,
      fallback_reason: null,
      source: "gemini",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const generateProfileWithGroq = async ({ symptoms, preferredDosha }) => {
  if (!GROQ_API_KEY) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Return ONLY valid JSON with keys risk_flags (array), primary_dosha (vata|pitta|kapha), confidence (0..1), fallback (boolean). Allowed risk_flags: none, diabetes, high_blood_pressure, obesity, thyroid, pcos, high_cholesterol, digestive_issues.",
          },
          {
            role: "user",
            content: `Symptoms: ${String(symptoms || "").trim()}\nPreferred dosha: ${
              String(preferredDosha || "").trim() || "pitta"
            }`,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json().catch(() => null);
    const text = String(data?.choices?.[0]?.message?.content || "").trim();
    const parsed = extractJsonObject(text);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      risk_flags: normalizeProfileRiskFlags(parsed.risk_flags),
      primary_dosha: normalizeProfileDosha(parsed.primary_dosha, preferredDosha || "pitta"),
      confidence: normalizeProfileConfidence(parsed.confidence, 0.65),
      fallback: false,
      fallback_reason: null,
      source: "groq",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const callStrictLlmEndpoint = async (path, payload = {}) => {
  const llmApiKey = process.env.AYUDIET_LLM_API_KEY || process.env.AYUDIET_API_KEY;
  let lastError = null;

  for (const baseUrl of STRICT_LLM_BASE_URLS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), STRICT_LLM_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(llmApiKey ? { "X-API-Key": llmApiKey } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new ApiError(
          response.status,
          data?.error?.message ||
            data?.error ||
            `Strict backend failed with status ${response.status}`
        );
      }

      return data;
    } catch (error) {
      if (error?.name === "AbortError") {
        lastError = new ApiError(504, `Strict backend timeout: ${baseUrl}`);
      } else if (error instanceof ApiError) {
        lastError = error;
      } else {
        lastError = new ApiError(502, `Strict backend unavailable: ${baseUrl}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new ApiError(502, "Strict backend unavailable");
};

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
  debugLog("Sending plan:", plan);
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

  debugLog("Computing new analysis");
  const analysisResult = await modifyPlanBasedOnProgress(patientId);
  const analysisWithTimestamp = {
    ...(analysisResult?.analysis || {}),
    computedAt: new Date(),
  };

  normalizedPlan.analysis = analysisWithTimestamp;
  await persistPlanAnalysis(normalizedPlan._id, analysisWithTimestamp);
  debugLog("Sending plan analysis:", normalizedPlan.analysis);

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
    debugLog("Using cached analysis");
    debugLog("Sending plan analysis:", normalizedPlan.analysis);
    return normalizedPlan;
  }

  if (
    !forceCompute &&
    normalizedPlan.analysis &&
    (!isValidAnalysisCache(normalizedPlan.analysis) ||
      isAnalysisStale(normalizedPlan.analysis))
  ) {
    debugLog("Computing new analysis");
    try {
      return await computeAndPersistPlanAnalysis(normalizedPlan);
    } catch (error) {
      normalizedPlan.analysis = normalizedPlan.analysis || null;
      debugLog("Sending plan analysis:", normalizedPlan.analysis);
      return normalizedPlan;
    }
  }

  try {
    return await computeAndPersistPlanAnalysis(normalizedPlan);
  } catch (error) {
    normalizedPlan.analysis = normalizedPlan.analysis || null;
    debugLog("Sending plan analysis:", normalizedPlan.analysis);
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
      .populate("patient", "name age gender phone")
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

const getActivePlans = async (req, res, next) => {
  try {
    const plans = await Plan.find({
      doctor: req.user.id,
      isActive: true,
    })
      .populate("patient", "name age gender phone")
      .sort({ createdAt: -1 });

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
    const generationResult = await generateMealsWithAi(
      patient,
      normalizedGoal,
      doshaType,
      progressSummary
    );
    const meals = generationResult.meals;

    res
      .status(200)
      .json(
        buildAiResponse(
          meals,
          patient,
          normalizedGoal,
          doshaType,
          relevantFoods,
          progressSummary,
          generationResult
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
    const generationResult = await generateMealsWithAi(
      patient,
      normalizedGoal,
      doshaType,
      progressSummary
    );
    const meals = generationResult.meals;
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
      generationSource: generationResult.generationSource || "unknown",
      generationFallbackReason: generationResult.generationFallbackReason || null,
      generationModel: generationResult.generationModel || null,
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

const strictProfileProxy = async (req, res, next) => {
  try {
    // Strict LLM /profile accepts only { symptoms }.
    const payload = {
      symptoms: String(req.body?.symptoms || "").trim(),
    };

    if (!payload.symptoms) {
      return next(new ApiError(400, "symptoms is required"));
    }

    const data = await callStrictLlmEndpoint("/profile", payload);

    const normalizedData = data?.data || data || {};
    const riskFlags = Array.isArray(normalizedData?.risk_flags)
      ? normalizedData.risk_flags
      : Array.isArray(normalizedData?.symptom_tags)
        ? normalizedData.symptom_tags
        : ["none"];

    const normalized = {
      success: true,
      data: {
        risk_flags: riskFlags,
        primary_dosha:
          normalizedData?.primary_dosha ||
          normalizedData?.dosha ||
          req.body?.preferredDosha ||
          "pitta",
        confidence:
          typeof normalizedData?.confidence === "number"
            ? normalizedData.confidence
            : 0.2,
        fallback: Boolean(normalizedData?.fallback),
        fallback_reason: normalizedData?.fallback_reason || null,
      },
      error: null,
    };

    if (normalized.data.fallback) {
      const groqProfile = await generateProfileWithGroq({
        symptoms: payload.symptoms,
        preferredDosha: req.body?.preferredDosha || "pitta",
      });
      if (groqProfile) {
        return res.status(200).json({
          success: true,
          data: groqProfile,
          error: null,
        });
      }

      const geminiProfile = await generateProfileWithGemini({
        symptoms: payload.symptoms,
        preferredDosha: req.body?.preferredDosha || "pitta",
      });
      if (geminiProfile) {
        return res.status(200).json({
          success: true,
          data: geminiProfile,
          error: null,
        });
      }
    }

    res.status(200).json(normalized);
  } catch (error) {
    const symptoms = String(req.body?.symptoms || "").trim();
    if (symptoms) {
      const groqProfile = await generateProfileWithGroq({
        symptoms,
        preferredDosha: req.body?.preferredDosha || "pitta",
      });
      if (groqProfile) {
        return res.status(200).json({
          success: true,
          data: groqProfile,
          error: null,
        });
      }

      const geminiProfile = await generateProfileWithGemini({
        symptoms,
        preferredDosha: req.body?.preferredDosha || "pitta",
      });
      if (geminiProfile) {
        return res.status(200).json({
          success: true,
          data: geminiProfile,
          error: null,
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        risk_flags: ["none"],
        dosha_estimate: {
          vata: 0.33,
          pitta: 0.33,
          kapha: 0.34,
        },
        primary_dosha: "pitta",
        confidence: 0.2,
        fallback: true,
      },
      error: null,
    });
  }
};

const strictExplainProxy = async (req, res, next) => {
  try {
    const contextParts = [
      req.body?.context,
      req.body?.symptoms,
      req.body?.goal,
      req.body?.patientContext?.healthConditions,
      req.body?.progressContext?.latest?.digestion,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    const reasoningParts = [
      req.body?.reasoning,
      req.body?.progressContext?.latest?.notes,
      req.body?.progressContext?.latest?.digestionDetail,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    // Strict LLM /explain accepts only { context, reasoning }.
    const payload = {
      context:
        contextParts.join(". ").trim() || "insufficient context for explanation",
      reasoning:
        reasoningParts.join(". ").trim() || "user requested plan explanation",
    };

    const data = await callStrictLlmEndpoint("/explain", payload);

    const normalizedData = data?.data || data || {};
    const normalized = {
      success: true,
      data: {
        explanation:
          normalizedData?.explanation ||
          "insufficient context to provide safe explanation",
        reasoning: Array.isArray(normalizedData?.reasoning)
          ? normalizedData.reasoning
          : ["fallback"],
        confidence:
          typeof normalizedData?.confidence === "number"
            ? normalizedData.confidence
            : 0.1,
        sources: Array.isArray(normalizedData?.sources) ? normalizedData.sources : [],
        fallback: Boolean(normalizedData?.fallback),
        fallback_reason: normalizedData?.fallback_reason || null,
      },
      error: null,
    };

    res.status(200).json(normalized);
  } catch (error) {
    return res.status(200).json({
      success: true,
      data: {
        explanation: "insufficient context to provide safe explanation",
        reasoning: ["fallback"],
        confidence: 0.1,
        sources: [],
        fallback: true,
      },
      error: null,
    });
  }
};

const strictChatProxy = async (req, res, next) => {
  try {
    const message = String(req.body?.message || "").trim();
    const sessionId = String(req.body?.session_id || req.body?.sessionId || "").trim();

    if (!message) {
      return next(new ApiError(400, "message is required"));
    }

    const payload = {
      message,
      ...(sessionId ? { session_id: sessionId } : {}),
    };

    let normalized;

    try {
      const data = await callStrictLlmEndpoint("/chat", payload);
      normalized =
        data && typeof data === "object" && "data" in data
          ? data
          : {
              success: true,
              data: {
                reply: data?.response || data?.reply || "",
                session_id: data?.session_id || sessionId || null,
                status: data?.status || "success",
              },
              error: null,
            };
    } catch {
      const chatEndpoint = ensureChatCompletionsEndpoint(MEALS_LLM_BASE_URL);
      const directChatResult =
        chatEndpoint && MEALS_LLM_API_KEY
          ? await requestChatFromOpenAiCompatible({
              endpoint: chatEndpoint,
              apiKey: MEALS_LLM_API_KEY,
              model: MEALS_LLM_MODEL,
              message,
              sessionId,
              timeoutMs: MEALS_LLM_TIMEOUT_MS,
            })
          : { reply: "", session_id: sessionId || null, errorReason: "chat_missing_llm_config" };

      if (String(directChatResult.reply || "").trim()) {
        normalized = {
          success: true,
          data: {
            reply: directChatResult.reply,
            session_id: directChatResult.session_id || sessionId || null,
            status: "success",
            source: "meals_llm_chat_fallback",
            fallback: false,
          },
          error: null,
        };
      } else {
        // Fallback for strict backends that expose /explain but not /chat.
        const explainData = await callStrictLlmEndpoint("/explain", {
          symptoms: message,
          preferredDosha: "",
          goal: "chat_assistant",
          patientContext: {},
          progressContext: {},
          constraints: {},
        });

        normalized = {
          success: true,
          data: {
            reply:
              explainData?.data?.explanation ||
              explainData?.explanation ||
              "I understand your query. Please share a little more context and I will help step by step.",
            session_id: sessionId || null,
            status: "success",
            source: "strict_explain_fallback",
          },
          error: null,
        };
      }
    }

    res.status(200).json(normalized);
  } catch (error) {
    return res.status(200).json({
      success: true,
      data: {
        reply:
          "I could not reach the live assistant right now. Please share patient goal, symptoms, and latest adherence/energy/digestion values, and I will guide next steps.",
        session_id: req.body?.session_id || req.body?.sessionId || null,
        status: "fallback",
        fallback: true,
      },
      error: null,
    });
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
    await plan.populate("patient", "name age gender phone");
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

    await plan.populate("patient", "name age gender phone");
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
    await plan.populate("patient", "name age gender phone");
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
    }).populate("patient", "name age gender phone");

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
      .populate("patient", "name age gender phone")
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
  getActivePlans,
  generateAiPlan,
  generateAiDay,
  fixAiPlan,
  strictProfileProxy,
  strictExplainProxy,
  strictChatProxy,
  approvePlan,
  createPlan,
  updatePlan,
  rejectPlan,
  applyPlanAdjustments,
  getPlansByPatient,
  getAdaptivePlanModifications,
};

