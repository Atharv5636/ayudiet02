const mongoose = require("mongoose");
const Plan = require("../models/plan.model");
const Patient = require("../models/patient.model");
const ProgressLog = require("../models/progressLog.model");
const ApiError = require("../utils/ApiError");
const { validatePlan, fixPlan } = require("../utils/planValidation");
const {
  modifyPlanBasedOnProgress,
} = require("../services/adaptivePlanService");
const { processPatientInput } = require("../utils/userProfileProcessor");
const { buildHealthProfile } = require("../services/healthEngineService");
const {
  buildDietSafetyProfile,
  buildSafetyConstraintText,
  evaluateMealSafety,
  evaluateMealsSafety,
} = require("../services/dietSafetyRuleEngine");
const {
  buildPatientHistoryProfile,
  trackPlanSnapshot,
} = require("../services/userHistoryService");
const foods = require("../data/foods.json");
const debugLogsEnabled = process.env.DEBUG_LOGS === "true";
const debugLog = (...args) => {
  if (debugLogsEnabled) {
    console.log(...args);
  }
};

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const PLAN_SLOT_KEYS = [
  "earlyMorning",
  "morning",
  "afterExercise",
  "breakfast",
  "midMorning",
  "lunch",
  "after2Hours",
  "evening",
  "lateEvening",
  "dinner",
  "bedTime",
];
const normalizeGoalText = (goal = "") => {
  const normalized = String(goal || "").trim();
  return normalized || "general wellness";
};
const toGoalKey = (goal = "") => normalizeGoalText(goal).toLowerCase();

const normalizeMeals = (meals = []) =>
  meals.map((meal, index) => {
    const normalized = {
      day: meal?.day?.trim() || `Day ${index + 1}`,
    };

    PLAN_SLOT_KEYS.forEach((key) => {
      normalized[key] = String(meal?.[key] || "").trim();
    });

    return normalized;
  });

const hasAtLeastOneMeal = (mealDay) =>
  PLAN_SLOT_KEYS.some((slotKey) => Boolean(String(mealDay?.[slotKey] || "").trim()));

const validatePlanPayload = ({
  patient,
  title,
  goal,
  doshaType,
  reviewDueDate,
  meals,
  requirePatient = true,
  requireGoal = true,
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

  if (requireGoal && !String(goal || "").trim()) {
    throw new ApiError(400, "Goal is required");
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
    ...(goal !== undefined ? { goal: normalizeGoalText(goal) } : {}),
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
    return "diabetes support";
  }
  if (normalizedGoal.includes("pcos")) {
    return "pcos support";
  }
  if (
    normalizedGoal.includes("hypertension") ||
    normalizedGoal.includes("high blood pressure") ||
    normalizedGoal.includes("blood pressure")
  ) {
    return "hypertension support";
  }
  if (normalizedGoal.includes("thyroid")) {
    return "thyroid support";
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

const SLOT_KEYS = [...PLAN_SLOT_KEYS];

const MAX_RELEVANT_FOODS = 12;
const MIN_SLOT_COVERAGE = 3;
const DIET_VEGETARIAN = "vegetarian";
const DIET_EGGETARIAN = "eggetarian";
const NON_VEG_KEYWORDS = ["chicken", "fish", "mutton", "prawn", "seafood"];
const EGG_KEYWORDS = ["egg"];
const FOOD_COST_TIERS = ["low", "medium", "high"];
const FOOD_AVAILABILITY_LEVELS = ["local_common", "seasonal", "niche"];
const DEFAULT_BUDGET_TIER = "low";
const DEFAULT_LOCAL_REGION = "pan_india";
const PREMIUM_INGREDIENT_TOKENS = [
  "quinoa",
  "avocado",
  "almond milk",
  "chia",
  "imported",
  "smoothie bowl",
];
const MODERATE_COST_TOKENS = [
  "paneer",
  "tofu",
  "chicken",
  "fish",
  "egg",
  "nuts",
  "almond",
];
const NICHE_AVAILABILITY_TOKENS = [
  "quinoa",
  "avocado",
  "chia",
  "smoothie",
  "wrap",
  "lettuce",
  "nourish bowl",
];
const SEASONAL_AVAILABILITY_TOKENS = ["mango", "jackfruit", "berries", "fig"];
const REGION_ALIASES = {
  north: "north",
  south: "south",
  east: "east",
  west: "west",
  central: "central",
  northeast: "northeast",
  maharashtra: "west",
  gujarat: "west",
  goa: "west",
  rajasthan: "north",
  punjab: "north",
  haryana: "north",
  delhi: "north",
  himachal_pradesh: "north",
  jammu_and_kashmir: "north",
  uttar_pradesh: "north",
  uttarakhand: "north",
  bihar: "east",
  jharkhand: "east",
  west_bengal: "east",
  odisha: "east",
  assam: "northeast",
  meghalaya: "northeast",
  manipur: "northeast",
  mizoram: "northeast",
  nagaland: "northeast",
  tripura: "northeast",
  arunachal_pradesh: "northeast",
  sikkim: "northeast",
  madhya_pradesh: "central",
  chhattisgarh: "central",
  karnataka: "south",
  tamil_nadu: "south",
  kerala: "south",
  andhra_pradesh: "south",
  telangana: "south",
  pan_india: "pan_india",
  india: "pan_india",
};

const normalizeDietTypeForFoods = (dietType = "") => {
  const normalized = String(dietType || "").trim().toLowerCase();
  if (!normalized) return DIET_VEGETARIAN;
  if (normalized.includes("eggetarian") || normalized.includes("egg")) {
    return DIET_EGGETARIAN;
  }
  if (normalized.includes("non") && normalized.includes("veg")) {
    return "non_veg";
  }
  if (normalized.includes("veg")) {
    return DIET_VEGETARIAN;
  }
  return DIET_VEGETARIAN;
};

const normalizeBudgetTier = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  return FOOD_COST_TIERS.includes(normalized) ? normalized : DEFAULT_BUDGET_TIER;
};

const normalizeLocalRegion = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return REGION_ALIASES[normalized] || DEFAULT_LOCAL_REGION;
};

const normalizeFoodRegions = (food = {}) => {
  const regions = Array.isArray(food?.regions) ? food.regions : [DEFAULT_LOCAL_REGION];
  const normalized = [...new Set(regions.map(normalizeLocalRegion).filter(Boolean))];
  return normalized.length ? normalized : [DEFAULT_LOCAL_REGION];
};

const isExactRegionMatch = (food = {}, targetRegion = DEFAULT_LOCAL_REGION) => {
  const normalizedTarget = normalizeLocalRegion(targetRegion);
  if (normalizedTarget === DEFAULT_LOCAL_REGION) return false;
  return normalizeFoodRegions(food).includes(normalizedTarget);
};

const scoreFoodWithRegionBoost = ({
  food = {},
  canonicalGoal = "general wellness",
  mealType = "lunch",
  patientLocalRegion = DEFAULT_LOCAL_REGION,
  strictRegion = false,
}) => {
  let score = scoreFoodForGoalAndSlot(food, canonicalGoal, mealType);
  const normalizedTarget = normalizeLocalRegion(patientLocalRegion);
  if (normalizedTarget === DEFAULT_LOCAL_REGION) return score;

  const isExactMatch = isExactRegionMatch(food, normalizedTarget);
  if (isExactMatch) {
    score += 8;
  } else {
    score -= strictRegion ? 6 : 2;
  }

  return score;
};

const inferFoodCostTier = (food = {}) => {
  const text = `${String(food?.name || "").toLowerCase()} ${String(food?.notes || "").toLowerCase()}`;
  if (PREMIUM_INGREDIENT_TOKENS.some((token) => text.includes(token))) return "high";
  if (MODERATE_COST_TOKENS.some((token) => text.includes(token))) return "medium";
  return "low";
};

const inferFoodAvailability = (food = {}) => {
  const text = `${String(food?.name || "").toLowerCase()} ${String(food?.notes || "").toLowerCase()}`;
  if (NICHE_AVAILABILITY_TOKENS.some((token) => text.includes(token))) return "niche";
  if (SEASONAL_AVAILABILITY_TOKENS.some((token) => text.includes(token))) return "seasonal";
  return "local_common";
};

const normalizeFoodMetadata = (food = {}) => {
  const normalizedCostTier = normalizeBudgetTier(food?.costTier || food?.cost_tier || inferFoodCostTier(food));
  const availabilityRaw = String(
    food?.availability || food?.availabilityLevel || inferFoodAvailability(food)
  )
    .trim()
    .toLowerCase();
  const availability = FOOD_AVAILABILITY_LEVELS.includes(availabilityRaw)
    ? availabilityRaw
    : "local_common";
  const regionsRaw = Array.isArray(food?.regions)
    ? food.regions
    : food?.region
      ? [food.region]
      : [DEFAULT_LOCAL_REGION];
  const regions = [...new Set(regionsRaw.map(normalizeLocalRegion).filter(Boolean))];

  return {
    ...food,
    costTier: normalizedCostTier,
    availability,
    regions: regions.length ? regions : [DEFAULT_LOCAL_REGION],
  };
};

const isCostAllowed = (foodCostTier = "low", budgetTier = DEFAULT_BUDGET_TIER) => {
  const ranking = { low: 1, medium: 2, high: 3 };
  const budgetScore = ranking[normalizeBudgetTier(budgetTier)] || 1;
  const foodScore = ranking[normalizeBudgetTier(foodCostTier)] || 1;
  return foodScore <= budgetScore;
};

const isRegionAllowed = (foodRegions = [], targetRegion = DEFAULT_LOCAL_REGION) => {
  const regions = Array.isArray(foodRegions) ? foodRegions.map(normalizeLocalRegion) : [];
  const normalizedTarget = normalizeLocalRegion(targetRegion);
  if (!regions.length) return true;
  if (regions.includes(DEFAULT_LOCAL_REGION)) return true;
  return regions.includes(normalizedTarget);
};

const isMealNameCompatibleWithDiet = (mealName = "", dietType = DIET_VEGETARIAN) => {
  const name = String(mealName || "").trim().toLowerCase();
  const containsNonVeg = NON_VEG_KEYWORDS.some((token) => name.includes(token));
  const containsEgg = EGG_KEYWORDS.some((token) => name.includes(token));

  if (dietType === DIET_VEGETARIAN) {
    return !containsNonVeg && !containsEgg;
  }
  if (dietType === DIET_EGGETARIAN) {
    return !containsNonVeg;
  }
  return true;
};

const GOAL_TO_FOOD_TARGETS = {
  "weight loss": ["weight loss", "better digestion", "general wellness"],
  "muscle gain": ["muscle gain", "general wellness"],
  "better digestion": ["better digestion", "general wellness"],
  "general wellness": ["general wellness", "better digestion", "weight loss"],
  "diabetes support": ["weight loss", "better digestion", "general wellness"],
  "pcos support": ["weight loss", "general wellness", "better digestion"],
  "hypertension support": ["better digestion", "general wellness", "weight loss"],
  "thyroid support": ["general wellness", "better digestion", "muscle gain"],
};

const getGoalTargets = (canonicalGoal = "general wellness") =>
  GOAL_TO_FOOD_TARGETS[canonicalGoal] || GOAL_TO_FOOD_TARGETS["general wellness"];

const scoreFoodForGoal = (food = {}, canonicalGoal = "general wellness") => {
  const targets = getGoalTargets(canonicalGoal);
  const foodGoals = Array.isArray(food.goals) ? food.goals : [];
  const lowerName = String(food?.name || "").toLowerCase();
  const lowerNotes = String(food?.notes || "").toLowerCase();
  const text = `${lowerName} ${lowerNotes}`;

  let score = 0;
  targets.forEach((target, index) => {
    if (foodGoals.includes(target)) {
      score += Math.max(1, targets.length - index);
    }
  });

  if (canonicalGoal === "muscle gain") {
    if (/(paneer|tofu|egg|chicken|fish|dal|chana|rajma|chole|sprouts)/.test(text)) score += 2;
  } else if (canonicalGoal === "weight loss") {
    if (/(soup|millet|lauki|salad|stew|khichdi)/.test(text)) score += 2;
    if (/(smoothie|fried|paratha)/.test(text)) score -= 1;
  } else if (canonicalGoal === "diabetes support") {
    if (/(millet|moong|sprouts|lauki|dal|vegetable|soup)/.test(text)) score += 2;
    if (/(rice|smoothie|date)/.test(text)) score -= 1;
  } else if (canonicalGoal === "pcos support") {
    if (/(moong|sprouts|millet|tofu|paneer|vegetable|soup)/.test(text)) score += 2;
  } else if (canonicalGoal === "hypertension support") {
    if (/(soup|stew|vegetable|light|lauki|moong)/.test(text)) score += 2;
    if (/(pickle|spicy|fried)/.test(text)) score -= 1;
  } else if (canonicalGoal === "thyroid support") {
    if (/(dal|paneer|tofu|millet|vegetable|balanced)/.test(text)) score += 2;
  } else if (canonicalGoal === "better digestion") {
    if (/(soup|khichdi|stew|light|moong|idli)/.test(text)) score += 2;
  }

  return score;
};

const scoreFoodForGoalAndSlot = (
  food = {},
  canonicalGoal = "general wellness",
  mealType = "lunch"
) => {
  const baseScore = scoreFoodForGoal(food, canonicalGoal);
  const text = `${String(food?.name || "").toLowerCase()} ${String(food?.notes || "").toLowerCase()}`;
  let slotScore = 0;

  if (mealType === "breakfast") {
    if (/(fruit|papaya|apple|poha|upma|idli|daliya|porridge|chilla|dosa|sprouts)/.test(text)) {
      slotScore += 2;
    }
    if (canonicalGoal === "muscle gain" && /(paneer|tofu|egg|milk|protein|dal)/.test(text)) {
      slotScore += 2;
    }
  }

  if (mealType === "lunch") {
    if (/(dal|roti|phulka|sabzi|salad|millet|khichdi|rice|tofu|paneer|chicken|fish|egg)/.test(text)) {
      slotScore += 2;
    }
  }

  if (mealType === "dinner") {
    if (/(soup|stew|moong|lauki|clear|light|palak)/.test(text)) {
      slotScore += 3;
    }
    if (/(paratha|fried|heavy)/.test(text)) {
      slotScore -= 2;
    }
  }

  return baseScore + slotScore;
};

const SUPPORT_OR_WEIGHT_GOALS = new Set([
  "weight loss",
  "diabetes support",
  "pcos support",
  "hypertension support",
  "better digestion",
]);

const isFruitLikeMeal = (mealText = "") =>
  /(papaya|apple|orange|mosambi|watermelon|mix fruits|fruit bowl|fruit)/.test(
    String(mealText || "").toLowerCase()
  );

const isLightDinnerMeal = (mealText = "") =>
  /(soup|stew|clear|moong|lauki|palak|light|khichdi)/.test(
    String(mealText || "").toLowerCase()
  );

const normalizeMealText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .split("|")[0]
    .replace(/\s+/g, " ")
    .trim();

const CORE_MEAL_SLOTS = ["breakfast", "lunch", "dinner"];

const buildMealCartOptions = (meals = [], foodsList = []) => {
  const usedNames = new Set();
  (Array.isArray(meals) ? meals : []).forEach((mealDay) => {
    CORE_MEAL_SLOTS.forEach((slot) => {
      const normalized = normalizeMealText(mealDay?.[slot]);
      if (normalized) usedNames.add(normalized);
    });
  });

  const usedFoods = [];
  const availableFoods = [];

  (Array.isArray(foodsList) ? foodsList : []).forEach((food) => {
    const normalizedName = normalizeMealText(food?.name || "");
    if (!normalizedName) return;
    if (usedNames.has(normalizedName)) {
      usedFoods.push(food);
    } else {
      availableFoods.push(food);
    }
  });

  return {
    usedFoods,
    availableFoods,
    usedFoodCount: usedFoods.length,
    availableFoodCount: availableFoods.length,
  };
};

const pickBestSlotFood = ({
  mealType,
  canonicalGoal,
  pool = [],
  goalFoods = [],
  avoid = [],
  requireLightDinner = false,
  patientLocalRegion = DEFAULT_LOCAL_REGION,
  strictRegion = false,
}) => {
  const blocked = new Set(
    avoid.map((value) => normalizeMealText(String(value || ""))).filter(Boolean)
  );
  const sources = [goalFoods, pool];

  for (const source of sources) {
    if (!Array.isArray(source) || !source.length) continue;

    const candidates = source
      .filter((food) => Array.isArray(food?.mealTypes) && food.mealTypes.includes(mealType))
      .map((food) => ({
        food,
        score: scoreFoodWithRegionBoost({
          food,
          canonicalGoal,
          mealType,
          patientLocalRegion,
          strictRegion,
        }),
      }))
      .sort((left, right) => right.score - left.score)
      .map((item) => item.food)
      .filter((food) => {
        const name = String(food?.name || "");
        if (!name) return false;
        if (blocked.has(normalizeMealText(name))) return false;
        if ((mealType === "lunch" || mealType === "dinner") && isFruitLikeMeal(name)) return false;
        if (mealType === "dinner" && requireLightDinner && !isLightDinnerMeal(name)) return false;
        return true;
      });

    if (candidates.length) {
      return String(candidates[0]?.name || "").trim();
    }
  }

  return "";
};

const buildCoveredSelection = ({
  priorityFoods = [],
  sourceFoods = [],
  maxCount = MAX_RELEVANT_FOODS,
}) => {
  const source = Array.isArray(sourceFoods) ? sourceFoods : [];
  const priority = Array.isArray(priorityFoods) ? priorityFoods : [];
  const selected = [];
  const seenNames = new Set();
  const slots = ["breakfast", "lunch", "dinner"];
  const addFood = (food) => {
    if (!food?.name || seenNames.has(food.name)) {
      return false;
    }
    if (selected.length >= maxCount) {
      return false;
    }
    selected.push(food);
    seenNames.add(food.name);
    return true;
  };

  // First pass: include at least MIN_SLOT_COVERAGE per slot where possible.
  slots.forEach((slot) => {
    let slotCount = selected.filter((food) => food?.mealTypes?.includes(slot)).length;
    if (slotCount >= MIN_SLOT_COVERAGE) {
      return;
    }

    const slotPriority = [
      ...priority.filter((food) => food?.mealTypes?.includes(slot)),
      ...source.filter((food) => food?.mealTypes?.includes(slot)),
    ];

    for (const food of slotPriority) {
      if (slotCount >= MIN_SLOT_COVERAGE || selected.length >= maxCount) {
        break;
      }
      if (addFood(food)) {
        slotCount += 1;
      }
    }
  });

  // Second pass: fill remaining capacity by priority order.
  [...priority, ...source].forEach((food) => {
    addFood(food);
  });

  return selected.slice(0, maxCount);
};

const getRelevantFoods = (goal, doshaType, patient = null) => {
  const canonicalGoal = normalizeGoalForFoods(goal);
  const patientDietType = normalizeDietTypeForFoods(patient?.dietType);
  const patientBudgetTier = normalizeBudgetTier(
    patient?.planningInputs?.budgetTier || DEFAULT_BUDGET_TIER
  );
  const patientLocalRegion = normalizeLocalRegion(
    patient?.planningInputs?.localRegion || DEFAULT_LOCAL_REGION
  );
  const normalizedFoods = foods.map(normalizeFoodMetadata);

  const baseEligibleFoods = normalizedFoods.filter(
    (food) =>
      food.dosha.includes(doshaType) &&
      isMealNameCompatibleWithDiet(food.name, patientDietType)
  );
  const budgetAndRegionStrictFoods = baseEligibleFoods.filter(
    (food) =>
      isCostAllowed(food.costTier, patientBudgetTier) &&
      isRegionAllowed(food.regions, patientLocalRegion) &&
      food.availability === "local_common"
  );
  const budgetAndRegionFoods = baseEligibleFoods.filter(
    (food) =>
      isCostAllowed(food.costTier, patientBudgetTier) &&
      isRegionAllowed(food.regions, patientLocalRegion)
  );
  const regionFoods = baseEligibleFoods.filter((food) =>
    isRegionAllowed(food.regions, patientLocalRegion)
  );

  const doshaMatchedFoods =
    budgetAndRegionStrictFoods.length >= 8
      ? budgetAndRegionStrictFoods
      : budgetAndRegionFoods.length >= 8
        ? budgetAndRegionFoods
        : regionFoods.length >= 8
          ? regionFoods
          : baseEligibleFoods;

  const goalTargets = getGoalTargets(canonicalGoal);
  const rankedFoods = [...doshaMatchedFoods]
    .map((food) => ({
      food,
      score: scoreFoodWithRegionBoost({
        food,
        canonicalGoal,
        mealType: "lunch",
        patientLocalRegion,
        strictRegion: false,
      }),
    }))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.food);

  const specificGoalFoods = rankedFoods.filter((food) =>
    goalTargets.some((target) => food.goals.includes(target))
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
    return buildCoveredSelection({
      priorityFoods: specificGoalFoods,
      sourceFoods: doshaMatchedFoods,
      maxCount: MAX_RELEVANT_FOODS,
    });
  }

  // Prioritize foods that match the explicit goal, then wellness-safe fillers.
  return buildCoveredSelection({
    priorityFoods: [...specificGoalFoods, ...generalWellnessFoods, ...remainingDoshaFoods],
    sourceFoods: doshaMatchedFoods,
    maxCount: MAX_RELEVANT_FOODS,
  });
};

const buildFoodPools = (goal, doshaType, relevantFoods = [], patient = null) => {
  const canonicalGoal = normalizeGoalForFoods(goal);
  const pool = relevantFoods.length ? relevantFoods : getRelevantFoods(goal, doshaType, patient);
  const patientLocalRegion = normalizeLocalRegion(
    patient?.planningInputs?.localRegion || DEFAULT_LOCAL_REGION
  );
  const goalTargets = getGoalTargets(canonicalGoal);
  const goalFoods = pool.filter((food) =>
    goalTargets.some((target) => food.goals.includes(target))
  );
  const regionalFoods = pool.filter((food) => isExactRegionMatch(food, patientLocalRegion));

  return {
    canonicalGoal,
    pool,
    goalFoods,
    regionalFoods,
    patientLocalRegion,
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
        `- ${food.name} (${food.mealTypes.join(", ")}) [cost:${food.costTier || "low"}, availability:${food.availability || "local_common"}, region:${(food.regions || [DEFAULT_LOCAL_REGION]).join("/")}] : ${food.notes}`
    )
    .join("\n");

const buildPatientSummary = (patient, goal, doshaType) => ({
  name: patient.name || "Patient",
  age: patient.age || "Not recorded",
  weight: patient.weight || "Not recorded",
  height: patient.height || "Not recorded",
  bloodGroup: patient.bloodGroup || "Not recorded",
  gender: patient.gender || "Not recorded",
  conditions: patient.healthConditions || "None reported",
  healthConditions: patient.healthConditions || "None reported",
  medications: patient.currentMedications || "None reported",
  allergies: patient.allergies || "None reported",
  dietType: patient.dietType || "Not recorded",
  activityLevel: patient.activityLevel || "Not recorded",
  preferences: Array.isArray(patient.preferences) ? patient.preferences.join(", ") : "None reported",
  planningInputs: patient.planningInputs || {},
  budgetTier: normalizeBudgetTier(patient?.planningInputs?.budgetTier || DEFAULT_BUDGET_TIER),
  localRegion: normalizeLocalRegion(patient?.planningInputs?.localRegion || DEFAULT_LOCAL_REGION),
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

const isWeightLossLikeGoal = (goal = "") => {
  const normalized = String(goal || "").trim().toLowerCase();
  return (
    normalized === "weight loss" ||
    normalized === "diabetes support" ||
    normalized === "pcos support"
  );
};

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
    } else if (isWeightLossLikeGoal(goal)) {
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
  progressSummary,
  historyProfile = null,
  totalDays = DEFAULT_GENERATION_DAYS
) => {
  const summary = buildPatientSummary(patient, goal, doshaType);
  const planningInputs = summary.planningInputs || {};
  const safeTotalDays = normalizeTotalDays(totalDays, DEFAULT_GENERATION_DAYS);
  const historySummary = historyProfile?.summaryText || "No prior history available.";

  return `
Generate a ${safeTotalDays}-day Ayurvedic diet plan for:

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
Budget tier (low/medium/high): ${summary.budgetTier || DEFAULT_BUDGET_TIER}
Local region preference: ${summary.localRegion || DEFAULT_LOCAL_REGION}

Recent progress insights:
${progressSummary.insights.map((insight) => `- ${insight}`).join("\n")}

Adjust diet based on:
${progressSummary.adjustments.map((adjustment) => `- ${adjustment}`).join("\n")}

Longitudinal user history (for personalization over time):
- ${historySummary}
- Reuse patterns that had better adherence and avoid repeating patterns linked to poor adherence when possible.

Use ONLY the following foods:
${buildFoodGrounding(relevantFoods)}

Rules:
- Balanced meals
- Include protein daily
- Avoid repetition across days
- Avoid identical consecutive day plans
- Do not repeat the exact same meal in the same slot on back-to-back days
- Respect the patient's diet type strictly (vegetarian / eggetarian / non-veg)
- Prefer familiar Indian home-cooked options from the provided list
- If Local region preference is set (not pan_india), ensure at least two core meals per day reflect that regional cuisine
- Mirror dietitian-style pattern:
  breakfast should be light (fruit / poha / upma / chilla / idli style),
  lunch should be structured and balanced,
  dinner should be lighter (soup/stew/light protein style)
- Keep dinner lighter than lunch for fat-loss/digestion/support goals
- Follow dosha-specific restrictions strictly
- Keep the plan Ayurvedic compliant
- Use lighter dinner if stress is high or digestion is weak
- Prefer easier-to-prepare meals if adherence is low
- Keep hydration-supportive meals if water intake is low
- Prioritize low-cost, locally available dishes first (affordable home-style options)
- Avoid premium or niche ingredients unless required by constraints and still affordable
- Do NOT introduce foods outside the provided list
- Return exactly ${safeTotalDays} days

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
    patient.planningInputs?.budgetTier || DEFAULT_BUDGET_TIER,
    patient.planningInputs?.localRegion || DEFAULT_LOCAL_REGION,
    goal || "",
    doshaType || "",
  ]
    .join("|")
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0);

const DEFAULT_GENERATION_DAYS = 7;
const MIN_GENERATION_DAYS = 1;
const MAX_GENERATION_DAYS = 14;

const normalizeTotalDays = (value, fallback = DEFAULT_GENERATION_DAYS) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  return Math.max(MIN_GENERATION_DAYS, Math.min(MAX_GENERATION_DAYS, rounded));
};

const expandMealsToTotalDays = (meals = [], totalDays = DEFAULT_GENERATION_DAYS) => {
  const normalized = normalizeMeals(meals);
  const safeTotalDays = normalizeTotalDays(totalDays, DEFAULT_GENERATION_DAYS);
  if (!normalized.length) return [];

  return Array.from({ length: safeTotalDays }, (_, index) => {
    const source = normalized[index % normalized.length] || {};
    return {
      day: `Day ${index + 1}`,
      breakfast: source.breakfast || "",
      lunch: source.lunch || "",
      dinner: source.dinner || "",
    };
  });
};

const createMockMeals = (
  patient,
  goal,
  doshaType,
  relevantFoods,
  totalDays = DEFAULT_GENERATION_DAYS
) => {
  const { canonicalGoal, pool, goalFoods } = buildFoodPools(
    goal,
    doshaType,
    relevantFoods,
    patient
  );
  const picks = pool;
  const safeTotalDays = normalizeTotalDays(totalDays, DEFAULT_GENERATION_DAYS);
  const personalizationSeed = getPersonalizationSeed(patient, goal, doshaType);
  const choose = (index, mealType, preferGoalFoods = false) => {
    const offset = (personalizationSeed + index) % Math.max(picks.length, 1);
    const basePool =
      preferGoalFoods && goalFoods.length ? goalFoods : picks;
    return chooseFoodFromPool(basePool, mealType, offset);
  };

  return Array.from({ length: safeTotalDays }, (_, index) => ({
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
  const { canonicalGoal, goalFoods } = buildFoodPools(
    goal,
    doshaType,
    relevantFoods,
    patient
  );

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

const signatureForMealDay = (mealDay = {}) =>
  ["breakfast", "lunch", "dinner"]
    .map((slot) => normalizeMealText(mealDay?.[slot] || ""))
    .join("|");

const findMatchingFoodInPool = (pool = [], mealText = "") => {
  const text = normalizeMealText(mealText);
  if (!text) return null;

  let bestMatch = null;
  let bestLength = 0;
  for (const food of pool) {
    const foodName = String(food?.name || "").trim();
    const normalizedFoodName = normalizeMealText(foodName);
    if (!normalizedFoodName) continue;

    if (text.includes(normalizedFoodName) || normalizedFoodName.includes(text)) {
      if (normalizedFoodName.length > bestLength) {
        bestMatch = food;
        bestLength = normalizedFoodName.length;
      }
    }
  }

  return bestMatch;
};

const alignMealsToSlotFoods = (meals = [], goal = "", doshaType = "", relevantFoods = [], patient) => {
  const normalizedMeals = normalizeMeals(meals);
  if (!normalizedMeals.length) return normalizedMeals;

  const { canonicalGoal, pool, goalFoods, patientLocalRegion } = buildFoodPools(
    goal,
    doshaType,
    relevantFoods,
    patient
  );
  const personalizationSeed = getPersonalizationSeed(patient, goal, doshaType);
  const slotOffset = { breakfast: 0, lunch: 1, dinner: 2 };

  return normalizedMeals.map((mealDay, dayIndex) => {
    const updated = { ...mealDay };
    ["breakfast", "lunch", "dinner"].forEach((slot) => {
      const currentValue = String(updated?.[slot] || "").trim();
      const matchedFood = findMatchingFoodInPool(pool, currentValue);
      const isSlotCompatible = Boolean(
        matchedFood && Array.isArray(matchedFood.mealTypes) && matchedFood.mealTypes.includes(slot)
      );

      if (isSlotCompatible) {
        // Normalize to canonical local dish name from the pool.
        updated[slot] = matchedFood.name;
        return;
      }

      const replacement = pickDistinctFoodName({
        mealType: slot,
        primaryPool: goalFoods.length ? goalFoods : pool,
        fallbackPool: pool,
        avoid: [currentValue],
        offset: personalizationSeed + dayIndex + (slotOffset[slot] || 0),
        canonicalGoal,
        patientLocalRegion,
        strictRegion: false,
      });

      if (replacement) {
        updated[slot] = replacement;
      }
    });

    return updated;
  });
};

const pickDistinctFoodName = ({
  mealType,
  primaryPool = [],
  fallbackPool = [],
  avoid = [],
  offset = 0,
  canonicalGoal = "general wellness",
  patientLocalRegion = DEFAULT_LOCAL_REGION,
  strictRegion = false,
  requireRegionMatch = false,
}) => {
  const blocked = new Set(
    avoid.map((value) => normalizeMealText(String(value || ""))).filter(Boolean)
  );
  const selectFrom = [primaryPool, fallbackPool];

  for (const source of selectFrom) {
    if (!Array.isArray(source) || !source.length) continue;
    const typeMatched = source.filter((food) => food.mealTypes.includes(mealType));
    const candidates = (typeMatched.length ? typeMatched : source)
      .filter((food) =>
        requireRegionMatch ? isExactRegionMatch(food, patientLocalRegion) : true
      )
      .map((food) => ({
        food,
        score: scoreFoodWithRegionBoost({
          food,
          canonicalGoal,
          mealType,
          patientLocalRegion,
          strictRegion,
        }),
      }))
      .sort((left, right) => right.score - left.score)
      .map((item) => item.food);

    for (let step = 0; step < candidates.length; step += 1) {
      const candidate = candidates[(offset + step) % candidates.length];
      const candidateName = String(candidate?.name || "").trim();
      if (!candidateName) continue;
      if (!blocked.has(normalizeMealText(candidateName))) {
        return candidateName;
      }
    }
  }

  return "";
};

const enforceMealVariety = (
  meals,
  goal,
  doshaType,
  relevantFoods,
  patient,
  totalDays = DEFAULT_GENERATION_DAYS
) => {
  const safeTotalDays = normalizeTotalDays(totalDays, DEFAULT_GENERATION_DAYS);
  const expandedMeals = expandMealsToTotalDays(meals, safeTotalDays);
  const { canonicalGoal, pool, goalFoods, regionalFoods, patientLocalRegion } = buildFoodPools(
    goal,
    doshaType,
    relevantFoods,
    patient
  );
  const personalizationSeed = getPersonalizationSeed(patient, goal, doshaType);
  const seenBySlot = {
    breakfast: new Set(),
    lunch: new Set(),
    dinner: new Set(),
  };
  const finalizedDays = [];

  return expandedMeals.map((mealDay, index) => {
    const updated = { ...mealDay, day: `Day ${index + 1}` };
    const previousDay = index > 0 ? finalizedDays[index - 1] : null;
    const slots = ["breakfast", "lunch", "dinner"];

    slots.forEach((slot, slotIndex) => {
      const currentValue = String(updated[slot] || "").trim();
      const previousValue = String(previousDay?.[slot] || "").trim();
      const normalizedCurrent = normalizeMealText(currentValue);
      const shouldReplace =
        !currentValue ||
        (previousValue &&
          normalizedCurrent === normalizeMealText(previousValue)) ||
        (normalizedCurrent && seenBySlot[slot].has(normalizedCurrent));

      if (!shouldReplace) {
        if (normalizedCurrent) {
          seenBySlot[slot].add(normalizedCurrent);
        }
        return;
      }

      const replacement = pickDistinctFoodName({
        mealType: slot,
        primaryPool: goalFoods.length ? goalFoods : pool,
        fallbackPool: pool,
        avoid: [currentValue, previousValue, ...Array.from(seenBySlot[slot])],
        offset: personalizationSeed + index + slotIndex,
        canonicalGoal,
        patientLocalRegion,
        strictRegion: false,
      });

      if (replacement) {
        updated[slot] = replacement;
        seenBySlot[slot].add(normalizeMealText(replacement));
      } else if (normalizedCurrent) {
        seenBySlot[slot].add(normalizedCurrent);
      }
    });

    if (
      index > 0 &&
      signatureForMealDay(updated) === signatureForMealDay(finalizedDays[index - 1])
    ) {
      const replacementDinner = pickDistinctFoodName({
        mealType: "dinner",
        primaryPool: goalFoods.length ? goalFoods : pool,
        fallbackPool: pool,
        avoid: [updated.dinner, finalizedDays[index - 1]?.dinner, updated.lunch],
        offset: personalizationSeed + index + 9,
        canonicalGoal,
        patientLocalRegion,
        strictRegion: false,
      });
      if (replacementDinner) {
        updated.dinner = replacementDinner;
        seenBySlot.dinner.add(normalizeMealText(replacementDinner));
      }
    }

    // Regional quota: enforce at least 2 locally matched core meals/day when a local region is set.
    if (patientLocalRegion !== DEFAULT_LOCAL_REGION && regionalFoods.length) {
      const coreSlots = ["breakfast", "lunch", "dinner"];
      const localMatches = coreSlots.filter((slot) => {
        const matched = findMatchingFoodInPool(pool, updated[slot]);
        return isExactRegionMatch(matched, patientLocalRegion);
      });

      if (localMatches.length < 2) {
        const neededMatches = 2 - localMatches.length;
        const regionalPrioritySlots = ["lunch", "dinner", "breakfast"];
        let addedMatches = 0;

        for (const slot of regionalPrioritySlots) {
          if (addedMatches >= neededMatches) {
            break;
          }
          if (localMatches.includes(slot)) {
            continue;
          }

          const replacement = pickDistinctFoodName({
            mealType: slot,
            primaryPool: regionalFoods,
            fallbackPool: regionalFoods,
            avoid: [updated[slot], updated.breakfast, updated.lunch, updated.dinner],
            offset: personalizationSeed + index + 13,
            canonicalGoal,
            patientLocalRegion,
            strictRegion: true,
            requireRegionMatch: true,
          });
          if (replacement) {
            updated[slot] = replacement;
            seenBySlot[slot].add(normalizeMealText(replacement));
            addedMatches += 1;
          }
        }
      }
    }

    finalizedDays.push(updated);
    return updated;
  });
};

const enforceDietitianHardRules = (
  meals = [],
  goal = "",
  doshaType = "",
  relevantFoods = [],
  patient = null
) => {
  const normalizedMeals = normalizeMeals(meals);
  if (!normalizedMeals.length) return normalizedMeals;

  const { canonicalGoal, pool, goalFoods, patientLocalRegion } = buildFoodPools(
    goal,
    doshaType,
    relevantFoods,
    patient
  );
  const requireLightDinner = SUPPORT_OR_WEIGHT_GOALS.has(canonicalGoal);

  return normalizedMeals.map((mealDay) => {
    const updated = { ...mealDay };

    if (isFruitLikeMeal(updated.lunch)) {
      const replacementLunch = pickBestSlotFood({
        mealType: "lunch",
        canonicalGoal,
        pool,
        goalFoods,
        avoid: [updated.lunch, updated.breakfast],
        patientLocalRegion,
        strictRegion: false,
      });
      if (replacementLunch) {
        updated.lunch = replacementLunch;
      }
    }

    if (isFruitLikeMeal(updated.dinner) || (requireLightDinner && !isLightDinnerMeal(updated.dinner))) {
      const replacementDinner = pickBestSlotFood({
        mealType: "dinner",
        canonicalGoal,
        pool,
        goalFoods,
        avoid: [updated.dinner, updated.lunch],
        requireLightDinner,
        patientLocalRegion,
        strictRegion: false,
      });
      if (replacementDinner) {
        updated.dinner = replacementDinner;
      }
    }

    return updated;
  });
};

const countRegionalCoreMatches = (mealDay = {}, pool = [], patientLocalRegion = DEFAULT_LOCAL_REGION) => {
  if (patientLocalRegion === DEFAULT_LOCAL_REGION) return 0;
  return ["breakfast", "lunch", "dinner"].reduce((count, slot) => {
    const matched = findMatchingFoodInPool(pool, mealDay?.[slot]);
    return isExactRegionMatch(matched, patientLocalRegion) ? count + 1 : count;
  }, 0);
};

const enforceRegionalCoreQuota = (
  meals = [],
  goal = "",
  doshaType = "",
  relevantFoods = [],
  patient = null
) => {
  const normalizedMeals = normalizeMeals(meals);
  if (!normalizedMeals.length) return normalizedMeals;

  const { canonicalGoal, pool, regionalFoods, patientLocalRegion } = buildFoodPools(
    goal,
    doshaType,
    relevantFoods,
    patient
  );

  if (patientLocalRegion === DEFAULT_LOCAL_REGION || !regionalFoods.length) {
    return normalizedMeals;
  }

  const personalizationSeed = getPersonalizationSeed(patient, goal, doshaType);
  const slotOffset = { breakfast: 0, lunch: 1, dinner: 2 };
  const regionalPrioritySlots = ["lunch", "dinner", "breakfast"];

  return normalizedMeals.map((mealDay, dayIndex) => {
    const updated = { ...mealDay };
    let matches = countRegionalCoreMatches(updated, pool, patientLocalRegion);
    if (matches >= 2) return updated;

    for (const slot of regionalPrioritySlots) {
      if (matches >= 2) break;
      const alreadyRegional = isExactRegionMatch(
        findMatchingFoodInPool(pool, updated[slot]),
        patientLocalRegion
      );
      if (alreadyRegional) continue;

      const strictReplacement = pickDistinctFoodName({
        mealType: slot,
        primaryPool: regionalFoods,
        fallbackPool: regionalFoods,
        avoid: [updated[slot], updated.breakfast, updated.lunch, updated.dinner],
        offset: personalizationSeed + dayIndex + (slotOffset[slot] || 0),
        canonicalGoal,
        patientLocalRegion,
        strictRegion: true,
        requireRegionMatch: true,
      });

      const replacement =
        strictReplacement ||
        pickDistinctFoodName({
          mealType: slot,
          primaryPool: regionalFoods,
          fallbackPool: regionalFoods,
          avoid: [updated[slot]],
          offset: personalizationSeed + dayIndex + 17 + (slotOffset[slot] || 0),
          canonicalGoal,
          patientLocalRegion,
          strictRegion: true,
          requireRegionMatch: true,
        });

      if (replacement) {
        updated[slot] = replacement;
        matches = countRegionalCoreMatches(updated, pool, patientLocalRegion);
      }
    }

    return updated;
  });
};

const enforceNoConsecutiveSlotRepeats = (
  meals = [],
  goal = "",
  doshaType = "",
  relevantFoods = [],
  patient = null
) => {
  const normalizedMeals = normalizeMeals(meals);
  if (normalizedMeals.length <= 1) return normalizedMeals;

  const { canonicalGoal, pool, goalFoods, regionalFoods, patientLocalRegion } = buildFoodPools(
    goal,
    doshaType,
    relevantFoods,
    patient
  );
  const personalizationSeed = getPersonalizationSeed(patient, goal, doshaType);
  const slotOffset = { breakfast: 0, lunch: 1, dinner: 2 };
  const updatedMeals = normalizedMeals.map((day) => ({ ...day }));

  for (let dayIndex = 1; dayIndex < updatedMeals.length; dayIndex += 1) {
    const day = updatedMeals[dayIndex];
    const previousDay = updatedMeals[dayIndex - 1];

    ["breakfast", "lunch", "dinner"].forEach((slot) => {
      const current = normalizeMealText(day?.[slot]);
      const previous = normalizeMealText(previousDay?.[slot]);
      if (!current || !previous || current !== previous) {
        return;
      }

      const matchedCurrent = findMatchingFoodInPool(pool, day?.[slot]);
      const currentIsRegional = isExactRegionMatch(matchedCurrent, patientLocalRegion);
      const regionalCount = countRegionalCoreMatches(day, pool, patientLocalRegion);
      const mustKeepRegional =
        patientLocalRegion !== DEFAULT_LOCAL_REGION &&
        regionalFoods.length > 0 &&
        currentIsRegional &&
        regionalCount <= 2;

      const replacement = pickDistinctFoodName({
        mealType: slot,
        primaryPool: mustKeepRegional
          ? regionalFoods
          : goalFoods.length
            ? goalFoods
            : pool,
        fallbackPool: mustKeepRegional ? regionalFoods : pool,
        avoid: [
          day[slot],
          previousDay?.[slot],
          day.breakfast,
          day.lunch,
          day.dinner,
          updatedMeals[dayIndex - 2]?.[slot],
        ],
        offset: personalizationSeed + dayIndex + (slotOffset[slot] || 0) + 29,
        canonicalGoal,
        patientLocalRegion,
        strictRegion: mustKeepRegional,
        requireRegionMatch: mustKeepRegional,
      });

      if (replacement) {
        day[slot] = replacement;
      }
    });
  }

  return updatedMeals;
};

const pickSafetyCompliantFoodName = ({
  mealType,
  canonicalGoal = "general wellness",
  goalFoods = [],
  pool = [],
  avoid = [],
  safetyProfile = {},
  patientLocalRegion = DEFAULT_LOCAL_REGION,
  strictRegion = false,
}) => {
  const blocked = new Set(
    avoid.map((value) => normalizeMealText(String(value || ""))).filter(Boolean)
  );
  const sources = [goalFoods, pool];

  for (const source of sources) {
    if (!Array.isArray(source) || !source.length) continue;

    const typeMatched = source.filter((food) => food.mealTypes.includes(mealType));
    const candidates = (typeMatched.length ? typeMatched : source)
      .map((food) => ({
        food,
        score: scoreFoodWithRegionBoost({
          food,
          canonicalGoal,
          mealType,
          patientLocalRegion,
          strictRegion,
        }),
      }))
      .sort((left, right) => right.score - left.score)
      .map((item) => item.food);

    for (const candidate of candidates) {
      const candidateName = String(candidate?.name || "").trim();
      if (!candidateName) continue;
      if (blocked.has(normalizeMealText(candidateName))) continue;
      if (evaluateMealSafety(candidateName, safetyProfile).length) continue;
      return candidateName;
    }
  }

  return "";
};

const applyDietSafetyCorrections = (
  meals = [],
  goal = "",
  doshaType = "",
  relevantFoods = [],
  patient = null,
  safetyProfile = {}
) => {
  const normalizedMeals = normalizeMeals(meals);
  if (!normalizedMeals.length) {
    return {
      meals: normalizedMeals,
      wasModified: false,
    };
  }

  const { canonicalGoal, pool, goalFoods, patientLocalRegion } = buildFoodPools(
    goal,
    doshaType,
    relevantFoods,
    patient
  );
  let wasModified = false;

  const corrected = normalizedMeals.map((mealDay) => {
    const updated = { ...mealDay };
    ["breakfast", "lunch", "dinner"].forEach((slot) => {
      const mealText = String(updated?.[slot] || "").trim();
      if (!mealText) return;
      const reasons = evaluateMealSafety(mealText, safetyProfile);
      if (!reasons.length) return;

      const replacement = pickSafetyCompliantFoodName({
        mealType: slot,
        canonicalGoal,
        goalFoods,
        pool,
        avoid: [mealText, updated.breakfast, updated.lunch, updated.dinner],
        safetyProfile,
        patientLocalRegion,
        strictRegion: false,
      });

      if (replacement) {
        updated[slot] = replacement;
        wasModified = true;
      }
    });
    return updated;
  });

  return {
    meals: corrected,
    wasModified,
  };
};

const PROTEIN_DENSE_KEYWORDS = [
  "paneer",
  "tofu",
  "egg",
  "chicken",
  "fish",
  "dal",
  "rajma",
  "chole",
  "chana",
  "sprout",
  "moong",
  "lentil",
  "soya",
  "curd",
  "yogurt",
];

const CALORIE_HEAVY_KEYWORDS = [
  "fried",
  "paratha",
  "biryani",
  "pakora",
  "makhani",
  "naan",
  "dessert",
  "sweet",
  "halwa",
  "laddu",
  "jalebi",
  "cream",
  "butter",
];

const CALORIE_LIGHT_KEYWORDS = [
  "soup",
  "stew",
  "salad",
  "khichdi",
  "lauki",
  "moong",
  "steamed",
  "clear",
  "vegetable",
];

const deriveNutritionTargets = (patient = {}) => {
  const normalized = processPatientInput(patient || {}, {
    requireCoreFields: false,
    partialUpdate: false,
  });
  const userProfile = normalized?.userProfile || {};
  const healthProfile = buildHealthProfile(userProfile);
  const calorieTarget = Number(healthProfile?.targets?.calorieTargetKcal || 0) || null;
  const proteinTarget = Number(healthProfile?.targets?.proteinTargetGrams || 0) || null;

  return {
    calorieTarget,
    proteinTarget,
  };
};

const estimateMealCalories = (mealText = "") => {
  const text = String(mealText || "").toLowerCase();
  if (!text.trim()) return 0;
  let calories = 420;

  if (CALORIE_HEAVY_KEYWORDS.some((token) => text.includes(token))) calories += 180;
  if (CALORIE_LIGHT_KEYWORDS.some((token) => text.includes(token))) calories -= 120;
  if (text.includes("snack")) calories -= 80;

  return Math.max(150, calories);
};

const estimateMealProtein = (mealText = "") => {
  const text = String(mealText || "").toLowerCase();
  if (!text.trim()) return 0;
  let protein = 8;

  PROTEIN_DENSE_KEYWORDS.forEach((token) => {
    if (text.includes(token)) protein += 7;
  });

  return Math.min(45, protein);
};

const validateNutritionTargets = (meals = [], targets = {}) => {
  const normalizedMeals = normalizeMeals(meals);
  if (!normalizedMeals.length) {
    return {
      isValid: false,
      score: 0,
      reason: "empty_plan",
      estimated: {
        avgCalories: null,
        avgProtein: null,
      },
      mismatch: {
        calories: null,
        protein: null,
      },
    };
  }

  const daySummaries = normalizedMeals.map((dayPlan) => {
    const dayCalories =
      estimateMealCalories(dayPlan.breakfast) +
      estimateMealCalories(dayPlan.lunch) +
      estimateMealCalories(dayPlan.dinner);
    const dayProtein =
      estimateMealProtein(dayPlan.breakfast) +
      estimateMealProtein(dayPlan.lunch) +
      estimateMealProtein(dayPlan.dinner);

    return {
      calories: dayCalories,
      protein: dayProtein,
    };
  });

  const avgCalories = Number(
    (
      daySummaries.reduce((sum, day) => sum + day.calories, 0) /
      daySummaries.length
    ).toFixed(0)
  );
  const avgProtein = Number(
    (
      daySummaries.reduce((sum, day) => sum + day.protein, 0) /
      daySummaries.length
    ).toFixed(0)
  );

  const calorieTarget = Number(targets?.calorieTarget || 0) || null;
  const proteinTarget = Number(targets?.proteinTarget || 0) || null;

  if (!calorieTarget && !proteinTarget) {
    return {
      isValid: true,
      score: 100,
      reason: "no_targets_provided",
      estimated: {
        avgCalories,
        avgProtein,
      },
      mismatch: {
        calories: null,
        protein: null,
      },
    };
  }

  const calorieDeviation = calorieTarget
    ? Number((((avgCalories - calorieTarget) / calorieTarget) * 100).toFixed(1))
    : 0;
  const proteinDeviation = proteinTarget
    ? Number((((avgProtein - proteinTarget) / proteinTarget) * 100).toFixed(1))
    : 0;

  const calorieValid = !calorieTarget || Math.abs(calorieDeviation) <= 15;
  const proteinValid = !proteinTarget || proteinDeviation >= -10;

  const caloriePenalty = calorieTarget ? Math.min(60, Math.abs(calorieDeviation) * 1.5) : 0;
  const proteinPenalty = proteinTarget ? Math.min(40, Math.max(0, -proteinDeviation) * 2) : 0;
  const score = Math.max(0, Math.round(100 - caloriePenalty - proteinPenalty));

  return {
    isValid: calorieValid && proteinValid,
    score,
    reason: calorieValid && proteinValid ? "within_targets" : "target_mismatch",
    estimated: {
      avgCalories,
      avgProtein,
    },
    mismatch: {
      calories: calorieTarget ? calorieDeviation : null,
      protein: proteinTarget ? proteinDeviation : null,
    },
  };
};

const buildNutritionCorrectionInstructions = (validation = {}, targets = {}) => {
  const lines = [];
  const calorieDeviation = Number(validation?.mismatch?.calories);
  const proteinDeviation = Number(validation?.mismatch?.protein);
  const calorieTarget = Number(targets?.calorieTarget || 0) || null;
  const proteinTarget = Number(targets?.proteinTarget || 0) || null;

  if (calorieTarget) {
    lines.push(
      `- Daily calories should move closer to target ${calorieTarget} kcal (current estimate ${validation?.estimated?.avgCalories ?? "n/a"} kcal).`
    );
    if (Number.isFinite(calorieDeviation) && calorieDeviation > 15) {
      lines.push("- Reduce total calories: prefer lighter cooking and lower-calorie meals.");
    } else if (Number.isFinite(calorieDeviation) && calorieDeviation < -15) {
      lines.push("- Increase total calories moderately with balanced additions.");
    }
  }

  if (proteinTarget) {
    lines.push(
      `- Daily protein should reach at least target ${proteinTarget} g (current estimate ${validation?.estimated?.avgProtein ?? "n/a"} g).`
    );
    if (Number.isFinite(proteinDeviation) && proteinDeviation < -10) {
      lines.push("- Increase protein-rich foods (dal, paneer, tofu, sprouts, eggs/fish/chicken if allowed).");
    }
  }

  lines.push("- Keep output format unchanged and do not add commentary.");
  return lines.join("\n");
};

const buildUserFriendlyGoalMatch = (goal = "") => {
  const normalized = normalizeGoalForFoods(goal);
  if (normalized === "weight loss") {
    return "Meals are kept lighter and balanced to support gradual fat loss and better consistency.";
  }
  if (normalized === "muscle gain") {
    return "Meals include more protein-focused options to support strength and recovery.";
  }
  if (normalized === "diabetes support") {
    return "Meals prioritize steadier energy and lower sugar-load choices for blood sugar support.";
  }
  if (normalized === "hypertension support") {
    return "Meals emphasize lower-salt and heart-supportive options.";
  }
  if (normalized === "better digestion") {
    return "Meals are selected to be easier on digestion and reduce heaviness.";
  }
  return "Meals are balanced around your daily routine and wellness goals.";
};

const buildKeyHealthConsiderations = (patient = {}, doshaType = "", healthProfile = null) => {
  const considerations = [];
  const conditions = String(patient?.healthConditions || "").trim();
  const allergies = String(patient?.allergies || "").trim();
  const medications = String(patient?.currentMedications || "").trim();
  const riskConditions = Array.isArray(healthProfile?.riskConditions)
    ? healthProfile.riskConditions
    : [];

  if (conditions) {
    considerations.push(`Health conditions considered: ${conditions}.`);
  }
  if (allergies) {
    considerations.push(`Allergy precautions applied: ${allergies}.`);
  }
  if (medications) {
    considerations.push(`Medication context noted: ${medications}.`);
  }
  if (doshaType) {
    considerations.push(`Dosha guidance applied for ${doshaType}.`);
  }
  if (riskConditions.length && !riskConditions.includes("none")) {
    considerations.push(
      `Risk-aware adjustments included for: ${riskConditions.join(", ")}.`
    );
  }
  if (!considerations.length) {
    considerations.push("General wellness and routine adherence were prioritized.");
  }

  return considerations;
};

const buildExplainability = ({
  patient = {},
  goal = "",
  doshaType = "",
  progressSummary = null,
  historyProfile = null,
}) => {
  const normalized = processPatientInput(patient || {}, {
    requireCoreFields: false,
    partialUpdate: false,
  });
  const userProfile = normalized?.userProfile || {};
  const healthProfile = buildHealthProfile(userProfile);
  const progressNotes = Array.isArray(progressSummary?.insights)
    ? progressSummary.insights
    : [];

  const whyRecommended = historyProfile?.hasHistory
    ? "This plan builds on your previous responses and keeps recommendations practical for long-term adherence."
    : "This plan is tailored from your current profile, goal, and daily routine.";

  return {
    whyThisPlanIsRecommended: whyRecommended,
    howItMatchesYourGoal: buildUserFriendlyGoalMatch(goal),
    keyHealthConsiderations: [
      ...buildKeyHealthConsiderations(patient, doshaType, healthProfile),
      ...(progressNotes.length
        ? [`Recent progress signals considered: ${progressNotes.join("; ")}.`]
        : []),
    ].slice(0, 5),
  };
};

const buildPipelineTrace = (generationMetadata = {}) => ({
  stages: [
    "Form Input",
    "Data Cleaner",
    "Health Engine (BMI, TDEE, targets)",
    "Context Builder",
    `LLM (${MEALS_LLM_MODEL || "openai/gpt-oss-120b"})`,
    "Rule Engine + Validation",
    "Refinement Loop",
    "Final Diet Plan",
    "User History (Memory)",
  ],
  llmModel: generationMetadata.generationModel || MEALS_LLM_MODEL || "openai/gpt-oss-120b",
  generationSource: generationMetadata.generationSource || "unknown",
  refinement:
    generationMetadata.generationFallbackReason &&
    String(generationMetadata.generationFallbackReason).includes("iterative_refinement")
      ? "applied"
      : "applied_if_needed",
  safety:
    generationMetadata.generationFallbackReason &&
    String(generationMetadata.generationFallbackReason).includes("safety")
      ? "applied"
      : "applied_if_needed",
});

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

const cleanMealText = (value = "") =>
  String(value || "")
    .split("|")[0]
    .replace(/\s+/g, " ")
    .trim();

const normalizeSlotPlanItem = (item = {}, fallbackMealDay = {}) => {
  const normalizedDay = String(item?.day || fallbackMealDay?.day || "").trim();
  const normalized = {
    day: normalizedDay || fallbackMealDay?.day || "Day 1",
  };

  SLOT_KEYS.forEach((key) => {
    const value = String(item?.[key] || "").trim();
    if (value) {
      normalized[key] = value;
    }
  });

  if (!normalized.breakfast) normalized.breakfast = cleanMealText(fallbackMealDay?.breakfast);
  if (!normalized.lunch) normalized.lunch = cleanMealText(fallbackMealDay?.lunch);
  if (!normalized.dinner) normalized.dinner = cleanMealText(fallbackMealDay?.dinner);

  return normalized;
};

const normalizeSlotPlans = (slotPlans = [], baseMeals = []) => {
  if (!Array.isArray(slotPlans) || !slotPlans.length) {
    return [];
  }

  return slotPlans.map((item, index) =>
    normalizeSlotPlanItem(item, baseMeals[index] || { day: `Day ${index + 1}` })
  );
};

const SLOT_TIMING_MAP = {
  earlyMorning: "wakeUpTime",
  breakfast: "breakfastTime",
  lunch: "lunchTime",
  evening: "eveningSnackTime",
  lateEvening: "eveningSnackTime",
  dinner: "dinnerTime",
  bedTime: "bedTime",
};

const SLOT_WINDOW_MINUTES = {
  earlyMorning: 60,
  breakfast: 90,
  lunch: 120,
  evening: 90,
  lateEvening: 90,
  dinner: 120,
  bedTime: 90,
};

const CLOCK_TOKEN_REGEX = /(\d{1,2})\s*:\s*(\d{2})(?:\s*(AM|PM))?/i;

const toClockMinutes = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return null;

  const match = text.match(CLOCK_TOKEN_REGEX);
  if (!match) return null;

  const rawHour = Number(match[1]);
  const rawMinute = Number(match[2]);
  const meridiem = String(match[3] || "").toUpperCase();

  if (
    Number.isNaN(rawHour) ||
    Number.isNaN(rawMinute) ||
    rawMinute < 0 ||
    rawMinute > 59
  ) {
    return null;
  }

  if (meridiem === "AM" || meridiem === "PM") {
    if (rawHour < 1 || rawHour > 12) return null;
    const hour = rawHour % 12 + (meridiem === "PM" ? 12 : 0);
    return hour * 60 + rawMinute;
  }

  if (rawHour < 0 || rawHour > 23) return null;
  return rawHour * 60 + rawMinute;
};

const formatMinutesTo12Hour = (minutes = 0) => {
  const total = Number(minutes);
  if (Number.isNaN(total)) return "";
  const normalized = ((total % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(
    2,
    "0"
  )} ${suffix}`;
};

const minutesDeltaCircular = (left = 0, right = 0) => {
  const diff = Math.abs(Number(left) - Number(right));
  return Math.min(diff, 1440 - diff);
};

const isWithinTimeWindow = (actualMinutes, targetMinutes, windowMinutes) => {
  if (
    actualMinutes === null ||
    targetMinutes === null ||
    Number.isNaN(Number(windowMinutes))
  ) {
    return true;
  }
  return minutesDeltaCircular(actualMinutes, targetMinutes) <= Number(windowMinutes);
};

const extractFirstClockToken = (text = "") => {
  const match = String(text || "").match(CLOCK_TOKEN_REGEX);
  return match ? match[0] : "";
};

const stripLeadingClockPrefix = (text = "") =>
  String(text || "")
    .replace(
      /^\s*\d{1,2}\s*:\s*\d{2}(?:\s*(?:AM|PM))?\s*(?:[-|,]\s*|\s+)/i,
      ""
    )
    .trim();

const applyTimePrefix = (label = "", timeValue = "") => {
  const time = String(timeValue || "").trim();
  if (!time) return String(label || "").trim();
  const text = stripLeadingClockPrefix(String(label || "").trim());
  if (!text) return time;
  if (/^\d{1,2}:\d{2}\b/.test(text)) return text;
  return `${time} - ${text}`;
};

const sanitizeSlotText = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let text = raw
    .replace(/^\s*\d{1,2}\s*:\s*\d{2}(?:\s*(?:AM|PM))?\s*[-|,]?\s*/i, "")
    .replace(/\|+/g, " ")
    .replace(/\s+\|\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Avoid contradictory portion cues like "rice ... 2 rotis".
  if (
    /rice/i.test(text) &&
    /portion\s*:/i.test(text) &&
    /roti/i.test(text)
  ) {
    text = text.replace(/portion\s*:[^;,.]*/i, "Portion: moderate serving");
  }

  return text;
};

const sanitizeSlotPlans = (slotPlans = []) =>
  (Array.isArray(slotPlans) ? slotPlans : []).map((dayPlan) => {
    const next = { ...dayPlan };
    SLOT_KEYS.forEach((slotKey) => {
      if (!next[slotKey]) return;
      next[slotKey] = sanitizeSlotText(next[slotKey]);
    });
    return next;
  });

const SLOT_TIME_RULES = {
  earlyMorning: { source: "wakeUpTime", offset: 0 },
  morning: { source: "breakfastTime", offset: -60 },
  afterExercise: { source: "breakfastTime", offset: 30 },
  breakfast: { source: "breakfastTime", offset: 0 },
  midMorning: { source: "lunchTime", offset: -150 },
  lunch: { source: "lunchTime", offset: 0 },
  after2Hours: { source: "lunchTime", offset: 120 },
  evening: { source: "eveningSnackTime", offset: 0 },
  lateEvening: { source: "eveningSnackTime", offset: 90 },
  dinner: { source: "dinnerTime", offset: 0 },
  bedTime: { source: "bedTime", offset: 0 },
};

const resolveSlotTargetMinutes = (mealTimings = {}, slotKey = "") => {
  const rule = SLOT_TIME_RULES[slotKey];
  if (!rule) return null;
  const anchor = toClockMinutes(mealTimings?.[rule.source]);
  if (anchor === null) return null;
  return ((anchor + rule.offset) % 1440 + 1440) % 1440;
};

const PROTEIN_SIGNAL_TOKENS = [
  "paneer",
  "tofu",
  "egg",
  "chicken",
  "fish",
  "dal",
  "chana",
  "rajma",
  "sprout",
  "protein",
  "curd",
  "yogurt",
  "milk",
];

const hasProteinSignal = (value = "") =>
  PROTEIN_SIGNAL_TOKENS.some((token) =>
    String(value || "").toLowerCase().includes(token)
  );

const enforceSlotChartGoalRules = (slotPlans = [], goal = "") => {
  const normalizedGoal = normalizeGoalForFoods(goal);
  if (!Array.isArray(slotPlans) || !slotPlans.length) return [];

  if (normalizedGoal !== "muscle gain") {
    return slotPlans;
  }

  return slotPlans.map((dayPlan) => {
    const next = { ...dayPlan };
    const keyMeals = [next.breakfast, next.lunch, next.dinner, next.afterExercise];
    const hasAnyProteinFocus = keyMeals.some(hasProteinSignal);

    if (!hasAnyProteinFocus) {
      next.afterExercise =
        "Plant-protein shake or roasted chana with buttermilk";
      next.dinner = next.dinner
        ? `${stripLeadingClockPrefix(next.dinner)} + protein side`
        : "Paneer/tofu with vegetables + 1 phulka";
    }

    if (next.lateEvening && /honey/i.test(next.lateEvening)) {
      next.lateEvening = String(next.lateEvening).replace(
        /\bwith\s+a\s+teaspoon\s+honey\b/i,
        "with unsalted seeds"
      );
    }

    return next;
  });
};

const validateSlotPlanTimings = (slotPlans = [], planningInputs = {}) => {
  const mealTimings = planningInputs?.mealTimings || {};
  const violations = [];

  if (!Array.isArray(slotPlans) || !slotPlans.length) {
    return { isValid: false, violations: [{ reason: "empty_slot_plans" }] };
  }

  slotPlans.forEach((dayPlan, dayIndex) => {
    Object.entries(SLOT_TIMING_MAP).forEach(([slotKey, timingField]) => {
      const slotText = String(dayPlan?.[slotKey] || "").trim();
      if (!slotText) return;

      const ruleTargetMinutes = resolveSlotTargetMinutes(mealTimings, slotKey);
      const configuredTime =
        ruleTargetMinutes !== null
          ? formatMinutesTo12Hour(ruleTargetMinutes)
          : String(mealTimings?.[timingField] || "").trim();
      if (!configuredTime) return;

      const configuredMinutes =
        ruleTargetMinutes !== null ? ruleTargetMinutes : toClockMinutes(configuredTime);
      if (configuredMinutes === null) return;

      const detectedToken = extractFirstClockToken(slotText);
      if (!detectedToken) return;

      const detectedMinutes = toClockMinutes(detectedToken);
      const allowedWindow = SLOT_WINDOW_MINUTES[slotKey] ?? 90;

      if (!isWithinTimeWindow(detectedMinutes, configuredMinutes, allowedWindow)) {
        violations.push({
          day: dayPlan?.day || `Day ${dayIndex + 1}`,
          slot: slotKey,
          expected: formatMinutesTo12Hour(configuredMinutes),
          actual: formatMinutesTo12Hour(detectedMinutes),
          windowMinutes: allowedWindow,
        });
      }
    });
  });

  return {
    isValid: violations.length === 0,
    violations,
  };
};

const buildTimingWindowInstructions = (planningInputs = {}) => {
  const mealTimings = planningInputs?.mealTimings || {};
  const lines = [];

  Object.entries(SLOT_TIMING_MAP).forEach(([slotKey, timingField]) => {
    const configuredTime = String(mealTimings?.[timingField] || "").trim();
    if (!configuredTime) return;
    const minutes = toClockMinutes(configuredTime);
    if (minutes === null) return;
    const windowMinutes = SLOT_WINDOW_MINUTES[slotKey] ?? 90;
    lines.push(
      `- ${slotKey}: keep around ${formatMinutesTo12Hour(
        minutes
      )} (allowed +/- ${windowMinutes} minutes)`
    );
  });

  return lines.length
    ? `Timing windows that MUST be respected if time appears in slot text:\n${lines.join(
        "\n"
      )}`
    : "No strict timing windows provided.";
};

const applyMealTimingsToSlotPlans = (slotPlans = [], planningInputs = {}) => {
  if (!Array.isArray(slotPlans) || !slotPlans.length) {
    return [];
  }

  return slotPlans.map((dayPlan) => {
    const next = { ...dayPlan };
    SLOT_KEYS.forEach((slotKey) => {
      if (!next[slotKey]) return;
      // Keep slot text content-only. Times are managed in the Meal Timings card.
      next[slotKey] = sanitizeSlotText(next[slotKey]);
    });
    return next;
  });
};

const buildFallbackSlotPlans = (baseMeals = [], patient = {}, plan = {}) => {
  const planningInputs = patient?.planningInputs || {};
  const stressLevel = Number(planningInputs?.stressLevel || 3);
  const waterLiters = Number(planningInputs?.waterIntakeLiters || 2);
  const dosha = String(plan?.doshaType || "").trim().toLowerCase();

  const doshaHint =
    dosha === "vata"
      ? "Prefer warm meals"
      : dosha === "pitta"
        ? "Prefer cooling meals"
        : dosha === "kapha"
          ? "Prefer light meals"
          : "Keep meals balanced";

  return normalizeMeals(baseMeals).map((mealDay, index) => ({
    day: mealDay.day || `Day ${index + 1}`,
    earlyMorning: `1 glass lukewarm water (${doshaHint})`,
    morning: stressLevel >= 4 ? "1 cup herbal tea" : "1 cup tea / black coffee",
    afterExercise: "200 ml toned milk or 1 fruit",
    breakfast: cleanMealText(mealDay.breakfast) || "-",
    midMorning: "1 fruit / coconut water",
    lunch: cleanMealText(mealDay.lunch) || "-",
    after2Hours:
      waterLiters >= 3
        ? "1 glass buttermilk + hydration reminder"
        : "1 glass buttermilk / coconut water",
    evening: "1 cup tea/coffee + light snack",
    lateEvening: "1 fruit / salad",
    dinner: cleanMealText(mealDay.dinner) || "-",
    bedTime: "1 cup warm milk",
  }));
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

const requestJsonFromOpenAiCompatible = async ({
  endpoint,
  apiKey,
  model,
  prompt,
  provider,
  timeoutMs = 20000,
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
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are an Ayurvedic diet planner. Return strict valid JSON only with no markdown and no extra keys.",
          },
          {
            role: "user",
            content: String(prompt || "").trim(),
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
        data: null,
        errorReason: `${provider}_http_${response.status}${
          providerErrorCode ? `_${providerErrorCode}` : ""
        }`,
      };
    }

    const data = await response.json().catch(() => null);
    const content = String(data?.choices?.[0]?.message?.content || "").trim();
    const parsed = tryParseJson(content);
    if (!parsed || typeof parsed !== "object") {
      return {
        data: null,
        errorReason: `${provider}_parse_failed`,
      };
    }

    return {
      data: parsed,
      errorReason: null,
    };
  } catch (error) {
    return {
      data: null,
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

const generateMealsWithAi = async (
  patient,
  goal,
  doshaType,
  progressSummary,
  historyProfile = null,
  totalDays = DEFAULT_GENERATION_DAYS
) => {
  const relevantFoods = getRelevantFoods(goal, doshaType, patient);
  const model = MEALS_LLM_MODEL;
  const endpoint = ensureChatCompletionsEndpoint(MEALS_LLM_BASE_URL);
  const provider = inferOpenAiCompatibleProvider(endpoint);
  const apiKey = MEALS_LLM_API_KEY;
  const safeTotalDays = normalizeTotalDays(totalDays, DEFAULT_GENERATION_DAYS);
  const safetyProfile = buildDietSafetyProfile({ patient, goal });
  const safetyConstraintText = buildSafetyConstraintText(safetyProfile);
  const nutritionTargets = deriveNutritionTargets(patient);
  const maxRefinementAttempts = 3;

  const prepareSafeMeals = (rawMeals = []) => {
    const goalAlignedMeals = enforceGoalSpecificMeals(
      rawMeals,
      goal,
      doshaType,
      relevantFoods,
      patient
    );
    const slotAlignedMeals = alignMealsToSlotFoods(
      goalAlignedMeals,
      goal,
      doshaType,
      relevantFoods,
      patient
    );
    const variedMeals = enforceMealVariety(
      slotAlignedMeals,
      goal,
      doshaType,
      relevantFoods,
      patient,
      safeTotalDays
    );
    const hardRuleMeals = enforceDietitianHardRules(
      variedMeals,
      goal,
      doshaType,
      relevantFoods,
      patient
    );
    const corrected = applyDietSafetyCorrections(
      hardRuleMeals,
      goal,
      doshaType,
      relevantFoods,
      patient,
      safetyProfile
    );
    const regionalQuotaMeals = enforceRegionalCoreQuota(
      corrected.meals,
      goal,
      doshaType,
      relevantFoods,
      patient
    );
    const noStreakMeals = enforceNoConsecutiveSlotRepeats(
      regionalQuotaMeals,
      goal,
      doshaType,
      relevantFoods,
      patient
    );
    const finalizedMeals = enforceRegionalCoreQuota(
      noStreakMeals,
      goal,
      doshaType,
      relevantFoods,
      patient
    );
    const safetyCheck = evaluateMealsSafety(finalizedMeals, safetyProfile);

    return {
      meals: finalizedMeals,
      safetyCheck,
      wasCorrected: corrected.wasModified,
    };
  };

  if (!relevantFoods.length) {
    return {
      meals: createMockMeals(patient, goal, doshaType, [], safeTotalDays),
      generationSource: "fallback_mock",
      generationFallbackReason: "no_relevant_foods",
      generationModel: null,
    };
  }

  if (!endpoint) {
    return {
      meals: createMockMeals(patient, goal, doshaType, relevantFoods, safeTotalDays),
      generationSource: "fallback_mock",
      generationFallbackReason: "missing_meals_llm_base_url",
      generationModel: null,
    };
  }

  if (!apiKey) {
    return {
      meals: createMockMeals(patient, goal, doshaType, relevantFoods, safeTotalDays),
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
    progressSummary,
    historyProfile,
    safeTotalDays
  );

  let bestCandidate = null;
  let correctionInstructions = "";
  let firstErrorReason = null;

  for (let attempt = 1; attempt <= maxRefinementAttempts; attempt += 1) {
    const iterativePrompt = correctionInstructions
      ? `${prompt}

ITERATIVE REFINEMENT INSTRUCTIONS (attempt ${attempt}/${maxRefinementAttempts}):
${correctionInstructions}

CRITICAL DIET SAFETY OVERRIDES (MUST FOLLOW):
${safetyConstraintText}
`.trim()
      : prompt;

    const llmResult = await requestMealsFromOpenAiCompatible({
      provider,
      endpoint,
      apiKey,
      model,
      prompt: iterativePrompt,
      timeoutMs: MEALS_LLM_TIMEOUT_MS,
      useJsonResponseFormat: false,
    });

    if (!llmResult.meals) {
      if (!firstErrorReason) {
        firstErrorReason = llmResult.errorReason || `${provider}_failed`;
      }
      continue;
    }

    const prepared = prepareSafeMeals(llmResult.meals);
    const nutritionValidation = validateNutritionTargets(prepared.meals, nutritionTargets);
    const fullyValid = prepared.safetyCheck.safe && nutritionValidation.isValid;
    const qualityScore = Math.round(
      (prepared.safetyCheck.safe ? 55 : 15) + nutritionValidation.score * 0.45
    );

    if (!bestCandidate || qualityScore > bestCandidate.qualityScore) {
      bestCandidate = {
        meals: prepared.meals,
        qualityScore,
        safetyOk: prepared.safetyCheck.safe,
        nutritionValidation,
        attempt,
      };
    }

    if (fullyValid) {
      return {
        meals: prepared.meals,
        generationSource: provider,
        generationFallbackReason:
          attempt === 1
            ? prepared.wasCorrected
              ? "safety_auto_corrected"
              : null
            : `iterative_refinement_success_attempt_${attempt}`,
        generationModel: model,
      };
    }

    const nutritionCorrections = buildNutritionCorrectionInstructions(
      nutritionValidation,
      nutritionTargets
    );

    correctionInstructions = `
- Previous attempt failed validation.
- Safety violations found: ${prepared.safetyCheck.safe ? "none" : JSON.stringify(prepared.safetyCheck.violations)}.
- Nutrition mismatch: ${JSON.stringify(nutritionValidation)}.
${nutritionCorrections}
- Keep meals practical, Indian, and goal-aligned.
`.trim();
  }

  if (bestCandidate?.meals?.length) {
    return {
      meals: bestCandidate.meals,
      generationSource: provider,
      generationFallbackReason: `iterative_refinement_best_effort_attempt_${bestCandidate.attempt}`,
      generationModel: model,
    };
  }

  const fallbackPrepared = prepareSafeMeals(
    createMockMeals(patient, goal, doshaType, relevantFoods, safeTotalDays)
  );

  return {
    meals: fallbackPrepared.meals,
    generationSource: "fallback_mock",
    generationFallbackReason:
      firstErrorReason || `${provider}_failed`,
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
  historyProfile = null,
  generationMetadata = {}
) => {
  const canonicalGoal = normalizeGoalForFoods(goal);
  const localRegionUsed = normalizeLocalRegion(
    patient?.planningInputs?.localRegion || DEFAULT_LOCAL_REGION
  );
  const budgetTierUsed = normalizeBudgetTier(
    patient?.planningInputs?.budgetTier || DEFAULT_BUDGET_TIER
  );
  const goalTargetsUsed = getGoalTargets(canonicalGoal);
  const rankedFoodNames = [...(relevantFoods || [])]
    .map((food) => ({
      name: food?.name || "",
      score: scoreFoodForGoal(food, canonicalGoal),
    }))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.name)
    .filter(Boolean);
  const explainability = buildExplainability({
    patient,
    goal,
    doshaType,
    progressSummary,
    historyProfile,
  });
  const mealCart = buildMealCartOptions(meals, relevantFoods);
  const regionalFoodsCount = (Array.isArray(relevantFoods) ? relevantFoods : []).filter((food) =>
    isExactRegionMatch(food, localRegionUsed)
  ).length;

  return {
    success: true,
    foods: relevantFoods,
    meals,
    mealCart,
    validation: validatePlan(meals, doshaType),
    patientContext: buildPatientSummary(patient, goal, doshaType),
    progressInsights: progressSummary.insights,
    historyInsights: historyProfile?.summaryText || null,
    explainability,
    pipeline: buildPipelineTrace(generationMetadata),
    generationSource: generationMetadata.generationSource || "unknown",
    generationFallbackReason: generationMetadata.generationFallbackReason || null,
    generationModel: generationMetadata.generationModel || null,
    generationDebug: {
      localRegionUsed,
      budgetTierUsed,
      regionalFoodsCount,
      totalRelevantFoods: Array.isArray(relevantFoods) ? relevantFoods.length : 0,
    },
    goalDebug: {
      goalRaw: String(goal || "").trim(),
      goalCanonical: canonicalGoal,
      goalTargetsUsed,
      patientDietType: normalizeDietTypeForFoods(patient?.dietType),
      rankedFoodNames,
      relevantFoodsCount: Array.isArray(relevantFoods) ? relevantFoods.length : 0,
    },
  };
};

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
    const { patientId, goal, doshaType, totalDays } = req.body;

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
    const safeTotalDays = normalizeTotalDays(totalDays, DEFAULT_GENERATION_DAYS);
    const relevantFoods = getRelevantFoods(normalizedGoal, doshaType, patient);
    const progressLogs = await getRecentProgressLogs(patientId, req.user.id, patient);
    const progressSummary = buildProgressInsights(progressLogs, normalizedGoal);
    const historyProfile = await buildPatientHistoryProfile(patientId);
    const generationResult = await generateMealsWithAi(
      patient,
      normalizedGoal,
      doshaType,
      progressSummary,
      historyProfile,
      safeTotalDays
    );
    const meals = generationResult.meals;
    await trackPlanSnapshot({
      patientId,
      plan: {
        title: `AI Recommendation - ${normalizedGoal}`,
        goal: normalizedGoal,
        doshaType,
        meals,
        status: "generated_preview",
        isActive: false,
      },
      source: "ai_generated_preview",
      generationSource: generationResult.generationSource,
    }).catch(() => {});

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
          historyProfile,
          generationResult
        )
      );
  } catch (error) {
    next(error);
  }
};

const generateAiDay = async (req, res, next) => {
  try {
    const { dayNumber, patientId, goal, doshaType, totalDays } = req.body;

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
    const requestedDays = normalizeTotalDays(totalDays, DEFAULT_GENERATION_DAYS);
    const safeTotalDays = normalizeTotalDays(
      Math.max(Number(dayNumber) || 1, requestedDays),
      requestedDays
    );
    const relevantFoods = getRelevantFoods(normalizedGoal, doshaType, patient);
    const progressLogs = await getRecentProgressLogs(patientId, req.user.id, patient);
    const progressSummary = buildProgressInsights(progressLogs, normalizedGoal);
    const historyProfile = await buildPatientHistoryProfile(patientId);
    const generationResult = await generateMealsWithAi(
      patient,
      normalizedGoal,
      doshaType,
      progressSummary,
      historyProfile,
      safeTotalDays
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
    const canonicalGoal = normalizeGoalForFoods(normalizedGoal);
    const goalTargetsUsed = getGoalTargets(canonicalGoal);
    const rankedFoodNames = [...(relevantFoods || [])]
      .map((food) => ({
        name: food?.name || "",
        score: scoreFoodForGoal(food, canonicalGoal),
      }))
      .sort((left, right) => right.score - left.score)
      .map((item) => item.name)
      .filter(Boolean);
    const explainability = buildExplainability({
      patient,
      goal: normalizedGoal,
      doshaType,
      progressSummary,
      historyProfile,
    });
    const singleDayMeals = [
      {
        day: dayMeal.day || fallbackDay.day,
        breakfast: dayMeal.breakfast || "",
        lunch: dayMeal.lunch || "",
        dinner: dayMeal.dinner || "",
      },
    ];
    const mealCart = buildMealCartOptions(singleDayMeals, relevantFoods);

    res.status(200).json({
      success: true,
      foods: relevantFoods,
      mealCart,
      day: {
        day: dayMeal.day || fallbackDay.day,
        breakfast: dayMeal.breakfast || "",
        lunch: dayMeal.lunch || "",
        dinner: dayMeal.dinner || "",
      },
      validation: validatePlan(
        singleDayMeals,
        doshaType
      ),
      generationSource: generationResult.generationSource || "unknown",
      generationFallbackReason: generationResult.generationFallbackReason || null,
      generationModel: generationResult.generationModel || null,
      explainability,
      pipeline: buildPipelineTrace(generationResult),
      goalDebug: {
        goalRaw: String(normalizedGoal || "").trim(),
        goalCanonical: canonicalGoal,
        goalTargetsUsed,
        patientDietType: normalizeDietTypeForFoods(patient?.dietType),
        rankedFoodNames,
        relevantFoodsCount: Array.isArray(relevantFoods) ? relevantFoods.length : 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

const generateAiSlotChart = async (req, res, next) => {
  try {
    const { patientId, planId, baseMeals: rawBaseMeals } = req.body;

    if (!patientId) {
      return next(new ApiError(400, "patientId is required"));
    }

    if (!isValidObjectId(patientId)) {
      return next(new ApiError(400, "Invalid patient id"));
    }

    if (planId && !isValidObjectId(planId)) {
      return next(new ApiError(400, "Invalid plan id"));
    }

    const patient = await Patient.findOne({
      _id: patientId,
      doctor: req.user.id,
    });

    if (!patient) {
      return next(new ApiError(404, "Patient not found"));
    }

    const providedBaseMeals = Array.isArray(rawBaseMeals)
      ? normalizeMeals(rawBaseMeals)
      : [];
    const hasProvidedBaseMeals = providedBaseMeals.some((mealDay) =>
      hasAtLeastOneMeal(mealDay)
    );

    const planQuery = {
      patient: patientId,
      doctor: req.user.id,
      ...(planId ? { _id: planId } : {}),
    };

    let plan = null;
    if (!hasProvidedBaseMeals) {
      plan = await Plan.findOne(planQuery).sort({
        isActive: -1,
        createdAt: -1,
      });
    }

    if (!plan && !hasProvidedBaseMeals) {
      return next(new ApiError(404, "Plan not found"));
    }

    const baseMeals = hasProvidedBaseMeals
      ? providedBaseMeals
      : normalizeMeals(plan?.meals || []);
    if (!baseMeals.length) {
      return next(new ApiError(400, "Plan has no meals to expand into slots"));
    }

    const endpoint = ensureChatCompletionsEndpoint(MEALS_LLM_BASE_URL);
    const provider = inferOpenAiCompatibleProvider(endpoint);
    const apiKey = MEALS_LLM_API_KEY;
    const model = MEALS_LLM_MODEL;
    const slotGoal = String(
      plan?.goal || patient?.planningInputs?.primaryGoal || "general wellness"
    ).trim();

    const fallbackSlotPlans = enforceSlotChartGoalRules(
      applyMealTimingsToSlotPlans(
        sanitizeSlotPlans(buildFallbackSlotPlans(baseMeals, patient, plan)),
        patient?.planningInputs || {}
      ),
      slotGoal
    );

    if (!endpoint || !apiKey) {
      return res.status(200).json({
        success: true,
        patientId,
        planId: plan?._id ? String(plan._id) : null,
        slotPlans: fallbackSlotPlans,
        generationSource: "fallback_rules",
        generationFallbackReason: !endpoint
          ? "missing_meals_llm_base_url"
          : "missing_meals_llm_api_key",
        generationModel: null,
      });
    }

    const patientSummary = buildPatientSummary(
      patient,
      plan?.goal || patient?.planningInputs?.primaryGoal || "general wellness",
      plan?.doshaType ||
        patient?.prakriti?.dominantDosha ||
        String(req.body?.doshaType || "vata").toLowerCase()
    );
    const baseMealsText = baseMeals
      .map(
        (day, index) =>
          `Day ${index + 1}: breakfast=${cleanMealText(day.breakfast)}, lunch=${cleanMealText(
            day.lunch
          )}, dinner=${cleanMealText(day.dinner)}`
      )
      .join("\n");

    const slotFormatLine = SLOT_KEYS.map((key) => `"${key}": "..."`).join(", ");
    const timingWindowInstructions = buildTimingWindowInstructions(
      patientSummary.planningInputs || {}
    );
    const prompt = `
Create a full Ayurvedic day-slot chart for each day using patient context and the fixed core meals.

Patient:
- Name: ${patientSummary.name}
- Age: ${patientSummary.age}
- Gender: ${patientSummary.gender}
- Dosha: ${plan?.doshaType || patientSummary.dominantDosha || "vata"}
- Goal: ${plan?.goal || patientSummary.goal || "general wellness"}
- Health conditions: ${patientSummary.healthConditions}
- Diet type: ${patientSummary.dietType}
- Planning inputs: ${JSON.stringify(patientSummary.planningInputs || {})}

Core meals that MUST remain unchanged for breakfast/lunch/dinner:
${baseMealsText}

Return STRICT JSON with this shape only:
{
  "slotPlans": [
    { "day": "Day 1", ${slotFormatLine} }
  ]
}

Rules:
- Return exactly ${baseMeals.length} day objects in slotPlans.
- Keep breakfast/lunch/dinner exactly as given in core meals.
- Generate realistic, clinically safe Ayurvedic options for other slots.
- Respect goal, dosha, diet type, and health conditions.
- Do NOT include time prefixes in slot text; timings are managed separately in Meal Timings.
- Remove placeholder symbols like "|" and avoid contradictory portion notes.
- Keep text concise and practical (single line per slot).
- No markdown, no commentary, no extra keys.

${timingWindowInstructions}
`.trim();

    const aiResult = await requestJsonFromOpenAiCompatible({
      endpoint,
      apiKey,
      model,
      prompt,
      provider,
      timeoutMs: MEALS_LLM_TIMEOUT_MS,
    });

    const rawSlotPlans = Array.isArray(aiResult?.data?.slotPlans)
      ? aiResult.data.slotPlans
      : [];
    const normalizedRawAiSlots = normalizeSlotPlans(rawSlotPlans, baseMeals);
    const sanitizedAiSlots = sanitizeSlotPlans(normalizedRawAiSlots);
    const timedAiSlots = applyMealTimingsToSlotPlans(
      sanitizedAiSlots,
      patient?.planningInputs || {}
    );
    const normalizedAiSlots = enforceSlotChartGoalRules(timedAiSlots, slotGoal);
    const timingValidation = validateSlotPlanTimings(
      normalizedAiSlots,
      patient?.planningInputs || {}
    );
    const aiShapeValid = normalizedAiSlots.length === baseMeals.length;
    const aiTimingValid = timingValidation.isValid;
    const canUseAiSlots = aiShapeValid && aiTimingValid;
    const slotPlans =
      canUseAiSlots ? normalizedAiSlots : fallbackSlotPlans;

    res.status(200).json({
      success: true,
      patientId,
      planId: plan?._id ? String(plan._id) : null,
      slotPlans,
      generationSource: canUseAiSlots ? provider : "fallback_rules",
      generationFallbackReason:
        canUseAiSlots
          ? null
          : !aiShapeValid
            ? aiResult?.errorReason || "invalid_slot_plan_shape"
            : "timing_window_mismatch",
      timingValidation: {
        isValid: aiTimingValid,
        violations: timingValidation.violations,
      },
      generationModel: model,
    });
  } catch (error) {
    next(error);
  }
};

const fixAiPlan = async (req, res, next) => {
  try {
    const { meals, doshaType, goal, patientId } = req.body;

    if (!Array.isArray(meals) || !meals.length || !doshaType) {
      return next(new ApiError(400, "meals and doshaType are required"));
    }

    const normalizedMeals = normalizeMeals(meals);
    if (normalizedMeals.some((mealDay) => !hasAtLeastOneMeal(mealDay))) {
      return next(new ApiError(400, "Each day must include at least one meal"));
    }

    const validation = validatePlan(normalizedMeals, doshaType);
    const legacyFix = fixPlan(
      normalizedMeals,
      validation.issues,
      doshaType
    );

    let patient = null;
    if (patientId && isValidObjectId(patientId)) {
      patient = await Patient.findOne({
        _id: patientId,
        doctor: req.user.id,
      });
    }

    const canonicalGoal = normalizeGoalText(
      goal || patient?.planningInputs?.primaryGoal || "general wellness"
    );
    const relevantFoods = getRelevantFoods(canonicalGoal, doshaType, patient);
    const safetyProfile = buildDietSafetyProfile({ patient, goal: canonicalGoal });
    const safeTotalDays = normalizeTotalDays(normalizedMeals.length, normalizedMeals.length);

    const goalAlignedMeals = enforceGoalSpecificMeals(
      normalizedMeals,
      canonicalGoal,
      doshaType,
      relevantFoods,
      patient
    );
    const slotAlignedMeals = alignMealsToSlotFoods(
      goalAlignedMeals,
      canonicalGoal,
      doshaType,
      relevantFoods,
      patient
    );
    const variedMeals = enforceMealVariety(
      slotAlignedMeals,
      canonicalGoal,
      doshaType,
      relevantFoods,
      patient,
      safeTotalDays
    );
    const hardRuleMeals = enforceDietitianHardRules(
      variedMeals,
      canonicalGoal,
      doshaType,
      relevantFoods,
      patient
    );
    const safetyCorrected = applyDietSafetyCorrections(
      hardRuleMeals,
      canonicalGoal,
      doshaType,
      relevantFoods,
      patient,
      safetyProfile
    );
    const regionalQuotaMeals = enforceRegionalCoreQuota(
      safetyCorrected.meals,
      canonicalGoal,
      doshaType,
      relevantFoods,
      patient
    );
    const noStreakMeals = enforceNoConsecutiveSlotRepeats(
      regionalQuotaMeals,
      canonicalGoal,
      doshaType,
      relevantFoods,
      patient
    );
    const improvedMeals = enforceRegionalCoreQuota(
      noStreakMeals,
      canonicalGoal,
      doshaType,
      relevantFoods,
      patient
    );
    const improvedValidation = validatePlan(improvedMeals, doshaType);

    const countOpenIssues = (result = {}) => (Array.isArray(result.issues) ? result.issues.length : 0);
    const enhancedIsBetter =
      (Number(improvedValidation?.score ?? 0) > Number(legacyFix?.validation?.score ?? 0)) ||
      (Number(improvedValidation?.score ?? 0) === Number(legacyFix?.validation?.score ?? 0) &&
        countOpenIssues(improvedValidation) <= countOpenIssues(legacyFix?.validation));

    const selectedMeals = enhancedIsBetter ? improvedMeals : legacyFix.improvedMeals;
    const selectedValidation = enhancedIsBetter ? improvedValidation : legacyFix.validation;
    const selectedChanges = [];

    selectedMeals.forEach((day, index) => {
      const before = normalizedMeals[index] || {};
      ["breakfast", "lunch", "dinner"].forEach((slot) => {
        if (normalizeMealText(before?.[slot]) !== normalizeMealText(day?.[slot])) {
          selectedChanges.push(
            `Updated ${day.day || `Day ${index + 1}`} ${slot} from "${before?.[slot] || ""}" to "${day?.[slot] || ""}"`
          );
        }
      });
    });

    res.status(200).json({
      success: true,
      improvedMeals: selectedMeals,
      changes: selectedChanges.length ? selectedChanges : legacyFix.changes,
      validation: selectedValidation,
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
      {
        patient: plan.patient,
        isActive: true,
        _id: { $ne: plan._id },
      },
      { $set: { isActive: false } }
    );

    plan.status = "approved";
    plan.isActive = true;

    await plan.save();
    await trackPlanSnapshot({
      patientId: plan.patient,
      plan,
      source: "plan_approved",
    }).catch(() => {});
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
    const { patient, title, goal, startDate, doshaType, reviewDueDate, meals } =
      req.body;

    const validatedPayload = validatePlanPayload({
      patient,
      title,
      goal,
      doshaType,
      reviewDueDate,
      meals,
      requirePatient: true,
      requireGoal: true,
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
    await trackPlanSnapshot({
      patientId: patient,
      plan,
      source: "plan_created",
    }).catch(() => {});

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

    const { title, goal, doshaType, reviewDueDate, meals } = req.body;
    const validatedPayload = validatePlanPayload({
      title,
      goal,
      doshaType,
      reviewDueDate,
      meals,
      requirePatient: false,
      requireGoal: false,
    });

    plan.title = validatedPayload.title;
    if (typeof validatedPayload.goal === "string") {
      plan.goal = validatedPayload.goal;
    }
    plan.doshaType = validatedPayload.doshaType;
    plan.reviewDueDate = validatedPayload.reviewDueDate;
    plan.meals = validatedPayload.meals;

    await plan.save();
    await trackPlanSnapshot({
      patientId: plan.patient,
      plan,
      source: "plan_updated",
    }).catch(() => {});
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

    const goal = String(req.query?.goal || "").trim();
    const result = await modifyPlanBasedOnProgress(patientId, {
      ...(goal ? { goal } : {}),
    });

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
  generateAiSlotChart,
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

