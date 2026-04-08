import { useEffect, useMemo, useState } from "react";

const DAY_MS = 24 * 60 * 60 * 1000;
const formatDateDayMonthYear = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
};

const getDaysLeftMeta = (reviewDueDate) => {
  if (!reviewDueDate) {
    return {
      label: "No review date",
      className: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
      daysLeft: null,
    };
  }

  const now = new Date();
  const due = new Date(reviewDueDate);

  if (Number.isNaN(due.getTime())) {
    return {
      label: "Invalid review date",
      className: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
      daysLeft: null,
    };
  }

  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const daysLeft = Math.ceil((startDue - startToday) / DAY_MS);

  if (daysLeft < 0) {
    return {
      label: `Overdue by ${Math.abs(daysLeft)}d`,
      className:
        "bg-gray-100 text-gray-700 ring-1 ring-gray-200 underline decoration-red-600 decoration-2 underline-offset-4",
      daysLeft,
    };
  }

  if (daysLeft <= 2) {
    return {
      label: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
      className:
        "bg-gray-100 text-gray-700 ring-1 ring-gray-200 underline decoration-red-600 decoration-2 underline-offset-4",
      daysLeft,
    };
  }

  if (daysLeft <= 7) {
    return {
      label: `${daysLeft} days left`,
      className:
        "bg-gray-100 text-gray-700 ring-1 ring-gray-200 underline decoration-amber-600 decoration-2 underline-offset-4",
      daysLeft,
    };
  }

  return {
    label: `${daysLeft} days left`,
    className:
      "bg-gray-100 text-gray-700 ring-1 ring-gray-200 underline decoration-emerald-600 decoration-2 underline-offset-4",
    daysLeft,
  };
};

const getDecisionMeta = ({ score, trend, daysLeft, primaryIssue }) => {
  const normalizedIssue = String(primaryIssue || "").toLowerCase();
  const isOverdue = typeof daysLeft === "number" && daysLeft < 0;
  const isUrgent = typeof daysLeft === "number" && daysLeft <= 2;
  const isLowScore = typeof score === "number" && score < 50;
  const isMediumScore = typeof score === "number" && score >= 50 && score < 70;
  const isDownTrend = trend === "down";
  const hasAdherenceOrEnergyRisk =
    normalizedIssue.includes("adherence") || normalizedIssue.includes("energy");

  if (isOverdue || (isLowScore && isDownTrend)) {
    return {
      label: "Recommended: Reject",
      className:
        "bg-gray-100 text-gray-700 ring-1 ring-gray-200 underline decoration-red-600 decoration-2 underline-offset-4",
      reason: "High risk and declining pattern. Ask for major revision before approval.",
    };
  }

  if (isUrgent || isMediumScore || isDownTrend || hasAdherenceOrEnergyRisk) {
    return {
      label: "Recommended: Improve First",
      className:
        "bg-gray-100 text-gray-700 ring-1 ring-gray-200 underline decoration-amber-600 decoration-2 underline-offset-4",
      reason: "Needs targeted fixes before approval (portion, adherence, or symptom-focused edits).",
    };
  }

  return {
    label: "Recommended: Approve",
    className:
      "bg-gray-100 text-gray-700 ring-1 ring-gray-200 underline decoration-emerald-600 decoration-2 underline-offset-4",
    reason: "Signals look stable and safe for approval.",
  };
};

const isPlaceholderText = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  return (
    !normalized ||
    normalized === "-" ||
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "none" ||
    normalized === "null" ||
    normalized === "undefined" ||
    normalized === "no delta" ||
    normalized === "no insight summary available." ||
    normalized === "no expected impact available."
  );
};

function PlansAwaitingReview({
  plans = [],
  onApproved,
  onRejected,
  getPrimaryIssue,
  getEffectivenessScore,
  getTrendValue,
  getTrendDelta,
  getReasonSummary,
  getExpectedImpact,
  formatTrendLabel,
  getTrendMeta,
  isImmediateAttention,
  formatPlanDuration,
}) {
  const [loadingId, setLoadingId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 2;

  const totalPages = Math.max(1, Math.ceil((plans?.length || 0) / ITEMS_PER_PAGE));

  const paginatedPlans = useMemo(() => {
    const list = plans || [];
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return list.slice(start, start + ITEMS_PER_PAGE);
  }, [plans, currentPage]);

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, plans?.length || 0);

  useEffect(() => {
    setCurrentPage(1);
  }, [plans]);

  const handleApprove = async (plan) => {
    try {
      setLoadingId(plan._id);
      console.log("REAL APPROVE BUTTON CLICKED", plan._id);
      await onApproved?.(plan._id);
    } catch {
      alert("Unable to approve the plan. Please try again.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleReject = async (planId) => {
    const confirmReject = window.confirm(
      "Are you sure you want to reject this plan? This action cannot be undone."
    );

    if (!confirmReject) return;

    try {
      setLoadingId(planId);
      await onRejected?.(planId);
    } catch {
      alert("Unable to reject the plan. Please try again.");
    } finally {
      setLoadingId(null);
    }
  };

  if (plans.length === 0) {
    return (
      <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Pending Plans</h2>
        <p className="text-sm text-gray-600">There are no plans pending review.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Pending Plans</h2>
          <p className="mt-1 text-sm text-gray-600">
            Review plan duration and patient context before approving or rejecting.
          </p>
        </div>

        <div className="flex-1 space-y-4">
          {paginatedPlans.map((plan) => {
            const primaryIssue = getPrimaryIssue?.(plan) || "none";
            const trend = getTrendValue?.(plan) || "stable";
            const trendMeta = getTrendMeta?.(trend);
            const TrendIcon = trendMeta?.icon;
            const patientName =
              typeof plan?.patient === "object"
                ? plan?.patient?.name || "Unknown Patient"
                : "Unknown Patient";
            const planTitle =
              typeof plan?.title === "string" && plan.title.trim()
                ? plan.title.trim()
                : "Untitled Plan";
            const doshaLabel =
              typeof plan?.doshaType === "string" && plan.doshaType.trim()
                ? plan.doshaType.trim()
                : "Not specified";
            const createdDate = formatDateDayMonthYear(plan?.createdAt);
            const reviewDueDate = formatDateDayMonthYear(plan?.reviewDueDate);
            const trendDelta = getTrendDelta?.(plan) || "No delta";
            const daysLeftMeta = getDaysLeftMeta(plan?.reviewDueDate);
            const effectivenessScore = getEffectivenessScore?.(plan);
            const decisionMeta = getDecisionMeta({
              score: effectivenessScore,
              trend,
              daysLeft: daysLeftMeta.daysLeft,
              primaryIssue,
            });
            const expectedImpact = getExpectedImpact?.(plan);
            const reasonSummary = getReasonSummary?.(plan);
            const hasReasonSummary = !isPlaceholderText(reasonSummary);
            const hasExpectedImpact = !isPlaceholderText(expectedImpact);
            const hasTrendDelta = !isPlaceholderText(trendDelta);

            return (
              <div
                key={plan._id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.12em] text-gray-500">
                        Plan
                      </p>
                      <p className="text-base font-semibold text-gray-900">{planTitle}</p>
                      <p className="text-xl font-semibold text-gray-900">{patientName}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${daysLeftMeta.className}`}
                      >
                        {daysLeftMeta.label}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${decisionMeta.className}`}
                      >
                        {decisionMeta.label}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700">
                      Issue: {primaryIssue}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700">
                      Trend: {formatTrendLabel?.(trend) || trend}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700">
                      Score: {typeof effectivenessScore === "number" ? `${effectivenessScore}/100` : "N/A"}
                    </span>
                  </div>

                  <div className="grid gap-2 text-sm text-gray-600 md:grid-cols-2">
                    <p>Dosha: <span className="font-medium text-gray-800">{doshaLabel}</span></p>
                    <p>Duration: <span className="font-medium text-gray-800">{formatPlanDuration?.(plan)}</span></p>
                    <p>Review due: <span className="font-medium text-gray-800">{reviewDueDate}</span></p>
                    <p>Created: <span className="font-medium text-gray-800">{createdDate}</span></p>
                    {hasTrendDelta ? (
                      <p className="md:col-span-2">
                        Trend Delta: <span className="font-medium text-gray-800">{trendDelta}</span>
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <p className="text-sm font-medium text-gray-800">{decisionMeta.reason}</p>
                    {hasReasonSummary ? (
                      <p className="mt-1 text-xs text-gray-600">Why: {reasonSummary}</p>
                    ) : null}
                    {hasExpectedImpact ? (
                      <p className="mt-1 text-xs text-gray-600">Expected impact: {expectedImpact}</p>
                    ) : null}
                  </div>

                  {isImmediateAttention?.(plan) ? (
                    <span className="inline-flex rounded-full bg-black px-2.5 py-1 text-[11px] font-medium text-white">
                      Needs Immediate Attention
                    </span>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      disabled={loadingId === plan._id}
                      onClick={() => handleApprove(plan)}
                      className="rounded-md bg-yellow-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-yellow-500 disabled:opacity-50"
                    >
                      {loadingId === plan._id ? "Approving..." : "Approve"}
                    </button>

                    <button
                      disabled={loadingId === plan._id}
                      onClick={() => handleReject(plan._id)}
                      className="rounded-md bg-red-500 px-4 py-2 text-sm text-white transition hover:bg-red-600 disabled:opacity-50"
                    >
                      {loadingId === plan._id ? "Processing..." : "Reject"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 border-t border-gray-200 pt-3">
          <div className="flex items-center justify-center gap-6 sm:gap-10">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1 || !plans || plans.length === 0}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-800 transition hover:bg-black hover:text-white disabled:opacity-50"
            >
              Prev
            </button>

            {plans && plans.length > 0 && (
              <p className="text-xs text-gray-600">
                Showing {startIndex + 1}-{endIndex} of {plans.length}
              </p>
            )}

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages || !plans || plans.length === 0}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-800 transition hover:bg-black hover:text-white disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default PlansAwaitingReview;




