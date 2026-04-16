const ACTIVITY_MULTIPLIERS = {
  1: 1.2,
  2: 1.375,
  3: 1.55,
  4: 1.725,
  5: 1.9,
};

const GOAL_CALORIE_ADJUSTMENT = {
  "weight loss": -0.2,
  "muscle gain": 0.12,
  "blood sugar control": -0.1,
  "diabetes support": -0.1,
  "pcos support": -0.12,
  "thyroid support": 0,
  "hypertension support": -0.08,
  "better digestion": -0.05,
  "general wellness": 0,
};

const GOAL_PROTEIN_PER_KG = {
  "weight loss": 1.6,
  "muscle gain": 2,
  "blood sugar control": 1.4,
  "diabetes support": 1.4,
  "pcos support": 1.4,
  "thyroid support": 1.3,
  "hypertension support": 1.4,
  "better digestion": 1.2,
  "general wellness": 1.2,
};

const normalizeGoal = (goal = "") => String(goal || "").trim().toLowerCase();

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundTo = (value, decimals = 1) => {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const roundToNearest = (value, step = 10) => {
  if (!Number.isFinite(value)) return null;
  return Math.round(value / step) * step;
};

const calorieFloorByGender = (gender = "") => {
  const normalized = String(gender || "").toLowerCase();
  if (normalized === "male") return 1400;
  if (normalized === "female") return 1200;
  return 1300;
};

const getActivityMultiplier = (activity = {}) => {
  if (toNumber(activity?.multiplier)) {
    return activity.multiplier;
  }
  const level = toNumber(activity?.level);
  if (!level) return 1.2;
  return ACTIVITY_MULTIPLIERS[level] || 1.2;
};

const calculateBmi = (weightKg, heightCm) => {
  const weight = toNumber(weightKg);
  const height = toNumber(heightCm);
  if (!weight || !height) return null;
  const heightMeters = height / 100;
  if (heightMeters <= 0) return null;
  return roundTo(weight / (heightMeters * heightMeters), 1);
};

const classifyBmi = (bmi) => {
  if (!toNumber(bmi)) return "unknown";
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "overweight";
  return "obese";
};

const calculateBmr = ({ weightKg, heightCm, age, gender }) => {
  const weight = toNumber(weightKg);
  const height = toNumber(heightCm);
  const years = toNumber(age);
  if (!weight || !height || !years) return null;

  const base = 10 * weight + 6.25 * height - 5 * years;
  const normalizedGender = String(gender || "").toLowerCase();
  if (normalizedGender === "male") return roundTo(base + 5, 0);
  if (normalizedGender === "female") return roundTo(base - 161, 0);
  return roundTo(base - 78, 0);
};

const calculateTdee = (bmr, activityMultiplier) => {
  const parsedBmr = toNumber(bmr);
  const multiplier = toNumber(activityMultiplier);
  if (!parsedBmr || !multiplier) return null;
  return roundTo(parsedBmr * multiplier, 0);
};

const calculateCalorieTarget = ({ tdee, goal, gender }) => {
  const parsedTdee = toNumber(tdee);
  if (!parsedTdee) return null;

  const normalizedGoal = normalizeGoal(goal);
  const adjustment = GOAL_CALORIE_ADJUSTMENT[normalizedGoal] ?? 0;
  const adjusted = parsedTdee * (1 + adjustment);
  const bounded = Math.max(
    calorieFloorByGender(gender),
    Math.min(4500, adjusted)
  );
  return roundToNearest(bounded, 10);
};

const calculateProteinTarget = ({ weightKg, goal }) => {
  const weight = toNumber(weightKg);
  if (!weight) return null;
  const normalizedGoal = normalizeGoal(goal);
  const proteinPerKg = GOAL_PROTEIN_PER_KG[normalizedGoal] ?? 1.2;
  return roundTo(weight * proteinPerKg, 0);
};

const extractConditionText = (userProfile = {}) =>
  [
    userProfile?.conditions,
    userProfile?.medications,
    userProfile?.allergies,
    userProfile?.planningInputs?.primaryGoal,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

const includesAny = (source = "", patterns = []) =>
  patterns.some((pattern) => source.includes(pattern));

const detectRiskConditions = ({ bmi, textBlob = "" }) => {
  const risks = [];

  if (toNumber(bmi) && bmi >= 30) risks.push("obesity");
  if (toNumber(bmi) && bmi >= 25 && bmi < 30) risks.push("overweight");
  if (toNumber(bmi) && bmi < 18.5) risks.push("underweight");

  if (
    includesAny(textBlob, [
      "diabetes",
      "prediabetes",
      "pre-diabetes",
      "high blood sugar",
      "hba1c",
      "blood sugar control",
    ])
  ) {
    risks.push("diabetes");
  }

  if (
    includesAny(textBlob, [
      "hypertension",
      "high blood pressure",
      "bp",
    ])
  ) {
    risks.push("high_blood_pressure");
  }

  if (includesAny(textBlob, ["pcos", "pcod"])) {
    risks.push("pcos");
  }

  if (includesAny(textBlob, ["thyroid", "hypothyroid", "hyperthyroid"])) {
    risks.push("thyroid");
  }

  if (
    includesAny(textBlob, [
      "cholesterol",
      "ldl",
      "triglyceride",
      "dyslipidemia",
    ])
  ) {
    risks.push("high_cholesterol");
  }

  if (
    includesAny(textBlob, [
      "acidity",
      "bloating",
      "gas",
      "constipation",
      "ibs",
      "indigestion",
      "digestive",
    ])
  ) {
    risks.push("digestive_issues");
  }

  if (risks.includes("obesity") && (risks.includes("diabetes") || risks.includes("high_blood_pressure"))) {
    risks.push("metabolic_risk");
  }

  return [...new Set(risks)];
};

const inferDataCompleteness = (healthProfile = {}) => {
  const requiredForCore = [
    healthProfile?.inputs?.age,
    healthProfile?.inputs?.weightKg,
    healthProfile?.inputs?.heightCm,
    healthProfile?.inputs?.gender,
    healthProfile?.inputs?.activityMultiplier,
  ];

  const available = requiredForCore.filter((v) => v !== null && v !== undefined && v !== "").length;
  return roundTo((available / requiredForCore.length) * 100, 0);
};

const buildHealthProfile = (userProfile = {}) => {
  const goal = userProfile?.planningInputs?.primaryGoal || "general wellness";
  const inputs = {
    age: toNumber(userProfile?.age),
    weightKg: toNumber(userProfile?.weightKg),
    heightCm: toNumber(userProfile?.heightCm),
    gender: String(userProfile?.gender || "").toLowerCase() || null,
    activityLevel: toNumber(userProfile?.activityLevel?.level),
    activityMultiplier: getActivityMultiplier(userProfile?.activityLevel),
    goal: normalizeGoal(goal),
  };

  const bmi = calculateBmi(inputs.weightKg, inputs.heightCm);
  const bmr = calculateBmr(inputs);
  const tdee = calculateTdee(bmr, inputs.activityMultiplier);
  const calorieTarget = calculateCalorieTarget({
    tdee,
    goal: inputs.goal,
    gender: inputs.gender,
  });
  const proteinTarget = calculateProteinTarget({
    weightKg: inputs.weightKg,
    goal: inputs.goal,
  });

  const riskConditions = detectRiskConditions({
    bmi,
    textBlob: extractConditionText(userProfile),
  });

  const healthProfile = {
    inputs,
    metrics: {
      bmi,
      bmiCategory: classifyBmi(bmi),
      bmrKcal: bmr,
      tdeeKcal: tdee,
    },
    targets: {
      calorieTargetKcal: calorieTarget,
      proteinTargetGrams: proteinTarget,
    },
    riskConditions: riskConditions.length ? riskConditions : ["none"],
    dataCompleteness: null,
    generatedAt: new Date().toISOString(),
  };

  healthProfile.dataCompleteness = inferDataCompleteness(healthProfile);
  return healthProfile;
};

module.exports = {
  buildHealthProfile,
  calculateBmi,
  calculateBmr,
  calculateTdee,
};
