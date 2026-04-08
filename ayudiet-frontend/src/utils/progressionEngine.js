const toNumericAdherence = (value) => {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "boolean") return value ? 100 : 30;
  return 0;
};

const average = (values = []) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const cleanMealText = (value = "") =>
  String(value)
    .replace(/\s*\+\s*(more variety|optional add-ons)\s*$/i, "")
    .replace(/\s*\((simplified prep|fixed portions|easy digestion)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

const simplifyMealText = (value = "") =>
  cleanMealText(value)
    .split(/[,+/&]| and /i)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 1)
    .join(", ");

export const analyzeProgress = (logs) => {
  if (!logs || logs.length < 3) {
    return { trend: "stable", confidence: 0.3 };
  }

  const normalizedLogs = [...logs]
    .map((log) => ({
      adherence: toNumericAdherence(log?.adherence),
      weight:
        typeof log?.weight === "number" && !Number.isNaN(log.weight)
          ? log.weight
          : null,
      energy:
        typeof log?.energy === "number"
          ? log.energy
          : typeof log?.energyLevel === "number"
            ? log.energyLevel
            : null,
      createdAt: log?.createdAt || log?.date || null,
    }))
    .sort((left, right) => {
      const leftTime = new Date(left.createdAt || 0).getTime();
      const rightTime = new Date(right.createdAt || 0).getTime();
      return leftTime - rightTime;
    });

  const last3 = normalizedLogs.slice(-3);
  const prev3 = normalizedLogs.slice(-6, -3);

  if (prev3.length === 0) {
    return { trend: "stable", confidence: 0.35 };
  }

  const avgAdherence = average(last3.map((log) => log.adherence));
  const prevAvg = average(prev3.map((log) => log.adherence));
  const adherenceImproving = avgAdherence > prevAvg + 5;
  const adherenceDeclining = avgAdherence < prevAvg - 5;

  const last = normalizedLogs[normalizedLogs.length - 1];
  const prev = normalizedLogs[normalizedLogs.length - 2];

  const hasWeight = typeof last?.weight === "number" && typeof prev?.weight === "number";
  const weightTrend = hasWeight ? last.weight - prev.weight : 0;
  const weightDecreasing = hasWeight && weightTrend < -0.2;
  const weightIncreasing = hasWeight && weightTrend > 0.2;

  const hasEnergy = typeof last?.energy === "number" && typeof prev?.energy === "number";
  const energyTrend = hasEnergy ? last.energy - prev.energy : 0;
  const energyImproving = hasEnergy && energyTrend > 0.2;
  const energyDropping = hasEnergy && energyTrend < -0.2;

  let trend = "stable";

  if (
    (adherenceImproving && weightDecreasing) ||
    (adherenceImproving && energyImproving)
  ) {
    trend = "improving";
  } else if (
    adherenceDeclining ||
    weightIncreasing ||
    energyDropping
  ) {
    trend = "declining";
  }

  let confidence = 0.45;
  if (normalizedLogs.length >= 6) confidence += 0.2;
  if (normalizedLogs.length >= 10) confidence += 0.1;
  if ((adherenceImproving || adherenceDeclining) && Math.abs(avgAdherence - prevAvg) >= 10) {
    confidence += 0.15;
  }
  if ((trend === "improving" && (weightDecreasing || energyImproving)) ||
      (trend === "declining" && (weightIncreasing || energyDropping))) {
    confidence += 0.1;
  }

  confidence = Math.max(0.2, Math.min(0.95, confidence));

  return { trend, confidence };
};

export const adjustPlanByTrend = (plan, trend) => {
  if (!plan) return plan;

  if (Array.isArray(plan)) {
    return plan.map((dayPlan) => adjustPlanByTrend(dayPlan, trend));
  }

  const updated = { ...plan };

  if (trend === "declining") {
    updated.breakfast = simplifyMealText(plan.breakfast) || cleanMealText(plan.breakfast);
    updated.lunch = simplifyMealText(plan.lunch) || cleanMealText(plan.lunch);
    updated.dinner = simplifyMealText(plan.dinner) || cleanMealText(plan.dinner);
  }

  if (trend === "improving") {
    updated.breakfast = cleanMealText(plan.breakfast);
    updated.lunch = cleanMealText(plan.lunch);
    updated.dinner = cleanMealText(plan.dinner);
  }

  return updated;
};
