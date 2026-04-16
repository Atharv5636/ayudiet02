import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchJson } from "../../services/api";
import { updatePatient } from "../../services/patient.service";
import {
  createProgressLog,
  fetchProgressLogs,
} from "../../services/progress.service";
import {
  createPlan,
  explainPlanFromBackend,
  fetchPlansByPatient,
  generatePlanFromBackend,
  generatePersonalizedMeals,
  generateSlotChart,
  updatePlan,
} from "../../services/plan.service";
import usePlansStore from "../../store/plansStore";
import { validatePlan } from "../../utils/planValidation";
import {
  buildDietPlan,
  buildWeeklyDietPlan,
  formatRiskFlags,
} from "@/utils/dietPlanEngine";
import { adjustPlanByTrend, analyzeProgress } from "@/utils/progressionEngine";
import { generateProgressExplanation } from "@/utils/explainEngine";
import { autoImprovePlan } from "@/utils/autoImprovePlanEngine";
import { resolveApiAssetUrl } from "../../utils/apiBaseUrl";

const PLAN_SLOT_CONFIG = [
  { key: "earlyMorning", icon: "Dawn", label: "Early Morning" },
  { key: "morning", icon: "Cup", label: "Morning" },
  { key: "afterExercise", icon: "Move", label: "After Exercise" },
  { key: "breakfast", icon: "Sunrise", label: "Breakfast", library: true },
  { key: "midMorning", icon: "Fruit", label: "Mid Morning" },
  { key: "lunch", icon: "Sun", label: "Lunch", library: true },
  { key: "after2Hours", icon: "Glass", label: "After 2 Hrs" },
  { key: "evening", icon: "Tea", label: "Evening" },
  { key: "lateEvening", icon: "Dusk", label: "Late Evening" },
  { key: "dinner", icon: "Moon", label: "Dinner", library: true },
  { key: "bedTime", icon: "Night", label: "Bed Time" },
];

const PLAN_SLOT_KEYS = PLAN_SLOT_CONFIG.map((slot) => slot.key);
const CORE_MEAL_KEYS = ["breakfast", "lunch", "dinner"];

const createMealDay = (index) => {
  const day = { day: `Day ${index + 1}` };
  PLAN_SLOT_KEYS.forEach((key) => {
    day[key] = "";
  });
  return day;
};

const normalizeMealDayWithSlots = (meal = {}, index = 0) => {
  const normalized = {
    day: String(meal?.day || `Day ${index + 1}`).trim() || `Day ${index + 1}`,
  };
  PLAN_SLOT_KEYS.forEach((key) => {
    normalized[key] = String(meal?.[key] || "").trim();
  });
  return normalized;
};

const DEFAULT_PLAN_DAYS = 7;

const createInitialMealDays = (count = DEFAULT_PLAN_DAYS) =>
  Array.from({ length: count }, (_, index) => createMealDay(index));

const average = (values = []) =>
  values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;

const getLogTimestamp = (log) => log?.recordedAt || log?.createdAt || null;
const getObjectIdTimestamp = (id) => {
  if (typeof id !== "string" || id.length < 8) return 0;
  const seconds = Number.parseInt(id.slice(0, 8), 16);
  if (Number.isNaN(seconds)) return 0;
  return seconds * 1000;
};

const getCurrentDateTimeLocal = () => {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 16);
};
const toDateTimeLocalValue = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T09:00` : "";
  }
  const timezoneOffset = parsed.getTimezoneOffset() * 60000;
  return new Date(parsed.getTime() - timezoneOffset).toISOString().slice(0, 16);
};
const toIsoDateTimeValue = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
};
const formatDateDayMonthYear = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
};
const formatDateTimeDayMonthYear = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(parsed);
};
const getMealTimingDraftFromPatient = (patient = null) => {
  const mealTimings = patient?.planningInputs?.mealTimings || {};
  return {
    wakeUpTime: String(mealTimings?.wakeUpTime || "").trim(),
    breakfastTime: String(mealTimings?.breakfastTime || "").trim(),
    lunchTime: String(mealTimings?.lunchTime || "").trim(),
    eveningSnackTime: String(mealTimings?.eveningSnackTime || "").trim(),
    dinnerTime: String(mealTimings?.dinnerTime || "").trim(),
    bedTime: String(mealTimings?.bedTime || "").trim(),
  };
};

const suggestMealTimings = (patient = {}, goal = "") => {
  const planningInputs = patient?.planningInputs || {};
  const mealPattern = String(planningInputs?.mealPattern || "").toLowerCase();
  const goalText = String(goal || planningInputs?.primaryGoal || "").toLowerCase();
  const isWeightLossLike =
    goalText.includes("weight loss") ||
    goalText.includes("diabetes") ||
    goalText.includes("pcos") ||
    goalText.includes("hypertension");
  const isMuscleGainLike = goalText.includes("muscle") || goalText.includes("weight gain");

  const base = {
    wakeUpTime: "06:30",
    breakfastTime: "08:30",
    lunchTime: "13:00",
    eveningSnackTime: "17:30",
    dinnerTime: "20:00",
    bedTime: "22:30",
  };

  if (mealPattern.includes("intermittent")) {
    return {
      ...base,
      breakfastTime: "10:00",
      lunchTime: "14:00",
      eveningSnackTime: "18:00",
      dinnerTime: "20:30",
    };
  }

  if (isWeightLossLike) {
    return {
      ...base,
      dinnerTime: "19:30",
      bedTime: "22:00",
    };
  }

  if (isMuscleGainLike) {
    return {
      ...base,
      eveningSnackTime: "17:00",
      dinnerTime: "20:30",
      bedTime: "23:00",
    };
  }

  return base;
};
const resolvePatientPhotoUrl = (patient = {}) => {
  const raw = String(patient?.photo?.url || "").trim();
  return resolveApiAssetUrl(raw);
};
const getPatientInitials = (name = "") => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "PT";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
};

const LOW_ADHERENCE_SCORE = 30;
const HIGH_ADHERENCE_SCORE = 100;
const getPlanDraftStorageKey = (patientId) => `dietPlanDraft:${patientId}`;
const getPlanTimestamp = (plan = {}) => {
  const createdAtMs = new Date(plan?.createdAt || 0).getTime();
  if (Number.isFinite(createdAtMs) && createdAtMs > 0) return createdAtMs;
  const updatedAtMs = new Date(plan?.updatedAt || 0).getTime();
  return Number.isFinite(updatedAtMs) ? updatedAtMs : 0;
};

const normalizeAdherenceValue = (value) => {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? HIGH_ADHERENCE_SCORE : LOW_ADHERENCE_SCORE;
  }

  return null;
};

const sanitizeGeneratedMealText = (value = "") =>
  String(value)
    .replace(/\s*\+\s*(more variety|optional add-ons)\s*$/i, "")
    .replace(/\s*\((simplified prep|fixed portions|easy digestion)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
const hasPortionHint = (value = "") => /\bportion\s*:/i.test(String(value));
const DEFAULT_SLOT_ROTATION = {
  breakfast: [
    "vegetable daliya",
    "millet upma with vegetables",
    "idli with sambar",
    "besan chilla with mint chutney",
    "oats with soaked almonds",
    "stewed apples with cinnamon",
  ],
  lunch: [
    "vegetable millet bowl",
    "lauki chana dal sabzi with roti",
    "palak dal with jeera rice",
    "jowar roti with tur dal",
  ],
  dinner: [
    "moong soup",
    "bottle gourd soup",
    "tomato carrot soup with moong chilla",
    "dal palak soup with millet crackers",
  ],
};
const normalizeMealKey = (value = "") =>
  sanitizeGeneratedMealText(String(value || ""))
    .toLowerCase()
    .split("|")[0]
    .split(/[–—-]/)[0]
    .replace(/\s+/g, " ")
    .trim();

const buildSlotOptions = (foods = [], slot = "breakfast") => {
  const fromFoods = Array.isArray(foods)
    ? foods
        .filter((food) => Array.isArray(food?.mealTypes) && food.mealTypes.includes(slot))
        .map((food) => String(food?.name || "").trim())
        .filter(Boolean)
    : [];
  const fallback = DEFAULT_SLOT_ROTATION[slot] || [];
  return [...new Set([...fromFoods, ...fallback])];
};

const diversifyGeneratedMeals = (meals = [], foods = []) => {
  if (!Array.isArray(meals) || meals.length <= 1) {
    return meals;
  }

  const slotOptions = {
    breakfast: buildSlotOptions(foods, "breakfast"),
    lunch: buildSlotOptions(foods, "lunch"),
    dinner: buildSlotOptions(foods, "dinner"),
  };
  const seenBySlot = {
    breakfast: new Set(),
    lunch: new Set(),
    dinner: new Set(),
  };

  return meals.map((mealDay, dayIndex) => {
    const next = { ...mealDay };

    ["breakfast", "lunch", "dinner"].forEach((slot, slotIndex) => {
      const raw = String(next?.[slot] || "").trim();
      const key = normalizeMealKey(raw);
      const alreadySeen = key && seenBySlot[slot].has(key);

      if (!alreadySeen) {
        if (key) seenBySlot[slot].add(key);
        return;
      }

      const options = slotOptions[slot];
      for (let step = 0; step < options.length; step += 1) {
        const candidate = options[(dayIndex + slotIndex + step) % options.length];
        const candidateKey = normalizeMealKey(candidate);
        if (!candidateKey || seenBySlot[slot].has(candidateKey)) {
          continue;
        }
        next[slot] = candidate;
        seenBySlot[slot].add(candidateKey);
        return;
      }
    });

    return next;
  });
};

const buildAiPatientContext = (patient = {}, goal = "", dosha = "", progressLogs = []) => {
  const orderedLogs = Array.isArray(progressLogs)
    ? [...progressLogs].sort(
        (left, right) =>
          new Date(getLogTimestamp(right) || 0).getTime() -
          new Date(getLogTimestamp(left) || 0).getTime()
      )
    : [];
  const latestLog = orderedLogs[0] || null;

  return {
    goal: goal || patient?.planningInputs?.primaryGoal || "",
    preferredDosha: dosha || patient?.prakriti?.dominantDosha || "",
    patientContext: {
      age: patient?.age ?? null,
      gender: patient?.gender || "",
      heightCm: patient?.height ?? null,
      weightKg: patient?.weight ?? null,
      healthConditions: patient?.healthConditions || "",
      currentMedications: patient?.currentMedications || "",
      allergies: patient?.allergies || "",
      dietType: patient?.dietType || "",
      activityLevel: patient?.activityLevel || "",
      preferences: Array.isArray(patient?.preferences) ? patient.preferences : [],
      planningInputs: patient?.planningInputs || {},
    },
    progressContext: {
      totalLogs: orderedLogs.length,
      latest: latestLog
        ? {
            recordedAt: getLogTimestamp(latestLog),
            weight: latestLog.weight ?? null,
            energyLevel: latestLog.energyLevel ?? null,
            digestion: latestLog.digestion || "",
            symptomScore: latestLog.symptomScore ?? null,
            adherence: normalizeAdherenceValue(latestLog.adherence),
            sleepHours: latestLog.sleepHours ?? null,
            waterIntakeLiters: latestLog.waterIntakeLiters ?? null,
            activityMinutes: latestLog.activityMinutes ?? null,
            stressLevel: latestLog.stressLevel ?? null,
          }
        : null,
      recent: orderedLogs.slice(0, 5).map((log) => ({
        recordedAt: getLogTimestamp(log),
        weight: log.weight ?? null,
        energyLevel: log.energyLevel ?? null,
        digestion: log.digestion || "",
        symptomScore: log.symptomScore ?? null,
        adherence: normalizeAdherenceValue(log.adherence),
      })),
    },
    constraints: {
      avoidUnknownIngredients: true,
      requireRecognizableMealNames: true,
    },
  };
};

const normalizeGoalValue = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("diabetes") || normalized.includes("blood sugar")) {
    return "diabetes support";
  }
  if (normalized.includes("pcos")) return "pcos support";
  if (normalized.includes("thyroid")) return "thyroid support";
  if (
    normalized.includes("hypertension") ||
    normalized.includes("blood pressure")
  ) {
    return "hypertension support";
  }
  if (normalized.includes("weight") && normalized.includes("loss")) return "weight loss";
  if (normalized.includes("muscle") && normalized.includes("gain")) return "muscle gain";
  if (normalized.includes("digest")) return "better digestion";
  return "general wellness";
};

const getDefaultReviewDateTime = () => {
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const timezoneOffset = nextWeek.getTimezoneOffset() * 60000;
  return new Date(nextWeek.getTime() - timezoneOffset).toISOString().slice(0, 16);
};


function PatientDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [patient, setPatient] = useState(null);
  const [patientLoading, setPatientLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [isTitleManuallyEdited, setIsTitleManuallyEdited] = useState(false);
  const [goal, setGoal] = useState("");
  const [dosha, setDosha] = useState("");
  const [date, setDate] = useState("");
  const [manualDays, setManualDays] = useState(createInitialMealDays());
  const [aiDays, setAiDays] = useState(createInitialMealDays());
  const [builderMode, setBuilderMode] = useState("manual");
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [expandedPlanId, setExpandedPlanId] = useState(null);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isImprovingPlan, setIsImprovingPlan] = useState(false);
  const [autoFixChanges, setAutoFixChanges] = useState([]);
  const [lastGeneratedContext, setLastGeneratedContext] = useState(null);
  const [lastProgressInsights, setLastProgressInsights] = useState([]);
  const [generatedDietPlan, setGeneratedDietPlan] = useState(null);
  const [isGeneratedPlanLowConfidence, setIsGeneratedPlanLowConfidence] = useState(false);
  const [generatedPlanTrend, setGeneratedPlanTrend] = useState("stable");
  const [generatedPlanTrendConfidence, setGeneratedPlanTrendConfidence] = useState(0.4);
  const [generatedPlanReason, setGeneratedPlanReason] = useState({
    summary: "Not enough data",
    interpretation: "Insufficient recent progress history to infer a pattern",
    actionReason: "Plan maintained due to stable progress",
  });
  const [latestPlanChangeAudit, setLatestPlanChangeAudit] = useState(null);
  const [progressLogs, setProgressLogs] = useState([]);
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressForm, setProgressForm] = useState({
    weight: patient?.weight || "",
    energyLevel: "3",
    symptomScore: "5",
    digestion: "good",
    digestionDetail: "normal",
    adherence: "75",
    sleepHours:
      typeof patient?.planningInputs?.sleepHours === "number"
        ? String(patient.planningInputs.sleepHours)
        : "",
    waterIntakeLiters:
      typeof patient?.planningInputs?.waterIntakeLiters === "number"
        ? String(patient.planningInputs.waterIntakeLiters)
        : "",
    appetite: "normal",
    activityMinutes: "",
    stressLevel:
      typeof patient?.planningInputs?.stressLevel === "number"
        ? String(patient.planningInputs.stressLevel)
        : "3",
    notes: "",
    recordedAt: getCurrentDateTimeLocal(),
  });
  const [toast, setToast] = useState("");
  const [mealTimingDraft, setMealTimingDraft] = useState(
    getMealTimingDraftFromPatient(null)
  );
  const [savingMealTimings, setSavingMealTimings] = useState(false);
  const [progressPage, setProgressPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const PROGRESS_LOGS_PER_PAGE = 2;
  const PLAN_HISTORY_PER_PAGE = 4;

  const activeDays = builderMode === "ai" ? aiDays : manualDays;
  const setActiveDays = useCallback(
    (updater) => {
      if (builderMode === "ai") {
        setAiDays(updater);
        return;
      }
      setManualDays(updater);
    },
    [builderMode]
  );
  const getDefaultPlanFormValues = useCallback(() => {
    const defaultGoal = normalizeGoalValue(
      patient?.planningInputs?.primaryGoal || goal
    );
    const defaultDosha = String(
      patient?.prakriti?.dominantDosha || patient?.doshaType || dosha || ""
    )
      .trim()
      .toLowerCase();
    const safeDosha = ["vata", "pitta", "kapha"].includes(defaultDosha)
      ? defaultDosha
      : "";
    const defaultTitle = patient?.name
      ? `${patient.name} ${defaultGoal ? `- ${defaultGoal}` : ""} Plan`
      : "Diet Plan";

    return {
      title: defaultTitle.trim(),
      goal: defaultGoal,
      dosha: safeDosha,
      date: getDefaultReviewDateTime(),
    };
  }, [patient, goal, dosha]);
  const buildPortionHintForSlot = useCallback(
    (slotKey, mealText = "") => {
      const goalText = String(goal || "").toLowerCase();
      const conditionText = String(patient?.healthConditions || "").toLowerCase();
      const mealTextNormalized = String(mealText || "").toLowerCase();
      const isWeightLoss = goalText.includes("weight loss");
      const isMuscleGain =
        goalText.includes("muscle") || goalText.includes("weight gain");
      const isRotiStyleDish = /(roti|chapati|phulka|paratha|thepla|wrap)/.test(
        mealTextNormalized
      );
      const isGrainBowlDish =
        /(khichdi|rice|pulao|daliya|quinoa|oats|porridge|upma|poha|millet)/.test(
          mealTextNormalized
        );
      const isSoupSaladDish = /(soup|salad|broth|stew)/.test(mealTextNormalized);

      const baseBySlot = {
        breakfast: isMuscleGain
          ? "Portion: 1.5 bowls"
          : isWeightLoss
            ? "Portion: 1 bowl"
            : "Portion: 1-1.25 bowls",
        lunch: isRotiStyleDish
          ? isMuscleGain
            ? "Portion: 2-3 rotis + 1 cup sabzi/dal"
            : isWeightLoss
              ? "Portion: 1-1.5 rotis + 1 cup sabzi"
              : "Portion: 1-2 rotis + 1 cup sabzi/dal"
          : isGrainBowlDish
            ? isMuscleGain
              ? "Portion: 1.5 cups cooked grains/khichdi"
              : isWeightLoss
                ? "Portion: 0.75-1 cup cooked grains/khichdi"
                : "Portion: 1-1.25 cups cooked grains/khichdi"
            : isSoupSaladDish
              ? isMuscleGain
                ? "Portion: 1.5 bowls + protein side"
                : isWeightLoss
                  ? "Portion: 1 bowl + protein side"
                  : "Portion: 1-1.25 bowls + protein side"
              : isMuscleGain
                ? "Portion: 1.5 bowls or 2 rotis"
                : isWeightLoss
                  ? "Portion: 1 bowl or 1 roti"
                  : "Portion: 1-1.25 bowls or 1-2 rotis",
        dinner: isMuscleGain
          ? "Portion: 1.5 bowls + protein side"
          : isWeightLoss
            ? "Portion: 1 bowl (light)"
            : "Portion: 1-1.25 bowls",
      };

      const qualifiers = [];
      if (conditionText.includes("diabet")) qualifiers.push("low glycemic carbs");
      if (conditionText.includes("blood pressure")) qualifiers.push("very low salt");
      if (conditionText.includes("digest")) qualifiers.push("easy-to-digest prep");

      const suffix = qualifiers.length ? `; ${qualifiers.join(", ")}` : "";
      return `${baseBySlot[slotKey] || "Portion: moderate serving"}${suffix}`;
    },
    [goal, patient?.healthConditions]
  );
  const ensureMealHasPortion = useCallback(
    (slotKey, mealText) => {
      const cleaned = sanitizeGeneratedMealText(mealText || "");
      if (!cleaned) return cleaned;
      if (hasPortionHint(cleaned)) return cleaned;
      return `${cleaned} | ${buildPortionHintForSlot(slotKey, cleaned)}`;
    },
    [buildPortionHintForSlot]
  );

  const plans = usePlansStore((state) => state.patientPlans[id]);
  const setPatientPlans = usePlansStore((state) => state.setPatientPlans);
  const upsertPatientPlan = usePlansStore((state) => state.upsertPatientPlan);

  const visiblePlans = useMemo(() => plans || [], [plans]);
  const mealTimings = mealTimingDraft;
  const activePlan = useMemo(() => {
    const activePlans = visiblePlans.filter((plan) => plan?.isActive);
    if (!activePlans.length) return null;

    // Always show the latest active plan, independent of currently edited goal.
    return [...activePlans].sort((left, right) => getPlanTimestamp(right) - getPlanTimestamp(left))[0];
  }, [visiblePlans]);
  const loading = patientLoading || plansLoading;
  const builderValidation = useMemo(
    () => validatePlan(activeDays, dosha),
    [activeDays, dosha]
  );
  const hasRequiredPlanContext = Boolean(
    title.trim() && goal && dosha && date
  );
  const requiredPlanContextMessage =
    "Please fill plan title, goal, dosha, and review date first.";
  const progressTrendSummary = useMemo(() => {
    if (!progressLogs.length) {
      return {
        weightTrend: { label: "No data", arrow: "->" },
        energyTrend: { label: "No data", arrow: "->" },
        adherence: { label: "No data", arrow: "->" },
      };
    }

    const orderedLogs = [...progressLogs].sort(
      (left, right) =>
        new Date(getLogTimestamp(left) || 0).getTime() -
        new Date(getLogTimestamp(right) || 0).getTime()
    );

    const weightLogs = orderedLogs.filter((log) => typeof log.weight === "number");
    const first = weightLogs[0];
    const last = weightLogs[weightLogs.length - 1];
    const directWeightDiff =
      typeof first?.weight === "number" && typeof last?.weight === "number"
        ? Number((last.weight - first.weight).toFixed(1))
        : 0;
    const recentWeightLogs = weightLogs.slice(-3);
    const previousWeightLogs =
      weightLogs.length > 3
        ? weightLogs.slice(0, Math.max(weightLogs.length - 3, 1))
        : weightLogs.slice(0, -1);
    const avgRecentWeight = average(recentWeightLogs.map((log) => log.weight));
    const avgPreviousWeight = average(
      previousWeightLogs.map((log) => log.weight)
    );
    const weightDiff =
      typeof avgRecentWeight === "number" && typeof avgPreviousWeight === "number"
        ? Number((avgRecentWeight - avgPreviousWeight).toFixed(1))
        : directWeightDiff;

    const energyLogs = orderedLogs.filter(
      (log) => typeof log.energyLevel === "number"
    );
    const recentEnergyLogs = energyLogs.slice(-3);
    const previousEnergyLogs =
      energyLogs.length > 3
        ? energyLogs.slice(0, Math.max(energyLogs.length - 3, 1))
        : energyLogs.slice(0, -1);
    const currentEnergy = average(recentEnergyLogs.map((log) => log.energyLevel));
    const previousEnergy = average(
      previousEnergyLogs.map((log) => log.energyLevel)
    );

    const adherenceValues = orderedLogs
      .map((log) => normalizeAdherenceValue(log.adherence))
      .filter((value) => typeof value === "number");
    const adherenceRate =
      adherenceValues.length > 0 ? average(adherenceValues) / 100 : null;

    const weightTrend =
      weightDiff > 1
        ? { label: `Increasing (+${weightDiff}kg)`, arrow: "↑" }
        : weightDiff < -1
          ? { label: `Decreasing (${weightDiff}kg)`, arrow: "↓" }
          : { label: "Stable", arrow: "→" };

    const energyTrend =
      typeof currentEnergy === "number" && typeof previousEnergy === "number"
        ? currentEnergy > previousEnergy + 0.3
          ? {
              label: `${previousEnergy.toFixed(1)} -> ${currentEnergy.toFixed(1)}`,
              arrow: "↑",
            }
          : currentEnergy < previousEnergy - 0.3
            ? {
                label: `${previousEnergy.toFixed(1)} -> ${currentEnergy.toFixed(1)}`,
                arrow: "↓",
              }
            : {
                label: `${previousEnergy.toFixed(1)} -> ${currentEnergy.toFixed(1)}`,
                arrow: "→",
              }
        : { label: "No data", arrow: "→" };

    const adherence =
      adherenceRate >= 0.8
        ? { label: `Good (${Math.round(adherenceRate * 100)}%)`, arrow: "↑" }
        : adherenceRate < 0.5
          ? { label: `Poor (${Math.round(adherenceRate * 100)}%)`, arrow: "↓" }
          : {
              label: `Moderate (${Math.round(adherenceRate * 100)}%)`,
              arrow: "→",
            };

    return {
      weightTrend,
      energyTrend,
      adherence,
    };
  }, [progressLogs]);

  const totalProgressPages = Math.max(
    1,
    Math.ceil(progressLogs.length / PROGRESS_LOGS_PER_PAGE)
  );

  const paginatedProgressLogs = useMemo(() => {
    const start = (progressPage - 1) * PROGRESS_LOGS_PER_PAGE;
    return progressLogs.slice(start, start + PROGRESS_LOGS_PER_PAGE);
  }, [progressLogs, progressPage]);

  const progressStartIndex = (progressPage - 1) * PROGRESS_LOGS_PER_PAGE;
  const progressEndIndex = Math.min(
    progressStartIndex + PROGRESS_LOGS_PER_PAGE,
    progressLogs.length
  );

  const historicalPlans = useMemo(
    () => visiblePlans.filter((plan) => !plan.isActive),
    [visiblePlans]
  );

  const totalHistoryPages = Math.max(
    1,
    Math.ceil(historicalPlans.length / PLAN_HISTORY_PER_PAGE)
  );

  const paginatedHistoryPlans = useMemo(() => {
    const start = (historyPage - 1) * PLAN_HISTORY_PER_PAGE;
    return historicalPlans.slice(start, start + PLAN_HISTORY_PER_PAGE);
  }, [historicalPlans, historyPage]);

  const historyStartIndex = (historyPage - 1) * PLAN_HISTORY_PER_PAGE;
  const historyEndIndex = Math.min(
    historyStartIndex + PLAN_HISTORY_PER_PAGE,
    historicalPlans.length
  );

  const persistPlanDraft = useCallback(
    (nextDraft = {}) => {
      try {
        sessionStorage.setItem(
          getPlanDraftStorageKey(id),
          JSON.stringify({
            showForm,
            editingPlanId,
            title,
            goal,
            dosha,
            date,
            manualDays,
            aiDays,
            builderMode,
            selectedDayIndex,
            ...nextDraft,
          })
        );
      } catch (error) {
        console.error("Failed to persist plan draft", error);
      }
    },
    [id, showForm, editingPlanId, title, goal, dosha, date, manualDays, aiDays, builderMode, selectedDayIndex]
  );

  const resetBuilder = () => {
    const defaults = getDefaultPlanFormValues();
    setShowForm(false);
    setEditingPlanId(null);
    setTitle(defaults.title);
    setIsTitleManuallyEdited(false);
    setGoal(defaults.goal);
    setDosha(defaults.dosha);
    setDate(defaults.date);
    setManualDays(createInitialMealDays());
    setAiDays(createInitialMealDays());
    setBuilderMode("manual");
    setSelectedDayIndex(0);
    setAutoFixChanges([]);
    setLastGeneratedContext(null);
    setLastProgressInsights([]);
    try {
      sessionStorage.removeItem(getPlanDraftStorageKey(id));
    } catch (error) {
      console.error("Failed to clear plan draft", error);
    }
  };

  const startEditingPlan = (plan) => {
    setShowForm(true);
    setEditingPlanId(plan._id);
    setTitle(plan.title || "");
    setIsTitleManuallyEdited(true);
    setGoal(String(plan.goal || patient?.planningInputs?.primaryGoal || "").trim());
    setDosha(plan.doshaType || "");
    setDate(
      plan.reviewDueDate
        ? toDateTimeLocalValue(plan.reviewDueDate)
        : ""
    );
    const planDays = plan.meals?.length
      ? plan.meals.map((meal, index) => normalizeMealDayWithSlots(meal, index))
      : createInitialMealDays();
    setManualDays(planDays);
    setAiDays(createInitialMealDays(planDays.length || DEFAULT_PLAN_DAYS));
    setBuilderMode("manual");
    setSelectedDayIndex(0);
    setAutoFixChanges([]);
    setLastGeneratedContext(null);
    setLastProgressInsights([]);
  };

  const updateDayField = (index, field, value) => {
    setAutoFixChanges([]);
    setActiveDays((currentDays) =>
      currentDays.map((day, dayIndex) =>
        dayIndex === index ? { ...day, [field]: value } : day
      )
    );
  };

  const applyGeneratedDietPlanToBuilder = (dietPlan, options = {}) => {
    const { mergeOnlyNonCore = false } = options;
    if (!dietPlan) {
      return;
    }

    setAiDays((currentDays) => {
      const nextDays = Array.isArray(currentDays) && currentDays.length
        ? [...currentDays]
        : createInitialMealDays();

      if (Array.isArray(dietPlan)) {
        for (let index = 0; index < nextDays.length; index += 1) {
          const sourceDay =
            dietPlan[index] ||
            (dietPlan.length ? dietPlan[index % dietPlan.length] : null) ||
            {};
          const normalizedSource = normalizeMealDayWithSlots(sourceDay, index);
          nextDays[index] = {
            ...normalizeMealDayWithSlots(nextDays[index], index),
            ...(mergeOnlyNonCore
              ? {}
              : {
                  breakfast: ensureMealHasPortion(
                    "breakfast",
                    normalizedSource.breakfast || ""
                  ),
                  lunch: ensureMealHasPortion("lunch", normalizedSource.lunch || ""),
                  dinner: ensureMealHasPortion("dinner", normalizedSource.dinner || ""),
                }),
            ...PLAN_SLOT_KEYS.reduce((acc, key) => {
              if (CORE_MEAL_KEYS.includes(key)) return acc;
              acc[key] = normalizedSource[key] || "";
              return acc;
            }, {}),
          };
        }
      } else {
        const normalizedSource = normalizeMealDayWithSlots(dietPlan, 0);
        for (let index = 0; index < nextDays.length; index += 1) {
          nextDays[index] = {
            ...normalizeMealDayWithSlots(nextDays[index], index),
            ...(mergeOnlyNonCore
              ? {}
              : {
                  breakfast: ensureMealHasPortion(
                    "breakfast",
                    normalizedSource.breakfast || ""
                  ),
                  lunch: ensureMealHasPortion("lunch", normalizedSource.lunch || ""),
                  dinner: ensureMealHasPortion("dinner", normalizedSource.dinner || ""),
                }),
            ...PLAN_SLOT_KEYS.reduce((acc, key) => {
              if (CORE_MEAL_KEYS.includes(key)) return acc;
              acc[key] = normalizedSource[key] || "";
              return acc;
            }, {}),
          };
        }
      }

      return nextDays;
    });
  };

  const addDay = () => {
    setAutoFixChanges([]);
    setBuilderMode("manual");
    setManualDays((currentDays) => [...currentDays, createMealDay(currentDays.length)]);
  };

  const removeDay = (index) => {
    setAutoFixChanges([]);
    setActiveDays((currentDays) => {
      if (currentDays.length === 1) {
        return currentDays;
      }

      const nextDays = currentDays
        .filter((_, dayIndex) => dayIndex !== index)
        .map((day, dayIndex) => ({
          ...day,
          day: `Day ${dayIndex + 1}`,
        }));

      setSelectedDayIndex((currentIndex) => {
        if (currentIndex > index) {
          return currentIndex - 1;
        }
        if (currentIndex === index) {
          return Math.max(index - 1, 0);
        }
        return currentIndex;
      });

      return nextDays;
    });
  };

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  };

  const handleTimingFieldChange = (field, value) => {
    setMealTimingDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const persistMealTimings = async (nextDraft, options = {}) => {
    const { showSuccessToast = true } = options;
    if (!patient?._id) {
      return false;
    }

    try {
      setSavingMealTimings(true);
      const existingPlanningInputs =
        patient?.planningInputs && typeof patient.planningInputs === "object"
          ? patient.planningInputs
          : {};
      const nextPlanningInputs = {
        ...existingPlanningInputs,
        mealTimings: {
          wakeUpTime: nextDraft.wakeUpTime || undefined,
          breakfastTime: nextDraft.breakfastTime || undefined,
          lunchTime: nextDraft.lunchTime || undefined,
          eveningSnackTime: nextDraft.eveningSnackTime || undefined,
          dinnerTime: nextDraft.dinnerTime || undefined,
          bedTime: nextDraft.bedTime || undefined,
        },
      };

      const updated = await updatePatient(patient._id, {
        planningInputs: nextPlanningInputs,
      });
      setPatient(updated || patient);
      setMealTimingDraft(getMealTimingDraftFromPatient(updated || patient));
      if (showSuccessToast) {
        showToast("Meal timings saved");
      }
      return true;
    } catch (error) {
      console.error("Error saving meal timings:", error);
      if (showSuccessToast) {
        alert(error.message || "Unable to save meal timings.");
      }
      return false;
    } finally {
      setSavingMealTimings(false);
    }
  };

  const handleSaveMealTimings = async () => {
    await persistMealTimings(mealTimingDraft, { showSuccessToast: true });
  };

  const autoFillMealTimingsAfterAi = async () => {
    const suggested = suggestMealTimings(patient, goal);
    const merged = {
      ...mealTimingDraft,
    };
    let changed = false;

    Object.keys(suggested).forEach((key) => {
      const currentValue = String(merged[key] || "").trim();
      if (!currentValue) {
        merged[key] = suggested[key];
        changed = true;
      }
    });

    if (!changed) {
      return;
    }

    setMealTimingDraft(merged);
    const saved = await persistMealTimings(merged, { showSuccessToast: false });
    if (saved) {
      showToast("AI generated plan and suggested meal timings");
    }
  };

  const fetchProgress = useCallback(async () => {
    try {
      setProgressLoading(true);
      const logs = await fetchProgressLogs(id);
      const normalizedLogs = Array.isArray(logs)
        ? [...logs].sort(
            (left, right) =>
              getObjectIdTimestamp(right?._id) - getObjectIdTimestamp(left?._id) ||
              new Date(right?.createdAt || getLogTimestamp(right) || 0).getTime() -
                new Date(left?.createdAt || getLogTimestamp(left) || 0).getTime()
          )
        : [];
      console.log("Logs:", normalizedLogs);
      setProgressLogs(normalizedLogs);
    } catch (error) {
      console.error("Error fetching progress logs:", error);
    } finally {
      setProgressLoading(false);
    }
  }, [id]);

  const fetchPatientPlans = useCallback(async () => {
    try {
      setPlansLoading(true);
      const data = await fetchPlansByPatient(id);
      setPatientPlans(id, data?.plans || []);
      return data?.plans || [];
    } catch (error) {
      console.error("Error fetching plans:", error);
      setPatientPlans(id, []);
      return [];
    } finally {
      setPlansLoading(false);
    }
  }, [id, setPatientPlans]);

  useEffect(() => {
    console.log("Logs:", progressLogs);
  }, [progressLogs]);

  useEffect(() => {
    setSelectedDayIndex((currentIndex) =>
      Math.min(currentIndex, Math.max(activeDays.length - 1, 0))
    );
  }, [activeDays.length]);

  useEffect(() => {
    try {
      const rawDraft = sessionStorage.getItem(getPlanDraftStorageKey(id));
      if (!rawDraft) return;

      const draft = JSON.parse(rawDraft);
      if (!draft?.showForm) return;

      setShowForm(Boolean(draft.showForm));
      setEditingPlanId(draft.editingPlanId || null);
      setTitle(draft.title || "");
      setIsTitleManuallyEdited(Boolean((draft.title || "").trim()));
      setGoal(draft.goal || "");
      setDosha(draft.dosha || "");
      setDate(toDateTimeLocalValue(draft.date) || "");
      const restoredManualDays = Array.isArray(draft.manualDays) && draft.manualDays.length
        ? draft.manualDays
        : Array.isArray(draft.days) && draft.days.length
          ? draft.days
          : createInitialMealDays();
      const restoredAiDays = Array.isArray(draft.aiDays) && draft.aiDays.length
        ? draft.aiDays
        : createInitialMealDays(restoredManualDays.length || DEFAULT_PLAN_DAYS);
      setManualDays(
        restoredManualDays.map((mealDay, index) =>
          normalizeMealDayWithSlots(mealDay, index)
        )
      );
      setAiDays(
        restoredAiDays.map((mealDay, index) =>
          normalizeMealDayWithSlots(mealDay, index)
        )
      );
      setBuilderMode(draft.builderMode || "manual");
      setSelectedDayIndex(typeof draft.selectedDayIndex === "number" ? draft.selectedDayIndex : 0);
    } catch (error) {
      console.error("Failed to restore plan draft", error);
    }
  }, [id]);

  useEffect(() => {
    if (!showForm) return;
    persistPlanDraft();
  }, [showForm, editingPlanId, title, goal, dosha, date, manualDays, aiDays, builderMode, selectedDayIndex, persistPlanDraft]);

  useEffect(() => {
    if (!showForm || editingPlanId) {
      return;
    }

    const defaults = getDefaultPlanFormValues();
    if (!isTitleManuallyEdited && !title.trim()) setTitle(defaults.title);
    if (!goal) setGoal(defaults.goal);
    if (!dosha) setDosha(defaults.dosha);
    if (!date) setDate(defaults.date);
  }, [showForm, editingPlanId, title, goal, dosha, date, isTitleManuallyEdited, getDefaultPlanFormValues]);

  const openMealLibrary = (dayIndex, slotKey) => {
    persistPlanDraft({
      showForm: true,
      selectedDayIndex: dayIndex,
    });

    navigate(
      `/dashboard/patients/${id}/meal-library?day=${dayIndex}&slot=${slotKey}&goal=${encodeURIComponent(
        goal
      )}&dosha=${encodeURIComponent(dosha)}`
    );
  };

  const handleProgressFieldChange = (field, value) => {
    setProgressForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

      const handleGeneratePlan = async (planInput = null) => {
    if (!hasRequiredPlanContext) {
      alert(requiredPlanContextMessage);
      return;
    }

    const symptoms =
      planInput?.primaryIssue || goal.trim() || patient?.healthConditions || "";
    if (!symptoms) {
      alert("Enter goal or symptoms before generation");
      return;
    }
    try {
      setIsGeneratingAi(true);

      // Preferred path: backend meal generation using patient record (more personalized).
      try {
        const mealsResponse = await generatePersonalizedMeals({
          patientId: id,
          goal: goal.trim(),
          doshaType: dosha || "vata",
          totalDays: aiDays.length || DEFAULT_PLAN_DAYS,
        });

        const meals = Array.isArray(mealsResponse?.meals)
          ? mealsResponse.meals.map((meal, index) => ({
              day: meal?.day || `Day ${index + 1}`,
              breakfast: sanitizeGeneratedMealText(meal?.breakfast || ""),
              lunch: sanitizeGeneratedMealText(meal?.lunch || ""),
              dinner: sanitizeGeneratedMealText(meal?.dinner || ""),
            }))
          : null;
        const diversifiedMeals = Array.isArray(meals)
          ? diversifyGeneratedMeals(meals, mealsResponse?.foods)
          : null;

        if (diversifiedMeals && diversifiedMeals.length) {
          const generationSource = String(
            mealsResponse?.generationSource || "unknown"
          ).toLowerCase();
          const usedFallback =
            generationSource === "fallback_mock" || generationSource === "unknown";
          const fallbackReason = mealsResponse?.generationFallbackReason
            ? String(mealsResponse.generationFallbackReason)
            : "none";
          setAutoFixChanges([]);
          applyGeneratedDietPlanToBuilder(diversifiedMeals);
          try {
            const slotChartResponse = await generateSlotChart({
              patientId: id,
              doshaType: dosha || "vata",
              baseMeals: diversifiedMeals,
            });
            if (Array.isArray(slotChartResponse?.slotPlans) && slotChartResponse.slotPlans.length) {
              applyGeneratedDietPlanToBuilder(slotChartResponse.slotPlans, {
                mergeOnlyNonCore: true,
              });
            }
          } catch (slotError) {
            console.warn("Slot chart generation failed for personalized meals:", slotError);
          }
          setBuilderMode("ai");
          setSelectedDayIndex(0);
          setGeneratedDietPlan(diversifiedMeals[0]);
          setIsGeneratedPlanLowConfidence(false);
          setGeneratedPlanTrend("stable");
          setGeneratedPlanTrendConfidence(0.8);
          setGeneratedPlanReason({
            summary: usedFallback
              ? "Baseline personalized meals generated"
              : "Personalized AI meals generated",
            interpretation: usedFallback
              ? "OpenAI response fallback was used; meals are still based on patient profile and progress context"
              : "Meal plan generated using patient profile and recent progress",
            actionReason: usedFallback
              ? `Fallback reason: ${fallbackReason}`
              : "Meals grounded to allowed Ayurvedic foods and patient constraints",
          });
          setLastGeneratedContext({
            goal: String(
              mealsResponse?.patientContext?.goal ||
                goal.trim() ||
                "Diet plan"
            ).trim(),
            doshaType: String(
              mealsResponse?.patientContext?.doshaType ||
                dosha ||
                "vata"
            ).trim(),
            weight:
              mealsResponse?.patientContext?.weight ||
              patient?.weight ||
              "-",
          });
          setLastProgressInsights([
            ...(Array.isArray(mealsResponse?.progressInsights)
              ? mealsResponse.progressInsights.slice(0, 3)
              : []),
            ...(Array.isArray(mealsResponse?.foods) && mealsResponse.foods.length
              ? [`Foods grounded: ${mealsResponse.foods.length}`]
              : []),
            `Generation source: ${generationSource}`,
            ...(usedFallback ? [`Fallback reason: ${fallbackReason}`] : []),
          ]);
          await autoFillMealTimingsAfterAi();
          showToast(
            usedFallback
              ? `Generated using fallback mode (${fallbackReason}).`
              : "Personalized AI meals generated."
          );
          return;
        }
      } catch (error) {
        console.warn("Personalized meal generation failed, falling back:", error);
      }

      const aiRequestPayload = {
        symptoms,
        preferredDosha: dosha || "vata",
        ...buildAiPatientContext(patient, goal, dosha, progressLogs),
      };
      const result = await generatePlanFromBackend({
        ...aiRequestPayload,
      });
      const profile = result || {};
      const confidence =
        typeof profile?.confidence === "number" ? profile.confidence : 0;
      const useSafeBaseline = Boolean(profile?.fallback) || confidence < 0.45;
      const patientWithProgress = {
        ...patient,
        progressLogs,
      };
      const safeProfile = useSafeBaseline
        ? {
            primary_dosha: dosha || profile?.primary_dosha || "vata",
            risk_flags: ["none"],
          }
        : profile;
      const baseDietPlan = buildWeeklyDietPlan(
        safeProfile,
        aiDays.length || DEFAULT_PLAN_DAYS,
        aiRequestPayload
      );
      let dietPlan = baseDietPlan;
      const progression = analyzeProgress(patientWithProgress.progressLogs || []);
      const trend = progression?.trend || "stable";
      const trendConfidence =
        typeof progression?.confidence === "number" ? progression.confidence : 0.4;
      if (!useSafeBaseline) {
        dietPlan = adjustPlanByTrend(dietPlan, trend);
      }
      const reason = generateProgressExplanation(
        patientWithProgress.progressLogs || [],
        trend
      );
      const formatted = {
        score: Math.round(confidence * 100),
        issue: formatRiskFlags(profile.risk_flags),
        category: profile.primary_dosha || "-",
        dietPlan,
      };
      const confidenceLabel =
        useSafeBaseline
          ? "Low confidence or schema fallback: safe baseline plan applied"
          : `Confidence: ${formatted.score}%`;
      setAutoFixChanges([]);
      setGeneratedDietPlan(
        Array.isArray(formatted.dietPlan)
          ? formatted.dietPlan[0] || buildDietPlan(profile, aiRequestPayload)
          : formatted.dietPlan
      );
      applyGeneratedDietPlanToBuilder(formatted.dietPlan);
      try {
        const baseMealsForSlots = Array.isArray(formatted.dietPlan)
          ? formatted.dietPlan
          : [formatted.dietPlan];
        const slotChartResponse = await generateSlotChart({
          patientId: id,
          doshaType: dosha || "vata",
          baseMeals: baseMealsForSlots,
        });
        if (Array.isArray(slotChartResponse?.slotPlans) && slotChartResponse.slotPlans.length) {
          applyGeneratedDietPlanToBuilder(slotChartResponse.slotPlans, {
            mergeOnlyNonCore: true,
          });
        }
      } catch (slotError) {
        console.warn("Slot chart generation failed for profile analysis:", slotError);
      }
      setBuilderMode("ai");
      setSelectedDayIndex(0);
      setGeneratedPlanTrend(trend);
      setGeneratedPlanTrendConfidence(trendConfidence);
      setGeneratedPlanReason(reason);
      setIsGeneratedPlanLowConfidence(confidence < 0.4);
      setLatestPlanChangeAudit({
        previousPlan: baseDietPlan,
        updatedPlan: dietPlan,
        trend,
        timestamp: new Date().toISOString(),
      });
      setLastGeneratedContext({
        goal: goal.trim() || "Symptoms analysis",
        doshaType: formatted.category,
        weight: patient?.weight || "-",
      });
      setLastProgressInsights([
        `Risk Flags: ${formatted.issue}`,
        `Category: ${formatted.category}`,
        `Trend: ${trend.charAt(0).toUpperCase() + trend.slice(1)}`,
        `Trend confidence: ${Math.round(trendConfidence * 100)}%`,
        confidenceLabel,
      ]);
      await autoFillMealTimingsAfterAi();
      if (useSafeBaseline) {
        showToast("Safe baseline plan generated (low-confidence AI response).");
      } else {
        showToast("Profile analysis generated successfully");
      }
    } catch (error) {
      console.error("Error generating profile analysis:", error);
      alert(error.message || "Unable to generate profile analysis.");
    } finally {
      setIsGeneratingAi(false);
    }
  };
  const handleGenerateWithAi = () => handleGeneratePlan();

  const applyDeterministicAutoImprove = (trend) => {
    if (!Array.isArray(activeDays) || activeDays.length === 0) {
      return {
        applied: false,
        changes: [],
        beforeScore: null,
        afterScore: null,
      };
    }

    const normalizedPlan = activeDays.map((day) => ({
      breakfast: day?.breakfast || "",
      lunch: day?.lunch || "",
      dinner: day?.dinner || "",
    }));
    const { improvedPlan, changes } = autoImprovePlan(normalizedPlan, {
      trend,
      dosha,
    });

    if (!Array.isArray(improvedPlan) || improvedPlan.length !== activeDays.length) {
      return {
        applied: false,
        changes: [],
        beforeScore: builderValidation?.score ?? null,
        afterScore: null,
      };
    }

    const beforeValidation = validatePlan(normalizedPlan, dosha);
    const afterValidation = validatePlan(improvedPlan, dosha);
    const beforeScore =
      typeof beforeValidation?.score === "number" ? beforeValidation.score : null;
    const afterScore =
      typeof afterValidation?.score === "number" ? afterValidation.score : null;

    if (
      typeof beforeScore === "number" &&
      typeof afterScore === "number" &&
      afterScore < beforeScore
    ) {
      return {
        applied: false,
        changes: [],
        beforeScore,
        afterScore,
      };
    }

    setActiveDays((currentDays) =>
      currentDays.map((day, index) => ({
        ...day,
        breakfast: improvedPlan[index]?.breakfast ?? day.breakfast,
        lunch: improvedPlan[index]?.lunch ?? day.lunch,
        dinner: improvedPlan[index]?.dinner ?? day.dinner,
      }))
    );

    return {
      applied: true,
      changes: Array.isArray(changes) ? changes : [],
      beforeScore,
      afterScore,
    };
  };

  const dayEntries = activeDays[selectedDayIndex]
    ? [{ day: activeDays[selectedDayIndex], index: selectedDayIndex }]
    : [];
  const handleAutoImprovePlan = async () => {
    if (!hasRequiredPlanContext) {
      alert(requiredPlanContextMessage);
      return;
    }

    const symptoms = goal.trim() || patient?.healthConditions || "";
    if (!symptoms) {
      alert("Enter goal or symptoms before explain");
      return;
    }

    try {
      setIsImprovingPlan(true);
      const progression = analyzeProgress(progressLogs || []);
      const trend = progression?.trend || "stable";
      const autoImproveResult = applyDeterministicAutoImprove(trend);
      const deterministicChanges = autoImproveResult.changes;

      let result = null;
      try {
        result = await explainPlanFromBackend({
          symptoms,
          preferredDosha: dosha || "vata",
          ...buildAiPatientContext(patient, goal, dosha, progressLogs),
        });
      } catch (explainError) {
        console.warn("Explain backend unavailable during auto-improve:", explainError);
      }

      const explainChanges = autoImproveResult.applied
        ? [
            `Auto-improvement applied using deterministic rule engine (${trend})`,
            ...deterministicChanges,
          ]
        : [
            "Auto-improvement skipped because proposed changes reduced plan quality score.",
            typeof autoImproveResult.beforeScore === "number" &&
            typeof autoImproveResult.afterScore === "number"
              ? `Score guard: ${autoImproveResult.beforeScore}/10 -> ${autoImproveResult.afterScore}/10 (blocked)`
              : "Score guard: no safe improvement was found for this plan.",
          ];

      if (result && Array.isArray(result?.risk_flags) && result.risk_flags.length > 0) {
        explainChanges.push(`Risk Flags: ${result.risk_flags.join(", ")}`);
      }
      if (result?.primary_dosha) {
        explainChanges.push(`Primary Dosha: ${result.primary_dosha}`);
      }
      if (typeof result?.confidence === "number") {
        const confidencePercent = Math.round(result.confidence * 100);
        explainChanges.push(
          result.confidence < 0.4
            ? "Low confidence explain result. Review manually before approving."
            : `Explain confidence: ${confidencePercent}%`
        );
      }

      setAutoFixChanges(
        explainChanges.length > 0
          ? [...new Set(explainChanges)]
          : ["No auto-improvement changes were applied."]
      );
      showToast(
        autoImproveResult.applied
          ? "Plan auto-improved successfully"
          : "No safe auto-improvement found"
      );
    } catch (error) {
      console.error("Error loading explainability response:", error);
      alert(error.message || "Unable to load explainability details.");
    } finally {
      setIsImprovingPlan(false);
    }
  };

  async function handleSubmitPlan() {
    const reviewDueDateIso = toIsoDateTimeValue(date);
    const normalizedDays = activeDays.map((day, index) => {
      const normalized = {
        day: String(day?.day || `Day ${index + 1}`).trim() || `Day ${index + 1}`,
      };
      PLAN_SLOT_KEYS.forEach((slotKey) => {
        normalized[slotKey] = String(day?.[slotKey] || "").trim();
      });
      return normalized;
    });

    const hasInvalidDay = normalizedDays.some((day) =>
      PLAN_SLOT_KEYS.every((slotKey) => !String(day?.[slotKey] || "").trim())
    );

    if (!title.trim() || !goal.trim() || !dosha || !reviewDueDateIso) {
      alert("Title, goal, dosha type, and review date are required");
      return;
    }

    if (normalizedDays.length === 0 || hasInvalidDay) {
      alert("Each day must include at least one meal");
      return;
    }

    try {
      if (editingPlanId) {
        const updatedPlan = await updatePlan(editingPlanId, {
          title: title.trim(),
          goal: goal.trim(),
          doshaType: dosha,
          reviewDueDate: reviewDueDateIso,
          meals: normalizedDays,
        });

        upsertPatientPlan(id, updatedPlan);
      } else {
        const createdPlan = await createPlan({
          patient: id,
          title: title.trim(),
          goal: goal.trim(),
          doshaType: dosha,
          reviewDueDate: reviewDueDateIso,
          meals: normalizedDays,
        });

        setPatientPlans(id, [createdPlan, ...visiblePlans]);
      }

      resetBuilder();
    } catch (error) {
      console.error("Error saving plan:", error);
      alert(error.message || "Unable to save the plan.");
    }
  }

  const handleSaveProgress = async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      alert("Please log in again to save progress");
      return;
    }

    if (!progressForm.weight || !progressForm.energyLevel || !progressForm.digestion) {
      alert("Weight, energy level, and digestion are required");
      return;
    }

    try {
      await createProgressLog({
        patient: id,
        patientId: id,
        planId: activePlan?._id || undefined,
        goal: goal.trim() || activePlan?.goal || undefined,
        weight: Number(progressForm.weight),
        energy: Number(progressForm.energyLevel),
        energyLevel: Number(progressForm.energyLevel),
        symptomScore: Number(progressForm.symptomScore),
        digestion: progressForm.digestion,
        digestionDetail: progressForm.digestionDetail,
        adherence: Number(progressForm.adherence),
        sleepHours: progressForm.sleepHours,
        waterIntakeLiters: progressForm.waterIntakeLiters,
        appetite: progressForm.appetite,
        activityMinutes: progressForm.activityMinutes,
        stressLevel: progressForm.stressLevel,
        notes: progressForm.notes,
        recordedAt: progressForm.recordedAt,
      });

      await Promise.all([fetchProgress(), fetchPatientPlans()]);
      setProgressForm((current) => ({
        ...current,
        energyLevel: "3",
        symptomScore: "5",
        digestion: "good",
        digestionDetail: "normal",
        adherence: "75",
        sleepHours:
          typeof patient?.planningInputs?.sleepHours === "number"
            ? String(patient.planningInputs.sleepHours)
            : "",
        waterIntakeLiters:
          typeof patient?.planningInputs?.waterIntakeLiters === "number"
            ? String(patient.planningInputs.waterIntakeLiters)
            : "",
        appetite: "normal",
        activityMinutes: "",
        stressLevel:
          typeof patient?.planningInputs?.stressLevel === "number"
            ? String(patient.planningInputs.stressLevel)
            : "3",
        notes: "",
        recordedAt: getCurrentDateTimeLocal(),
      }));
      showToast("Progress log saved");
    } catch (error) {
      console.error("Error saving progress log:", error);
      alert(error.message || "Unable to save the progress log.");
    }
  };

  const handleSubmitProgress = async (event) => {
    event.preventDefault();
    await handleSaveProgress();
  };

  useEffect(() => {
    const loadPatient = async () => {
      try {
        const token = localStorage.getItem("token");
        const data = await fetchJson(`/patients/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setPatient(data.patient || data);
      } catch (error) {
        console.error("Error loading patient details:", error);
      } finally {
        setPatientLoading(false);
      }
    };

    loadPatient();
  }, [id]);

  useEffect(() => {
    fetchPatientPlans();
  }, [fetchPatientPlans]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  useEffect(() => {
    try {
      localStorage.setItem("progressLogs", JSON.stringify(progressLogs));
      localStorage.setItem(`progressLogs:${id}`, JSON.stringify(progressLogs));
    } catch (error) {
      console.error("Failed to persist progress logs:", error);
    }
  }, [progressLogs, id]);

  useEffect(() => {
    if (!patient) {
      return;
    }

    setMealTimingDraft(getMealTimingDraftFromPatient(patient));

    setProgressForm((current) => ({
      ...current,
      weight: patient.weight || current.weight || "",
    }));
  }, [patient]);

  useEffect(() => {
    setProgressPage(1);
  }, [progressLogs.length]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historicalPlans.length]);

  if (loading) {
    return <p className="text-gray-600">Loading...</p>;
  }

  if (!patient) {
    return <p className="text-gray-600">Patient not found</p>;
  }

  return (
    <div className="w-full space-y-8">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-md bg-black px-4 py-2 text-white shadow-sm">
          {toast}
        </div>
      )}

      <Link to="/dashboard" className="text-sm text-gray-700 hover:underline">
        {"<- Back to Dashboard"}
      </Link>

      <div className="space-y-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-6  md:p-7">
          <div className="flex flex-wrap items-center gap-4">
            {resolvePatientPhotoUrl(patient) ? (
              <img
                src={resolvePatientPhotoUrl(patient)}
                alt={patient?.name || "Patient"}
                className="h-16 w-16 rounded-full border border-gray-200 object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700">
                {getPatientInitials(patient?.name)}
              </div>
            )}
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
              {patient?.name}
            </h1>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              Target: {patient?.planningInputs?.primaryGoal || "-"}
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              Goal Weight:{" "}
              {typeof patient?.planningInputs?.targetWeight === "number"
                ? `${patient.planningInputs.targetWeight} kg`
                : "-"}
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              Timeframe:{" "}
              {typeof patient?.planningInputs?.timeframeWeeks === "number"
                ? `${patient.planningInputs.timeframeWeeks} weeks`
                : "-"}
            </span>
          </div>
        </div>

        <Section title="Basic Information">
          <Info label="Age" value={`${patient?.age || "-"} yrs`} />
          <Info label="Gender" value={patient?.gender || "-"} />
          <Info
            label="Height"
            value={patient?.height ? `${patient.height} cm` : "-"}
          />
          <Info
            label="Weight"
            value={patient?.weight ? `${patient.weight} kg` : "-"}
          />
        </Section>

        <div className="mt-6 space-y-6 rounded-2xl border border-gray-200 bg-white p-6 md:p-7">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold text-gray-900">Active Diet Plan</h2>

            {!showForm && (
              <button
                onClick={() => {
                  resetBuilder();
                  setShowForm(true);
                }}
                className="rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-yellow-500"
              >
                Create Diet Plan
              </button>
            )}
          </div>

          {!showForm &&
            (activePlan ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-gray-900">
                        {activePlan.title?.trim() || "Untitled Plan"}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        Dosha: {activePlan.doshaType || "-"} | Days:{" "}
                        {Array.isArray(activePlan.meals) ? activePlan.meals.length : 0} | Review due:{" "}
                        {formatDateDayMonthYear(activePlan.reviewDueDate)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startEditingPlan(activePlan)}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 transition hover:bg-black hover:text-white focus:outline-none focus:ring-2 focus:ring-gray-300"
                    >
                      Edit Plan
                    </button>
                  </div>
                </div>

                <MealsList meals={activePlan.meals} compact />
                <PlanValidationCard
                  validation={validatePlan(activePlan.meals, activePlan.doshaType)}
                />
              </div>
            ) : (
              <p className="text-gray-600">No active plan</p>
            ))}

          {showForm && (
            <div className="mt-4 space-y-6 rounded-2xl border border-gray-200 bg-white p-6 md:p-7">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-2xl font-semibold text-gray-900">
                  {editingPlanId ? "Editing Mode" : "Create Plan"}
                </h3>
                {editingPlanId && (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                    Updating existing plan
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <input
                  type="text"
                  placeholder="Plan Title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setIsTitleManuallyEdited(true);
                  }}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-500 focus:border-gray-400 focus:outline-none"
                />

                  <select
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                >
                  <option value="">Select Goal</option>
                  <option value="weight loss">Weight Loss</option>
                  <option value="muscle gain">Muscle Gain</option>
                  <option value="diabetes support">Diabetes Support</option>
                  <option value="pcos support">PCOS Support</option>
                  <option value="thyroid support">Thyroid Support</option>
                  <option value="hypertension support">Hypertension Support</option>
                  <option value="better digestion">Better Digestion</option>
                  <option value="general wellness">General Wellness</option>
                </select>

                <select
                  value={dosha}
                  onChange={(e) => setDosha(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                >
                  <option value="">Select Dosha</option>
                  <option value="vata">Vata</option>
                  <option value="pitta">Pitta</option>
                  <option value="kapha">Kapha</option>
                </select>

                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500">
                    Review Due Date
                  </p>
                  <input
                    type="datetime-local"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-xl font-semibold text-gray-900">
                      Meal Builder
                    </h3>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="inline-flex items-center rounded-lg border border-gray-200 p-1">
                        <button
                          type="button"
                          onClick={() => setBuilderMode("manual")}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                            builderMode === "manual"
                              ? "bg-gray-900 text-white"
                              : "text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          Doctor Manual Plan
                        </button>
                        <button
                          type="button"
                          onClick={() => setBuilderMode("ai")}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                            builderMode === "ai"
                              ? "bg-gray-900 text-white"
                              : "text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          AI Weekly Plan
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleGenerateWithAi}
                        disabled={isGeneratingAi || !hasRequiredPlanContext}
                        title={
                          !hasRequiredPlanContext
                            ? requiredPlanContextMessage
                            : undefined
                        }
                        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 transition hover:bg-black hover:text-white disabled:opacity-60"
                      >
                        {isGeneratingAi
                          ? "Generating diet plan..."
                          : "Generate with AI"}
                      </button>
                      <button
                        type="button"
                        onClick={handleAutoImprovePlan}
                        disabled={isImprovingPlan || !hasRequiredPlanContext}
                        title={
                          !hasRequiredPlanContext
                            ? requiredPlanContextMessage
                            : undefined
                        }
                        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 transition hover:bg-black hover:text-white disabled:opacity-60"
                      >
                        {isImprovingPlan
                          ? "Improving plan..."
                          : "Auto Improve Plan"}
                      </button>
                      <button
                        type="button"
                        onClick={addDay}
                        disabled={builderMode === "ai"}
                        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 transition hover:bg-black hover:text-white"
                      >
                        Add Day
                      </button>
                    </div>
                  </div>
                  {!hasRequiredPlanContext ? (
                    <p className="text-xs text-gray-500">
                      Fill title, goal, dosha, and review date to enable AI actions.
                    </p>
                  ) : null}

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.15em] text-gray-500">
                        Meal Timings
                      </p>
                      <button
                        type="button"
                        onClick={handleSaveMealTimings}
                        disabled={savingMealTimings}
                        className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-800 transition hover:bg-black hover:text-white disabled:opacity-60"
                      >
                        {savingMealTimings ? "Saving..." : "Save Timings"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                      <label className="text-[11px] text-gray-600">
                        Wake-up
                        <input
                          type="time"
                          value={mealTimings.wakeUpTime}
                          onChange={(event) =>
                            handleTimingFieldChange("wakeUpTime", event.target.value)
                          }
                          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-gray-400 focus:outline-none"
                        />
                      </label>
                      <label className="text-[11px] text-gray-600">
                        Breakfast
                        <input
                          type="time"
                          value={mealTimings.breakfastTime}
                          onChange={(event) =>
                            handleTimingFieldChange("breakfastTime", event.target.value)
                          }
                          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-gray-400 focus:outline-none"
                        />
                      </label>
                      <label className="text-[11px] text-gray-600">
                        Lunch
                        <input
                          type="time"
                          value={mealTimings.lunchTime}
                          onChange={(event) =>
                            handleTimingFieldChange("lunchTime", event.target.value)
                          }
                          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-gray-400 focus:outline-none"
                        />
                      </label>
                      <label className="text-[11px] text-gray-600">
                        Evening Snack
                        <input
                          type="time"
                          value={mealTimings.eveningSnackTime}
                          onChange={(event) =>
                            handleTimingFieldChange("eveningSnackTime", event.target.value)
                          }
                          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-gray-400 focus:outline-none"
                        />
                      </label>
                      <label className="text-[11px] text-gray-600">
                        Dinner
                        <input
                          type="time"
                          value={mealTimings.dinnerTime}
                          onChange={(event) =>
                            handleTimingFieldChange("dinnerTime", event.target.value)
                          }
                          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-gray-400 focus:outline-none"
                        />
                      </label>
                      <label className="text-[11px] text-gray-600">
                        Bed Time
                        <input
                          type="time"
                          value={mealTimings.bedTime}
                          onChange={(event) =>
                            handleTimingFieldChange("bedTime", event.target.value)
                          }
                          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-gray-400 focus:outline-none"
                        />
                      </label>
                    </div>
                    <p className="mt-2 text-[11px] text-gray-500">
                      Saved timings are reused as default for all new plans.
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="mb-2 text-xs uppercase tracking-[0.15em] text-gray-500">
                      {builderMode === "ai" ? "Week Day Selector" : "Day Selector"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {activeDays.map((day, index) => (
                        <button
                          key={`${day.day}-${index}-selector`}
                          type="button"
                          onClick={() => setSelectedDayIndex(index)}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                            selectedDayIndex === index
                              ? "bg-gray-900 text-white"
                              : "bg-white text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          {day.day || `Day ${index + 1}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-5">
                    {dayEntries.map(({ day, index }) => (
                      <div
                        key={`${day.day}-${index}`}
                        className="rounded-2xl border border-gray-200 bg-white p-5  md:p-6"
                      >
                        <div className="mb-5 flex items-center justify-between gap-4 border-b border-gray-200 pb-4">
                          <div className="space-y-1">
                            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                              Day Plan
                            </p>
                            <input
                              type="text"
                              value={day.day}
                              onChange={(e) =>
                                updateDayField(index, "day", e.target.value)
                              }
                              className="bg-transparent text-xl font-semibold text-gray-900 outline-none"
                            />
                          </div>

                          {builderMode !== "ai" && activeDays.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeDay(index)}
                              className="text-sm font-medium text-gray-600 transition hover:text-gray-600"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {PLAN_SLOT_CONFIG.map((slot) => (
                            <MealEditor
                              key={`${day.day}-${slot.key}`}
                              icon={slot.icon}
                              label={slot.label}
                              value={day?.[slot.key] || ""}
                              onChange={(value) =>
                                updateDayField(index, slot.key, value)
                              }
                              onChooseFromLibrary={
                                slot.library
                                  ? () => openMealLibrary(index, slot.key)
                                  : null
                              }
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-5 lg:col-span-1">
                  <PlanValidationCard validation={builderValidation} />

                  {autoFixChanges.length > 0 && (
                    <ChangesMadeCard changes={autoFixChanges} />
                  )}

                  <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
                    <p className="text-sm uppercase tracking-[0.2em] text-gray-500">
                      Actions
                    </p>
                    <button
                      onClick={handleSubmitPlan}
                      className="w-full rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-yellow-500"
                    >
                      {editingPlanId ? "Save Changes" : "Save Plan"}
                    </button>
                    <button
                      type="button"
                      onClick={resetBuilder}
                      className="w-full rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                {lastGeneratedContext && (
                  <div className="space-y-2 rounded-xl bg-gray-50 px-4 py-3">
                    <p className="text-sm text-gray-600">
                      Generated for: {lastGeneratedContext.goal} |{" "}
                      {lastGeneratedContext.doshaType} |{" "}
                      {lastGeneratedContext.weight} kg
                    </p>
                    {lastProgressInsights.length > 0 && (
                      <p className="text-xs text-gray-600">
                        Plan adjusted based on recent progress:{" "}
                        {lastProgressInsights.join(" | ")}
                      </p>
                    )}
                    {generatedDietPlan && (
                      <div
                        className={`mt-3 space-y-1 text-sm ${
                          isGeneratedPlanLowConfidence ? "text-gray-400" : "text-gray-700"
                        }`}
                      >
                        <p>
                          <strong>Trend:</strong>{" "}
                          {generatedPlanTrend.charAt(0).toUpperCase() +
                            generatedPlanTrend.slice(1)}{" "}
                          (Confidence: {Math.round(generatedPlanTrendConfidence * 100)}%)
                        </p>
                        <p>
                          <strong>Breakfast:</strong> {generatedDietPlan.breakfast}
                        </p>
                        <p>
                          <strong>Lunch:</strong> {generatedDietPlan.lunch}
                        </p>
                        <p>
                          <strong>Dinner:</strong> {generatedDietPlan.dinner}
                        </p>
                        <div className="mt-3 space-y-1">
                          <p className="text-sm font-semibold text-gray-700">
                            Why this plan was adjusted
                          </p>
                          <p className="text-sm text-gray-600">
                            <strong>Summary:</strong> {generatedPlanReason.summary}
                          </p>
                          <p className="text-sm text-gray-600">
                            <strong>Interpretation:</strong> {generatedPlanReason.interpretation}
                          </p>
                          <p className="text-sm text-gray-600">
                            <strong>Action Taken:</strong> {generatedPlanReason.actionReason}
                          </p>
                          {latestPlanChangeAudit?.timestamp ? (
                            <p className="text-xs text-gray-500">
                              Audited at{" "}
                              {new Date(latestPlanChangeAudit.timestamp).toLocaleString()}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 md:p-7">
          <h2 className="mb-4 text-2xl font-semibold text-gray-900">Plan History</h2>

          {historicalPlans.length === 0 ? (
            <p className="text-gray-600">No plans found</p>
          ) : (
            <div className="space-y-4">
              {paginatedHistoryPlans.map((plan) => {
                  const isExpanded = expandedPlanId === plan._id;

                  return (
                    <div
                      key={plan._id}
                      className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 "
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          setExpandedPlanId(isExpanded ? null : plan._id)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setExpandedPlanId(isExpanded ? null : plan._id);
                          }
                        }}
                        className="flex w-full items-center justify-between gap-4 text-left"
                      >
                        <div>
                          <p className="text-base font-medium text-gray-900">
                            {plan.title}
                          </p>
                          <p className="text-sm text-gray-600">
                            {plan.status} | Review due{" "}
                            {formatDateDayMonthYear(plan.reviewDueDate || plan.createdAt)}{" "}
                            | Created {formatDateDayMonthYear(plan.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              startEditingPlan(plan);
                            }}
                            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 transition hover:bg-black hover:text-white focus:outline-none focus:ring-2 focus:ring-gray-300"
                          >
                            Edit Plan
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedPlanId(isExpanded ? null : plan._id);
                            }}
                            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 transition hover:bg-black hover:text-white focus:outline-none focus:ring-2 focus:ring-gray-300"
                          >
                            {isExpanded ? "Hide meals" : "View meals"}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="space-y-4">
                          <MealsList meals={plan.meals} />
                          <PlanValidationCard
                            validation={validatePlan(plan.meals, plan.doshaType)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

              <div className="mt-4 border-t border-gray-200 pt-3">
                <div className="flex items-center justify-center gap-6 sm:gap-10">
                  <button
                    type="button"
                    onClick={() => setHistoryPage((p) => Math.max(p - 1, 1))}
                    disabled={historyPage === 1 || historicalPlans.length === 0}
                    className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 disabled:opacity-50"
                  >
                    Prev
                  </button>

                  {historicalPlans.length > 0 && (
                    <p className="text-xs text-gray-600">
                      Showing {historyStartIndex + 1}-{historyEndIndex} of{" "}
                      {historicalPlans.length}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setHistoryPage((p) => Math.min(p + 1, totalHistoryPages))
                    }
                    disabled={
                      historyPage === totalHistoryPages || historicalPlans.length === 0
                    }
                    className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <Section title="Medical Details">
          <Info label="Conditions" value={patient?.healthConditions || "None"} />
          <Info
            label="Medications"
            value={patient?.currentMedications || "None"}
          />
          <Info label="Allergies" value={patient?.allergies || "None"} />
        </Section>

        <Section title="Ayurvedic Assessment">
          <Info
            label="Dominant Dosha"
            value={patient?.prakriti?.dominantDosha || "-"}
          />
          <Info label="Diet Type" value={patient?.dietType || "-"} />
          <Info label="Activity Level" value={patient?.activityLevel || "-"} />
          <Info
            label="Preferences"
            value={
              Array.isArray(patient?.preferences) && patient.preferences.length > 0
                ? patient.preferences.join(", ")
                : "-"
            }
          />
        </Section>

        <Section title="Planning Inputs">
          <Info
            label="Primary Goal"
            value={patient?.planningInputs?.primaryGoal || "-"}
          />
          <Info
            label="Target Weight"
            value={
              typeof patient?.planningInputs?.targetWeight === "number"
                ? `${patient.planningInputs.targetWeight} kg`
                : "-"
            }
          />
          <Info
            label="Timeframe"
            value={
              typeof patient?.planningInputs?.timeframeWeeks === "number"
                ? `${patient.planningInputs.timeframeWeeks} weeks`
                : "-"
            }
          />
          <Info
            label="Meal Pattern"
            value={patient?.planningInputs?.mealPattern || "-"}
          />
          <Info
            label="Sleep Hours"
            value={
              typeof patient?.planningInputs?.sleepHours === "number"
                ? `${patient.planningInputs.sleepHours} hrs`
                : "-"
            }
          />
          <Info
            label="Stress Level"
            value={
              typeof patient?.planningInputs?.stressLevel === "number"
                ? `${patient.planningInputs.stressLevel}/5`
                : "-"
            }
          />
          <Info
            label="Water Intake"
            value={
              typeof patient?.planningInputs?.waterIntakeLiters === "number"
                ? `${patient.planningInputs.waterIntakeLiters} L/day`
                : "-"
            }
          />
          <Info
            label="Budget Tier"
            value={patient?.planningInputs?.budgetTier || "-"}
          />
          <Info
            label="Local Region"
            value={patient?.planningInputs?.localRegion || "pan_india"}
          />
        </Section>

        <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 md:p-7">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-gray-900">
              Progress Tracking
            </h2>
            <p className="text-sm text-gray-600">
              Track weight, energy, digestion, and adherence over time.
            </p>
          </div>

          <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold text-gray-900">Trend Summary</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <TrendCard
                label="Weight Trend"
                arrow={progressTrendSummary.weightTrend.arrow}
                value={progressTrendSummary.weightTrend.label}
              />
              <TrendCard
                label="Energy Trend"
                arrow={progressTrendSummary.energyTrend.arrow}
                value={progressTrendSummary.energyTrend.label}
              />
              <TrendCard
                label="Adherence"
                arrow={progressTrendSummary.adherence.arrow}
                value={progressTrendSummary.adherence.label}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <form
              onSubmit={handleSubmitProgress}
              className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5"
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-gray-700">Weight (kg)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={progressForm.weight}
                    onChange={(event) =>
                      handleProgressFieldChange("weight", event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-gray-700">Energy Level</span>
                  <select
                    value={progressForm.energyLevel}
                    onChange={(event) =>
                      handleProgressFieldChange("energyLevel", event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                  >
                    {[1, 2, 3, 4, 5].map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-gray-700">Symptoms Score (1-10)</span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={progressForm.symptomScore}
                    onChange={(event) =>
                      handleProgressFieldChange("symptomScore", event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-gray-700">Log Date & Time</span>
                  <input
                    type="datetime-local"
                    value={progressForm.recordedAt}
                    onChange={(event) =>
                      handleProgressFieldChange("recordedAt", event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-gray-700">Digestion</span>
                  <select
                    value={progressForm.digestion}
                    onChange={(event) =>
                      handleProgressFieldChange("digestion", event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                  >
                    <option value="good">Good</option>
                    <option value="bad">Bad</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-gray-700">Digestion Detail</span>
                  <select
                    value={progressForm.digestionDetail}
                    onChange={(event) =>
                      handleProgressFieldChange("digestionDetail", event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                  >
                    <option value="normal">Normal</option>
                    <option value="bloating">Bloating</option>
                    <option value="acidity">Acidity</option>
                    <option value="constipation">Constipation</option>
                    <option value="loose stools">Loose stools</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-gray-700">Adherence (%)</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={progressForm.adherence}
                    onChange={(event) =>
                      handleProgressFieldChange("adherence", event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-gray-700">Appetite</span>
                  <select
                    value={progressForm.appetite}
                    onChange={(event) =>
                      handleProgressFieldChange("appetite", event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-gray-700">Sleep Hours</span>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    value={progressForm.sleepHours}
                    onChange={(event) =>
                      handleProgressFieldChange("sleepHours", event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-gray-700">Water Intake (L)</span>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    step="0.1"
                    value={progressForm.waterIntakeLiters}
                    onChange={(event) =>
                      handleProgressFieldChange("waterIntakeLiters", event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-gray-700">Activity (minutes)</span>
                  <input
                    type="number"
                    min="0"
                    max="1440"
                    step="1"
                    value={progressForm.activityMinutes}
                    onChange={(event) =>
                      handleProgressFieldChange("activityMinutes", event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-gray-700">Stress Level (1-5)</span>
                  <select
                    value={progressForm.stressLevel}
                    onChange={(event) =>
                      handleProgressFieldChange("stressLevel", event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                  >
                    {[1, 2, 3, 4, 5].map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm text-gray-700">Notes</span>
                <textarea
                  value={progressForm.notes}
                  onChange={(event) =>
                    handleProgressFieldChange("notes", event.target.value)
                  }
                  rows={4}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                  placeholder="Optional observations"
                />
              </label>

              <button
                type="button"
                onClick={handleSaveProgress}
                className="rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-yellow-500"
              >
                Save Progress
              </button>
            </form>

            <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Recent Progress Logs
                </h3>
                <span className="text-sm text-gray-600">
                  {progressLogs.length} entries
                </span>
              </div>

              {progressLoading ? (
                <p className="text-sm text-gray-600">Loading progress logs...</p>
              ) : progressLogs.length === 0 ? (
                <p className="text-sm text-gray-600">
                  No progress logs recorded yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {paginatedProgressLogs.map((log) => (
                    <div
                      key={log._id}
                      className="rounded-xl border border-gray-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-medium text-gray-900">
                          {formatDateTimeDayMonthYear(getLogTimestamp(log))}
                        </p>
                        <p className="text-xs text-gray-600">
                          {log.plan?.title
                            ? `Active Plan: ${log.plan.title}`
                            : "Active Plan"}
                        </p>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-700">
                        <p>Weight: {log.weight ?? "-"}</p>
                        <p>Energy: {log.energyLevel ?? "-"}/5</p>
                        <p>Symptoms: {log.symptomScore ?? "-"}/10</p>
                        <p>Digestion: {log.digestion || "-"}</p>
                        <p>Digestion Detail: {log.digestionDetail || "-"}</p>
                        <p>
                          Adherence:{" "}
                          {typeof log.adherence === "number"
                            ? `${log.adherence}%`
                            : log.adherence
                              ? "100%"
                              : "30%"}
                        </p>
                        <p>Sleep: {log.sleepHours ?? "-"} hrs</p>
                        <p>Water: {log.waterIntakeLiters ?? "-"} L</p>
                        <p>Appetite: {log.appetite || "-"}</p>
                        <p>Activity: {log.activityMinutes ?? "-"} min</p>
                        <p>Stress: {log.stressLevel ?? "-"}/5</p>
                      </div>

                      {log.notes && (
                        <p className="mt-3 text-sm text-gray-600">{log.notes}</p>
                      )}
                    </div>
                  ))}

                  <div className="mt-4 border-t border-gray-200 pt-3">
                    <div className="flex items-center justify-center gap-6 sm:gap-10">
                      <button
                        type="button"
                        onClick={() => setProgressPage((p) => Math.max(p - 1, 1))}
                        disabled={progressPage === 1 || progressLogs.length === 0}
                        className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 disabled:opacity-50"
                      >
                        Prev
                      </button>

                      {progressLogs.length > 0 && (
                        <p className="text-xs text-gray-600">
                          Showing {progressStartIndex + 1}-{progressEndIndex} of{" "}
                          {progressLogs.length}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setProgressPage((p) => Math.min(p + 1, totalProgressPages))
                        }
                        disabled={
                          progressPage === totalProgressPages || progressLogs.length === 0
                        }
                        className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PatientDetails;

function MealsList({ meals = [], compact = false }) {
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const clampedSelectedDayIndex = Math.min(
    selectedDayIndex,
    Math.max((meals?.length || 1) - 1, 0)
  );

  if (!meals.length) {
    return <p className="text-sm text-gray-600">No meals added.</p>;
  }

  if (compact) {
    const selectedMeal = meals[clampedSelectedDayIndex] || meals[0];

    return (
      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
            Active Plan Days
          </p>
          <div className="flex flex-wrap gap-2">
            {meals.map((mealDay, index) => (
              <button
                key={`${mealDay.day}-${index}-active-selector`}
                type="button"
                onClick={() => setSelectedDayIndex(index)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  clampedSelectedDayIndex === index
                    ? "bg-gray-900 text-white"
                    : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                {mealDay.day || `Day ${index + 1}`}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            {selectedMeal?.day || "Day Plan"}
          </h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {PLAN_SLOT_CONFIG.map((slot) => (
              <MealDisplay
                key={`${selectedMeal?.day || "day"}-${slot.key}`}
                icon={slot.icon}
                label={slot.label}
                value={selectedMeal?.[slot.key]}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {meals.map((mealDay, index) => (
        <div
          key={`${mealDay.day}-${index}`}
          className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6"
        >
          <h3 className="mb-4 text-lg font-semibold text-gray-900">{mealDay.day}</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {PLAN_SLOT_CONFIG.map((slot) => (
              <MealDisplay
                key={`${mealDay.day}-${slot.key}`}
                icon={slot.icon}
                label={slot.label}
                value={mealDay?.[slot.key]}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlanValidationCard({ validation }) {
  if (!validation) {
    return null;
  }

  const { score, issues, suggestions, hasMealEntries = true } = validation;
  const hasNumericScore = typeof score === "number";
  const badgeClasses = !hasNumericScore
    ? "bg-gray-100 text-gray-700"
    : score < 5
      ? "bg-black text-white"
      : "bg-gray-100 text-gray-700";

  return (
    <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500">
            Validation
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900">Plan Quality</p>
        </div>
        <div className={`rounded-full px-4 py-2 text-lg font-semibold ${badgeClasses}`}>
          Score: {hasNumericScore ? `${score}/10` : "N/A"}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-xl bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-600">Warning Issues</p>
          <p className="text-xs text-gray-600">Review these items first</p>
          {!hasMealEntries ? (
            <p className="text-sm text-gray-600">
              Add at least one meal to start validation.
            </p>
          ) : issues.length ? (
            <div className="space-y-2">
              {issues.map((issue) => (
                <p key={issue} className="text-sm text-gray-600">
                  Warning {issue}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600">No major issues detected.</p>
          )}
        </div>

        <div className="space-y-2 rounded-xl bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-700">Helpful Suggestions</p>
          <p className="text-xs text-gray-600">
            Simple ways to improve balance
          </p>
          {!hasMealEntries ? (
            <p className="text-sm text-gray-600">
              Suggestions will appear after meals are added.
            </p>
          ) : suggestions.length ? (
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <p key={suggestion} className="text-sm text-gray-700">
                  Check {suggestion}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600">This plan looks well balanced.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ChangesMadeCard({ changes }) {
  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
      <p className="text-base font-semibold text-gray-900">Changes made:</p>
      <div className="space-y-2">
        {changes.map((change) => (
          <p key={change} className="text-sm text-amber-700">
            {change}
          </p>
        ))}
      </div>
    </div>
  );
}

function MealEditor({
  icon,
  label,
  value,
  onChange,
  onChooseFromLibrary,
}) {
  const canChooseFromLibrary = typeof onChooseFromLibrary === "function";
  return (
    <div className="grid h-full grid-rows-[76px_112px] gap-4 rounded-2xl border border-gray-200 bg-[#fcfcfb] p-4">
      <div className="flex h-[76px] items-start justify-between gap-3">
        <div className="flex h-[56px] items-start gap-3">
          <div className="rounded-full bg-[#eef4d0] px-3 py-1 text-xs font-medium text-gray-800">
            {icon}
          </div>
          <div className="h-[48px]">
            <p className="text-sm font-medium text-gray-900">{label}</p>
            <p className="text-xs text-gray-500">
              Type manually or choose from library
            </p>
          </div>
        </div>

        {canChooseFromLibrary ? (
          <button
            type="button"
            onClick={onChooseFromLibrary}
            className="inline-flex h-11 w-[92px] shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
          >
            Choose Dish
          </button>
        ) : null}
      </div>

      <textarea
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full w-full resize-none rounded-xl border border-gray-300 bg-white p-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-gray-400 focus:outline-none"
      />
    </div>
  );
}

function MealDisplay({ icon, label, value }) {
  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
          {icon}
        </div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
      </div>
      <p className="text-sm leading-6 text-gray-700">{value || "-"}</p>
    </div>
  );
}

function TrendCard({ label, arrow, value }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-2xl font-semibold text-gray-900">{arrow}</span>
        <p className="text-base text-gray-800">{value}</p>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6  md:p-7">
      <h2 className=" text-xl font-semibold text-gray-900">
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">{children}</div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 ">
      <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-2 text-base text-gray-900">{value}</p>
    </div>
  );
}







