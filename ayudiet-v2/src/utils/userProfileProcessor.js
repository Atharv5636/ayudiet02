const ACTIVITY_MULTIPLIERS = {
  1: 1.2,
  2: 1.375,
  3: 1.55,
  4: 1.725,
  5: 1.9,
};

const GENDERS = new Set(["male", "female", "other"]);
const BLOOD_GROUPS = new Set(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
const DOSHAS = new Set(["vata", "pitta", "kapha"]);
const DIET_TYPES = new Set(["vegetarian", "non-vegetarian", "vegan", "eggetarian"]);
const PRIMARY_GOALS = new Set([
  "weight loss",
  "muscle gain",
  "blood sugar control",
  "diabetes support",
  "pcos support",
  "thyroid support",
  "hypertension support",
  "better digestion",
  "general wellness",
]);
const BUDGET_TIERS = new Set(["low", "medium", "high"]);
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const hasOwn = (source, key) => Object.prototype.hasOwnProperty.call(source || {}, key);
const isMissing = (value) => value === undefined || value === null || value === "";

const sanitizeText = (value, options = {}) => {
  if (value === undefined || value === null) return undefined;
  const {
    lowercase = false,
    maxLength = 240,
  } = options;

  const cleaned = String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return undefined;
  const clipped = cleaned.slice(0, maxLength);
  return lowercase ? clipped.toLowerCase() : clipped;
};

const sanitizePhone = (value) => {
  const cleaned = sanitizeText(value, { maxLength: 32 });
  if (!cleaned) return undefined;

  const stripped = cleaned.replace(/[^\d+]/g, "");
  const digits = stripped.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return undefined;
  return stripped;
};

const toNumber = (value, options = {}) => {
  if (isMissing(value)) return undefined;

  const { integer = false, min = -Infinity, max = Infinity } = options;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  if (integer && !Number.isInteger(parsed)) return Number.NaN;
  if (parsed < min || parsed > max) return Number.NaN;

  return integer ? parsed : Number(parsed.toFixed(2));
};

const toEnum = (value, allowedValues) => {
  const cleaned = sanitizeText(value, { lowercase: true, maxLength: 40 });
  if (!cleaned) return undefined;
  return allowedValues.has(cleaned) ? cleaned : null;
};

const toDate = (value) => {
  if (isMissing(value)) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const toTime = (value) => {
  const cleaned = sanitizeText(value, { maxLength: 5 });
  if (!cleaned) return undefined;
  return TIME_PATTERN.test(cleaned) ? cleaned : null;
};

const parsePreferences = (value) => {
  if (isMissing(value)) return [];

  const raw = Array.isArray(value) ? value : String(value).split(",");
  const dedupe = new Set();
  const parsed = [];

  raw.forEach((entry) => {
    const cleaned = sanitizeText(entry, { maxLength: 80 });
    if (!cleaned) return;
    const token = cleaned.toLowerCase();
    if (dedupe.has(token)) return;
    dedupe.add(token);
    parsed.push(cleaned);
  });

  return parsed;
};

const buildUserProfile = (normalized = {}, missingFields = []) => {
  const height = normalized.height ?? null;
  const weight = normalized.weight ?? null;
  const bmi =
    typeof height === "number" && height > 0 && typeof weight === "number" && weight > 0
      ? Number((weight / ((height / 100) * (height / 100))).toFixed(1))
      : null;

  return {
    name: normalized.name ?? null,
    age: normalized.age ?? null,
    gender: normalized.gender ?? null,
    dateOfBirth: normalized.dateOfBirth ? normalized.dateOfBirth.toISOString().slice(0, 10) : null,
    bloodGroup: normalized.bloodGroup ?? null,
    heightCm: height,
    weightKg: weight,
    bmi,
    activityLevel: {
      level: normalized.activityLevel ?? null,
      multiplier:
        typeof normalized.activityLevel === "number"
          ? ACTIVITY_MULTIPLIERS[normalized.activityLevel] ?? null
          : null,
    },
    dietType: normalized.dietType ?? null,
    dominantDosha: normalized.dominantDosha ?? null,
    conditions: normalized.healthConditions ?? null,
    medications: normalized.currentMedications ?? null,
    allergies: normalized.allergies ?? null,
    preferences: normalized.preferences ?? [],
    planningInputs: {
      primaryGoal: normalized.planningInputs?.primaryGoal ?? null,
      targetWeightKg: normalized.planningInputs?.targetWeight ?? null,
      timeframeWeeks: normalized.planningInputs?.timeframeWeeks ?? null,
      mealPattern: normalized.planningInputs?.mealPattern ?? null,
      sleepHours: normalized.planningInputs?.sleepHours ?? null,
      stressLevel: normalized.planningInputs?.stressLevel ?? null,
      waterIntakeLiters: normalized.planningInputs?.waterIntakeLiters ?? null,
      budgetTier: normalized.planningInputs?.budgetTier ?? "low",
      localRegion: normalized.planningInputs?.localRegion ?? null,
      mealTimings: normalized.planningInputs?.mealTimings ?? {},
    },
    contacts: {
      phone: normalized.phone ?? null,
      emergencyContactName: normalized.emergencyContactName ?? null,
      emergencyContactPhone: normalized.emergencyContactPhone ?? null,
    },
    missingFields,
  };
};

const processPatientInput = (input = {}, options = {}) => {
  const { requireCoreFields = false, partialUpdate = false } = options;
  const errors = [];
  const missingFields = [];

  const normalized = {};
  const hasValue = (key) => hasOwn(input, key);
  const hasPlanning = hasOwn(input, "planningInputs") && input.planningInputs && typeof input.planningInputs === "object";
  const planning = hasPlanning ? input.planningInputs : {};
  const rawDominantDosha = input?.dominantDosha ?? input?.prakriti?.dominantDosha;

  if (hasValue("name") || !partialUpdate) {
    const name = sanitizeText(input.name, { maxLength: 120 });
    if (!name) {
      if (requireCoreFields) errors.push("Name is required");
      else if (!partialUpdate) missingFields.push("name");
    } else {
      normalized.name = name;
    }
  }

  if (hasValue("age") || !partialUpdate) {
    const age = toNumber(input.age, { integer: true, min: 1, max: 120 });
    if (Number.isNaN(age)) errors.push("Age must be an integer between 1 and 120");
    else if (age === undefined) {
      if (requireCoreFields) errors.push("Age is required");
      else if (!partialUpdate) missingFields.push("age");
    } else normalized.age = age;
  }

  if (hasValue("gender") || !partialUpdate) {
    const gender = toEnum(input.gender, GENDERS);
    if (gender === null) errors.push("Gender must be one of male, female, or other");
    else if (!gender) {
      if (requireCoreFields) errors.push("Gender is required");
      else if (!partialUpdate) missingFields.push("gender");
    } else normalized.gender = gender;
  }

  if (hasValue("height")) {
    const height = toNumber(input.height, { min: 50, max: 260 });
    if (Number.isNaN(height)) errors.push("Height must be between 50 and 260 cm");
    else if (height !== undefined) normalized.height = height;
  } else if (!partialUpdate) missingFields.push("height");

  if (hasValue("weight")) {
    const weight = toNumber(input.weight, { min: 20, max: 400 });
    if (Number.isNaN(weight)) errors.push("Weight must be between 20 and 400 kg");
    else if (weight !== undefined) normalized.weight = weight;
  } else if (!partialUpdate) missingFields.push("weight");

  if (hasValue("dateOfBirth")) {
    const dateOfBirth = toDate(input.dateOfBirth);
    if (dateOfBirth === null) errors.push("dateOfBirth must be a valid date");
    else if (dateOfBirth) normalized.dateOfBirth = dateOfBirth;
  }

  if (hasValue("bloodGroup")) {
    const bloodGroup = sanitizeText(input.bloodGroup, { maxLength: 3 });
    if (bloodGroup && !BLOOD_GROUPS.has(bloodGroup)) {
      errors.push("bloodGroup must be one of A+, A-, B+, B-, AB+, AB-, O+, O-");
    } else if (bloodGroup) normalized.bloodGroup = bloodGroup;
  }

  if (hasValue("phone")) {
    const phone = sanitizePhone(input.phone);
    if (!phone && !isMissing(input.phone)) {
      errors.push("phone must be a valid phone number (7 to 15 digits)");
    } else {
      normalized.phone = phone;
    }
  }
  if (hasValue("emergencyContactPhone")) {
    const emergencyPhone = sanitizePhone(input.emergencyContactPhone);
    if (!emergencyPhone && !isMissing(input.emergencyContactPhone)) {
      errors.push("emergencyContactPhone must be a valid phone number (7 to 15 digits)");
    } else {
      normalized.emergencyContactPhone = emergencyPhone;
    }
  }
  if (hasValue("emergencyContactName")) {
    normalized.emergencyContactName = sanitizeText(input.emergencyContactName, { maxLength: 120 });
  }

  if (hasValue("healthConditions")) {
    normalized.healthConditions = sanitizeText(input.healthConditions, { maxLength: 500 });
  }
  if (hasValue("currentMedications")) {
    normalized.currentMedications = sanitizeText(input.currentMedications, { maxLength: 500 });
  }
  if (hasValue("allergies")) {
    normalized.allergies = sanitizeText(input.allergies, { maxLength: 500 });
  }

  if (hasValue("dietType")) {
    const dietType = toEnum(input.dietType, DIET_TYPES);
    if (dietType === null) errors.push("dietType must be vegetarian, non-vegetarian, vegan, or eggetarian");
    else if (dietType) normalized.dietType = dietType;
  } else if (!partialUpdate) missingFields.push("dietType");

  if (hasValue("activityLevel")) {
    const activityLevel = toNumber(input.activityLevel, { integer: true, min: 1, max: 5 });
    if (Number.isNaN(activityLevel)) errors.push("activityLevel must be an integer from 1 to 5");
    else if (activityLevel !== undefined) normalized.activityLevel = activityLevel;
  } else if (!partialUpdate) missingFields.push("activityLevel");

  if (hasValue("preferences")) {
    normalized.preferences = parsePreferences(input.preferences);
  } else if (!partialUpdate) {
    normalized.preferences = [];
    missingFields.push("preferences");
  }

  if ((hasValue("dominantDosha") || hasOwn(input, "prakriti")) || !partialUpdate) {
    const dominantDosha = toEnum(rawDominantDosha, DOSHAS);
    if (dominantDosha === null) errors.push("dominantDosha must be vata, pitta, or kapha");
    else if (dominantDosha) normalized.dominantDosha = dominantDosha;
    else if (!partialUpdate) missingFields.push("dominantDosha");
  }

  const normalizedPlanning = {};
  const shouldEvaluatePlanning = hasPlanning || hasValue("planningInputs") || !partialUpdate;
  if (shouldEvaluatePlanning) {
    const primaryGoal = toEnum(planning.primaryGoal, PRIMARY_GOALS);
    if (primaryGoal === null) {
      errors.push("planningInputs.primaryGoal is invalid");
    } else if (primaryGoal) {
      normalizedPlanning.primaryGoal = primaryGoal;
    }

    const targetWeight = toNumber(planning.targetWeight, { min: 20, max: 400 });
    if (Number.isNaN(targetWeight)) errors.push("planningInputs.targetWeight must be between 20 and 400 kg");
    else if (targetWeight !== undefined) normalizedPlanning.targetWeight = targetWeight;

    const timeframeWeeks = toNumber(planning.timeframeWeeks, {
      integer: true,
      min: 1,
      max: 104,
    });
    if (Number.isNaN(timeframeWeeks)) {
      errors.push("planningInputs.timeframeWeeks must be an integer between 1 and 104");
    } else if (timeframeWeeks !== undefined) {
      normalizedPlanning.timeframeWeeks = timeframeWeeks;
    }

    const mealPattern = sanitizeText(planning.mealPattern, { maxLength: 120 });
    if (mealPattern) normalizedPlanning.mealPattern = mealPattern;

    const sleepHours = toNumber(planning.sleepHours, { min: 0, max: 16 });
    if (Number.isNaN(sleepHours)) errors.push("planningInputs.sleepHours must be between 0 and 16");
    else if (sleepHours !== undefined) normalizedPlanning.sleepHours = sleepHours;

    const stressLevel = toNumber(planning.stressLevel, { integer: true, min: 1, max: 5 });
    if (Number.isNaN(stressLevel)) errors.push("planningInputs.stressLevel must be an integer from 1 to 5");
    else if (stressLevel !== undefined) normalizedPlanning.stressLevel = stressLevel;

    const waterIntakeLiters = toNumber(planning.waterIntakeLiters, { min: 0, max: 15 });
    if (Number.isNaN(waterIntakeLiters)) errors.push("planningInputs.waterIntakeLiters must be between 0 and 15");
    else if (waterIntakeLiters !== undefined) normalizedPlanning.waterIntakeLiters = waterIntakeLiters;

    const budgetTier = toEnum(planning.budgetTier, BUDGET_TIERS);
    if (budgetTier === null) {
      errors.push("planningInputs.budgetTier must be low, medium, or high");
    } else if (budgetTier) {
      normalizedPlanning.budgetTier = budgetTier;
    } else if (!partialUpdate) {
      normalizedPlanning.budgetTier = "low";
    }

    const localRegion = sanitizeText(planning.localRegion, {
      lowercase: true,
      maxLength: 40,
    });
    if (localRegion) {
      normalizedPlanning.localRegion = localRegion;
    }

    const mealTimingsSource = planning.mealTimings && typeof planning.mealTimings === "object"
      ? planning.mealTimings
      : {};
    const mealTimings = {};
    const timingKeys = [
      "wakeUpTime",
      "breakfastTime",
      "lunchTime",
      "eveningSnackTime",
      "dinnerTime",
      "bedTime",
    ];

    timingKeys.forEach((key) => {
      const rawValue = mealTimingsSource[key];
      if (rawValue === undefined) return;
      const time = toTime(rawValue);
      if (time === null) {
        errors.push(`planningInputs.mealTimings.${key} must be in HH:mm format`);
      } else if (time) {
        mealTimings[key] = time;
      }
    });

    if (Object.keys(mealTimings).length) {
      normalizedPlanning.mealTimings = mealTimings;
    }
  }

  if (Object.keys(normalizedPlanning).length) {
    normalized.planningInputs = normalizedPlanning;
  }

  const patientData = {};
  const assign = (key, value) => {
    if (value !== undefined) patientData[key] = value;
  };

  assign("name", normalized.name);
  assign("age", normalized.age);
  assign("gender", normalized.gender);
  assign("height", normalized.height);
  assign("weight", normalized.weight);
  assign("dateOfBirth", normalized.dateOfBirth);
  assign("bloodGroup", normalized.bloodGroup);
  assign("phone", normalized.phone);
  assign("emergencyContactName", normalized.emergencyContactName);
  assign("emergencyContactPhone", normalized.emergencyContactPhone);
  assign("healthConditions", normalized.healthConditions);
  assign("currentMedications", normalized.currentMedications);
  assign("allergies", normalized.allergies);
  assign("dietType", normalized.dietType);
  assign("activityLevel", normalized.activityLevel);
  assign("preferences", normalized.preferences);
  if (normalized.dominantDosha !== undefined) {
    patientData.prakriti = { dominantDosha: normalized.dominantDosha };
  }
  if (normalized.planningInputs) {
    patientData.planningInputs = normalized.planningInputs;
  }

  return {
    errors,
    missingFields,
    patientData,
    userProfile: buildUserProfile(normalized, missingFields),
  };
};

module.exports = {
  ACTIVITY_MULTIPLIERS,
  processPatientInput,
};
