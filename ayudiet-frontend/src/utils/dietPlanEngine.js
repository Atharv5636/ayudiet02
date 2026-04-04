export const buildDietPlan = (profile) => {
  if (!profile) return null;

  const { primary_dosha, risk_flags } = profile;

  let plan = {
    breakfast: "Oats or fruit bowl",
    lunch: "Rice + dal + vegetables",
    dinner: "Light soup or khichdi",
  };

  if (primary_dosha === "pitta") {
    plan = {
      breakfast: "Cooling fruits (banana, apple) + soaked almonds",
      lunch: "Rice + moong dal + boiled vegetables",
      dinner: "Vegetable soup + chapati",
    };
  }

  if (primary_dosha === "vata") {
    plan = {
      breakfast: "Warm porridge + dry fruits",
      lunch: "Rice + ghee + dal",
      dinner: "Khichdi + cooked vegetables",
    };
  }

  if (primary_dosha === "kapha") {
    plan = {
      breakfast: "Light fruits + herbal tea",
      lunch: "Millet + vegetables",
      dinner: "Soup + salad",
    };
  }

  if (risk_flags?.includes("diabetes")) {
    plan.breakfast = "Low sugar fruits + nuts";
    plan.lunch = "Brown rice + dal + vegetables";
  }

  if (risk_flags?.includes("high_blood_pressure")) {
    plan.lunch += " (low salt)";
    plan.dinner += " (low sodium)";
  }

  return plan;
};

const rotate = (items = [], index = 0) => {
  if (!items.length) return "";
  return items[index % items.length];
};

const applyRiskAdjustmentsToMeal = (meal, riskFlags = []) => {
  let adjusted = meal;

  if (riskFlags.includes("high_blood_pressure")) {
    adjusted += " (low salt)";
  }

  return adjusted;
};

const getMealPools = (profile = {}) => {
  const dosha = profile?.primary_dosha;
  const riskFlags = Array.isArray(profile?.risk_flags) ? profile.risk_flags : [];

  let pools = {
    breakfast: [
      "Oats with apple and chia",
      "Fruit bowl with soaked almonds",
      "Vegetable poha with peanuts",
      "Moong chilla with mint chutney",
      "Ragi porridge with nuts",
      "Idli with sambar",
      "Dalia with mixed seeds",
    ],
    lunch: [
      "Rice, dal and sauteed vegetables",
      "Millet khichdi with curd",
      "Chapati with chana masala and salad",
      "Moong dal khichdi with beetroot",
      "Brown rice with rajma and cucumber",
      "Vegetable pulao with raita",
      "Quinoa with mixed veg curry",
    ],
    dinner: [
      "Vegetable soup with chapati",
      "Moong soup with steamed vegetables",
      "Light khichdi with carrot salad",
      "Lauki chana dal with roti",
      "Palak soup with paneer cubes",
      "Steamed vegetables with lentil soup",
      "Bottle gourd soup with millet roti",
    ],
  };

  if (dosha === "pitta") {
    pools = {
      breakfast: [
        "Cooling fruit bowl with soaked almonds",
        "Pear and banana smoothie bowl",
        "Coconut chia pudding",
        "Sweet apple porridge",
        "Cucumber mint yogurt bowl",
        "Stewed pear with oats",
        "Papaya and seeds bowl",
      ],
      lunch: [
        "Rice with moong dal and boiled vegetables",
        "Jeera rice with lauki dal",
        "Quinoa with zucchini curry",
        "Chapati with tori sabzi and dal",
        "Brown rice with pumpkin curry",
        "Millet with moong stew",
        "Vegetable daliya with curd",
      ],
      dinner: [
        "Vegetable soup with chapati",
        "Lauki soup with rice",
        "Moong broth with spinach",
        "Carrot beet soup with roti",
        "Pumpkin soup with millet roti",
        "Steamed veg with light dal",
        "Khichdi with mint yogurt",
      ],
    };
  }

  if (dosha === "vata") {
    pools = {
      breakfast: [
        "Warm porridge with dates and ghee",
        "Upma with vegetables and nuts",
        "Banana oats with cinnamon",
        "Ragi malt with dry fruits",
        "Besan chilla with chutney",
        "Stewed apple with warm milk",
        "Poha with sesame and peanuts",
      ],
      lunch: [
        "Rice with ghee, dal and root vegetables",
        "Khichdi with ghee and carrot",
        "Chapati with mixed veg curry and dal",
        "Moong dal rice with beetroot stir-fry",
        "Millet with paneer curry",
        "Vegetable daliya with lentils",
        "Curd rice with sauteed vegetables",
      ],
      dinner: [
        "Soft khichdi with cooked vegetables",
        "Lentil soup with ghee roti",
        "Vegetable stew with rice",
        "Pumpkin soup with chapati",
        "Moong soup with carrot",
        "Soft upma with vegetables",
        "Rice gruel with dal",
      ],
    };
  }

  if (dosha === "kapha") {
    pools = {
      breakfast: [
        "Light fruits with ginger herbal tea",
        "Moong chilla with coriander chutney",
        "Vegetable oats upma",
        "Sprouts salad with lemon",
        "Ragi dosa with mint chutney",
        "Papaya bowl with pumpkin seeds",
        "Poha with peas and lemon",
      ],
      lunch: [
        "Millet with mixed vegetables",
        "Brown rice with dal and stir-fry",
        "Chapati with methi sabzi and lentils",
        "Quinoa with chickpea salad",
        "Vegetable soup with moong chilla",
        "Daliya with vegetables",
        "Lauki chana dal with millet roti",
      ],
      dinner: [
        "Soup with sauteed vegetables",
        "Mixed veg clear soup and salad",
        "Moong soup with steamed broccoli",
        "Lentil soup with stir-fry",
        "Tomato carrot soup with sprouts",
        "Pumpkin soup with salad",
        "Vegetable stew with light millet",
      ],
    };
  }

  if (riskFlags.includes("diabetes")) {
    pools.breakfast = [
      "Low sugar fruits with nuts",
      "Oats with chia and flax seeds",
      "Moong chilla with mint chutney",
      "Boiled sprouts with cucumber",
      "Vegetable omelette style besan chilla",
      "Greek yogurt with seeds",
      "Ragi porridge without added sugar",
    ];
    pools.lunch = [
      "Brown rice, dal and vegetables",
      "Millet khichdi with salad",
      "Chapati with mixed veg and dal",
      "Quinoa bowl with paneer and greens",
      "Lentil soup with sauteed vegetables",
      "Moong dal with millet roti",
      "Brown rice with chana curry",
    ];
  }

  return pools;
};

export const buildWeeklyDietPlan = (profile, totalDays = 7) => {
  if (!profile) return [];

  const riskFlags = Array.isArray(profile?.risk_flags) ? profile.risk_flags : [];
  const pools = getMealPools(profile);

  return Array.from({ length: totalDays }, (_, index) => ({
    day: `Day ${index + 1}`,
    breakfast: applyRiskAdjustmentsToMeal(
      rotate(pools.breakfast, index),
      riskFlags
    ),
    lunch: applyRiskAdjustmentsToMeal(rotate(pools.lunch, index), riskFlags),
    dinner: applyRiskAdjustmentsToMeal(rotate(pools.dinner, index), riskFlags),
  }));
};

export const formatRiskFlags = (flags) => {
  if (!flags || flags.includes("none")) return "No major issues";

  return flags
    .map((flag) => flag.replaceAll("_", " "))
    .map((flag) => flag.charAt(0).toUpperCase() + flag.slice(1))
    .join(", ");
};
