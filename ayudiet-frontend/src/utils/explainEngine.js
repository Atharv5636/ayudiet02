export const generateActionReason = (trend) => {
  if (trend === "declining") {
    return "Plan simplified to improve adherence and reduce patient burden";
  }

  if (trend === "improving") {
    return "Plan expanded to introduce variety and maintain engagement";
  }

  return "Plan maintained due to stable progress";
};

export const generateProgressExplanation = (logs, trend = "stable") => {
  if (!logs || logs.length < 2) {
    return {
      summary: "Not enough data",
      interpretation: "Insufficient recent progress history to infer a pattern",
      actionReason: generateActionReason(trend),
    };
  }

  const last = logs[logs.length - 1];
  const prev = logs[logs.length - 2];

  const adherenceLast =
    typeof last?.adherence === "number" ? last.adherence : last?.adherence ? 100 : 30;
  const adherencePrev =
    typeof prev?.adherence === "number" ? prev.adherence : prev?.adherence ? 100 : 30;

  const adherenceChange = adherenceLast - adherencePrev;
  const weightLast = typeof last?.weight === "number" ? last.weight : 0;
  const weightPrev = typeof prev?.weight === "number" ? prev.weight : 0;
  const weightChange = weightLast - weightPrev;

  const explanation = [];
  const interpretation = [];

  if (adherenceChange > 0) {
    explanation.push(`Adherence improved by ${adherenceChange}%`);
    interpretation.push("This indicates improved consistency with the diet plan");
  } else if (adherenceChange < 0) {
    explanation.push(`Adherence dropped by ${Math.abs(adherenceChange)}%`);
  }

  if (weightChange < 0) {
    explanation.push(`Weight decreased by ${Math.abs(weightChange)}kg`);
    interpretation.push("Weight reduction suggests positive response to the plan");
  } else if (weightChange > 0) {
    explanation.push(`Weight increased by ${weightChange}kg`);
  }

  return {
    summary: explanation.length > 0 ? explanation.join(", ") : "No major change detected",
    interpretation:
      interpretation.length > 0
        ? interpretation.join(". ")
        : "Progress signals are mixed and should be monitored closely",
    actionReason: generateActionReason(trend),
  };
};
