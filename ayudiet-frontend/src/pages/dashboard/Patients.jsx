import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchJson } from "../../services/api";
import agendaFrame from "../../assets/agenda-botanical-frame.png";

function Patients() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const totalPages = Math.max(1, Math.ceil((patients?.length || 0) / ITEMS_PER_PAGE));

  const paginatedPatients = useMemo(() => {
    const list = patients || [];
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return list.slice(start, start + ITEMS_PER_PAGE);
  }, [patients, currentPage]);

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, patients?.length || 0);

  useEffect(() => {
    async function fetchPatients() {
      try {
        const token = localStorage.getItem("token");
        const data = await fetchJson("/patients", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setPatients(data.patients);
      } catch (error) {
        console.error("Error fetching patients:", error);
      }
    }

    fetchPatients();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [patients.length]);

  return (
    <div className="space-y-4">
      <h1 className="mb-4 text-2xl font-bold text-gray-900">Patients</h1>

      {patients.length === 0 ? (
        <p className="text-gray-600">No patients found</p>
      ) : (
        <div className="rounded-2xl bg-[#c8d6b7] p-4">
          <div className="space-y-3">
            {paginatedPatients.map((p) => (
              <div
                key={p._id}
                className="w-full overflow-hidden rounded-xl border-[2px] border-black p-4 shadow-sm"
                style={{
                  backgroundImage: `url(${agendaFrame})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="rounded-lg bg-white/90 px-3 py-2 shadow-sm">
                    <p className="inline-block rounded-md bg-yellow-300 px-2.5 py-0.5 text-lg font-semibold text-gray-900">
                      {p.name}
                    </p>
                    <p className="mt-1 text-sm text-gray-800">Age: {p.age}</p>
                  </div>

                  <div className="inline-flex items-center gap-2 self-start sm:self-center">
                    {/* VIEW BUTTON */}
                    <button
                      onClick={() => navigate(`/dashboard/patients/${p._id}`)}
                      className="min-w-[84px] rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 transition-all duration-200 hover:bg-gray-900 hover:text-white"
                    >
                      View
                    </button>

                    {/* EDIT BUTTON */}
                    <button
                      onClick={() => navigate(`/dashboard/patients/${p._id}/edit`)}
                      className="min-w-[84px] rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 transition-all duration-200 hover:bg-gray-900 hover:text-white"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-gray-200 pt-3">
            <div className="flex items-center justify-center gap-6 sm:gap-10">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1 || !patients || patients.length === 0}
                className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 disabled:opacity-50"
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
                disabled={currentPage === totalPages || !patients || patients.length === 0}
                className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Patients;

