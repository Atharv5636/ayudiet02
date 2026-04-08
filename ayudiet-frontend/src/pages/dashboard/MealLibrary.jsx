import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { MEAL_LIBRARY, SLOT_LABELS } from "../../data/mealLibrary";
import BackNavLink from "../../components/common/BackNavLink";

const getPlanDraftStorageKey = (patientId) => `dietPlanDraft:${patientId}`;
const CUSTOM_MEALS_STORAGE_KEY = "doctorCustomMeals";
const DEFAULT_FORM = {
  name: "",
  slot: "breakfast",
  summary: "",
  tags: "",
  ingredients: "",
  steps: "",
  goals: "",
  doshas: "",
  image: "",
};
const hasPortionHint = (value = "") => /\bportion\s*:/i.test(String(value));
const getPortionHintBySlot = (slot = "breakfast", goal = "", mealName = "") => {
  const goalText = String(goal || "").toLowerCase();
  const mealText = String(mealName || "").toLowerCase();
  const isWeightLoss = goalText.includes("weight loss");
  const isMuscleGain = goalText.includes("muscle") || goalText.includes("weight gain");
  const isRotiStyleDish = /(roti|chapati|phulka|paratha|thepla|wrap)/.test(mealText);
  const isGrainBowlDish =
    /(khichdi|rice|pulao|daliya|quinoa|oats|porridge|upma|poha|millet)/.test(
      mealText
    );
  const isSoupSaladDish = /(soup|salad|broth|stew)/.test(mealText);

  if (slot === "breakfast") {
    if (isMuscleGain) return "Portion: 1.5 bowls";
    if (isWeightLoss) return "Portion: 1 bowl";
    return "Portion: 1-1.25 bowls";
  }

  if (slot === "lunch") {
    if (isRotiStyleDish) {
      if (isMuscleGain) return "Portion: 2-3 rotis + 1 cup sabzi/dal";
      if (isWeightLoss) return "Portion: 1-1.5 rotis + 1 cup sabzi";
      return "Portion: 1-2 rotis + 1 cup sabzi/dal";
    }
    if (isGrainBowlDish) {
      if (isMuscleGain) return "Portion: 1.5 cups cooked grains/khichdi";
      if (isWeightLoss) return "Portion: 0.75-1 cup cooked grains/khichdi";
      return "Portion: 1-1.25 cups cooked grains/khichdi";
    }
    if (isSoupSaladDish) {
      if (isMuscleGain) return "Portion: 1.5 bowls + protein side";
      if (isWeightLoss) return "Portion: 1 bowl + protein side";
      return "Portion: 1-1.25 bowls + protein side";
    }
    if (isMuscleGain) return "Portion: 1.5 bowls or 2 rotis";
    if (isWeightLoss) return "Portion: 1 bowl or 1 roti";
    return "Portion: 1-1.25 bowls or 1-2 rotis";
  }

  if (isMuscleGain) return "Portion: 1.5 bowls + protein side";
  if (isWeightLoss) return "Portion: 1 bowl (light)";
  return "Portion: 1-1.25 bowls";
};
const formatMealWithPortion = (mealName = "", slot = "breakfast", goal = "") => {
  const base = String(mealName || "").trim();
  if (!base) return base;
  if (hasPortionHint(base)) return base;
  return `${base} | ${getPortionHintBySlot(slot, goal, base)}`;
};

const normalizeGoalForMealLibrary = (goal = "") => {
  const normalized = String(goal || "").trim().toLowerCase();
  if (!normalized) return "";
  if (
    normalized.includes("diabetes") ||
    normalized.includes("blood sugar") ||
    normalized.includes("pcos")
  ) {
    return "weight loss";
  }
  if (
    normalized.includes("hypertension") ||
    normalized.includes("blood pressure")
  ) {
    return "better digestion";
  }
  if (normalized.includes("thyroid")) {
    return "general wellness";
  }
  return normalized;
};

const normalizeKey = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const getFileName = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withoutQuery = raw.split("?")[0].split("#")[0];
  const parts = withoutQuery.split("/");
  return (parts[parts.length - 1] || "").toLowerCase();
};

const buildLibraryImageLookups = () => {
  const byName = new Map();
  const byFile = new Map();

  MEAL_LIBRARY.forEach((meal) => {
    if (!meal?.image) return;
    const normalizedName = normalizeKey(meal.name);
    if (normalizedName && !byName.has(normalizedName)) {
      byName.set(normalizedName, meal.image);
    }

    const fileName = getFileName(meal.image);
    if (fileName && !byFile.has(fileName)) {
      byFile.set(fileName, meal.image);
    }
  });

  return { byName, byFile };
};

const resolveMealImageSource = (meal, imageLookups) => {
  const rawImage = String(meal?.image || "").trim();
  const normalizedMealName = normalizeKey(meal?.name);

  if (!rawImage) {
    return imageLookups.byName.get(normalizedMealName) || "";
  }

  if (/^https?:\/\//i.test(rawImage) || rawImage.startsWith("data:image/")) {
    return rawImage;
  }

  // Handles old stored values like "dish-vegetable-poha.jpg"
  const fileMatch = imageLookups.byFile.get(getFileName(rawImage));
  if (fileMatch) return fileMatch;

  // Fallback by meal name for custom entries with missing/invalid image paths.
  return imageLookups.byName.get(normalizedMealName) || rawImage;
};

function MealImage({ image, name }) {
  const [failed, setFailed] = useState(false);
  const source = String(image || "").trim();

  if (!source || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,#eef4d0,transparent_55%),linear-gradient(135deg,#faf7ef,#f3efe4)] px-6 text-center">
        <p className="text-lg font-semibold text-gray-700">{name}</p>
      </div>
    );
  }

  return (
    <img
      src={source}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover object-center"
    />
  );
}

function MealLibrary() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTag, setActiveTag] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [customMeals, setCustomMeals] = useState(() => {
    try {
      const rawMeals = localStorage.getItem(CUSTOM_MEALS_STORAGE_KEY);
      if (!rawMeals) return [];
      const parsedMeals = JSON.parse(rawMeals);
      return Array.isArray(parsedMeals) ? parsedMeals : [];
    } catch (error) {
      console.error("Failed to load custom meals", error);
      return [];
    }
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(DEFAULT_FORM);
  const isPlanSelectionMode = Boolean(id);
  const imageLookups = useMemo(() => buildLibraryImageLookups(), []);

  const dayIndex = Number(searchParams.get("day") || 0);
  const slotKey = searchParams.get("slot") || "breakfast";
  const goal = searchParams.get("goal") || "";
  const normalizedGoal = normalizeGoalForMealLibrary(goal);
  const dosha = searchParams.get("dosha") || "";

  const allMeals = [...customMeals, ...MEAL_LIBRARY];

  const matchingMeals = allMeals.filter((meal) => {
    if (meal.slot !== slotKey) return false;
    if (normalizedGoal && !meal.goals.includes(normalizedGoal)) return false;
    if (dosha && !meal.doshas.includes(dosha)) return false;
    if (activeTag !== "all" && !meal.tags.includes(activeTag)) return false;
    if (searchTerm.trim()) {
      const query = searchTerm.trim().toLowerCase();
      const matchesSearch =
        meal.name.toLowerCase().includes(query) ||
        meal.summary.toLowerCase().includes(query) ||
        meal.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        meal.ingredients.some((ingredient) => ingredient.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }
    return true;
  });

  const fallbackMeals = allMeals.filter((meal) => meal.slot === slotKey);

  const visibleMeals = matchingMeals.length ? matchingMeals : fallbackMeals;
  const activeTags = useMemo(
    () => ["all", ...new Set(fallbackMeals.flatMap((meal) => meal.tags))],
    [fallbackMeals]
  );

  const handleStandaloneSlotChange = (nextSlot) => {
    setActiveTag("all");
    setSearchParams({ slot: nextSlot });
  };

  const handleCreateFormChange = (field, value) => {
    setCreateForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetCreateForm = (slot = slotKey) => {
    setCreateForm({
      ...DEFAULT_FORM,
      slot,
    });
  };

  const saveCustomMeals = (meals) => {
    setCustomMeals(meals);
    localStorage.setItem(CUSTOM_MEALS_STORAGE_KEY, JSON.stringify(meals));
  };

  const handleCreateDish = (event) => {
    event.preventDefault();

    const mealName = createForm.name.trim();
    const summary = createForm.summary.trim();
    const tags = createForm.tags
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const ingredients = createForm.ingredients
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const steps = createForm.steps
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const goals = createForm.goals
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const doshas = createForm.doshas
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    if (!mealName || !summary || !ingredients.length || !steps.length) {
      return;
    }

    const nextMeal = {
      id: `custom-${Date.now()}`,
      slot: createForm.slot,
      name: mealName,
      image: createForm.image.trim(),
      summary,
      goals: goals.length ? goals : ["general wellness"],
      doshas: doshas.length ? doshas : ["vata", "pitta", "kapha"],
      tags: tags.length ? tags : ["custom"],
      ingredients,
      steps,
      isCustom: true,
    };

    const nextMeals = [nextMeal, ...customMeals];
    saveCustomMeals(nextMeals);
    setShowCreateForm(false);
    setActiveTag("all");
    setSearchParams({ slot: createForm.slot });
    resetCreateForm(createForm.slot);
  };

  const applyMealToDraft = (mealName) => {
    if (!id) {
      navigate("/dashboard/patients");
      return;
    }

    try {
      const rawDraft = sessionStorage.getItem(getPlanDraftStorageKey(id));
      if (!rawDraft) {
        navigate(`/dashboard/patients/${id}`);
        return;
      }

      const draft = JSON.parse(rawDraft);
      const activeMode = draft?.builderMode === "ai" ? "ai" : "manual";
      const sourceDays =
        activeMode === "ai"
          ? Array.isArray(draft.aiDays)
            ? draft.aiDays
            : Array.isArray(draft.days)
              ? draft.days
              : []
          : Array.isArray(draft.manualDays)
            ? draft.manualDays
            : Array.isArray(draft.days)
              ? draft.days
              : [];
      const nextDays = [...sourceDays];

      if (!nextDays[dayIndex]) {
        navigate(`/dashboard/patients/${id}`);
        return;
      }

      nextDays[dayIndex] = {
        ...nextDays[dayIndex],
        [slotKey]: formatMealWithPortion(mealName, slotKey, goal),
      };

      sessionStorage.setItem(
        getPlanDraftStorageKey(id),
        JSON.stringify({
          ...draft,
          showForm: true,
          selectedDayIndex: dayIndex,
          ...(activeMode === "ai"
            ? { aiDays: nextDays }
            : { manualDays: nextDays }),
          days: nextDays,
        })
      );
    } catch (error) {
      console.error("Failed to apply meal to draft", error);
    }

    navigate(`/dashboard/patients/${id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          {isPlanSelectionMode ? (
            <Link to={`/dashboard/patients/${id}`} className="text-sm text-gray-600 hover:underline">
              {"<- Back to Plan Builder"}
            </Link>
          ) : (
            <BackNavLink to="/dashboard" label="Back to Dashboard" className="text-gray-600" />
          )}
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">
            {isPlanSelectionMode ? "Dish Library" : "Meals Cart"}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            {isPlanSelectionMode
              ? `Choose a ${SLOT_LABELS[slotKey]?.toLowerCase() || "meal"} for Day ${
                  dayIndex + 1
                }. It will be added directly to the current plan draft.`
              : "Browse dishes by meal type and keep this page open as a quick doctor reference while creating plans."}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          {isPlanSelectionMode ? (
            <>
              {goal ? `Goal: ${goal}` : "Goal not selected"} |{" "}
              {dosha ? `Dosha: ${dosha}` : "Dosha not selected"}
            </>
          ) : (
            <>Meal Type: {SLOT_LABELS[slotKey] || "Breakfast"}</>
          )}
        </div>
      </div>

      {!isPlanSelectionMode ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-gray-200 bg-white p-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Doctor-created meals</p>
            <p className="text-sm text-gray-600">
              Add your own dishes here and they will also appear while building patient plans.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              resetCreateForm(slotKey);
              setShowCreateForm((current) => !current);
            }}
            className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-black"
          >
            {showCreateForm ? "Close New Dish Form" : "Create New Dish"}
          </button>
        </div>
      ) : null}

      {!isPlanSelectionMode && showCreateForm ? (
        <form
          onSubmit={handleCreateDish}
          className="grid gap-4 rounded-3xl border border-gray-200 bg-white p-5 md:grid-cols-2"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Dish Name</label>
            <input
              type="text"
              value={createForm.name}
              onChange={(event) => handleCreateFormChange("name", event.target.value)}
              placeholder="Example: Methi Thepla with Curd"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-400"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Meal Type</label>
            <select
              value={createForm.slot}
              onChange={(event) => handleCreateFormChange("slot", event.target.value)}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-400"
            >
              {Object.entries(SLOT_LABELS).map(([slot, label]) => (
                <option key={slot} value={slot}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-gray-700">Short Summary</label>
            <input
              type="text"
              value={createForm.summary}
              onChange={(event) => handleCreateFormChange("summary", event.target.value)}
              placeholder="Doctor note about when this dish is useful"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-400"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Tags</label>
            <input
              type="text"
              value={createForm.tags}
              onChange={(event) => handleCreateFormChange("tags", event.target.value)}
              placeholder="high-protein, quick, vegetarian"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-400"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Image URL</label>
            <input
              type="url"
              value={createForm.image}
              onChange={(event) => handleCreateFormChange("image", event.target.value)}
              placeholder="https://..."
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-400"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Goals</label>
            <input
              type="text"
              value={createForm.goals}
              onChange={(event) => handleCreateFormChange("goals", event.target.value)}
              placeholder="weight loss, general wellness"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-400"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Doshas</label>
            <input
              type="text"
              value={createForm.doshas}
              onChange={(event) => handleCreateFormChange("doshas", event.target.value)}
              placeholder="vata, pitta, kapha"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-400"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-gray-700">Ingredients</label>
            <textarea
              value={createForm.ingredients}
              onChange={(event) => handleCreateFormChange("ingredients", event.target.value)}
              placeholder="List ingredients separated by commas"
              className="min-h-[96px] w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-400"
              required
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-gray-700">Recipe Steps</label>
            <textarea
              value={createForm.steps}
              onChange={(event) => handleCreateFormChange("steps", event.target.value)}
              placeholder={"Write one step per line"}
              className="min-h-[120px] w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-400"
              required
            />
          </div>

          <div className="flex flex-wrap gap-3 md:col-span-2">
            <button
              type="submit"
              className="rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-yellow-500"
            >
              Save Dish
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                resetCreateForm(slotKey);
              }}
              className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {!isPlanSelectionMode ? (
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(SLOT_LABELS).map(([slot, label]) => (
            <button
              key={slot}
              type="button"
              onClick={() => handleStandaloneSlotChange(slot)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                slotKey === slot
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-md">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search dishes, ingredients, or tags"
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-gray-400"
          />
        </div>

        {searchTerm.trim() ? (
          <button
            type="button"
            onClick={() => setSearchTerm("")}
            className="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Clear Search
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {activeTags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => setActiveTag(tag)}
            className={`rounded-full px-3 py-2 text-xs font-medium transition ${
              activeTag === tag
                ? "bg-lime-300 text-gray-900"
                : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
            }`}
          >
            {tag === "all" ? "All" : tag.replace("-", " ")}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleMeals.map((meal) => (
          <article
            key={meal.id}
            className="flex h-full flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm"
          >
            <div className="aspect-[16/9] w-full overflow-hidden bg-[#f5f5f0]">
              <MealImage image={resolveMealImageSource(meal, imageLookups)} name={meal.name} />
            </div>

            <div className="flex flex-1 flex-col gap-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 min-h-[3.5rem] text-lg font-semibold text-gray-900">
                    {meal.name}
                  </p>
                  <p className="mt-1 line-clamp-2 min-h-[3rem] text-sm text-gray-600">{meal.summary}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#fff4cf] px-3 py-1 text-xs font-medium text-gray-700">
                  {SLOT_LABELS[meal.slot]}
                </span>
              </div>

              {meal.isCustom ? (
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#eef4d0] px-3 py-1 text-xs font-medium text-gray-700">
                    Doctor Added
                  </span>
                </div>
              ) : null}

              <div className="flex min-h-[2.25rem] flex-wrap gap-2">
                {meal.tags.slice(0, 3).map((tag) => (
                  <span
                    key={`${meal.id}-${tag}`}
                    className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600"
                  >
                    {tag.replace("-", " ")}
                  </span>
                ))}
              </div>

              <div className="grid flex-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-[#fcfcfb] p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Ingredients</p>
                  <div className="mt-3 flex min-h-[8.5rem] flex-wrap content-start gap-2">
                    {meal.ingredients.slice(0, 6).map((ingredient) => (
                      <span
                        key={`${meal.id}-${ingredient}`}
                        className="rounded-full bg-[#eef4d0] px-2.5 py-1 text-xs text-gray-700"
                      >
                        {ingredient}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl bg-[#fcfcfb] p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Recipe</p>
                  <div className="mt-3 min-h-[8.5rem] space-y-2">
                    {meal.steps.slice(0, 3).map((step, index) => (
                      <p key={`${meal.id}-step-${index}`} className="text-sm text-gray-700">
                        {index + 1}. {step}
                      </p>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => applyMealToDraft(meal.name)}
                className="w-full rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-semibold text-black transition hover:bg-yellow-500"
              >
                {isPlanSelectionMode
                  ? `Add To ${SLOT_LABELS[slotKey]} Plan`
                  : "Open Patient Plans To Use Dish"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export default MealLibrary;
