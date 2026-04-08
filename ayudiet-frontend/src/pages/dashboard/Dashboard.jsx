import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import PlansAwaitingReview from "../../components/dashboard/PlansAwaitingReview";
import TodaysAgenda from "../../components/dashboard/TodaysAgenda";
import PatientProgressChart from "../../components/dashboard/PatientProgressChart";
import { getTrend, getTrendColor, getTrendLabel } from "@/utils/trendUtils";

import {
  approvePlan,
  fetchActivePlans,
  fetchPendingPlans,
  rejectPlan,
} from "../../services/plan.service";
import { fetchJson } from "../../services/api";

const AGENDA_STORAGE_KEY = "agenda";

const ACTIVE_SEGMENTS_BY_DIGIT = {
  0: ["a", "b", "c", "d", "e", "f"],
  1: ["b", "c"],
  2: ["a", "b", "g", "e", "d"],
  3: ["a", "b", "g", "c", "d"],
  4: ["f", "g", "b", "c"],
  5: ["a", "f", "g", "c", "d"],
  6: ["a", "f", "g", "e", "c", "d"],
  7: ["a", "b", "c"],
  8: ["a", "b", "c", "d", "e", "f", "g"],
  9: ["a", "b", "c", "d", "f", "g"],
};

const getObjectIdTimestamp = (id) => {
  if (typeof id !== "string" || id.length < 8) return Number.NaN;
  const parsed = Number.parseInt(id.slice(0, 8), 16);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return parsed * 1000;
};

const getHistoryTimestamp = (item, fallbackIndex = 0) => {
  const directDate = item?.date || item?.recordedAt || item?.createdAt || item?.loggedAt || null;
  const directTime = directDate ? new Date(directDate).getTime() : Number.NaN;
  if (Number.isFinite(directTime) && directTime > 0) {
    return directTime;
  }

  const idTime = getObjectIdTimestamp(
    typeof item?._id === "string" ? item._id : typeof item?.id === "string" ? item.id : ""
  );
  if (Number.isFinite(idTime)) {
    return idTime;
  }

  return fallbackIndex;
};

function SevenSegmentDigit({ digit }) {
  const activeSegments = ACTIVE_SEGMENTS_BY_DIGIT[digit] || [];
  const isOn = (segment) => activeSegments.includes(segment);

  return (
    <span className="relative inline-block h-16 w-9" aria-hidden="true">
      <span
        className={`absolute left-2 right-2 top-0 h-1.5 rounded-[2px] ${
          isOn("a") ? "bg-gray-900" : "bg-gray-300/30"
        }`}
      />
      <span
        className={`absolute right-0 top-1 h-6 w-1.5 rounded-[2px] ${
          isOn("b") ? "bg-gray-900" : "bg-gray-300/30"
        }`}
      />
      <span
        className={`absolute right-0 bottom-1 h-6 w-1.5 rounded-[2px] ${
          isOn("c") ? "bg-gray-900" : "bg-gray-300/30"
        }`}
      />
      <span
        className={`absolute left-2 right-2 bottom-0 h-1.5 rounded-[2px] ${
          isOn("d") ? "bg-gray-900" : "bg-gray-300/30"
        }`}
      />
      <span
        className={`absolute left-0 bottom-1 h-6 w-1.5 rounded-[2px] ${
          isOn("e") ? "bg-gray-900" : "bg-gray-300/30"
        }`}
      />
      <span
        className={`absolute left-0 top-1 h-6 w-1.5 rounded-[2px] ${
          isOn("f") ? "bg-gray-900" : "bg-gray-300/30"
        }`}
      />
      <span
        className={`absolute left-2 right-2 top-1/2 h-1.5 -translate-y-1/2 rounded-[2px] ${
          isOn("g") ? "bg-gray-900" : "bg-gray-300/30"
        }`}
      />
    </span>
  );
}

function SevenSegmentNumber({ value }) {
  const digits = String(value ?? 0)
    .split("")
    .filter((char) => /\d/.test(char))
    .map((char) => Number(char));

  return (
    <div className="flex items-center justify-center gap-1" aria-label={`Count ${value}`}>
      {digits.map((digit, index) => (
        <SevenSegmentDigit key={`${digit}-${index}`} digit={digit} />
      ))}
    </div>
  );
}

function Dashboard() {
  const [patients, setPatients] = useState([]);
  const [toast, setToast] = useState("");
  const [agenda, setAgenda] = useState(() => {
    try {
      const storedAgenda = localStorage.getItem(AGENDA_STORAGE_KEY);
      return storedAgenda ? JSON.parse(storedAgenda) : [];
    } catch {
      return [];
    }
  });
  const [message, setMessage] = useState("");
  const [selectedActivePlan, setSelectedActivePlan] = useState(null);
  const [pendingPlans, setPendingPlans] = useState([]);
  const [activePlans, setActivePlans] = useState([]);
  const [activePlansError, setActivePlansError] = useState("");
  const [showMockData, setShowMockData] = useState(true);
  const [appliedPlans, _setAppliedPlans] = useState({});
  const [loadingPlans, setLoadingPlans] = useState({});
  const [activePlanPage, setActivePlanPage] = useState(1);
  const [criticalPatientPage, setCriticalPatientPage] = useState(1);
  const ACTIVE_PLANS_PER_PAGE = 3;
  const CRITICAL_PATIENTS_PER_PAGE = 3;

  const filteredPlans = useMemo(() => {
    if (showMockData) return activePlans;

    return activePlans.filter(
      (plan) => !(plan?.isMock || plan?.patient?.isMock)
    );
  }, [activePlans, showMockData]);

  const getPlanAnalysis = useCallback(
    (entry) =>
      entry?.analysis ||
      entry?.adaptiveAnalysis ||
      entry?.latestAnalysis ||
      entry?.insights ||
      entry?.planAnalysis ||
      null,
    []
  );

  const getTrendValue = (entry) => {
    const trend = getPlanAnalysis(entry)?.effectivenessTrend || entry?.effectivenessTrend;

    if (
      typeof trend?.previous === "number" &&
      typeof trend?.current === "number"
    ) {
      return getTrend(trend.previous, trend.current);
    }

    return "stable";
  };

  const getTrendDelta = (entry) => {
    const trend = getPlanAnalysis(entry)?.effectivenessTrend || entry?.effectivenessTrend;

    if (
      typeof trend?.previous === "number" &&
      typeof trend?.current === "number"
    ) {
      return `${trend.previous} -> ${trend.current}`;
    }

    return "No delta";
  };

  const getEffectivenessScore = (entry) =>
    getPlanAnalysis(entry)?.effectiveness?.score ??
    entry?.effectiveness?.score ??
    null;

  const getPrimaryIssue = (entry) => {
    const rawAnalysisIssue =
      getPlanAnalysis(entry)?.primaryIssue || entry?.primaryIssue || "";
    const analysisIssue = String(rawAnalysisIssue).trim();
    const normalizedAnalysisIssue = analysisIssue.toLowerCase();
    const isPlaceholderIssue = [
      "",
      "-",
      "none",
      "n/a",
      "na",
      "null",
      "undefined",
      "unknown",
    ].includes(normalizedAnalysisIssue);
    if (!isPlaceholderIssue) {
      return analysisIssue;
    }

    const validationIssues = Array.isArray(entry?.validation?.issues)
      ? entry.validation.issues
      : [];
    const firstValidationIssue = validationIssues.find(
      (issue) => typeof issue === "string" && issue.trim()
    );
    if (firstValidationIssue) {
      return firstValidationIssue
        .replace(/^warning\s*/i, "")
        .replace(/^issue\s*/i, "")
        .trim();
    }

    const riskFlags = Array.isArray(entry?.risk_flags) ? entry.risk_flags : [];
    if (riskFlags.length > 0 && !riskFlags.includes("none")) {
      return riskFlags
        .map((flag) => String(flag).replaceAll("_", " "))
        .join(", ");
    }

    return "Insufficient progress data";
  };

  const getReasonSummary = (entry) =>
    getPlanAnalysis(entry)?.reasonSummary ||
    entry?.reasonSummary ||
    "No insight summary available.";

  const getExpectedImpact = (entry) =>
    getPlanAnalysis(entry)?.expectedImpact ||
    entry?.expectedImpact ||
    "No expected impact available.";

  const getAttentionScore = useCallback((plan) => {
    let score = 0;

    const analysis = plan?.analysis || getPlanAnalysis(plan) || {};
    const effectiveness =
      typeof analysis?.effectiveness === "number"
        ? analysis.effectiveness
        : analysis?.effectiveness?.score ||
          (typeof plan?.dashboardIntelligence?.score === "number"
            ? plan.dashboardIntelligence.score
            : 0);

    const trendInfo = analysis?.effectivenessTrend || plan?.effectivenessTrend;
    const trend = getTrend(trendInfo?.previous, trendInfo?.current);
    const issue = (
      analysis?.primaryIssue ||
      plan?.dashboardIntelligence?.primaryIssue ||
      ""
    ).toLowerCase();

    if (effectiveness < 40) score += 3;
    else if (effectiveness < 55) score += 2;
    else if (effectiveness < 75) score += 1;

    if (trend === "down") score += 3;
    else if (trend === "stable") score += 1;

    if (issue.includes("adherence")) score += 2;
    if (issue.includes("energy")) score += 1;
    if (issue.includes("progress")) score += 1;

    return score;
  }, [getPlanAnalysis]);

  function getPriorityLabel(score) {
    if (score >= 6) return "Critical";
    if (score >= 4) return "Moderate";
    return "Stable";
  }
  function getRelativeTime(computedAt) {
    if (!computedAt) return null;

    const dateObj = new Date(computedAt);
    if (isNaN(dateObj.getTime())) return null;

    const diffMs = Math.max(0, Date.now() - dateObj.getTime());
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin} min ago`;

    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr} hr ago`;
  }

  function extractStartEndFromReason(reason) {
    if (!reason || typeof reason !== "string") return null;

    // Supports patterns like: "55% -> 42%" or "2 ? 1"
    const match = reason.match(
      /from\s*(-?\d+(?:\.\d+)?)\s*(%|kg)?\s*(?:->|\u2192)\s*(-?\d+(?:\.\d+)?)\s*(%|kg)?/i
    );

    if (!match) return null;

    const start = Number(match[1]);
    const end = Number(match[3]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

    const unit = match[2] || match[4] || "";
    return { start, end, unit };
  }

  function formatPhone(phone) {
    if (!phone) return null;

    let cleaned = String(phone).replace(/[^0-9]/g, "");

    if (cleaned.startsWith("00")) {
      cleaned = cleaned.slice(2);
    } else if (cleaned.startsWith("0")) {
      cleaned = cleaned.slice(1);
    }

    if (cleaned.length === 10) {
      return `91${cleaned}`;
    }

    if (cleaned.length >= 11 && cleaned.length <= 13) {
      return cleaned;
    }

    return null;
  }

  function buildMessage(plan) {
    const name = plan?.patient?.name || "there";
    const issue = (plan?.analysis?.primaryIssue || "progress").toLowerCase();

    if (issue.includes("adherence")) {
      return `Hi ${name}, I noticed your diet adherence has dropped recently. Let's simplify your plan and get back on track.`;
    }

    if (issue.includes("energy")) {
      return `Hi ${name}, your energy levels seem low recently. We may need to adjust your calorie intake.`;
    }

    if (issue.includes("progress")) {
      return `Hi ${name}, your progress has slowed. Let's review your plan and make adjustments.`;
    }

    return `Hi ${name}, I reviewed your plan and would like to help you improve your results.`;
  }

  function handleSendMessage(plan, formattedPhone) {
    if (!formattedPhone) {
      alert("The phone number is missing or invalid.");
      return;
    }

    const message = encodeURIComponent(buildMessage(plan));
    const url = `https://wa.me/${formattedPhone}?text=${message}`;
    const newWindow = window.open(url, "_blank");

    if (!newWindow) {
      alert("Popup blocked. Please allow popups for this site.");
    }
  }

  const isImmediateAttention = (plan) => (plan?.attentionScore ?? 0) >= 5;

  const formatTrendLabel = (trend) => getTrendLabel(trend);

  const getTrendMeta = (trend) => {
    if (trend === "down") {
      return {
        icon: ArrowDownRight,
        className: "text-red-600",
        chipClassName: "bg-black text-white",
      };
    }

    if (trend === "up") {
      return {
        icon: ArrowUpRight,
        className: "text-green-600",
        chipClassName: "bg-gray-100 text-gray-700",
      };
    }

    return {
      icon: Minus,
      className: "text-gray-700",
      chipClassName: "bg-gray-100 text-gray-700",
    };
  };

  const formatPlanDuration = (plan) => {
    if (Array.isArray(plan?.meals) && plan.meals.length > 0) {
      return `${plan.meals.length} day${plan.meals.length > 1 ? "s" : ""}`;
    }

    if (plan?.startDate && plan?.reviewDueDate) {
      const totalDays = Math.max(
        1,
        Math.ceil(
          (new Date(plan.reviewDueDate) - new Date(plan.startDate)) /
            (1000 * 60 * 60 * 24)
        )
      );
      return `${totalDays} day${totalDays > 1 ? "s" : ""}`;
    }

    return "Duration unavailable";
  };

  const plansWithScore = useMemo(() => {
    return filteredPlans.map((plan) => ({
      ...plan,
      attentionScore: getAttentionScore(plan),
    }));
  }, [filteredPlans, getAttentionScore]);

  const patientsNeedingAttention = plansWithScore.filter(
    (plan) => plan.attentionScore >= 5
  ).length;

  const decliningPlans = plansWithScore.filter(
    (plan) =>
      getTrendValue(plan) === "down"
  ).length;

  const lowAdherenceCases = plansWithScore.filter((plan) => {
    const issue = plan.analysis?.primaryIssue || "";
    return issue.toLowerCase().includes("adherence");
  }).length;

  const sortedCriticalPatients = useMemo(() => {
    return [...plansWithScore].sort((a, b) => b.attentionScore - a.attentionScore);
  }, [plansWithScore]);

  const totalCriticalPatientPages = Math.max(
    1,
    Math.ceil(sortedCriticalPatients.length / CRITICAL_PATIENTS_PER_PAGE)
  );

  const paginatedCriticalPatients = useMemo(() => {
    const start = (criticalPatientPage - 1) * CRITICAL_PATIENTS_PER_PAGE;
    return sortedCriticalPatients.slice(start, start + CRITICAL_PATIENTS_PER_PAGE);
  }, [sortedCriticalPatients, criticalPatientPage]);

  const criticalPatientsStartIndex =
    (criticalPatientPage - 1) * CRITICAL_PATIENTS_PER_PAGE;
  const criticalPatientsEndIndex = Math.min(
    criticalPatientsStartIndex + CRITICAL_PATIENTS_PER_PAGE,
    sortedCriticalPatients.length
  );

  const sortedActivePlans = useMemo(() => {
    return [...plansWithScore].sort(
      (a, b) => b.attentionScore - a.attentionScore
    );
  }, [plansWithScore]);

  const totalActivePlanPages = Math.max(
    1,
    Math.ceil(sortedActivePlans.length / ACTIVE_PLANS_PER_PAGE)
  );

  const paginatedActivePlans = useMemo(() => {
    const start = (activePlanPage - 1) * ACTIVE_PLANS_PER_PAGE;
    return sortedActivePlans.slice(start, start + ACTIVE_PLANS_PER_PAGE);
  }, [sortedActivePlans, activePlanPage]);

  const activePlansStartIndex = (activePlanPage - 1) * ACTIVE_PLANS_PER_PAGE;
  const activePlansEndIndex = Math.min(
    activePlansStartIndex + ACTIVE_PLANS_PER_PAGE,
    sortedActivePlans.length
  );

  console.log("CRITICAL DEBUG:", {
    total: plansWithScore.length,
    selected: paginatedCriticalPatients.length,
    scores: plansWithScore.map((p) => p.attentionScore),
  });

  const nextAgendaId =
    agenda.find((item) => item.status !== "completed")?.id || null;

  const loadPendingPlans = async () => {
    try {
      const data = await fetchPendingPlans();
      setPendingPlans(data?.plans || []);
    } catch (error) {
      console.error(error);
      setPendingPlans([]);
    }
  };

  const loadActivePlans = async () => {
    try {
      const data = await fetchActivePlans();
      setActivePlansError("");
      setActivePlans(data?.plans || []);
    } catch (error) {
      console.error(error);
      setActivePlansError(error?.message || "Unable to load active plan insights.");
      setActivePlans([]);
    }
  };

  const showToast = (value) => {
    setToast(value);
    window.setTimeout(() => setToast(""), 2000);
  };

  const handleApprove = async (planId) => {
    console.log("APPROVE CLICKED:", planId);

    try {
      await approvePlan(planId);
      await Promise.all([loadPendingPlans(), loadActivePlans()]);
      showToast("The plan was approved successfully.");
    } catch (error) {
      console.error("APPROVE ERROR:", error);
      showToast("Unable to approve the plan.");
      throw error;
    }
  };

  const handleReject = async (planId) => {
    const previousPendingPlans = pendingPlans;
    setPendingPlans((prevPlans) =>
      prevPlans.filter((plan) => plan?._id !== planId)
    );

    try {
      await rejectPlan(planId);
      await loadPendingPlans();
    } catch (error) {
      console.error(error);
      setPendingPlans(previousPendingPlans);
      throw error;
    }
  };

  const handleDeleteAgenda = (id) => {
    if (!window.confirm("Delete this agenda item?")) return;
    setAgenda((prevAgenda) => prevAgenda.filter((item) => item.id !== id));
  };

  const handleAddAgenda = (agendaItem) => {
    setAgenda((prevAgenda) => [...prevAgenda, agendaItem]);
  };

  async function handleApplyChanges(plan) {
    if (!plan?._id) return;

    const planId = String(plan?._id);

    if (loadingPlans[planId] || plan?.adjustmentsApplied) return;
    if (!plan?.adjustments?.length) return;

    const token = localStorage.getItem("token");

    if (!token) {
      alert("Session expired. Please log in again.");
      return;
    }

    setLoadingPlans((prev) => ({
      ...prev,
      [planId]: true,
    }));

    try {
      const response = await fetchJson(`/plans/${planId}/apply-adjustments`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response || !response.plan) {
        throw new Error("Invalid server response.");
      }

      const updatedPlan = response.plan;

      setActivePlans((prevPlans) =>
        prevPlans.map((item) =>
          String(item?._id) === planId ? updatedPlan : item
        )
      );

      alert(response?.message || "Changes were applied successfully.");
    } catch (error) {
      console.error("Failed to apply adjustments:", error);
      alert("Unable to apply changes. Please try again.");
    } finally {
      setLoadingPlans((prev) => ({
        ...prev,
        [planId]: false,
      }));
    }
  }

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const token = localStorage.getItem("token");
        const patientsResponse = await fetchJson("/patients", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const loadedPatients = patientsResponse.patients || [];

        setPatients(loadedPatients);
        setMessage("");

        await Promise.all([
          loadPendingPlans(),
          loadActivePlans(),
        ]);
      } catch (error) {
        setMessage(error.message || "Unable to load dashboard data.");
        console.error("Failed to fetch plans", error);
      }
    };

    loadDashboard();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(AGENDA_STORAGE_KEY, JSON.stringify(agenda));
    } catch (error) {
      console.error("Failed to save agenda to localStorage", error);
    }
  }, [agenda]);

  useEffect(() => {
    setActivePlanPage(1);
  }, [sortedActivePlans.length]);

  useEffect(() => {
    setCriticalPatientPage(1);
  }, [sortedCriticalPatients.length]);

  return (
    <>
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-md bg-black px-4 py-2 text-white shadow-sm">
          {toast}
        </div>
      )}

      <div className="min-h-screen text-gray-900">
        <div className="w-full px-4 py-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Dashboard Overview
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Review decision signals and act on patients who need support
          </p>
          <button
            onClick={() => setShowMockData((prev) => !prev)}
            className="mt-2 rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-800 transition hover:bg-black hover:text-white"
          >
            {showMockData ? "Hide Mock Data" : "Show Mock Data"}
          </button>
        </div>

        <div className="grid gap-6 xl:grid-cols-12">
          <div className="grid gap-4 md:grid-cols-3 xl:col-span-8 2xl:col-span-9">
            {[
              {
                title: "Patients Needing Attention",
                key: "needs-attention",
                value: patientsNeedingAttention,
                note:
                  patientsNeedingAttention > 0
                    ? `${patientsNeedingAttention} patient(s) need attention`
                    : "No patients need attention",
              },
              {
                title: "Declining Plans",
                key: "declining-plans",
                value: decliningPlans,
                note: "Plans showing downward momentum",
              },
              {
                title: "Low Adherence Cases",
                key: "low-adherence",
                value: lowAdherenceCases,
                note: "Primary issue is adherence",
              },
            ].map((card) => (
              <div
                key={card.key}
                className="relative flex min-h-[300px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md"
              >
                <p className="text-gray-900 font-semibold">{card.title}</p>

                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <SevenSegmentNumber value={card.value} />
                  <p className="mt-3 text-sm text-gray-700">{card.note}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md xl:col-span-4 2xl:col-span-3">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Top Critical Patients</h2>
              <p className="mt-1 text-sm text-gray-600">
                Highest-priority cases based on score, trend, and adherence risk.
              </p>
            </div>

            <div className="space-y-4">
              {plansWithScore.length === 0 ? (
                <p className="text-sm text-gray-600">No data available</p>
              ) : paginatedCriticalPatients.length === 0 ? (
                <p className="text-sm text-gray-600">No high-risk patients</p>
              ) : (
                paginatedCriticalPatients.map((plan) => {
                  const patientName = plan?.patient?.name || "Unknown";
                  const trend = getTrendValue(plan);
                  const trendLabel = getTrendLabel(trend);
                  const issue = getPrimaryIssue(plan);
                  const issueLabel =
                    issue && !["-", "none", "n/a", "unknown"].includes(String(issue).toLowerCase())
                      ? issue
                      : "No major issue";
                  const priorityLabel = getPriorityLabel(plan.attentionScore);
                  const priorityTone =
                    priorityLabel === "Critical"
                      ? "bg-gray-100 text-gray-700 ring-1 ring-gray-200 underline decoration-red-600 decoration-2 underline-offset-4"
                      : priorityLabel === "Moderate"
                        ? "bg-gray-100 text-gray-700 ring-1 ring-gray-200 underline decoration-amber-600 decoration-2 underline-offset-4"
                        : "bg-gray-100 text-gray-700 ring-1 ring-gray-200 underline decoration-emerald-600 decoration-2 underline-offset-4";

                  return (
                    <div
                      key={plan._id}
                      className="rounded-xl border border-gray-200 bg-white p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-base font-semibold text-gray-900">{patientName}</p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${priorityTone}`}
                        >
                          {priorityLabel}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700 ring-1 ring-gray-200">
                          Trend: {trendLabel}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700 ring-1 ring-gray-200">
                          Score: {plan.attentionScore}
                        </span>
                      </div>

                      <p className="mt-2 text-xs text-gray-600">Issue: {issueLabel}</p>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-4 border-t border-gray-200 pt-3">
              <div className="flex items-center justify-center gap-6 sm:gap-10">
                <button
                  type="button"
                  onClick={() => setCriticalPatientPage((p) => Math.max(p - 1, 1))}
                  disabled={
                    criticalPatientPage === 1 || sortedCriticalPatients.length === 0
                  }
                  className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-800 transition hover:bg-black hover:text-white disabled:opacity-50"
                >
                  Prev
                </button>

                {sortedCriticalPatients.length > 0 && (
                  <p className="text-xs text-gray-600">
                    Showing {criticalPatientsStartIndex + 1}-{criticalPatientsEndIndex} of{" "}
                    {sortedCriticalPatients.length}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() =>
                    setCriticalPatientPage((p) =>
                      Math.min(p + 1, totalCriticalPatientPages)
                    )
                  }
                  disabled={
                    criticalPatientPage === totalCriticalPatientPages ||
                    sortedCriticalPatients.length === 0
                  }
                  className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-800 transition hover:bg-black hover:text-white disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="grid gap-6 xl:grid-cols-12">
          <div className="xl:col-span-5">
            <TodaysAgenda
              agenda={agenda}
              patients={patients}
              nextAgendaId={nextAgendaId}
              onAdd={handleAddAgenda}
              onDelete={handleDeleteAgenda}
            />
          </div>

          <div className="xl:col-span-7">
            <PlansAwaitingReview
              plans={pendingPlans}
              onApproved={handleApprove}
              onRejected={handleReject}
              getPrimaryIssue={getPrimaryIssue}
              getEffectivenessScore={getEffectivenessScore}
              getTrendValue={getTrendValue}
              getTrendDelta={getTrendDelta}
              getReasonSummary={getReasonSummary}
              getExpectedImpact={getExpectedImpact}
              formatTrendLabel={formatTrendLabel}
              getTrendMeta={getTrendMeta}
              isImmediateAttention={isImmediateAttention}
              formatPlanDuration={formatPlanDuration}
            />
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4 space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-gray-900">Active Plan Insights</h2>
            <p className="text-sm text-gray-600">
              Review live adaptive analysis for patients on active plans.
            </p>
          </div>

          {activePlansError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-medium text-red-700">
                Unable to load active plan insights.
              </p>
              <p className="mt-1 text-sm text-red-600">
                {activePlansError}
              </p>
            </div>
          ) : sortedActivePlans.length === 0 ? (
            <p className="text-sm text-gray-600">No active plan insights available.</p>
          ) : (
            <div className="space-y-4">
              {paginatedActivePlans.map((plan) => {
                const planId = String(plan?._id);
                const trendInfo = plan.analysis?.effectivenessTrend || {};
                const trendPrevious =
                  typeof trendInfo.previous === "number"
                    ? trendInfo.previous
                    : null;
                const trendCurrent =
                  typeof trendInfo.current === "number"
                    ? trendInfo.current
                    : null;
                const hasTrendPoints =
                  typeof trendPrevious === "number" &&
                  typeof trendCurrent === "number";
                const reasonTrend = extractStartEndFromReason(plan.analysis?.reason);
                const chartPrevious = hasTrendPoints
                  ? trendPrevious
                  : reasonTrend?.start ?? null;
                const chartCurrent = hasTrendPoints
                  ? trendCurrent
                  : reasonTrend?.end ?? null;
                const hasChartPoints =
                  typeof chartPrevious === "number" &&
                  typeof chartCurrent === "number";
                const chartUnit = reasonTrend?.unit || "";
                const adherenceHistory = Array.isArray(plan?.adherenceHistory)
                  ? plan.adherenceHistory
                  : Array.isArray(plan?.analysis?.adherenceHistory)
                    ? plan.analysis.adherenceHistory
                    : [];
                const sortedHistory = adherenceHistory
                  .map((item, index) => ({
                    item,
                    index,
                    time: getHistoryTimestamp(item, index),
                  }))
                  .sort((left, right) => left.time - right.time || left.index - right.index)
                  .map((entry) => entry.item);
                const mappedHistoryData = sortedHistory
                  .map((item, index) => {
                    const dateValue =
                      item?.date || item?.recordedAt || item?.createdAt || item?.loggedAt || null;
                    const parsedDate = dateValue ? new Date(dateValue) : null;
                    const hasValidDate =
                      parsedDate instanceof Date &&
                      Number.isFinite(parsedDate.getTime());
                    const fallbackLabel = `Point ${index + 1}`;
                    const label = hasValidDate
                      ? parsedDate.toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })
                      : `${index + 1}`;

                    if (typeof item === "number") {
                      return {
                        label,
                        tooltipLabel: fallbackLabel,
                        value: item,
                      };
                    }

                    if (typeof item?.score === "number") {
                      return {
                        label,
                        tooltipLabel: hasValidDate
                          ? parsedDate.toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : fallbackLabel,
                        value: item.score,
                      };
                    }

                    if (typeof item?.value === "number") {
                      return {
                        label,
                        tooltipLabel: hasValidDate
                          ? parsedDate.toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : fallbackLabel,
                        value: item.value,
                      };
                    }

                    return null;
                  })
                  .filter(Boolean);
                const hasHistoryChart = mappedHistoryData.length > 1;
                const chartData = hasHistoryChart
                  ? mappedHistoryData
                  : hasChartPoints
                    ? [
                        {
                          label: "Previous",
                          tooltipLabel: "Previous reading",
                          value: chartPrevious,
                        },
                        {
                          label: "Current",
                          tooltipLabel: "Current reading",
                          value: chartCurrent,
                        },
                      ]
                    : [];
                const formatChartValue = (value) =>
                  typeof value === "number"
                    ? Number.isInteger(value)
                      ? value
                      : value.toFixed(1)
                    : "-";
                const chartChangeLabel = hasChartPoints
                  ? `${formatChartValue(chartPrevious)}${chartUnit} → ${formatChartValue(chartCurrent)}${chartUnit}`
                  : "-";
                const historyStart = hasHistoryChart ? chartData[0]?.value : null;
                const historyEnd = hasHistoryChart
                  ? chartData[chartData.length - 1]?.value
                  : null;
                const chartTrend = hasHistoryChart
                  ? getTrend(historyStart, historyEnd)
                  : getTrend(chartPrevious, chartCurrent);
                const chartChangeDisplay = hasHistoryChart
                  ? `${formatChartValue(historyStart)}${chartUnit} → ${formatChartValue(historyEnd)}${chartUnit}`
                  : chartChangeLabel;
                const trendLabel = getTrendLabel(chartTrend);
                const trendColor = getTrendColor(chartTrend);
                const patientName = plan.patient?.name || "Unknown Patient";
                const patientAge =
                  plan?.patient?.age ??
                  plan?.patient?.patientProfile?.age ??
                  plan?.patient?.profile?.age ??
                  null;
                const primaryIssue = plan.analysis?.primaryIssue ?? "Not enough data";
                const adjustments = plan.adjustments || [];
                const normalizedIssue = String(primaryIssue || "").trim();
                const hasMeaningfulIssue =
                  normalizedIssue &&
                  !["-", "none", "n/a", "na", "unknown", "not enough data"].includes(
                    normalizedIssue.toLowerCase()
                  );
                const hasRecommendedActions = Array.isArray(adjustments) && adjustments.length > 0;
                const formattedPhone = formatPhone(plan?.patient?.phone);
                const score =
                  plan.analysis?.effectiveness?.score ??
                  plan.analysis?.effectiveness ??
                  null;
                const numericScore =
                  typeof score === "number" ? Math.round(score) : null;
                const hasScoreData = typeof numericScore === "number";
                const scoreCategory = !hasScoreData
                  ? "Not enough data"
                  : numericScore > 80
                    ? "Good"
                    : numericScore >= 50
                      ? "Moderate"
                      : "Poor";
                const evaluatedAt =
                  plan.analysis?.computedAt || plan.updatedAt || plan.createdAt;
                const timeLabel = getRelativeTime(evaluatedAt);
                const statusNeedsAttention = isImmediateAttention(plan);
                const statusLabel = hasScoreData
                  ? numericScore < 50
                    ? "Needs Attention"
                    : "Stable"
                  : statusNeedsAttention
                    ? "Needs Attention"
                    : "Stable";
                const statusBadgeClass =
                  statusLabel === "Needs Attention"
                    ? "bg-black text-white ring-1 ring-black/20"
                    : "bg-gray-100 text-gray-700 ring-1 ring-gray-200 underline decoration-emerald-600 decoration-2 underline-offset-4";

                return (
                  <div
                    key={planId}
                    className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md space-y-4"
                  >
                    <div className="grid grid-cols-4 gap-6">
                      <div className="col-span-3 space-y-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-baseline gap-3">
                              <p className="rounded-md bg-yellow-300 px-3 py-1 text-lg font-semibold text-gray-900">
                                {patientName}
                              </p>
                              <p className="text-xs text-gray-400">
                                Age: {patientAge ?? "-"}
                              </p>
                            </div>
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass}`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400">
                            Last updated {timeLabel || "-"}
                          </p>
                        </div>

                        <div className="rounded-xl bg-gray-50 px-4 py-3 space-y-1.5">
                          <p className="text-xs uppercase tracking-wide text-gray-400">
                            Adherence Score
                          </p>
                          <p className="mt-1 text-[34px] font-bold tracking-tight leading-tight text-gray-900">
                            {hasScoreData ? `${numericScore}%` : "-"}
                          </p>
                          <p className="text-sm text-gray-600">{scoreCategory || "-"}</p>
                        </div>

                        <div className="space-y-1.5">
                          <p className="text-xs uppercase tracking-wide text-gray-400">Issue</p>
                          <p className="text-sm text-gray-700">
                            {hasMeaningfulIssue ? normalizedIssue : "No major issue flagged yet"}
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <p className="text-xs uppercase tracking-wide text-gray-400">
                            Recommended Action
                          </p>
                          {hasRecommendedActions ? (
                            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
                              {adjustments.map((item, index) => (
                                <li key={index}>{item}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-gray-700">
                              No immediate adjustment needed. Continue monitoring.
                            </p>
                          )}
                        </div>

                        <div className="mt-2">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              disabled={
                                loadingPlans[planId] ||
                                appliedPlans[planId] ||
                                plan.adjustmentsApplied
                              }
                              onClick={() => handleApplyChanges(plan)}
                              className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95 shadow-sm hover:shadow-md ${
                                appliedPlans[planId] || plan.adjustmentsApplied
                                  ? "cursor-not-allowed bg-gray-200 text-gray-400"
                                  : "bg-yellow-400 text-black hover:bg-yellow-500"
                              }`}
                            >
                              {loadingPlans[planId]
                                ? "Applying..."
                                : appliedPlans[planId] || plan.adjustmentsApplied
                                  ? "Applied"
                                  : "Apply Changes"}
                            </button>

                            <button
                              type="button"
                              disabled={!formattedPhone}
                              onClick={() => handleSendMessage(plan, formattedPhone)}
                              title={
                                !plan?.patient
                                  ? "Patient data missing"
                                  : !formattedPhone
                                    ? "Phone number not available"
                                    : "Send WhatsApp message"
                              }
                              className={`rounded-md border border-gray-300 px-4 py-1.5 text-xs transition-all duration-200 ease-in-out active:scale-95 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:cursor-not-allowed disabled:opacity-60 ${
                                formattedPhone
                                  ? "bg-white text-gray-800 hover:bg-black hover:text-white"
                                  : "bg-gray-200 text-gray-400"
                              }`}
                            >
                              Message Patient
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="col-span-1">
                        <div className="min-h-full rounded-xl bg-gray-50 p-3 space-y-4 flex flex-col justify-between">
                          <div className="space-y-1.5">
                            <p className="text-xs uppercase tracking-wide text-gray-400">Trend</p>
                            <p className="text-sm text-gray-600" style={{ color: trendColor }}>
                              {trendLabel}
                            </p>
                          </div>

                          <div className="bg-gray-50 rounded-xl p-3">
                            <PatientProgressChart
                              data={chartData}
                              trend={chartTrend}
                              unit={chartUnit || "%"}
                              valueLabel="Adherence Score"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <p className="text-xs tracking-wide text-gray-400">Change</p>
                            <p className="text-sm text-gray-600">
                              {chartChangeDisplay === "-" ? "Awaiting enough points" : chartChangeDisplay}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="mt-4 border-t border-gray-200 pt-3">
                <div className="flex items-center justify-center gap-6 sm:gap-10">
                  <button
                    type="button"
                    onClick={() => setActivePlanPage((p) => Math.max(p - 1, 1))}
                    disabled={activePlanPage === 1 || sortedActivePlans.length === 0}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-800 transition hover:bg-black hover:text-white disabled:opacity-50"
                  >
                    Prev
                  </button>

                  {sortedActivePlans.length > 0 && (
                    <p className="text-xs text-gray-500">
                      Showing {activePlansStartIndex + 1}-{activePlansEndIndex} of{" "}
                      {sortedActivePlans.length}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setActivePlanPage((p) => Math.min(p + 1, totalActivePlanPages))
                    }
                    disabled={
                      activePlanPage === totalActivePlanPages ||
                      sortedActivePlans.length === 0
                    }
                    className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-800 transition hover:bg-black hover:text-white disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {message && <p className="text-sm text-gray-600">{message}</p>}
      </div>
      </div>

      {selectedActivePlan ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Plan Insights</h3>
                <p className="mt-1 text-sm text-gray-600">
                  {typeof selectedActivePlan?.patient === "object"
                    ? selectedActivePlan.patient?.name
                    : "Patient"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedActivePlan(null)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 transition hover:bg-black hover:text-white"
              >
                Close
              </button>
            </div>

            {!selectedActivePlan.analysis ? (
              <div className="mt-5 rounded-xl bg-gray-50 px-4 py-3">
                <p className="text-sm text-gray-600">No analysis available</p>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {isImmediateAttention(selectedActivePlan) ? (
                  <div className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white inline-flex">
                    Needs Immediate Attention
                  </div>
                ) : null}

                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-gray-400">
                    Summary
                  </p>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    {selectedActivePlan.analysis.reasonSummary || "No insight summary available."}
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl bg-gray-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-gray-400">
                      Metrics
                    </p>
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      Effectiveness:{" "}
                      {typeof selectedActivePlan.analysis.effectiveness?.score === "number"
                        ? `${selectedActivePlan.analysis.effectiveness.score} (${selectedActivePlan.analysis.effectiveness.level || "unknown"})`
                        : "-"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      Trend: {formatTrendLabel(getTrendValue(selectedActivePlan) || "stable")}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      Primary issue: {getPrimaryIssue(selectedActivePlan) || "none"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-gray-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-gray-400">
                      Recommendation
                    </p>
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      {selectedActivePlan.analysis.reasonSummary ||
                        "Review the latest adaptive analysis before deciding on next steps."}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-gray-400">
                    Expected Impact
                  </p>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    {selectedActivePlan.analysis.expectedImpact || "No expected impact available."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

export default Dashboard;
























