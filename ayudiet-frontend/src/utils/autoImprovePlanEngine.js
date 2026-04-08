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

const SLOT_KEYS = ["breakfast", "lunch", "dinner"];

const DEFAULT_MEALS_BY_DOSHA = {
  vata: {
    breakfast: "Warm oats porridge with nuts",
    lunch: "Moong dal khichdi with sauteed vegetables",
    dinner: "Light vegetable soup with soft rice",
  },
  pitta: {
    breakfast: "Fruit-curd bowl with soaked seeds",
    lunch: "Rice with moong dal and boiled vegetables",
    dinner: "Coriander vegetable soup with phulka",
  },
  kapha: {
    breakfast: "Moong chilla with mint chutney",
    lunch: "Millet khichdi with sauteed greens",
    dinner: "Clear vegetable soup with tofu",
  },
  default: {
    breakfast: "Balanced breakfast with fruit and protein",
    lunch: "Dal, rice, and vegetable plate",
    dinner: "Light soup with vegetables",
  },
};

const DOSHA_SAFE_REPLACEMENTS = {
  vata: "Warm moong dal khichdi",
  pitta: "Coriander rice with vegetables",
  kapha: "Light vegetable soup",
  default: "Balanced vegetable khichdi",
};

const normalizeMealText = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const includesAnyKeyword = (text, keywords = []) =>
  keywords.some((keyword) => text.includes(keyword));

const simplifyMealText = (text = "") =>
  String(text)
    .split(/[,+/&]| and /i)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 1)
    .join(", ");

const getDefaults = (dosha) =>
  DEFAULT_MEALS_BY_DOSHA[dosha] || DEFAULT_MEALS_BY_DOSHA.default;

const getSafeReplacement = (dosha) =>
  DOSHA_SAFE_REPLACEMENTS[dosha] || DOSHA_SAFE_REPLACEMENTS.default;

export function autoImprovePlan(plan = [], options = {}) {
  const trend = options?.trend || "stable";
  const dosha = options?.dosha || "";
  const defaults = getDefaults(dosha);
  const restrictedKeywords = DOSHA_RESTRICTIONS[dosha] || [];
  const safeReplacement = getSafeReplacement(dosha);

  const improvedPlan = (Array.isArray(plan) ? plan : []).map((dayPlan) => ({
    breakfast: dayPlan?.breakfast || "",
    lunch: dayPlan?.lunch || "",
    dinner: dayPlan?.dinner || "",
  }));
  const changeLog = [];

  improvedPlan.forEach((dayPlan, dayIndex) => {
    SLOT_KEYS.forEach((slot) => {
      const currentText = String(dayPlan[slot] || "").trim();
      const normalized = normalizeMealText(currentText);

      if (!normalized) {
        dayPlan[slot] = defaults[slot];
        changeLog.push(`Filled ${slot} on Day ${dayIndex + 1} with a balanced default`);
        return;
      }

      if (restrictedKeywords.length && includesAnyKeyword(normalized, restrictedKeywords)) {
        dayPlan[slot] = safeReplacement;
        changeLog.push(`Replaced dosha-restricted ${slot} on Day ${dayIndex + 1}`);
      }
    });

    const slotValues = SLOT_KEYS.map((slot) => normalizeMealText(dayPlan[slot]));
    const hasProtein = slotValues.some((value) =>
      includesAnyKeyword(value, PROTEIN_KEYWORDS)
    );
    if (!hasProtein) {
      dayPlan.lunch = `${dayPlan.lunch} + moong dal soup`;
      changeLog.push(`Added protein support to lunch on Day ${dayIndex + 1}`);
    }

    const carbHeavySlots = SLOT_KEYS.filter((slot) =>
      includesAnyKeyword(normalizeMealText(dayPlan[slot]), CARB_KEYWORDS)
    );
    if (carbHeavySlots.length >= 2) {
      dayPlan.dinner = safeReplacement;
      changeLog.push(`Reduced carb density in dinner on Day ${dayIndex + 1}`);
    }

    if (trend === "declining") {
      ["lunch", "dinner"].forEach((slot) => {
        const currentText = String(dayPlan[slot] || "").trim();
        const simplified = simplifyMealText(currentText);
        if (simplified && simplified !== currentText) {
          dayPlan[slot] = simplified;
          changeLog.push(`Simplified ${slot} for better adherence on Day ${dayIndex + 1}`);
        }
      });
    }

    if (trend === "improving") {
      const lunchText = String(dayPlan.lunch || "");
      if (!lunchText.toLowerCase().includes("seasonal side")) {
        dayPlan.lunch = `${lunchText} + seasonal side`;
        changeLog.push(`Added variety boost to lunch on Day ${dayIndex + 1}`);
      }
    }
  });

  return {
    improvedPlan,
    changes: [...new Set(changeLog)],
  };
}

