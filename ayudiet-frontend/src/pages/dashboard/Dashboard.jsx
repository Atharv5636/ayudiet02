import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import PatientsTable from "../../components/dashboard/PatientsTable";
import PlansAwaitingReview from "../../components/dashboard/PlansAwaitingReview";
import TodaysAgenda from "../../components/dashboard/TodaysAgenda";

import { deletePatient } from "../../services/patient.service";
import {
  approvePlan,
  fetchPendingPlans,
  fetchPlansByPatient,
  rejectPlan,
} from "../../services/plan.service";
import { fetchJson } from "../../services/api";

const AGENDA_STORAGE_KEY = "agenda";

function Dashboard() {
  const outletContext = useOutletContext();
  const search = outletContext?.search || "";

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
  const [showMockData, setShowMockData] = useState(true);
  const [appliedPlans, setAppliedPlans] = useState({});
  const [loadingPlans, setLoadingPlans] = useState({});

  const filteredPlans = useMemo(() => {
    if (showMockData) return activePlans;

    return activePlans.filter(
      (plan) => !(plan?.isMock || plan?.patient?.isMock)
    );
  }, [activePlans, showMockData]);

  const getPlanAnalysis = (entry) =>
    entry?.analysis ||
    entry?.adaptiveAnalysis ||
    entry?.latestAnalysis ||
    entry?.insights ||
    entry?.planAnalysis ||
    null;

  const getTrendValue = (entry) =>
    getPlanAnalysis(entry)?.effectivenessTrend?.trend ||
    entry?.effectivenessTrend?.trend ||
    null;

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

  const getPrimaryIssue = (entry) =>
    getPlanAnalysis(entry)?.primaryIssue ||
    entry?.primaryIssue ||
    "none";

  const getReasonSummary = (entry) =>
    getPlanAnalysis(entry)?.reasonSummary ||
    entry?.reasonSummary ||
    "No insight summary available.";

  const getExpectedImpact = (entry) =>
    getPlanAnalysis(entry)?.expectedImpact ||
    entry?.expectedImpact ||
    "No expected impact available.";

  const getLatestPlanForPatient = (patient) =>
    filteredPlans.find((plan) => {
      const planPatientId =
        typeof plan?.patient === "object" ? plan?.patient?._id : plan?.patient;
      return planPatientId === patient._id;
    }) || null;

  function getAttentionScore(plan) {
    let score = 0;

    const analysis = plan?.analysis || getPlanAnalysis(plan) || {};
    const effectiveness =
      typeof analysis?.effectiveness === "number"
        ? analysis.effectiveness
        : analysis?.effectiveness?.score ||
          (typeof plan?.dashboardIntelligence?.score === "number"
            ? plan.dashboardIntelligence.score
            : 0);

    const trend = (
      analysis?.trend ||
      plan?.dashboardIntelligence?.trend ||
      ""
    ).toLowerCase();
    const issue = (
      analysis?.primaryIssue ||
      plan?.dashboardIntelligence?.primaryIssue ||
      ""
    ).toLowerCase();

    if (effectiveness < 40) score += 3;
    else if (effectiveness < 55) score += 2;
    else if (effectiveness < 75) score += 1;

    if (trend === "declining") score += 3;
    else if (trend === "stable") score += 1;

    if (issue.includes("adherence")) score += 2;
    if (issue.includes("energy")) score += 1;
    if (issue.includes("progress")) score += 1;

    return score;
  }

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

  function getExactDateTime(computedAt) {
    if (!computedAt) return null;

    const dateObj = new Date(computedAt);
    if (isNaN(dateObj.getTime())) return null;

    return dateObj.toLocaleString();
  }

  const getPatientIntelligence = (patient) => {
    const linkedPlan = getLatestPlanForPatient(patient);
    const source = linkedPlan || patient;
    const score = getEffectivenessScore(source);
    const primaryIssue = getPrimaryIssue(source);
    const trend = getTrendValue(source) || "stable";
    const delta = getTrendDelta(source);

    return {
      score,
      primaryIssue,
      trend,
      delta,
    };
  };

  const isImmediateAttention = (plan) => (plan?.attentionScore ?? 0) >= 5;

  const needsAttention = (entry) => {
    const score = entry?.dashboardIntelligence?.score ?? getEffectivenessScore(entry);
    const trend = entry?.dashboardIntelligence?.trend ?? getTrendValue(entry) ?? "stable";
    const primaryIssue =
      entry?.dashboardIntelligence?.primaryIssue ?? getPrimaryIssue(entry);

    return (
      (typeof score === "number" && score < 60) ||
      trend === "declining" ||
      primaryIssue === "adherence"
    );
  };

  const formatTrendLabel = (trend) => {
    if (!trend) return "Stable";
    return trend.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const getTrendTone = (trend) => {
    if (trend === "declining" || trend === "slight_decline") {
      return "text-red-300";
    }

    if (trend === "improving" || trend === "slight_improvement") {
      return "text-green-300";
    }

    return "text-neutral-300";
  };

  const getTrendMeta = (trend) => {
    if (trend === "declining" || trend === "slight_decline") {
      return {
        icon: ArrowDownRight,
        className: "text-red-300",
        chipClassName: "bg-red-500/10 text-red-300",
      };
    }

    if (trend === "improving" || trend === "slight_improvement") {
      return {
        icon: ArrowUpRight,
        className: "text-green-300",
        chipClassName: "bg-green-500/10 text-green-300",
      };
    }

    return {
      icon: Minus,
      className: "text-neutral-300",
      chipClassName: "bg-neutral-700 text-neutral-200",
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

  const filteredPatients = patients.filter((patient) =>
    patient.name.toLowerCase().includes(search.toLowerCase())
  );

  const enrichedPatients = filteredPatients.map((patient) => ({
    ...patient,
    dashboardIntelligence: getPatientIntelligence(patient),
  }));

  const plansWithScore = useMemo(() => {
    return filteredPlans.map((plan) => ({
      ...plan,
      attentionScore: getAttentionScore(plan),
    }));
  }, [filteredPlans]);

  const patientsNeedingAttention = plansWithScore.filter(
    (plan) => plan.attentionScore >= 5
  ).length;

  const decliningPlans = plansWithScore.filter(
    (plan) =>
      (plan.analysis?.trend || "").toLowerCase() === "declining"
  ).length;

  const lowAdherenceCases = plansWithScore.filter((plan) => {
    const issue = plan.analysis?.primaryIssue || "";
    return issue.toLowerCase().includes("adherence");
  }).length;

  const lowEnergyCases = plansWithScore.filter((plan) => {
    const issue = plan.analysis?.primaryIssue || "";
    return issue.toLowerCase().includes("energy");
  }).length;

  const criticalPatients = useMemo(() => {
    return [...plansWithScore]
      .sort((a, b) => b.attentionScore - a.attentionScore)
      .slice(0, 3);
  }, [plansWithScore]);

  const sortedActivePlans = useMemo(() => {
    return [...plansWithScore].sort(
      (a, b) => b.attentionScore - a.attentionScore
    );
  }, [plansWithScore]);

  console.log("CRITICAL DEBUG:", {
    total: plansWithScore.length,
    selected: criticalPatients.length,
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

  const loadActivePlans = async (patientList = patients) => {
    try {
      const activePlansByPatient = await Promise.all(
        patientList.map(async (patient) => {
          const data = await fetchPlansByPatient(patient._id);
          const patientPlans = data?.plans || [];
          return patientPlans.filter((plan) => plan?.isActive === true);
        })
      );

      setActivePlans(activePlansByPatient.flat());
    } catch (error) {
      console.error(error);
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
      showToast("Plan approved successfully");
    } catch (error) {
      console.error("APPROVE ERROR:", error);
      showToast("Failed to approve plan");
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

  const handleDeletePatient = async (patientId) => {
    if (!window.confirm("Are you sure?")) return;

    try {
      await deletePatient(patientId);
      setPatients((prevPatients) =>
        prevPatients.filter((patient) => patient._id !== patientId)
      );
      setActivePlans((prevPlans) =>
        prevPlans.filter((plan) => {
          const planPatientId =
            typeof plan?.patient === "object" ? plan?.patient?._id : plan?.patient;
          return planPatientId !== patientId;
        })
      );
    } catch {
      alert("Failed to delete patient");
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
      alert("Session expired. Please login again.");
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
        throw new Error("Invalid server response");
      }

      const updatedPlan = response.plan;

      setActivePlans((prevPlans) =>
        prevPlans.map((item) =>
          String(item?._id) === planId ? updatedPlan : item
        )
      );

      alert(response?.message || "Changes applied successfully");
    } catch (error) {
      console.error("Failed to apply adjustments:", error);
      alert("Failed to apply changes. Please try again.");
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
          loadActivePlans(loadedPatients),
        ]);
      } catch (error) {
        setMessage(error.message || "Error fetching dashboard data");
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

  return (
    <>
      {toast && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow z-50">
          {toast}
        </div>
      )}

      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            Dashboard Overview
          </h1>
          <p className="text-neutral-400 mt-1">
            Review decision signals and act on patients who need support
          </p>
          <button
            onClick={() => setShowMockData((prev) => !prev)}
            className="mt-2 text-xs px-2 py-1 rounded bg-neutral-700 text-white"
          >
            {showMockData ? "Hide Mock Data" : "Show Mock Data"}
          </button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Patients Needing Attention",
                value: patientsNeedingAttention,
                note:
                  patientsNeedingAttention > 0
                    ? `${patientsNeedingAttention} patient(s) need attention`
                    : "No patients need attention",
              },
              {
                title: "Declining Plans",
                value: decliningPlans,
                note: "Plans showing downward momentum",
              },
              {
                title: "Low Adherence Cases",
                value: lowAdherenceCases,
                note: "Primary issue is adherence",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-xl border border-neutral-800 bg-neutral-900 p-5"
              >
                <p className="text-sm text-neutral-400">{card.title}</p>
                <p className="mt-2 text-3xl font-semibold text-white">{card.value}</p>
                <p className="mt-1 text-sm text-neutral-500">{card.note}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">Top Critical Patients</h2>
              <p className="mt-1 text-sm text-neutral-400">
                Highest-priority cases based on score, trend, and adherence risk.
              </p>
            </div>

            <div className="space-y-3">
              {plansWithScore.length === 0 ? (
                <p className="text-sm text-neutral-400">No data available</p>
              ) : criticalPatients.length === 0 ? (
                <p className="text-sm text-neutral-400">No high-risk patients</p>
              ) : (
                criticalPatients.map((plan) => (
                  <div
                    key={plan._id}
                    className="rounded-lg border border-neutral-800 bg-neutral-800/60 px-4 py-3"
                  >
                    <p className="text-sm text-white font-medium">
                      {plan.patient?.name || "Unknown"}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {plan.analysis?.primaryIssue || "-"} • {plan.analysis?.trend || "-"}
                    </p>
                    <p className="text-xs text-red-400">
                      Priority: {plan.attentionScore}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
<div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          <TodaysAgenda
            agenda={agenda}
            patients={patients}
            nextAgendaId={nextAgendaId}
            onAdd={handleAddAgenda}
            onDelete={handleDeleteAgenda}
          />

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

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white">Active Plan Insights</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Review live adaptive analysis for patients on active plans.
            </p>
          </div>

          {sortedActivePlans.length === 0 ? (
            <p className="text-sm text-neutral-400">No active plan insights available.</p>
          ) : (
            <div className="space-y-4">
              {sortedActivePlans.map((plan) => {
                const planId = String(plan?._id);
                const trend =
                  plan.analysis?.trend ??
                  plan.analysis?.effectivenessTrend?.trend ??
                  "-";
                const trendMeta = getTrendMeta(trend);
                const TrendIcon = trendMeta?.icon;
                const patientName = plan.patient?.name || "Unknown Patient";
                const primaryIssue = plan.analysis?.primaryIssue ?? "-";
                const adjustments = plan.adjustments || [];
                const score =
                  plan.analysis?.effectiveness?.score ??
                  plan.analysis?.effectiveness ??
                  "-";
                const evaluatedAt =
                  plan.analysis?.computedAt || plan.updatedAt || plan.createdAt;
                const timeLabel = getRelativeTime(evaluatedAt);
                const exactTimeLabel = getExactDateTime(evaluatedAt);

                console.log(plan.analysis);

                return (
                  <div
                    key={planId}
                    className="rounded-lg border border-neutral-800 bg-neutral-800/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-base font-semibold text-white">{patientName}</p>
                        <p className="mt-1 text-sm text-neutral-400">{plan.title}</p>
                        <p className="text-[10px] mt-1">
                          <span
                            className={
                              plan.attentionScore >= 6
                                ? "text-red-400"
                                : plan.attentionScore >= 4
                                  ? "text-yellow-400"
                                  : "text-green-400"
                            }
                          >
                            {getPriorityLabel(plan.attentionScore)}
                          </span>{" "}
                          ({plan.attentionScore})
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {isImmediateAttention(plan) ? (
                          <span className="rounded-full bg-red-500/12 px-2.5 py-1 text-[11px] font-medium text-red-300">
                            Needs Immediate Attention
                          </span>
                        ) : null}
                        <span className="rounded-full bg-neutral-700 px-2.5 py-1 text-[11px] font-medium text-neutral-200">
                          {formatPlanDuration(plan)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                      <div className="space-y-1">
                        <p className="text-xs text-neutral-500">Primary Issue</p>
                        <p className="mt-1 text-sm font-semibold text-red-400">
                          {primaryIssue}
                        </p>
                        {adjustments.length > 0 && (
                          <div className="mt-2 rounded-md bg-emerald-900/20 p-2 border border-emerald-700/30">
                            <p className="text-[11px] font-bold text-emerald-300 tracking-wide">
                              ACTION REQUIRED
                            </p>
                            <p className="text-xs font-semibold text-emerald-400">
                              Recommended Changes
                            </p>
                            <ul className="mt-1 mb-2 list-disc pl-4 text-xs text-neutral-300 space-y-1">
                              {adjustments.map((item, index) => (
                                <li key={index}>{item}</li>
                              ))}
                            </ul>
                            <button
                              type="button"
                              disabled={
                                loadingPlans[planId] ||
                                appliedPlans[planId] ||
                                plan.adjustmentsApplied
                              }
                              onClick={() => handleApplyChanges(plan)}
                              className={`mt-2 inline-flex items-center justify-center px-4 rounded-md py-1.5 text-xs font-medium text-white transition ${
                                appliedPlans[planId] || plan.adjustmentsApplied
                                  ? "bg-neutral-700 cursor-not-allowed"
                                  : "bg-emerald-500 hover:bg-emerald-400"
                              }`}
                            >
                              {loadingPlans[planId]
                                ? "Applying..."
                                : appliedPlans[planId] || plan.adjustmentsApplied
                                  ? "Applied"
                                  : "Apply Changes"}
                            </button>
                            {(appliedPlans[planId] || plan.adjustmentsApplied) && adjustments.length > 0 && (
                              <p className="mt-1 text-[10px] text-neutral-400">
                                Applied {adjustments.length} change{adjustments.length > 1 ? "s" : ""}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-neutral-500">
                          Effectiveness
                        </p>
                        <p className={`mt-1 font-semibold ${
                          score >= 75
                            ? "text-green-400"
                            : score >= 50
                              ? "text-yellow-400"
                              : "text-red-400"
                        }`}>
                          {score}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-neutral-500">Trend</p>
                        <div className="mt-1 inline-flex items-center gap-2 text-neutral-300">
                          {trend === "-" ? null : TrendIcon ? <TrendIcon className="h-4 w-4" /> : null}
                          <span>{trend === "-" ? "-" : formatTrendLabel(trend)}</span>
                        </div>
                        <p className="mt-1 text-xs text-neutral-500">{getTrendDelta(plan)}</p>
                      </div>
                    </div>
                    {plan.analysis?.reason && (
                      <div className="mt-2 text-xs text-neutral-400 leading-relaxed">
                        <span className="text-neutral-500">Reason:</span>{" "}
                        {plan.analysis.reason}
                      </div>
                    )}
                    {timeLabel && (
                      <p className="mt-2 text-[11px] text-neutral-400 flex items-center gap-1">
                        <span className="text-neutral-500">⏱</span>
                        Last evaluated {timeLabel}
                        {exactTimeLabel ? ` (${exactTimeLabel})` : ""}
                      </p>
                    )}

                    <div className="mt-4">
                      <button
                        type="button"
                        disabled={!plan.analysis}
                        onClick={() => setSelectedActivePlan(plan)}
                        className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        View Insights
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <PatientsTable
          patients={enrichedPatients}
          onDelete={handleDeletePatient}
          formatTrendLabel={formatTrendLabel}
          getTrendTone={getTrendTone}
          getTrendMeta={getTrendMeta}
        />

        {message && <p className="text-red-400">{message}</p>}
      </div>

      {selectedActivePlan ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Plan Insights</h3>
                <p className="mt-1 text-sm text-neutral-400">
                  {typeof selectedActivePlan?.patient === "object"
                    ? selectedActivePlan.patient?.name
                    : "Patient"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedActivePlan(null)}
                className="text-sm text-neutral-400 hover:text-white"
              >
                Close
              </button>
            </div>

            {!selectedActivePlan.analysis ? (
              <div className="mt-5 rounded-lg border border-neutral-800 bg-neutral-800/60 p-4">
                <p className="text-sm text-neutral-300">No analysis available</p>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {isImmediateAttention(selectedActivePlan) ? (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">
                    Needs Immediate Attention
                  </div>
                ) : null}

                <div className="rounded-lg border border-neutral-800 bg-neutral-800/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-neutral-500">
                    Summary
                  </p>
                  <p className="mt-2 text-sm leading-6 text-neutral-200">
                    {selectedActivePlan.analysis.reasonSummary || "No insight summary available."}
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-neutral-800 bg-neutral-800/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-neutral-500">
                      Metrics
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-200">
                      Effectiveness:{" "}
                      {typeof selectedActivePlan.analysis.effectiveness?.score === "number"
                        ? `${selectedActivePlan.analysis.effectiveness.score} (${selectedActivePlan.analysis.effectiveness.level || "unknown"})`
                        : "-"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-200">
                      Trend: {formatTrendLabel(getTrendValue(selectedActivePlan) || "stable")}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-200">
                      Primary issue: {getPrimaryIssue(selectedActivePlan) || "none"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-neutral-800 bg-neutral-800/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-neutral-500">
                      Recommendation
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-200">
                      {selectedActivePlan.analysis.reasonSummary ||
                        "Review the latest adaptive analysis before deciding on next steps."}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-neutral-800 bg-neutral-800/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-neutral-500">
                    Expected Impact
                  </p>
                  <p className="mt-2 text-sm leading-6 text-neutral-200">
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














