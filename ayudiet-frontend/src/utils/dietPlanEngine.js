const normalizeText = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase();

const hashText = (value = "") =>
  String(value || "")
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

const GOAL_TYPES = {
  WEIGHT_LOSS: "weight_loss",
  MUSCLE_GAIN: "muscle_gain",
  BETTER_DIGESTION: "better_digestion",
  GENERAL_WELLNESS: "general_wellness",
};

const getGoalType = (context = {}) => {
  const patientContext = context?.patientContext || {};
  const planningInputs = patientContext?.planningInputs || {};
  const rawGoal = normalizeText(context?.goal || planningInputs?.primaryGoal);

  if (
    rawGoal.includes("diabetes") ||
    rawGoal.includes("blood sugar") ||
    rawGoal.includes("pcos")
  ) {
    return GOAL_TYPES.WEIGHT_LOSS;
  }
  if (
    rawGoal.includes("hypertension") ||
    rawGoal.includes("blood pressure")
  ) {
    return GOAL_TYPES.BETTER_DIGESTION;
  }
  if (rawGoal.includes("thyroid")) {
    return GOAL_TYPES.GENERAL_WELLNESS;
  }
  if (rawGoal.includes("weight") && rawGoal.includes("loss")) {
    return GOAL_TYPES.WEIGHT_LOSS;
  }
  if (
    rawGoal.includes("muscle") ||
    (rawGoal.includes("weight") && rawGoal.includes("gain"))
  ) {
    return GOAL_TYPES.MUSCLE_GAIN;
  }
  if (rawGoal.includes("digest")) {
    return GOAL_TYPES.BETTER_DIGESTION;
  }
  return GOAL_TYPES.GENERAL_WELLNESS;
};

const parseActivityBand = (context = {}) => {
  const patientContext = context?.patientContext || {};
  const planningInputs = patientContext?.planningInputs || {};
  const raw = patientContext?.activityLevel ?? planningInputs?.activityLevel;

  if (typeof raw === "number") {
    if (raw >= 4) return "high";
    if (raw <= 2) return "low";
    return "medium";
  }

  const text = normalizeText(raw);
  if (!text) return "medium";
  if (text.includes("high") || text.includes("active")) return "high";
  if (text.includes("low") || text.includes("sedentary")) return "low";
  return "medium";
};

const getSignals = (riskFlags = [], context = {}) => {
  const patientContext = context?.patientContext || {};
  const conditions = normalizeText(patientContext?.healthConditions);
  const flags = Array.isArray(riskFlags) ? riskFlags : [];
  const hasFlag = (flag) => flags.includes(flag);

  return {
    diabetes: hasFlag("diabetes") || conditions.includes("diabet"),
    highBp:
      hasFlag("high_blood_pressure") ||
      conditions.includes("blood pressure") ||
      conditions.includes("hypertension"),
    obesity: hasFlag("obesity") || conditions.includes("obes"),
    thyroid: hasFlag("thyroid") || conditions.includes("thyroid"),
    pcos: hasFlag("pcos") || conditions.includes("pcos"),
    highCholesterol:
      hasFlag("high_cholesterol") || conditions.includes("cholesterol"),
    digestiveIssues:
      hasFlag("digestive_issues") ||
      conditions.includes("digest") ||
      conditions.includes("acidity") ||
      conditions.includes("bloat") ||
      conditions.includes("constipation"),
  };
};

const inferPreferences = (profile = {}, context = {}) => {
  const goalType = getGoalType(context);
  const activityBand = parseActivityBand(context);
  const dosha = normalizeText(profile?.primary_dosha);
  const safeDosha = ["vata", "pitta", "kapha"].includes(dosha) ? dosha : "pitta";

  let portionScale = "medium";
  if (goalType === GOAL_TYPES.WEIGHT_LOSS) portionScale = "light";
  if (goalType === GOAL_TYPES.MUSCLE_GAIN) portionScale = "high";
  if (activityBand === "high" && portionScale !== "high") portionScale = "high";
  if (activityBand === "low" && portionScale === "high") portionScale = "medium";

  return {
    goalType,
    activityBand,
    dosha: safeDosha,
    portionScale,
  };
};

const MEAL_CATALOG = {
  breakfast: [
    { name: "Moong chilla with mint chutney", doshas: ["vata", "pitta", "kapha"], goals: ["weight_loss", "better_digestion", "general_wellness"], protein: "medium", glycemic: "low", sodium: "low", digestion: "easy", heavy: false },
    { name: "Oats porridge with chia and almonds", doshas: ["vata", "pitta"], goals: ["muscle_gain", "general_wellness", "better_digestion"], protein: "medium", glycemic: "medium", sodium: "low", digestion: "easy", heavy: false },
    { name: "Sprouts bowl with cucumber and lemon", doshas: ["pitta", "kapha"], goals: ["weight_loss", "general_wellness"], protein: "medium", glycemic: "low", sodium: "low", digestion: "moderate", heavy: false },
    { name: "Ragi porridge with seeds", doshas: ["vata", "kapha"], goals: ["weight_loss", "better_digestion", "general_wellness"], protein: "low", glycemic: "medium", sodium: "low", digestion: "easy", heavy: false },
    { name: "Paneer breakfast wrap", doshas: ["vata", "pitta"], goals: ["muscle_gain"], protein: "high", glycemic: "medium", sodium: "medium", digestion: "moderate", heavy: true },
    { name: "Fruit-curd bowl with pumpkin seeds", doshas: ["pitta", "kapha"], goals: ["better_digestion", "general_wellness"], protein: "medium", glycemic: "medium", sodium: "low", digestion: "easy", heavy: false },
    { name: "Vegetable upma with peanuts", doshas: ["vata", "kapha"], goals: ["weight_loss", "general_wellness"], protein: "low", glycemic: "medium", sodium: "medium", digestion: "easy", heavy: false },
    { name: "Tofu scramble with millet toast", doshas: ["vata", "kapha"], goals: ["muscle_gain", "general_wellness"], protein: "high", glycemic: "medium", sodium: "low", digestion: "moderate", heavy: false },
  ],
  lunch: [
    { name: "Brown rice, moong dal and sauteed vegetables", doshas: ["vata", "pitta", "kapha"], goals: ["weight_loss", "better_digestion", "general_wellness"], protein: "medium", glycemic: "low", sodium: "low", digestion: "easy", heavy: false },
    { name: "Quinoa chickpea bowl with cucumber salad", doshas: ["pitta", "kapha"], goals: ["weight_loss", "muscle_gain", "general_wellness"], protein: "high", glycemic: "low", sodium: "low", digestion: "moderate", heavy: false },
    { name: "Millet khichdi with lauki and carrot", doshas: ["vata", "pitta", "kapha"], goals: ["better_digestion", "weight_loss"], protein: "medium", glycemic: "low", sodium: "low", digestion: "easy", heavy: false },
    { name: "Rice with dal and paneer vegetable stir-fry", doshas: ["vata", "pitta"], goals: ["muscle_gain", "general_wellness"], protein: "high", glycemic: "medium", sodium: "medium", digestion: "moderate", heavy: true },
    { name: "Chapati with lauki sabzi and moong dal", doshas: ["vata", "pitta", "kapha"], goals: ["weight_loss", "better_digestion", "general_wellness"], protein: "medium", glycemic: "medium", sodium: "low", digestion: "easy", heavy: false },
    { name: "Rajma rice bowl with mixed salad", doshas: ["vata", "kapha"], goals: ["muscle_gain", "general_wellness"], protein: "high", glycemic: "medium", sodium: "medium", digestion: "moderate", heavy: true },
    { name: "Tofu millet bowl with steamed vegetables", doshas: ["kapha", "pitta"], goals: ["muscle_gain", "weight_loss", "general_wellness"], protein: "high", glycemic: "low", sodium: "low", digestion: "moderate", heavy: false },
    { name: "Vegetable daliya with lentils", doshas: ["vata", "pitta", "kapha"], goals: ["better_digestion", "weight_loss", "general_wellness"], protein: "medium", glycemic: "medium", sodium: "low", digestion: "easy", heavy: false },
  ],
  dinner: [
    { name: "Clear vegetable soup with tofu cubes", doshas: ["pitta", "kapha"], goals: ["weight_loss", "better_digestion", "general_wellness"], protein: "medium", glycemic: "low", sodium: "low", digestion: "easy", heavy: false },
    { name: "Moong soup with steamed vegetables", doshas: ["vata", "pitta", "kapha"], goals: ["better_digestion", "weight_loss", "general_wellness"], protein: "medium", glycemic: "low", sodium: "low", digestion: "easy", heavy: false },
    { name: "Khichdi with curd", doshas: ["vata", "pitta"], goals: ["better_digestion", "general_wellness"], protein: "medium", glycemic: "medium", sodium: "low", digestion: "easy", heavy: false },
    { name: "Palak paneer with millet roti", doshas: ["vata", "kapha"], goals: ["muscle_gain", "general_wellness"], protein: "high", glycemic: "medium", sodium: "medium", digestion: "moderate", heavy: true },
    { name: "Lentil soup with phulka", doshas: ["vata", "pitta", "kapha"], goals: ["muscle_gain", "general_wellness"], protein: "medium", glycemic: "medium", sodium: "low", digestion: "easy", heavy: false },
    { name: "Pumpkin soup with toasted seeds", doshas: ["pitta", "kapha"], goals: ["weight_loss", "better_digestion"], protein: "low", glycemic: "low", sodium: "low", digestion: "easy", heavy: false },
    { name: "Vegetable stew with small red-rice serving", doshas: ["vata", "pitta"], goals: ["better_digestion", "general_wellness"], protein: "low", glycemic: "medium", sodium: "low", digestion: "easy", heavy: false },
    { name: "Paneer and vegetable nourish bowl", doshas: ["vata", "pitta"], goals: ["muscle_gain"], protein: "high", glycemic: "medium", sodium: "medium", digestion: "moderate", heavy: true },
  ],
};

const isMealCompatibleWithSignals = (meal, signals, slot) => {
  if (signals.diabetes && meal.glycemic === "high") return false;
  if (signals.highBp && meal.sodium === "high") return false;
  if (signals.digestiveIssues && meal.digestion === "heavy") return false;
  if ((signals.obesity || signals.pcos) && slot === "dinner" && meal.heavy) return false;
  if (signals.highCholesterol && meal.heavy && meal.protein === "high") return false;
  return true;
};

const scoreMeal = (meal, slot, preferences, signals, dayIndex = 0) => {
  let score = 0;

  if (meal.doshas.includes(preferences.dosha)) score += 3;
  if (meal.goals.includes(preferences.goalType)) score += 5;
  if (preferences.goalType === GOAL_TYPES.MUSCLE_GAIN && meal.protein === "high") score += 4;
  if (preferences.goalType === GOAL_TYPES.WEIGHT_LOSS && meal.heavy) score -= 4;
  if (preferences.goalType === GOAL_TYPES.BETTER_DIGESTION && meal.digestion === "easy") score += 4;
  if (preferences.goalType === GOAL_TYPES.BETTER_DIGESTION && meal.digestion === "moderate") score += 1;

  if (signals.diabetes) {
    if (meal.glycemic === "low") score += 3;
    if (meal.glycemic === "medium") score += 1;
    if (meal.glycemic === "high") score -= 6;
  }
  if (signals.highBp) {
    if (meal.sodium === "low") score += 3;
    if (meal.sodium === "medium") score += 1;
  }
  if (signals.digestiveIssues && meal.digestion === "easy") score += 3;
  if ((signals.obesity || signals.pcos) && slot === "dinner" && !meal.heavy) score += 2;

  if (slot === "dinner" && meal.heavy) score -= 2;
  score += ((dayIndex + hashText(meal.name)) % 3) * 0.05;

  return score;
};

const rotate = (items = [], index = 0, offset = 0) => {
  if (!items.length) return "";
  return items[(index + offset) % items.length];
};

const buildPortionGuideByMeal = (preferences, signals) => {
  const isHigh = preferences.portionScale === "high";
  const isLight = preferences.portionScale === "light";

  const breakfastPortion = isHigh ? "1.5 bowls" : isLight ? "1 bowl" : "1-1.25 bowls";
  const lunchPortion = isHigh ? "2 rotis or 1.5 cups grains" : isLight ? "1 roti or 0.75 cup grains" : "1-2 rotis or 1 cup grains";
  const dinnerPortion = isHigh ? "1.25 bowls + protein side" : isLight ? "1 bowl (light)" : "1-1.25 bowls";

  const qualifiers = [];
  if (signals.diabetes) qualifiers.push("low glycemic carbs");
  if (signals.highBp) qualifiers.push("very low salt");
  if (signals.digestiveIssues) qualifiers.push("warm cooked meals");

  const suffix = qualifiers.length ? `; ${qualifiers.join(", ")}` : "";

  return {
    breakfast: `Portion: ${breakfastPortion}${suffix}`,
    lunch: `Portion: ${lunchPortion}${suffix}`,
    dinner: `Portion: ${dinnerPortion}${suffix}`,
  };
};

const withPortion = (meal, portionHint = "") =>
  portionHint ? `${meal} | ${portionHint}` : meal;

const withRiskHints = (meal, signals) => {
  let next = meal;
  if (signals.highBp && !next.toLowerCase().includes("low salt")) {
    next += " (low salt)";
  }
  return next;
};

const pickWeeklyMealsForSlot = (slot, totalDays, preferences, signals) => {
  const source = Array.isArray(MEAL_CATALOG[slot]) ? MEAL_CATALOG[slot] : [];
  const compatible = source.filter((meal) =>
    isMealCompatibleWithSignals(meal, signals, slot)
  );
  const candidates = compatible.length ? compatible : source;

  const ranked = [...candidates].sort(
    (a, b) =>
      scoreMeal(b, slot, preferences, signals, 0) -
      scoreMeal(a, slot, preferences, signals, 0)
  );

  if (!ranked.length) {
    return Array.from({ length: totalDays }, () => "Balanced meal");
  }

  const offset =
    hashText(`${preferences.goalType}|${preferences.dosha}|${slot}`) % ranked.length;

  return Array.from({ length: totalDays }, (_, index) => {
    const meal = rotate(ranked, index * 2, offset);
    return meal?.name || "Balanced meal";
  });
};

const getSingleDayMeals = (preferences, signals) => {
  const bySlot = {};

  ["breakfast", "lunch", "dinner"].forEach((slot) => {
    const source = Array.isArray(MEAL_CATALOG[slot]) ? MEAL_CATALOG[slot] : [];
    const compatible = source.filter((meal) =>
      isMealCompatibleWithSignals(meal, signals, slot)
    );
    const candidates = compatible.length ? compatible : source;
    const ranked = [...candidates].sort(
      (a, b) =>
        scoreMeal(b, slot, preferences, signals, 0) -
        scoreMeal(a, slot, preferences, signals, 0)
    );
    bySlot[slot] = ranked[0]?.name || "Balanced meal";
  });

  return bySlot;
};

export const buildDietPlan = (profile, context = {}) => {
  if (!profile) return null;

  const riskFlags = Array.isArray(profile?.risk_flags) ? profile.risk_flags : [];
  const signals = getSignals(riskFlags, context);
  const preferences = inferPreferences(profile, context);
  const portionGuide = buildPortionGuideByMeal(preferences, signals);
  const oneDay = getSingleDayMeals(preferences, signals);

  return {
    breakfast: withPortion(withRiskHints(oneDay.breakfast, signals), portionGuide.breakfast),
    lunch: withPortion(withRiskHints(oneDay.lunch, signals), portionGuide.lunch),
    dinner: withPortion(withRiskHints(oneDay.dinner, signals), portionGuide.dinner),
  };
};

export const buildWeeklyDietPlan = (profile, totalDays = 7, context = {}) => {
  if (!profile) return [];

  const safeTotalDays = Number.isFinite(Number(totalDays))
    ? Math.max(1, Number(totalDays))
    : 7;
  const riskFlags = Array.isArray(profile?.risk_flags) ? profile.risk_flags : [];
  const signals = getSignals(riskFlags, context);
  const preferences = inferPreferences(profile, context);
  const portionGuide = buildPortionGuideByMeal(preferences, signals);

  const weeklyBreakfast = pickWeeklyMealsForSlot(
    "breakfast",
    safeTotalDays,
    preferences,
    signals
  );
  const weeklyLunch = pickWeeklyMealsForSlot("lunch", safeTotalDays, preferences, signals);
  const weeklyDinner = pickWeeklyMealsForSlot(
    "dinner",
    safeTotalDays,
    preferences,
    signals
  );

  return Array.from({ length: safeTotalDays }, (_, index) => ({
    day: `Day ${index + 1}`,
    breakfast: withPortion(
      withRiskHints(weeklyBreakfast[index], signals),
      portionGuide.breakfast
    ),
    lunch: withPortion(withRiskHints(weeklyLunch[index], signals), portionGuide.lunch),
    dinner: withPortion(
      withRiskHints(weeklyDinner[index], signals),
      portionGuide.dinner
    ),
  }));
};

export const formatRiskFlags = (flags) => {
  if (!flags || flags.includes("none")) return "No major issues";

  return flags
    .map((flag) => String(flag).replaceAll("_", " "))
    .map((flag) => flag.charAt(0).toUpperCase() + flag.slice(1))
    .join(", ");
};
