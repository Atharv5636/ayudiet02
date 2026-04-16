const HIGH_SUGAR_KEYWORDS = [
  "sugar",
  "sweet",
  "dessert",
  "jalebi",
  "gulab jamun",
  "rasgulla",
  "laddu",
  "kheer",
  "halwa",
  "ice cream",
  "pastry",
  "cake",
  "candy",
  "chocolate",
  "syrup",
  "cola",
  "soft drink",
  "juice",
];

const HIGH_SALT_KEYWORDS = [
  "pickle",
  "papad",
  "chips",
  "namkeen",
  "salted",
  "achar",
  "processed",
  "instant noodle",
  "sauce",
  "ketchup",
  "soy sauce",
  "soup packet",
  "canned",
];

const OVERWEIGHT_GOALS = new Set([
  "weight loss",
  "diabetes support",
  "pcos support",
  "hypertension support",
  "blood sugar control",
]);

const toTokens = (value = "") =>
  String(value || "")
    .split(/[,;/|]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const includesAnyKeyword = (text = "", keywords = []) => {
  const normalized = String(text || "").toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
};

const normalizeGoal = (goal = "") => String(goal || "").trim().toLowerCase();

const buildDietSafetyProfile = ({ patient = null, goal = "", healthProfile = null } = {}) => {
  const patientConditions = String(patient?.healthConditions || "").toLowerCase();
  const patientAllergies = String(patient?.allergies || "").toLowerCase();
  const riskConditions = Array.isArray(healthProfile?.riskConditions)
    ? healthProfile.riskConditions.map((item) => String(item || "").toLowerCase())
    : [];
  const normalizedGoal = normalizeGoal(goal || patient?.planningInputs?.primaryGoal || "");

  const diabetes =
    patientConditions.includes("diabetes") ||
    patientConditions.includes("prediabetes") ||
    normalizedGoal.includes("diabetes") ||
    normalizedGoal.includes("blood sugar") ||
    riskConditions.includes("diabetes");

  const highBloodPressure =
    patientConditions.includes("hypertension") ||
    patientConditions.includes("high blood pressure") ||
    patientConditions.includes("bp") ||
    normalizedGoal.includes("hypertension") ||
    riskConditions.includes("high_blood_pressure");

  const overweight =
    riskConditions.includes("obesity") ||
    riskConditions.includes("overweight") ||
    OVERWEIGHT_GOALS.has(normalizedGoal);

  const allergyTokens = toTokens(patientAllergies);

  return {
    diabetes,
    highBloodPressure,
    overweight,
    allergyTokens,
    normalizedGoal,
  };
};

const evaluateMealSafety = (mealText = "", safetyProfile = {}) => {
  const reasons = [];
  const normalized = String(mealText || "").trim().toLowerCase();
  if (!normalized) return reasons;

  if (safetyProfile.diabetes && includesAnyKeyword(normalized, HIGH_SUGAR_KEYWORDS)) {
    reasons.push("diabetes_high_sugar");
  }

  if (safetyProfile.highBloodPressure && includesAnyKeyword(normalized, HIGH_SALT_KEYWORDS)) {
    reasons.push("high_bp_high_salt");
  }

  const allergenMatch = (safetyProfile.allergyTokens || []).find((allergen) =>
    normalized.includes(allergen)
  );
  if (allergenMatch) {
    reasons.push(`allergy_${allergenMatch}`);
  }

  return reasons;
};

const evaluateMealsSafety = (meals = [], safetyProfile = {}) => {
  const slots = ["breakfast", "lunch", "dinner"];
  const violations = [];

  (Array.isArray(meals) ? meals : []).forEach((dayPlan, index) => {
    slots.forEach((slot) => {
      const meal = String(dayPlan?.[slot] || "").trim();
      if (!meal) return;
      const reasons = evaluateMealSafety(meal, safetyProfile);
      if (!reasons.length) return;

      violations.push({
        day: dayPlan?.day || `Day ${index + 1}`,
        slot,
        meal,
        reasons,
      });
    });
  });

  return {
    safe: violations.length === 0,
    violations,
  };
};

const buildSafetyConstraintText = (safetyProfile = {}) => {
  const constraints = [];

  if (safetyProfile.diabetes) {
    constraints.push(
      "- Diabetes safety: avoid high sugar foods and drinks (desserts, sweetened beverages, sweets)."
    );
  }
  if (safetyProfile.highBloodPressure) {
    constraints.push(
      "- High BP safety: reduce high-salt foods (pickle, papad, chips, packaged salty items)."
    );
  }
  if ((safetyProfile.allergyTokens || []).length) {
    constraints.push(
      `- Allergy safety (STRICT): never include ${safetyProfile.allergyTokens.join(", ")}.`
    );
  }
  if (safetyProfile.overweight) {
    constraints.push(
      "- Overweight safety: enforce calorie deficit pattern using lighter, lower-calorie preparations."
    );
  }

  if (!constraints.length) {
    constraints.push("- No additional safety overrides detected.");
  }

  return constraints.join("\n");
};

module.exports = {
  buildDietSafetyProfile,
  buildSafetyConstraintText,
  evaluateMealSafety,
  evaluateMealsSafety,
};
