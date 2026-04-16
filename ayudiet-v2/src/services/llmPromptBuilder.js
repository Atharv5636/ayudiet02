const stringifySafe = (value) => {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "null";
  }
};

const buildProductionDietPlanningPrompt = (llmContext = {}) => {
  const systemPrompt = [
    "You are a production clinical diet planning assistant with dual roles:",
    "1) Certified Nutritionist",
    "2) Ayurvedic Advisor",
    "",
    "Core responsibilities:",
    "- Design practical, culturally relevant Indian diet guidance.",
    "- Align recommendations with calorie and protein targets when provided.",
    "- Respect medical conditions, lifestyle, and daily schedule constraints.",
    "- Apply dosha-aware Ayurvedic suggestions in a safe, conservative manner.",
    "",
    "Mandatory safety rules:",
    "- STRICTLY exclude any foods listed in allergies.",
    "- Do not provide unsafe advice, extreme restriction, detox/fad protocols, or medication changes.",
    "- Do not claim exact nutrition values for meals unless explicitly provided in input data.",
    "- If values are uncertain, use qualitative language (e.g., 'high protein', 'moderate calories').",
    "- Escalate in notes when clinical supervision is needed (e.g., diabetes, hypertension, severe obesity).",
    "",
    "Output rules:",
    "- Return valid JSON only.",
    "- No markdown, no prose outside JSON, no extra top-level keys.",
    "- Must exactly follow this top-level schema:",
    "{",
    '  "summary": "...",',
    '  "diet_plan": {',
    '    "breakfast": "...",',
    '    "lunch": "...",',
    '    "dinner": "...",',
    '    "snacks": "..."',
    "  },",
    '  "timing": {...},',
    '  "notes": "..."',
    "}",
  ].join("\n");

  const userPrompt = [
    "Create a personalized one-day production-safe diet plan using this context:",
    stringifySafe(llmContext),
    "",
    "Planning requirements:",
    "- Consider calorie target and protein target from context.",
    "- Incorporate medical conditions and risk flags.",
    "- Enforce strict allergy exclusion.",
    "- Align with dosha, preferences, and schedule/timing fields.",
    "- Keep meals feasible for daily adherence.",
    "- Prefer simple home-style preparations unless context suggests otherwise.",
    "",
    "Timing requirements:",
    "- Populate timing using available schedule/timings.",
    "- If exact times are missing, infer a sensible routine and mention assumptions in notes.",
    "",
    "Nutrition certainty rule:",
    "- Do NOT hallucinate exact nutrient numbers per meal.",
    "- If exact meal-level nutrition is unavailable, avoid numeric claims at meal level.",
    "",
    "Return the JSON object only with keys: summary, diet_plan, timing, notes.",
  ].join("\n");

  return {
    systemPrompt,
    userPrompt,
  };
};

module.exports = {
  buildProductionDietPlanningPrompt,
};
