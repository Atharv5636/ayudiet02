import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchJson } from "../../services/api";
import {
  createProgressLog,
  fetchProgressLogs,
} from "../../services/progress.service";
import {
  createPlan,
  explainPlanFromBackend,
  fetchPlansByPatient,
  generatePlanFromBackend,
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

const createMealDay = (index) => ({
  day: `Day ${index + 1}`,
  breakfast: "",
  lunch: "",
  dinner: "",
});

const DEFAULT_PLAN_DAYS = 7;

const createInitialMealDays = (count = DEFAULT_PLAN_DAYS) =>
  Array.from({ length: count }, (_, index) => createMealDay(index));

const average = (values = []) =>
  values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;

const LOW_ADHERENCE_SCORE = 30;
const HIGH_ADHERENCE_SCORE = 100;

const normalizeAdherenceValue = (value) => {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? HIGH_ADHERENCE_SCORE : LOW_ADHERENCE_SCORE;
  }

  return null;
};

function PatientDetails() {
  const { id } = useParams();

  const [patient, setPatient] = useState(null);
  const [patientLoading, setPatientLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [dosha, setDosha] = useState("");
  const [date, setDate] = useState("");
  const [days, setDays] = useState(createInitialMealDays());
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
    digestion: "good",
    adherence: false,
    notes: "",
  });
  const [toast, setToast] = useState("");
  const [progressPage, setProgressPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const PROGRESS_LOGS_PER_PAGE = 2;
  const PLAN_HISTORY_PER_PAGE = 4;

  const plans = usePlansStore((state) => state.patientPlans[id]);
  const setPatientPlans = usePlansStore((state) => state.setPatientPlans);
  const upsertPatientPlan = usePlansStore((state) => state.upsertPatientPlan);

  const visiblePlans = plans || [];
  const activePlan = visiblePlans.find((plan) => plan.isActive) || null;
  const loading = patientLoading || plansLoading;
  const builderValidation = useMemo(
    () => validatePlan(days, dosha),
    [days, dosha]
  );
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
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
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

  const resetBuilder = () => {
    setShowForm(false);
    setEditingPlanId(null);
    setTitle("");
    setGoal("");
    setDosha("");
    setDate("");
    setDays(createInitialMealDays());
    setBuilderMode("manual");
    setSelectedDayIndex(0);
    setAutoFixChanges([]);
    setLastGeneratedContext(null);
    setLastProgressInsights([]);
  };

  const startEditingPlan = (plan) => {
    setShowForm(true);
    setEditingPlanId(plan._id);
    setTitle(plan.title || "");
    setDosha(plan.doshaType || "");
    setDate(
      plan.reviewDueDate
        ? new Date(plan.reviewDueDate).toISOString().slice(0, 10)
        : ""
    );
    setDays(
      plan.meals?.length
        ? plan.meals.map((meal, index) => ({
            day: meal.day || `Day ${index + 1}`,
            breakfast: meal.breakfast || "",
            lunch: meal.lunch || "",
            dinner: meal.dinner || "",
          }))
        : createInitialMealDays()
    );
    setBuilderMode("manual");
    setSelectedDayIndex(0);
    setAutoFixChanges([]);
    setLastGeneratedContext(null);
    setLastProgressInsights([]);
  };

  const updateDayField = (index, field, value) => {
    setAutoFixChanges([]);
    setDays((currentDays) =>
      currentDays.map((day, dayIndex) =>
        dayIndex === index ? { ...day, [field]: value } : day
      )
    );
  };

  const applyGeneratedDietPlanToBuilder = (dietPlan) => {
    if (!dietPlan) {
      return;
    }

    setDays((currentDays) => {
      const nextDays = Array.isArray(currentDays) && currentDays.length
        ? [...currentDays]
        : createInitialMealDays();

      if (Array.isArray(dietPlan)) {
        for (let index = 0; index < nextDays.length; index += 1) {
          const meal = dietPlan[index] || dietPlan[dietPlan.length - 1] || {};
          nextDays[index] = {
            ...nextDays[index],
            breakfast: meal.breakfast || "",
            lunch: meal.lunch || "",
            dinner: meal.dinner || "",
          };
        }
      } else {
        for (let index = 0; index < nextDays.length; index += 1) {
          nextDays[index] = {
            ...nextDays[index],
            breakfast: dietPlan.breakfast || "",
            lunch: dietPlan.lunch || "",
            dinner: dietPlan.dinner || "",
          };
        }
      }

      return nextDays;
    });
  };

  const addDay = () => {
    setAutoFixChanges([]);
    setBuilderMode("manual");
    setDays((currentDays) => [...currentDays, createMealDay(currentDays.length)]);
  };

  const removeDay = (index) => {
    setAutoFixChanges([]);
    setDays((currentDays) => {
      if (currentDays.length === 1) {
        return currentDays;
      }

      return currentDays
        .filter((_, dayIndex) => dayIndex !== index)
        .map((day, dayIndex) => ({
          ...day,
          day: `Day ${dayIndex + 1}`,
        }));
    });
  };

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  };

  const fetchProgress = useCallback(async () => {
    try {
      setProgressLoading(true);
      const logs = await fetchProgressLogs(id);
      const normalizedLogs = Array.isArray(logs) ? logs : [];
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
      Math.min(currentIndex, Math.max(days.length - 1, 0))
    );
  }, [days.length]);

  const handleProgressFieldChange = (field, value) => {
    setProgressForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

      const handleGeneratePlan = async (planInput = null) => {
    const symptoms =
      planInput?.primaryIssue || goal.trim() || patient?.healthConditions || "";
    if (!symptoms) {
      alert("Enter goal or symptoms before generation");
      return;
    }
    try {
      setIsGeneratingAi(true);
      const result = await generatePlanFromBackend({
        symptoms,
      });
      const profile = result || {};
      const confidence =
        typeof profile?.confidence === "number" ? profile.confidence : 0;
      const patientWithProgress = {
        ...patient,
        progressLogs,
      };
      const baseDietPlan = buildWeeklyDietPlan(profile, days.length || DEFAULT_PLAN_DAYS);
      let dietPlan = baseDietPlan;
      const progression = analyzeProgress(patientWithProgress.progressLogs || []);
      const trend = progression?.trend || "stable";
      const trendConfidence =
        typeof progression?.confidence === "number" ? progression.confidence : 0.4;
      dietPlan = adjustPlanByTrend(dietPlan, trend);
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
        confidence < 0.4 ? "Low confidence" : `Confidence: ${formatted.score}%`;
      setAutoFixChanges([]);
      setGeneratedDietPlan(
        Array.isArray(formatted.dietPlan)
          ? formatted.dietPlan[0] || buildDietPlan(profile)
          : formatted.dietPlan
      );
      applyGeneratedDietPlanToBuilder(formatted.dietPlan);
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
      if (confidence < 0.4) {
        showToast("Low confidence result. Please review manually before approving.");
      } else {
        showToast("Profile analysis generated successfully");
      }
    } catch (error) {
      console.error("Error generating profile analysis:", error);
      alert(error.message || "Failed to generate profile analysis");
    } finally {
      setIsGeneratingAi(false);
    }
  };
  const handleGenerateWithAi = () => handleGeneratePlan();

  const applyDeterministicAutoImprove = (trend) => {
    setDays((currentDays) => {
      if (!Array.isArray(currentDays) || currentDays.length === 0) {
        return currentDays;
      }

      const normalizedPlan = currentDays.map((day) => ({
        breakfast: day?.breakfast || "",
        lunch: day?.lunch || "",
        dinner: day?.dinner || "",
      }));

      const improvedPlan = adjustPlanByTrend(normalizedPlan, trend);
      if (!Array.isArray(improvedPlan)) {
        return currentDays;
      }

      return currentDays.map((day, index) => ({
        ...day,
        breakfast: improvedPlan[index]?.breakfast ?? day.breakfast,
        lunch: improvedPlan[index]?.lunch ?? day.lunch,
        dinner: improvedPlan[index]?.dinner ?? day.dinner,
      }));
    });
  };

  const dayEntries = days[selectedDayIndex]
    ? [{ day: days[selectedDayIndex], index: selectedDayIndex }]
    : [];
  const handleAutoImprovePlan = async () => {
    const symptoms = goal.trim() || patient?.healthConditions || "";
    if (!symptoms) {
      alert("Enter goal or symptoms before explain");
      return;
    }

    try {
      setIsImprovingPlan(true);

      const result = await explainPlanFromBackend({
        symptoms,
      });
      const progression = analyzeProgress(progressLogs || []);
      const trend = progression?.trend || "stable";
      applyDeterministicAutoImprove(trend);
      const explainChanges = [];

      if (Array.isArray(result?.risk_flags) && result.risk_flags.length > 0) {
        explainChanges.push(`Risk Flags: ${result.risk_flags.join(", ")}`);
      }
      if (result?.primary_dosha) {
        explainChanges.push(`Primary Dosha: ${result.primary_dosha}`);
      }
      if (typeof result?.confidence === "number") {
        const confidencePercent = Math.round(result.confidence * 100);
        explainChanges.push(
          result.confidence < 0.4
            ? "Low confidence result. Please review manually before approving."
            : `Confidence: ${confidencePercent}%`
        );
      }
      explainChanges.push(
        `Auto-improvement applied using deterministic trend logic (${trend})`
      );

      setAutoFixChanges(
        explainChanges.length > 0
          ? explainChanges
          : ["No explainability details were returned."]
      );
      showToast("Explainability response loaded");
    } catch (error) {
      console.error("Error loading explainability response:", error);
      alert(error.message || "Failed to load explainability response");
    } finally {
      setIsImprovingPlan(false);
    }
  };

  async function handleSubmitPlan() {
    const normalizedDays = days.map((day, index) => ({
      day: day.day.trim() || `Day ${index + 1}`,
      breakfast: day.breakfast.trim(),
      lunch: day.lunch.trim(),
      dinner: day.dinner.trim(),
    }));

    const hasInvalidDay = normalizedDays.some(
      (day) => !day.breakfast && !day.lunch && !day.dinner
    );

    if (!title.trim() || !dosha || !date) {
      alert("Title, dosha type, and review date are required");
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
          doshaType: dosha,
          reviewDueDate: date,
          meals: normalizedDays,
        });

        upsertPatientPlan(id, updatedPlan);
      } else {
        const createdPlan = await createPlan({
          patient: id,
          title: title.trim(),
          doshaType: dosha,
          reviewDueDate: date,
          meals: normalizedDays,
        });

        setPatientPlans(id, [createdPlan, ...visiblePlans]);
      }

      resetBuilder();
    } catch (error) {
      console.error("Error saving plan:", error);
      alert(error.message || "Failed to save plan");
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
        weight: Number(progressForm.weight),
        energy: Number(progressForm.energyLevel),
        energyLevel: Number(progressForm.energyLevel),
        digestion: progressForm.digestion,
        adherence: progressForm.adherence ? 100 : 30,
        notes: progressForm.notes,
      });

      await Promise.all([fetchProgress(), fetchPatientPlans()]);
      setProgressForm((current) => ({
        ...current,
        energyLevel: "3",
        digestion: "good",
        adherence: false,
        notes: "",
      }));
      showToast("Progress log saved");
    } catch (error) {
      console.error("Error saving progress log:", error);
      alert(error.message || "Failed to save progress log");
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
        Back to Dashboard
      </Link>

      <div className="space-y-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-6  md:p-7">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
            {patient?.name}
          </h1>
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

          {activePlan ? (
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
                      {new Date(activePlan.reviewDueDate).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEditingPlan(activePlan)}
                    className="text-sm font-medium text-gray-800 transition hover:text-black"
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
          )}

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
                  onChange={(e) => setTitle(e.target.value)}
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

                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                />
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
                        disabled={isGeneratingAi}
                        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 transition hover:bg-black hover:text-white disabled:opacity-60"
                      >
                        {isGeneratingAi
                          ? "Generating diet plan..."
                          : "Generate with AI"}
                      </button>
                      <button
                        type="button"
                        onClick={handleAutoImprovePlan}
                        disabled={isImprovingPlan}
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

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="mb-2 text-xs uppercase tracking-[0.15em] text-gray-500">
                      {builderMode === "ai" ? "Week Day Selector" : "Day Selector"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {days.map((day, index) => (
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

                          {builderMode !== "ai" && days.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeDay(index)}
                              className="text-sm font-medium text-gray-600 transition hover:text-gray-600"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          <MealEditor
                            icon="Sunrise"
                            label="Breakfast"
                            value={day.breakfast}
                            onChange={(value) =>
                              updateDayField(index, "breakfast", value)
                            }
                          />
                          <MealEditor
                            icon="Sun"
                            label="Lunch"
                            value={day.lunch}
                            onChange={(value) =>
                              updateDayField(index, "lunch", value)
                            }
                          />
                          <MealEditor
                            icon="Moon"
                            label="Dinner"
                            value={day.dinner}
                            onChange={(value) =>
                              updateDayField(index, "dinner", value)
                            }
                          />
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
                            {plan.status} | Created{" "}
                            {new Date(plan.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              startEditingPlan(plan);
                            }}
                            className="text-sm font-medium text-gray-800 transition hover:text-black"
                          >
                            Edit Plan
                          </button>
                          <span className="text-sm text-gray-700">
                            {isExpanded ? "Hide meals" : "View meals"}
                          </span>
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

                <label className="flex items-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-3">
                  <input
                    type="checkbox"
                    checked={progressForm.adherence}
                    onChange={(event) =>
                      handleProgressFieldChange("adherence", event.target.checked)
                    }
                    className="h-4 w-4 rounded border-gray-300 bg-transparent"
                  />
                  <span className="text-sm text-gray-700">
                    Patient followed the plan
                  </span>
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
                          {new Date(log.createdAt).toLocaleDateString()}
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
                        <p>Digestion: {log.digestion || "-"}</p>
                        <p>
                          Adherence:{" "}
                          {typeof log.adherence === "number"
                            ? `${log.adherence}%`
                            : log.adherence
                              ? "100%"
                              : "30%"}
                        </p>
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

  useEffect(() => {
    setSelectedDayIndex((current) =>
      Math.min(current, Math.max((meals?.length || 1) - 1, 0))
    );
  }, [meals?.length]);

  if (!meals.length) {
    return <p className="text-sm text-gray-600">No meals added.</p>;
  }

  if (compact) {
    const selectedMeal = meals[selectedDayIndex] || meals[0];

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
                  selectedDayIndex === index
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
          <div className="grid gap-3 md:grid-cols-3">
            <MealDisplay
              icon="Sunrise"
              label="Breakfast"
              value={selectedMeal?.breakfast}
            />
            <MealDisplay icon="Sun" label="Lunch" value={selectedMeal?.lunch} />
            <MealDisplay icon="Moon" label="Dinner" value={selectedMeal?.dinner} />
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
          <div className="grid gap-3 md:grid-cols-3">
            <MealDisplay
              icon="Sunrise"
              label="Breakfast"
              value={mealDay.breakfast}
            />
            <MealDisplay icon="Sun" label="Lunch" value={mealDay.lunch} />
            <MealDisplay icon="Moon" label="Dinner" value={mealDay.dinner} />
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

  const { score, issues, suggestions } = validation;
  const badgeClasses = score < 5 ? "bg-black text-white" : "bg-gray-100 text-gray-700";

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
          Score: {score}/10
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-xl bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-600">Warning Issues</p>
          <p className="text-xs text-gray-600">Review these items first</p>
          {issues.length ? (
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
          {suggestions.length ? (
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

function MealEditor({ icon, label, value, onChange }) {
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{label}</p>
          <p className="text-xs text-gray-500">Add meal details</p>
        </div>
      </div>

      <textarea
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-28 w-full resize-none rounded-xl border border-gray-300 bg-white p-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-gray-400 focus:outline-none"
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







