const PROTEIN_KEYWORDS = [
  "dal",
  "lentil",
  "lentils",
  "chana",
  "chickpea",
  "chickpeas",
  "bean",
  "beans",
  "paneer",
  "tofu",
  "curd",
  "yogurt",
  "milk",
  "sprouts",
  "moong",
  "rajma",
];

const CARB_KEYWORDS = [
  "rice",
  "roti",
  "naan",
  "bread",
  "paratha",
  "poha",
  "upma",
  "oats",
  "millet",
  "idli",
  "dosa",
  "pasta",
  "noodles",
];

const DOSHA_RESTRICTIONS = {
  vata: ["cold smoothie", "iced", "raw salad"],
  pitta: ["chili", "fried", "pickle", "spicy curry"],
  kapha: ["deep fried", "cream", "cheese burst", "sugar syrup"],
};
const MEAL_VALIDATION_KEYWORDS = [
  ...PROTEIN_KEYWORDS,
  ...CARB_KEYWORDS,
  "khichdi",
  "sabzi",
  "vegetable",
  "soup",
  "salad",
  "fruit",
  "chilla",
  "porridge",
  "stew",
  "quinoa",
];

const normalizeMealText = (value = "") =>
  value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const mealEntries = (meals = []) =>
  meals.flatMap((mealDay) =>
    ["breakfast", "lunch", "dinner"]
      .map((slot) => normalizeMealText(mealDay?.[slot]))
      .filter(Boolean)
  );

const includesAnyKeyword = (text, keywords) =>
  keywords.some((keyword) => text.includes(keyword));

export function validatePlan(meals = [], doshaType = "") {
  const issues = [];
  const suggestions = [];
  let score = 10;

  const normalizedEntries = mealEntries(meals);
  const hasMealEntries = normalizedEntries.length > 0;

  if (!hasMealEntries) {
    return {
      score: null,
      issues: [],
      suggestions: [],
      hasMealEntries: false,
    };
  }

  const totalSlots = Math.max(1, meals.length * 3);
  const filledSlots = meals.reduce((count, mealDay) => {
    const slots = [mealDay?.breakfast, mealDay?.lunch, mealDay?.dinner];
    return count + slots.filter((slot) => normalizeMealText(slot)).length;
  }, 0);
  const completionRatio = filledSlots / totalSlots;
  if (completionRatio < 1) {
    const completionPenalty = Math.max(2, Math.round((1 - completionRatio) * 6));
    issues.push("Plan is incomplete across day slots");
    suggestions.push("Fill breakfast, lunch, and dinner for each planned day");
    score -= completionPenalty;
  }

  const unrecognizedMeals = normalizedEntries.filter(
    (meal) => !includesAnyKeyword(meal, MEAL_VALIDATION_KEYWORDS)
  );
  if (unrecognizedMeals.length) {
    issues.push("Some meal entries are not recognizable food names");
    suggestions.push("Use clear dish names like moong dal, khichdi, tofu curry, etc.");
    score -= Math.min(4, unrecognizedMeals.length);
  }

  const uniqueEntries = new Set(normalizedEntries);

  if (normalizedEntries.length && uniqueEntries.size < normalizedEntries.length) {
    issues.push("Too repetitive across days");
    suggestions.push("Rotate meal choices so each day feels distinct");
    score -= 2;
  }

  const carbHeavyDays = meals.filter((mealDay) => {
    const slots = [mealDay.breakfast, mealDay.lunch, mealDay.dinner].map(
      normalizeMealText
    );

    return slots.filter((slot) => includesAnyKeyword(slot, CARB_KEYWORDS))
      .length >= 2;
  });

  if (carbHeavyDays.length) {
    issues.push("Several days are carb-heavy");
    suggestions.push("Balance heavier grains with soups, vegetables, or legumes");
    score -= 2;
  }

  const lowProteinDays = meals.filter((mealDay) => {
    const slots = [mealDay.breakfast, mealDay.lunch, mealDay.dinner].map(
      normalizeMealText
    );
    const hasAnyMeal = slots.some(Boolean);

    if (!hasAnyMeal) {
      return false;
    }

    return !slots.some((slot) => includesAnyKeyword(slot, PROTEIN_KEYWORDS));
  });

  if (lowProteinDays.length) {
    issues.push("Low protein coverage on some days");
    suggestions.push("Add lentils, moong, paneer, tofu, or curd each day");
    score -= 3;
  }

  const restrictedKeywords = DOSHA_RESTRICTIONS[doshaType] || [];
  const restrictedMeals = normalizedEntries.filter((meal) =>
    includesAnyKeyword(meal, restrictedKeywords)
  );

  if (restrictedMeals.length) {
    issues.push("Not fully dosha compliant");
    suggestions.push("Replace restricted foods with lighter dosha-friendly options");
    score -= 3;
  }

  return {
    score: Math.max(0, Math.min(10, score)),
    issues,
    suggestions,
    hasMealEntries: true,
  };
}
