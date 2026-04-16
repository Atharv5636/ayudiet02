const mongoose = require("mongoose");

const ApiError = require("../utils/ApiError");
const Patient = require("../models/patient.model");
const Plan = require("../models/plan.model");
const ProgressLog = require("../models/progressLog.model");
const { validatePlan } = require("../utils/planValidation");
const debugLogsEnabled = process.env.DEBUG_LOGS === "true";
const debugLog = (...args) => {
  if (debugLogsEnabled) {
    console.log(...args);
  }
};

const MAX_LOGS = 5;
const MIN_LOGS = 3;
const MAX_CHANGES_PER_UPDATE = 2;
const LOW_EFFECTIVENESS_MAX_CHANGES = 3;
const HIGH_EFFECTIVENESS_MAX_CHANGES = 1;
const EFFECTIVENESS_TREND_THRESHOLD = 5;
const STRONG_EFFECTIVENESS_TREND_THRESHOLD = 10;

const RAPID_WEIGHT_LOSS_THRESHOLD_KG = 2;
const LOW_ENERGY_THRESHOLD = 3.5;
const POOR_DIGESTION_THRESHOLD = 5;
const LOW_ADHERENCE_THRESHOLD = 60;
const ENERGY_SCALE_MIN = 1;
const ENERGY_SCALE_MAX = 5;
const DIGESTION_SCALE_MIN = 0;
const DIGESTION_SCALE_MAX = 10;
const ADHERENCE_MIN = 0;
const ADHERENCE_MAX = 100;
const LEGACY_FALSE_ADHERENCE_SCORE = 30;
const CALORIE_INCREASE = 250;
const EFFECTIVENESS_WEIGHTS = {
  weight: 0.27,
  adherence: 0.27,
  energy: 0.18,
  digestion: 0.18,
  triggeredRule: 0.1,
};

const MEAL_TYPES = ["breakfast", "lunch", "dinner"];

const CHANGE_REASONS = {
  increaseCalories: "rapid weight loss + low energy",
  simplifyMeal: "low adherence",
  replaceMeal: "poor digestion",
};

const LIGHT_MEAL_BY_TYPE = {
  breakfast: "rice porridge",
  lunch: "khichdi",
  dinner: "vegetable soup",
};

const HEAVY_MEAL_KEYWORDS = [
  "fried",
  "paratha",
  "paneer",
  "biryani",
  "stuffed",
  "creamy",
  "makhani",
  "naan",
  "pakora",
  "heavy",
];

const RULE_PRIORITY = [
  "adherence",
  "energyWeight",
  "digestion",
];

const RULE_LABELS = {
  adherence: "adherence",
  energyWeight: "energy + weight",
  digestion: "digestion",
};

const RULE_PRIMARY_ISSUE_MAP = {
  adherence: "adherence",
  digestion: "digestion",
};

const PRIMARY_ISSUE_LABELS = {
  adherence: "adherence",
  energy: "energy",
  digestion: "digestion",
  weight: "weight",
};

const REVERSE_CHANGE_TYPES = {
  increase_calories: "decrease_calories",
  decrease_calories: "increase_calories",
  simplify_meal: "restore_meal_complexity",
  restore_meal_complexity: "simplify_meal",
  replace_meal: "restore_meal",
  restore_meal: "replace_meal",
};

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const normalizeGoalText = (goal = "") => {
  const normalized = String(goal || "").trim();
  return normalized || "general wellness";
};
const toGoalKey = (goal = "") => normalizeGoalText(goal).toLowerCase();

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const roundScore = (value) => Math.round(clamp(value, 0, 100));

const average = (values = []) =>
  values.length
    ? Number(
        (values.reduce((total, value) => total + value, 0) / values.length).toFixed(2)
      )
    : null;

const getObjectIdTimestamp = (value) => {
  if (!value) return Number.NaN;
  const source = typeof value === "string" ? value : String(value);
  if (!source || source.length < 8) return Number.NaN;
  const parsed = Number.parseInt(source.slice(0, 8), 16);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return parsed * 1000;
};

const getLogSortTimestamp = (log = {}) => {
  const objectIdTime = getObjectIdTimestamp(log?._id);
  if (Number.isFinite(objectIdTime)) return objectIdTime;

  const createdAtTime = new Date(log?.createdAt || 0).getTime();
  if (Number.isFinite(createdAtTime) && createdAtTime > 0) return createdAtTime;

  const recordedAtTime = new Date(log?.recordedAt || 0).getTime();
  if (Number.isFinite(recordedAtTime) && recordedAtTime > 0) return recordedAtTime;

  return 0;
};

const sortLogsAscending = (logs = []) =>
  [...logs].sort(
    (left, right) => getLogSortTimestamp(left) - getLogSortTimestamp(right)
  );

const persistPlanIfDocument = async (plan) => {
  if (plan && typeof plan.save === "function") {
    await plan.save();
  }
};

const normalizeEnergy = (level) => {
  if (typeof level !== "number" || Number.isNaN(level)) {
    return null;
  }

  return clamp(level, ENERGY_SCALE_MIN, ENERGY_SCALE_MAX);
};

const normalizeDigestion = (status) => {
  if (typeof status === "number" && !Number.isNaN(status)) {
    return clamp(status, DIGESTION_SCALE_MIN, DIGESTION_SCALE_MAX);
  }

  if (typeof status !== "string") {
    return null;
  }

  const normalizedStatus = status.trim().toLowerCase();

  if (normalizedStatus === "good") {
    return 7;
  }

  if (normalizedStatus === "bad") {
    return 3;
  }

  return null;
};

const normalizeAdherence = (value) => {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return clamp(value, ADHERENCE_MIN, ADHERENCE_MAX);
  }

  if (typeof value === "boolean") {
    return value ? ADHERENCE_MAX : LEGACY_FALSE_ADHERENCE_SCORE;
  }

  return null;
};

const normalizeProgressLog = (log = {}) => ({
  _id: log._id || null,
  weight: typeof log.weight === "number" ? log.weight : null,
  energyLevel: normalizeEnergy(log.energyLevel ?? log.energy),
  adherence: normalizeAdherence(log.adherence),
  digestionScore: normalizeDigestion(log.digestionScore ?? log.digestion),
  notes: log.notes || log.note || "",
  recordedAt: log.recordedAt || null,
  createdAt: log.createdAt || null,
});

const getRecentProgressLogs = async (patientId, activePlanId) => {
  const collectionLogs = await ProgressLog.find({
    patient: patientId,
    ...(activePlanId ? { plan: activePlanId } : {}),
  })
    .sort({ _id: -1, createdAt: -1, recordedAt: -1 })
    .limit(MAX_LOGS)
    .lean();

  if (collectionLogs.length) {
    return sortLogsAscending(collectionLogs.map(normalizeProgressLog));
  }

  const patient = await Patient.findById(patientId).select("progressLogs").lean();

  return sortLogsAscending(
    [...(patient?.progressLogs || [])]
      .sort(
        (left, right) =>
          new Date(right.recordedAt || 0).getTime() -
          new Date(left.recordedAt || 0).getTime()
      )
      .slice(0, MAX_LOGS)
      .map(normalizeProgressLog)
  );
};

const analyzeProgressSignals = (progressLogs = []) => {
  const orderedLogs = sortLogsAscending(progressLogs);
  const weightLogs = orderedLogs.filter((log) => typeof log.weight === "number");
  const firstWeight = weightLogs[0]?.weight;
  const lastWeight = weightLogs[weightLogs.length - 1]?.weight;
  const weightDrop =
    typeof firstWeight === "number" && typeof lastWeight === "number"
      ? Number((firstWeight - lastWeight).toFixed(2))
      : null;

  const averageEnergy = average(
    orderedLogs
      .map((log) => log.energyLevel)
      .filter((value) => typeof value === "number")
  );
  const averageAdherence = average(
    orderedLogs
      .map((log) => log.adherence)
      .filter((value) => typeof value === "number")
  );
  const averageDigestion = average(
    orderedLogs
      .map((log) => log.digestionScore)
      .filter((value) => typeof value === "number")
  );

  return {
    logCount: orderedLogs.length,
    weightDrop,
    averageEnergy,
    averageAdherence,
    averageDigestion,
    thresholds: {
      rapidWeightLossKg: RAPID_WEIGHT_LOSS_THRESHOLD_KG,
      lowEnergy: LOW_ENERGY_THRESHOLD,
      lowAdherence: LOW_ADHERENCE_THRESHOLD,
      poorDigestion: POOR_DIGESTION_THRESHOLD,
    },
    rapidWeightLoss:
      typeof weightDrop === "number" ? weightDrop > RAPID_WEIGHT_LOSS_THRESHOLD_KG : false,
    lowEnergy:
      typeof averageEnergy === "number" ? averageEnergy < LOW_ENERGY_THRESHOLD : false,
    lowAdherence:
      typeof averageAdherence === "number"
        ? averageAdherence < LOW_ADHERENCE_THRESHOLD
        : false,
    poorDigestion:
      typeof averageDigestion === "number"
        ? averageDigestion < POOR_DIGESTION_THRESHOLD
        : false,
  };
};

const buildWeightTrend = (analysis) => {
  if (typeof analysis.weightDrop !== "number") {
    return "insufficient weight data";
  }

  if (analysis.rapidWeightLoss) {
    return "rapid weight loss";
  }

  if (analysis.weightDrop > 0) {
    return "gradual weight loss";
  }

  if (analysis.weightDrop === 0) {
    return "stable weight";
  }

  return "weight gain";
};

const buildEnergyStatus = (analysis) => {
  if (typeof analysis.averageEnergy !== "number") {
    return "insufficient energy data";
  }

  return analysis.lowEnergy ? "low energy" : "stable energy";
};

const buildAdherenceStatus = (analysis) => {
  if (typeof analysis.averageAdherence !== "number") {
    return "insufficient adherence data";
  }

  return analysis.lowAdherence ? "low adherence" : "good adherence";
};

const buildDigestionStatus = (analysis) => {
  if (typeof analysis.averageDigestion !== "number") {
    return "insufficient digestion data";
  }

  return analysis.poorDigestion ? "poor digestion" : "good digestion";
};

const buildEffectivenessTrendExplanation = (effectivenessTrend = {}) => {
  const previous =
    typeof effectivenessTrend.previous === "number"
      ? effectivenessTrend.previous
      : null;
  const current =
    typeof effectivenessTrend.current === "number"
      ? effectivenessTrend.current
      : null;

  if (previous === null || current === null) {
    return "";
  }

  if (effectivenessTrend.trend === "stable") {
    return ` Effectiveness trend is stable (${previous} -> ${current}) within the ${EFFECTIVENESS_TREND_THRESHOLD}-point threshold.`;
  }

  return ` Effectiveness trend is ${effectivenessTrend.trend} (${previous} -> ${current}).`;
};

const formatValue = (value, suffix = "") =>
  typeof value === "number" ? `${value}${suffix}` : "n/a";

const buildThresholdSummary = (analysis = {}) =>
  `Values: weightDrop=${formatValue(
    analysis.weightDrop,
    "kg"
  )}, energy=${formatValue(analysis.averageEnergy)}, adherence=${formatValue(
    analysis.averageAdherence
  )}, digestion=${formatValue(analysis.averageDigestion)}. Thresholds: rapidWeightLoss>${analysis.thresholds.rapidWeightLossKg}kg, lowEnergy<${analysis.thresholds.lowEnergy}, lowAdherence<${analysis.thresholds.lowAdherence}, poorDigestion<${analysis.thresholds.poorDigestion}.`;

const buildCauseEffectChain = (appliedRule, analysis = {}, confidence = "low") => {
  if (appliedRule === "adherence") {
    return `Cause-effect: adherence ${formatValue(
      analysis.averageAdherence
    )} is below ${analysis.thresholds.lowAdherence}, so meal complexity was reduced. Confidence=${confidence}.`;
  }

  if (appliedRule === "energyWeight") {
    return `Cause-effect: weightDrop ${formatValue(
      analysis.weightDrop,
      "kg"
    )} is above ${analysis.thresholds.rapidWeightLossKg}kg and energy ${formatValue(
      analysis.averageEnergy
    )} is below ${analysis.thresholds.lowEnergy}, so calories were increased. Confidence=${confidence}.`;
  }

  if (appliedRule === "digestion") {
    return `Cause-effect: digestion ${formatValue(
      analysis.averageDigestion
    )} is below ${analysis.thresholds.poorDigestion}, so heavier meals were replaced. Confidence=${confidence}.`;
  }

  if (analysis.rapidWeightLoss && !analysis.lowEnergy) {
    return `Cause-effect: weightDrop ${formatValue(
      analysis.weightDrop,
      "kg"
    )} is above ${analysis.thresholds.rapidWeightLossKg}kg, but energy ${formatValue(
      analysis.averageEnergy
    )} stayed above ${analysis.thresholds.lowEnergy}, so no deterministic change was applied. Confidence=${confidence}.`;
  }

  return `Cause-effect: the measured values did not justify an additional deterministic change. Confidence=${confidence}.`;
};

const buildReasonSummary = (
  appliedRule,
  analysis = {},
  effectivenessTrend = {},
  primaryIssue = null
) => {
  if (!analysis.logCount) {
    return "No recent progress data is available for a safe plan adjustment.";
  }

  if (!appliedRule) {
    if (analysis.rapidWeightLoss && !analysis.lowEnergy) {
      return `Weight change is notable, but energy remains above threshold, so no update was applied.`;
    }

    return "Recent progress signals did not justify a deterministic plan change.";
  }

  if (appliedRule === "adherence") {
    return `Adherence dropped to ${formatValue(
      analysis.averageAdherence,
      "%"
    )} (below threshold ${analysis.thresholds.lowAdherence}%), making ${primaryIssue || "adherence"} the dominant issue.`;
  }

  if (appliedRule === "energyWeight") {
    return `Weight loss reached ${formatValue(
      analysis.weightDrop,
      "kg"
    )} and energy fell to ${formatValue(
      analysis.averageEnergy
    )}, so the energy-weight rule was triggered.`;
  }

  if (appliedRule === "digestion") {
    return `Digestion dropped to ${formatValue(
      analysis.averageDigestion
    )} (below threshold ${analysis.thresholds.poorDigestion}), making digestion the dominant issue.`;
  }

  return "A deterministic adaptive update was applied based on the latest progress signals.";
};

const buildReasonDetails = (
  appliedRule,
  analysis,
  enoughLogs,
  effectivenessTrend,
  confidence
) => {
  const baseReason = !enoughLogs
    ? "Not enough recent progress logs to safely modify the plan."
    : appliedRule === "adherence"
      ? "Adherence issues were prioritized first, so the engine simplified meals before considering other signals."
      : appliedRule === "energyWeight"
        ? "Rapid weight loss combined with low energy triggered a calorie increase because no higher-priority adherence issue was present."
        : appliedRule === "digestion"
          ? "Poor digestion triggered lighter meal replacements because higher-priority adherence and energy-weight rules did not apply."
          : analysis.rapidWeightLoss && !analysis.lowEnergy
            ? "Rapid weight loss was detected, but energy remained stable, so no deterministic adjustment rule was triggered."
            : "No rule was triggered because recent progress signals did not cross the modification thresholds.";

  return `${baseReason} ${buildThresholdSummary(analysis)} ${buildCauseEffectChain(
    appliedRule,
    analysis,
    confidence
  )}${buildEffectivenessTrendExplanation(effectivenessTrend)}`.trim();
};

const buildExpectedImpact = (appliedRule, confidence = "low") => {
  if (appliedRule === "adherence") {
    return confidence === "low"
      ? "Expected impact: modest improvement in plan adherence through simpler, easier-to-repeat meals."
      : "Expected impact: improved adherence and more consistent follow-through through simpler, easier-to-repeat meals.";
  }

  if (appliedRule === "energyWeight") {
    return confidence === "low"
      ? "Expected impact: cautious support for energy recovery and slower weight loss."
      : "Expected impact: improved energy stability and reduced risk of excessive weight loss.";
  }

  if (appliedRule === "digestion") {
    return confidence === "low"
      ? "Expected impact: cautious digestive relief by replacing heavier meals."
      : "Expected impact: better digestion tolerance and fewer symptoms after meals.";
  }

  if (confidence === "low") {
    return "Expected impact: limited immediate change while the system gathers more progress data.";
  }

  return "Expected impact: continued stability while monitoring whether the current plan remains effective.";
};

const buildRuleExplanation = (
  appliedRule,
  analysis,
  enoughLogs,
  effectivenessTrend,
  confidence,
  primaryIssue
) =>
  `${buildReasonSummary(
    appliedRule,
    analysis,
    effectivenessTrend,
    primaryIssue
  )} ${buildReasonDetails(
    appliedRule,
    analysis,
    enoughLogs,
    effectivenessTrend,
    confidence
  )}`.trim();

const classifyEffectiveness = (score) => {
  if (score >= 80) {
    return "high";
  }

  if (score >= 60) {
    return "moderate";
  }

  return "low";
};

const scoreWeightTrend = (weightDrop) => {
  if (typeof weightDrop !== "number") {
    return 50;
  }

  if (weightDrop < 0) {
    return 40;
  }

  if (weightDrop <= 1.5) {
    return 100;
  }

  if (weightDrop <= RAPID_WEIGHT_LOSS_THRESHOLD_KG) {
    return 80;
  }

  return 20;
};

const scoreAdherence = (averageAdherence) => {
  if (typeof averageAdherence !== "number") {
    return 50;
  }

  if (averageAdherence >= 80) {
    return 100;
  }

  if (averageAdherence >= 60) {
    return roundScore(60 + ((averageAdherence - 60) / 20) * 20);
  }

  return roundScore((averageAdherence / 60) * 59);
};

const scoreEnergy = (averageEnergy) => {
  if (typeof averageEnergy !== "number") {
    return 50;
  }

  if (averageEnergy >= 4) {
    return 100;
  }

  if (averageEnergy >= 3) {
    return roundScore(60 + (averageEnergy - 3) * 20);
  }

  return roundScore(((averageEnergy - ENERGY_SCALE_MIN) / 2) * 59);
};

const scoreDigestion = (averageDigestion) => {
  if (typeof averageDigestion !== "number") {
    return 50;
  }

  if (averageDigestion >= 7) {
    return 100;
  }

  if (averageDigestion >= 5) {
    return roundScore(60 + ((averageDigestion - 5) / 2) * 20);
  }

  return roundScore((averageDigestion / 5) * 59);
};

const buildIssueSeverity = (analysis = {}) => ({
  adherence:
    typeof analysis.averageAdherence === "number" && analysis.averageAdherence < LOW_ADHERENCE_THRESHOLD
      ? Number(
          Math.max(
            0,
            (LOW_ADHERENCE_THRESHOLD - analysis.averageAdherence) /
              LOW_ADHERENCE_THRESHOLD
          ).toFixed(2)
        )
      : 0,
  energy:
    typeof analysis.averageEnergy === "number" && analysis.averageEnergy < LOW_ENERGY_THRESHOLD
      ? Number(
          Math.max(
            0,
            (LOW_ENERGY_THRESHOLD - analysis.averageEnergy) / LOW_ENERGY_THRESHOLD
          ).toFixed(2)
        )
      : 0,
  digestion:
    typeof analysis.averageDigestion === "number" && analysis.averageDigestion < POOR_DIGESTION_THRESHOLD
      ? Number(
          Math.max(
            0,
            (POOR_DIGESTION_THRESHOLD - analysis.averageDigestion) /
              POOR_DIGESTION_THRESHOLD
          ).toFixed(2)
        )
      : 0,
  weight:
    typeof analysis.weightDrop === "number" && analysis.weightDrop > RAPID_WEIGHT_LOSS_THRESHOLD_KG
      ? Number(
          Math.max(
            0,
            (analysis.weightDrop - RAPID_WEIGHT_LOSS_THRESHOLD_KG) /
              RAPID_WEIGHT_LOSS_THRESHOLD_KG
          ).toFixed(2)
        )
      : 0,
});

const detectPrimaryIssue = (analysis = {}) => {
  const severities = buildIssueSeverity(analysis);
  const rankedIssues = Object.entries(severities).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return (
      Object.keys(PRIMARY_ISSUE_LABELS).indexOf(left[0]) -
      Object.keys(PRIMARY_ISSUE_LABELS).indexOf(right[0])
    );
  });

  if (!rankedIssues.length || rankedIssues[0][1] <= 0) {
    return null;
  }

  return PRIMARY_ISSUE_LABELS[rankedIssues[0][0]] || rankedIssues[0][0];
};

const resolvePrimaryIssue = (analysis = {}, appliedRule = null) => {
  const severityPrimaryIssue = detectPrimaryIssue(analysis);

  if (!appliedRule) {
    return severityPrimaryIssue;
  }

  if (RULE_PRIMARY_ISSUE_MAP[appliedRule]) {
    return RULE_PRIMARY_ISSUE_MAP[appliedRule];
  }

  if (appliedRule === "energyWeight") {
    const severities = buildIssueSeverity(analysis);
    return severities.weight >= severities.energy ? "weight" : "energy";
  }

  return severityPrimaryIssue;
};

const buildConfidenceLevel = (logCount = 0) => {
  if (logCount >= 5) {
    return "high";
  }

  if (logCount >= 4) {
    return "medium";
  }

  return "low";
};

const getTriggeredRuleScore = (appliedRule, primaryIssue) => {
  if (!appliedRule) {
    return 100;
  }

  if (appliedRule === "adherence" && primaryIssue === "adherence") {
    return 30;
  }

  if (appliedRule === "energyWeight" && primaryIssue === "weight") {
    return 30;
  }

  if (appliedRule === "energyWeight" && primaryIssue === "energy") {
    return 35;
  }

  if (appliedRule === "digestion" && primaryIssue === "digestion") {
    return 35;
  }

  return 40;
};

const computeEffectivenessScore = (analysis = {}, options = {}) => {
  const primaryIssue = options.primaryIssue ?? detectPrimaryIssue(analysis);
  const componentScores = {
    weight: scoreWeightTrend(analysis.weightDrop),
    adherence: scoreAdherence(analysis.averageAdherence),
    energy: scoreEnergy(analysis.averageEnergy),
    digestion: scoreDigestion(analysis.averageDigestion),
    triggeredRule: getTriggeredRuleScore(options.appliedRule, primaryIssue),
  };

  const score = roundScore(
    componentScores.weight * EFFECTIVENESS_WEIGHTS.weight +
      componentScores.adherence * EFFECTIVENESS_WEIGHTS.adherence +
      componentScores.energy * EFFECTIVENESS_WEIGHTS.energy +
      componentScores.digestion * EFFECTIVENESS_WEIGHTS.digestion +
      componentScores.triggeredRule * EFFECTIVENESS_WEIGHTS.triggeredRule
  );

  return {
    score,
    level: classifyEffectiveness(score),
  };
};

const compareEffectivenessTrend = (previousScore, currentScore) => {
  const delta = currentScore - previousScore;

  if (Math.abs(delta) <= EFFECTIVENESS_TREND_THRESHOLD) {
    return "stable";
  }

  if (delta >= STRONG_EFFECTIVENESS_TREND_THRESHOLD) {
    return "improving";
  }

  if (delta > 0) {
    return "slight_improvement";
  }

  if (delta <= -STRONG_EFFECTIVENESS_TREND_THRESHOLD) {
    return "declining";
  }

  if (delta < 0) {
    return "slight_decline";
  }

  return "stable";
};

const computeEffectivenessTrend = (progressLogs = [], currentAnalysis = null, options = {}) => {
  const orderedLogs = sortLogsAscending(progressLogs);
  const currentEffectiveness = computeEffectivenessScore(
    currentAnalysis || analyzeProgressSignals(orderedLogs),
    options
  );

  if (orderedLogs.length < 2) {
    return {
      previous: currentEffectiveness.score,
      current: currentEffectiveness.score,
      trend: "stable",
    };
  }

  const previousAnalysis = analyzeProgressSignals(orderedLogs.slice(0, -1));
  const previousEffectiveness = computeEffectivenessScore(previousAnalysis, {
    primaryIssue: detectPrimaryIssue(previousAnalysis),
  });

  return {
    previous: previousEffectiveness.score,
    current: currentEffectiveness.score,
    trend: compareEffectivenessTrend(
      previousEffectiveness.score,
      currentEffectiveness.score
    ),
  };
};

const buildExplainableAnalysis = (
  analysis,
  appliedRule,
  enoughLogs,
  effectivenessTrend
) => {
  const primaryIssue = resolvePrimaryIssue(analysis, appliedRule);
  const confidence = buildConfidenceLevel(analysis.logCount);
  const effectiveness = computeEffectivenessScore(analysis, {
    appliedRule,
    primaryIssue,
  });

  return {
    ...analysis,
    enoughLogs,
    normalizedValues: {
      weightDrop: analysis.weightDrop,
      energyLevel: analysis.averageEnergy,
      adherence: analysis.averageAdherence,
      digestion: analysis.averageDigestion,
    },
    primaryIssue,
    confidence,
    effectiveness,
    effectivenessTrend,
    weightTrend: buildWeightTrend(analysis),
    energyStatus: buildEnergyStatus(analysis),
    adherenceStatus: buildAdherenceStatus(analysis),
    digestionStatus: buildDigestionStatus(analysis),
    triggeredRule: appliedRule ? RULE_LABELS[appliedRule] || appliedRule : null,
    reasonSummary: buildReasonSummary(
      appliedRule,
      analysis,
      effectivenessTrend,
      primaryIssue
    ),
    reasonDetails: buildReasonDetails(
      appliedRule,
      analysis,
      enoughLogs,
      effectivenessTrend,
      confidence
    ),
    expectedImpact: buildExpectedImpact(appliedRule, confidence),
    reason: buildRuleExplanation(
      appliedRule,
      analysis,
      enoughLogs,
      effectivenessTrend,
      confidence,
      primaryIssue
    ),
  };
};

const simplifyMealText = (mealText = "") => {
  if (!mealText.trim()) {
    return "";
  }

  return mealText
    .split(/[,+/&]| and /i)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 1)
    .join(", ");
};

const chooseLighterMeal = (mealType) => LIGHT_MEAL_BY_TYPE[mealType] || "khichdi";

const isHeavyMeal = (mealText = "") =>
  HEAVY_MEAL_KEYWORDS.some((keyword) =>
    mealText.toLowerCase().includes(keyword)
  );

const buildIncreaseCaloriesChange = () => ({
  type: "increase_calories",
  value: CALORIE_INCREASE,
  reason: CHANGE_REASONS.increaseCalories,
});

const buildSimplifyMealChanges = (meals = []) => {
  const changes = [];

  meals.forEach((mealDay, index) => {
    MEAL_TYPES.forEach((mealType) => {
      const currentMeal = mealDay[mealType];

      if (!currentMeal || !currentMeal.trim()) {
        return;
      }

      const simplifiedMeal = simplifyMealText(currentMeal);

      if (simplifiedMeal && simplifiedMeal !== currentMeal) {
        changes.push({
          type: "simplify_meal",
          day: index + 1,
          meal: mealType,
          newMeal: simplifiedMeal,
          reason: CHANGE_REASONS.simplifyMeal,
        });
      }
    });
  });

  return changes;
};

const buildDigestionChanges = (meals = []) => {
  const changes = [];

  meals.forEach((mealDay, index) => {
    MEAL_TYPES.forEach((mealType) => {
      const currentMeal = mealDay[mealType];

      if (!currentMeal || !currentMeal.trim() || !isHeavyMeal(currentMeal)) {
        return;
      }

      const newMeal = chooseLighterMeal(mealType);

      if (newMeal.toLowerCase() !== currentMeal.trim().toLowerCase()) {
        changes.push({
          type: "replace_meal",
          day: index + 1,
          meal: mealType,
          newMeal,
          reason: CHANGE_REASONS.replaceMeal,
        });
      }
    });
  });

  return changes;
};

const dedupeChanges = (changes = []) => {
  const seen = new Set();

  return changes.filter((change) => {
    const key = JSON.stringify(change);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const getLastAdjustment = (plan = {}) => {
  if (plan?.lastAdjustment && typeof plan.lastAdjustment.type === "string") {
    return plan.lastAdjustment;
  }

  if (typeof plan?.lastAdjustmentType === "string") {
    return { type: plan.lastAdjustmentType };
  }

  if (Array.isArray(plan?.adjustmentHistory) && plan.adjustmentHistory.length) {
    const lastEntry = [...plan.adjustmentHistory]
      .sort(
        (left, right) =>
          new Date(left.appliedAt || left.createdAt || 0).getTime() -
          new Date(right.appliedAt || right.createdAt || 0).getTime()
      )
      .pop();

    if (lastEntry?.type) {
      return lastEntry;
    }
  }

  return null;
};

const preventImmediateReversal = (changes = [], lastAdjustment = null) => {
  const reverseType = REVERSE_CHANGE_TYPES[lastAdjustment?.type];

  if (!reverseType) {
    return changes;
  }

  return changes.filter((change) => change.type !== reverseType);
};

const getChangeLimit = (effectiveness = {}, effectivenessTrend = {}) => {
  let limit = MAX_CHANGES_PER_UPDATE;

  if (effectiveness.level === "low") {
    limit = LOW_EFFECTIVENESS_MAX_CHANGES;
  } else if (effectiveness.level === "high") {
    limit = HIGH_EFFECTIVENESS_MAX_CHANGES;
  }

  if (effectivenessTrend.trend === "declining") {
    limit += 1;
  } else if (effectivenessTrend.trend === "improving") {
    limit -= 1;
  }

  return clamp(limit, HIGH_EFFECTIVENESS_MAX_CHANGES, LOW_EFFECTIVENESS_MAX_CHANGES);
};

const applyConfidenceGuardrail = (limit, confidence = "low") => {
  if (confidence === "low") {
    return Math.min(limit, MAX_CHANGES_PER_UPDATE);
  }

  if (confidence === "medium") {
    return Math.min(limit, MAX_CHANGES_PER_UPDATE);
  }

  return limit;
};

const limitChanges = (
  changes = [],
  effectiveness = {},
  effectivenessTrend = {},
  confidence = "low"
) =>
  changes.slice(
    0,
    applyConfidenceGuardrail(getChangeLimit(effectiveness, effectivenessTrend), confidence)
  );

const buildAdherenceChanges = (analysis, meals) =>
  analysis.lowAdherence ? buildSimplifyMealChanges(meals) : [];

const buildEnergyWeightChanges = (analysis) =>
  analysis.rapidWeightLoss && analysis.lowEnergy
    ? [buildIncreaseCaloriesChange()]
    : [];

const buildPriorityChanges = (priority, analysis, meals) => {
  if (priority === "adherence") {
    return buildAdherenceChanges(analysis, meals);
  }

  if (priority === "energyWeight") {
    return buildEnergyWeightChanges(analysis);
  }

  if (priority === "digestion") {
    return analysis.poorDigestion ? buildDigestionChanges(meals) : [];
  }

  return [];
};

const selectPriorityChanges = (
  analysis,
  meals = [],
  effectivenessTrend = {},
  lastAdjustment = null
) => {
  const primaryIssue = detectPrimaryIssue(analysis);
  const confidence = buildConfidenceLevel(analysis.logCount);

  for (const priority of RULE_PRIORITY) {
    const prioritizedChanges = preventImmediateReversal(
      dedupeChanges(buildPriorityChanges(priority, analysis, meals)),
      lastAdjustment
    );

    if (prioritizedChanges.length) {
      const effectiveness = computeEffectivenessScore(analysis, {
        appliedRule: priority,
        primaryIssue,
      });

      return {
        appliedRule: priority,
        changes: limitChanges(
          prioritizedChanges,
          effectiveness,
          effectivenessTrend,
          confidence
        ),
      };
    }
  }

  return {
    appliedRule: null,
    changes: [],
  };
};

const modifyPlanBasedOnProgress = async (patientId, options = {}) => {
  if (!patientId || !isValidObjectId(patientId)) {
    throw new ApiError(400, "Invalid patient id");
  }

  const patient = await Patient.findById(patientId).select("_id name").lean();

  if (!patient) {
    throw new ApiError(404, "Patient not found");
  }

  const requestedPlanId =
    options?.planId && isValidObjectId(options.planId)
      ? String(options.planId)
      : null;
  const requestedGoal = String(options?.goal || "").trim();
  const activePlanFilter = requestedPlanId
    ? { _id: requestedPlanId, patient: patientId, isActive: true }
    : {
        patient: patientId,
        isActive: true,
        ...(requestedGoal ? { goalKey: toGoalKey(requestedGoal) } : {}),
      };

  let activePlanQuery = Plan.findOne(activePlanFilter);
  if (!requestedPlanId && typeof activePlanQuery?.sort === "function") {
    activePlanQuery = activePlanQuery.sort({ createdAt: -1 });
  }
  let activePlan = await activePlanQuery;

  if (
    activePlan &&
    typeof activePlan.lean === "function" &&
    (activePlan._id === undefined || activePlan._id === null)
  ) {
    activePlan = await activePlan.lean();
  }

  if (!activePlan) {
    throw new ApiError(404, "Active plan not found");
  }

  const progressLogs = await getRecentProgressLogs(patientId, activePlan?._id);
  const normalizedLogs = sortLogsAscending((progressLogs || []).map(normalizeProgressLog));
  const analysisSignals = analyzeProgressSignals(normalizedLogs);
  const enoughLogs = normalizedLogs.length >= MIN_LOGS;
  const lastAdjustment = getLastAdjustment(activePlan);
  const primaryIssue = detectPrimaryIssue(analysisSignals);
  const effectivenessTrend = computeEffectivenessTrend(
    normalizedLogs,
    analysisSignals,
    { primaryIssue }
  );

  const { appliedRule, changes } = enoughLogs
    ? selectPriorityChanges(
        analysisSignals,
        activePlan?.meals || [],
        effectivenessTrend,
        lastAdjustment
      )
    : { appliedRule: null, changes: [] };

  const analysis = buildExplainableAnalysis(
    analysisSignals,
    appliedRule,
    enoughLogs,
    effectivenessTrend
  );

  // Keep meal-quality metadata for UI while preserving explainable response shape.
  const validation = validatePlan(activePlan?.meals || [], activePlan?.doshaType || "");
  const analysisWithMealQuality = {
    ...analysis,
    mealQuality: {
      score: roundScore((validation?.score ?? 0) * 10),
      validationScore: validation?.score ?? 0,
      issues: validation?.issues || [],
      suggestions: validation?.suggestions || [],
    },
  };

  activePlan.analysis = {
    ...analysisWithMealQuality,
    computedAt: new Date(),
  };
  activePlan.adjustments = changes.map((change) => change.reason || change.type);

  if (changes.length > 0) {
    const latestChangeType = changes[changes.length - 1]?.type || null;

    if (latestChangeType) {
      activePlan.lastAdjustment = { type: latestChangeType };
      activePlan.lastAdjustmentType = latestChangeType;
    }
  }

  await persistPlanIfDocument(activePlan);

  return {
    patientId: String(patient._id),
    planId: String(activePlan._id),
    logCount: normalizedLogs.length,
    analysis: analysisWithMealQuality,
    lastAdjustment,
    appliedRule,
    changes,
  };
};

/*
Example input:
modifyPlanBasedOnProgress("65f1234567890abcdef1234")

Example output:
{
  "patientId": "65f1234567890abcdef1234",
  "planId": "65f9999999990abcdef9999",
  "logCount": 5,
  "analysis": {
    "logCount": 5,
    "weightDrop": 2.4,
    "averageEnergy": 3.2,
    "averageAdherence": 48,
    "averageDigestion": 4.4,
    "normalizedValues": {
      "weightDrop": 2.4,
      "energyLevel": 3.2,
      "adherence": 48,
      "digestion": 4.4
    },
    "effectiveness": {
      "score": 30,
      "level": "low"
    },
    "effectivenessTrend": {
      "previous": 42,
      "current": 30,
      "trend": "declining"
    },
    "primaryIssue": "adherence",
    "confidence": "high",
    "weightTrend": "rapid weight loss",
    "energyStatus": "low energy",
    "adherenceStatus": "low adherence",
    "digestionStatus": "poor digestion",
    "thresholds": {
      "rapidWeightLossKg": 2,
      "lowEnergy": 3.5,
      "lowAdherence": 60,
      "poorDigestion": 5
    },
    "rapidWeightLoss": true,
    "lowEnergy": true,
    "lowAdherence": true,
    "poorDigestion": true,
    "enoughLogs": true,
    "triggeredRule": "adherence",
    "reason": "Adherence issues were prioritized first, so the engine simplified meals before considering other signals. Effectiveness trend is declining (42 -> 30)."
  },
  "lastAdjustment": {
    "type": "increase_calories"
  },
  "appliedRule": "adherence",
  "changes": [
    {
      "type": "simplify_meal",
      "day": 1,
      "meal": "breakfast",
      "newMeal": "idli",
      "reason": "low adherence"
    },
    {
      "type": "simplify_meal",
      "day": 1,
      "meal": "lunch",
      "newMeal": "khichdi",
      "reason": "low adherence"
    }
  ]
}
*/

module.exports = {
  analyzeProgressSignals,
  buildConfidenceLevel,
  compareEffectivenessTrend,
  computeEffectivenessScore,
  computeEffectivenessTrend,
  detectPrimaryIssue,
  modifyPlanBasedOnProgress,
  normalizeAdherence,
  normalizeDigestion,
  normalizeEnergy,
  normalizeProgressLog,
};

