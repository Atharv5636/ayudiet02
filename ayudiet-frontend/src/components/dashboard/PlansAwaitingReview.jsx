import { useEffect, useMemo, useState } from "react";

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
      alert("Failed to approve plan");
    } finally {
      setLoadingId(null);
    }
  };

  const handleReject = async (planId) => {
    const confirmReject = window.confirm(
      "Are you sure you want to reject this plan?"
    );

    if (!confirmReject) return;

    try {
      setLoadingId(planId);
      await onRejected?.(planId);
    } catch {
      alert("Failed to reject plan");
    } finally {
      setLoadingId(null);
    }
  };

  if (plans.length === 0) {
    return (
      <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Pending Plans</h2>
        <p className="text-sm text-gray-600">No plans pending review</p>
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
            const createdDate = plan?.createdAt
              ? new Date(plan.createdAt).toLocaleDateString()
              : null;
            const trendDelta = getTrendDelta?.(plan) || "No delta";

            return (
              <div
                key={plan._id}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Plan: {planTitle}
                  </p>
                  <p className="text-lg font-semibold text-gray-900">{patientName}</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {primaryIssue} - {formatTrendLabel?.(trend) || trend}
                  </p>
                  <p className="text-sm text-gray-600">
                    Dosha: {doshaLabel}
                    {createdDate ? ` | Created: ${createdDate}` : ""}
                  </p>
                  <p className="text-sm text-gray-600">Duration: {formatPlanDuration?.(plan)}</p>
                  <p className="text-xs uppercase tracking-wide text-gray-400">{trendDelta}</p>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {isImmediateAttention?.(plan) ? (
                    <span className="rounded-full bg-black px-2.5 py-1 text-[11px] font-medium text-white">
                      Needs Immediate Attention
                    </span>
                  ) : null}

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




