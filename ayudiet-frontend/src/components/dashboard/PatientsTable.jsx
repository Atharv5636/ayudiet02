import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function PatientsTable({
  patients,
  onDelete,
  formatTrendLabel,
  getTrendMeta,
}) {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const totalPages = Math.max(1, Math.ceil((patients?.length || 0) / ITEMS_PER_PAGE));
  const clampedCurrentPage = Math.min(currentPage, totalPages);

  const paginatedPatients = useMemo(() => {
    const list = patients || [];
    const start = (clampedCurrentPage - 1) * ITEMS_PER_PAGE;
    return list.slice(start, start + ITEMS_PER_PAGE);
  }, [patients, clampedCurrentPage]);

  const startIndex = (clampedCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, patients?.length || 0);

  const formatPrimaryIssue = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized || normalized.toLowerCase() === "none") return "-";
    return normalized
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const getInitials = (name = "") => {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "PT";
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
  };

  const resolvePhotoUrl = (patient) => {
    const raw = String(patient?.photo?.url || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = String(import.meta.env.VITE_API_URL || "").replace(/\/+$/g, "");
    if (!base) return raw;
    return `${base}${raw.startsWith("/") ? raw : `/${raw}`}`;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="inline-flex items-center rounded-lg bg-yellow-300 px-3 py-1 text-lg font-semibold leading-none text-gray-900">
          Patient Intelligence
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Review effectiveness, dominant issue, and trend before opening a case.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-[0.12em] text-gray-500">
            <tr>
              <th className="border-r border-gray-200 px-4 py-3 text-left font-semibold text-gray-600">Name</th>
              <th className="border-r border-gray-200 px-4 py-3 text-left font-semibold text-gray-600">Age</th>
              <th className="border-r border-gray-200 px-4 py-3 text-left font-semibold text-gray-600">Effectiveness</th>
              <th className="border-r border-gray-200 px-4 py-3 text-left font-semibold text-gray-600">Primary Issue</th>
              <th className="border-r border-gray-200 px-4 py-3 text-left font-semibold text-gray-600">Trend</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>

          <tbody>
            {!patients || patients.length === 0 ? (
              <tr>
                <td colSpan="6" className="py-10 text-center text-sm text-gray-600">
                  No patients were found.
                </td>
              </tr>
            ) : (
              paginatedPatients.map((patient) => {
                const score = patient.dashboardIntelligence?.score;
                const primaryIssue = patient.dashboardIntelligence?.primaryIssue || "none";
                const trend = patient.dashboardIntelligence?.trend || "stable";
                const trendMeta = getTrendMeta?.(trend);
                const TrendIcon = trendMeta?.icon;

                return (
                  <tr
                    key={patient._id}
                    className="border-t border-gray-200 align-middle transition hover:bg-gray-50/70"
                  >
                    <td className="border-r border-gray-200 px-4 py-4 text-base font-semibold text-gray-900">
                      <div className="flex items-center gap-3">
                        {resolvePhotoUrl(patient) ? (
                          <img
                            src={resolvePhotoUrl(patient)}
                            alt={patient.name || "Patient"}
                            className="h-10 w-10 rounded-full border border-gray-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                            {getInitials(patient?.name)}
                          </div>
                        )}
                        <span>{patient.name}</span>
                      </div>
                    </td>
                    <td className="border-r border-gray-200 px-4 py-4 text-base text-gray-700">
                      {patient.age ?? "-"}
                    </td>
                    <td className="border-r border-gray-200 px-4 py-4">
                      <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                        {typeof score === "number" ? `${score}/100` : "N/A"}
                      </span>
                    </td>
                    <td className="border-r border-gray-200 px-4 py-4">
                      <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                        {formatPrimaryIssue(primaryIssue)}
                      </span>
                    </td>
                    <td className="border-r border-gray-200 px-4 py-4">
                      <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                        {TrendIcon ? (
                          <TrendIcon className={`h-4 w-4 ${trendMeta?.className || ""}`} />
                        ) : null}
                        <span className={trendMeta?.className || ""}>
                          {formatTrendLabel?.(trend) || trend}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/dashboard/patients/${patient._id}`}
                          className="min-w-16 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 transition hover:bg-black hover:text-white"
                        >
                          View
                        </Link>

                        <button
                          type="button"
                          onClick={() => {
                            if (!patient?._id) {
                              return;
                            }

                            navigate(`/dashboard/patients/${patient._id}/edit`);
                          }}
                          className="min-w-16 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 transition hover:bg-black hover:text-white"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => onDelete(patient._id)}
                          className="min-w-16 rounded-md bg-red-500 px-4 py-2 text-sm text-white transition hover:bg-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 border-t border-gray-200 px-4 pb-4 pt-3">
        <div className="flex items-center justify-center gap-6 sm:gap-10">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={clampedCurrentPage === 1 || !patients || patients.length === 0}
            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-800 transition hover:bg-black hover:text-white disabled:opacity-50"
          >
            Prev
          </button>

          {patients && patients.length > 0 && (
            <p className="text-xs text-gray-600">
              Showing {startIndex + 1}-{endIndex} of {patients.length}
            </p>
          )}

          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={clampedCurrentPage === totalPages || !patients || patients.length === 0}
            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-800 transition hover:bg-black hover:text-white disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default PatientsTable;

