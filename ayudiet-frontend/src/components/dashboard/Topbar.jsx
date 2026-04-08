import { useEffect, useMemo, useState } from "react";
import { Menu, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchJson } from "../../services/api";
import { clearAuthSession } from "../../utils/authSession";

function getDoctorNameFromToken(token) {
  try {
    if (!token) return "";
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return "";

    const normalizedPayload = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      "="
    );
    const payload = JSON.parse(atob(paddedPayload));
    return payload?.name?.trim() || "";
  } catch {
    return "";
  }
}

function formatDoctorGreeting(name) {
  const trimmedName = name?.trim();
  if (!trimmedName) return "Welcome back, Doctor";

  if (/^dr\.?\s/i.test(trimmedName)) {
    return `Welcome back, ${trimmedName}`;
  }

  return `Welcome back, Dr. ${trimmedName}`;
}

function Topbar({ search, setSearch, isSidebarOpen, onToggleSidebar }) {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [hasLoadedPatients, setHasLoadedPatients] = useState(false);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const [doctorName, setDoctorName] = useState(() => {
    const storedName = localStorage.getItem("doctorName")?.trim();
    if (storedName) return storedName;

    const token = localStorage.getItem("token");
    const tokenName = getDoctorNameFromToken(token);
    if (tokenName) {
      localStorage.setItem("doctorName", tokenName);
      return tokenName;
    }

    return "";
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    const tokenName = getDoctorNameFromToken(token);

    if (tokenName) {
      setDoctorName(tokenName);
      localStorage.setItem("doctorName", tokenName);
    }
  }, []);

  const ensurePatientsLoaded = async () => {
    if (hasLoadedPatients || isLoadingPatients) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    setIsLoadingPatients(true);

    try {
      const response = await fetchJson("/patients", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setPatients(Array.isArray(response?.patients) ? response.patients : []);
      setHasLoadedPatients(true);
    } catch (error) {
      console.error("Failed to load patients for top search:", error);
    } finally {
      setIsLoadingPatients(false);
    }
  };

  const filteredPatients = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];

    return patients
      .filter((patient) =>
        (patient?.name || "").toLowerCase().includes(query)
      )
      .slice(0, 6);
  }, [patients, search]);

  const handleLogout = () => {
    clearAuthSession();
    navigate("/login");
  };

  const openSearchResult = () => {
    const query = search.trim();
    if (!query) return;

    const exactMatch = patients.find(
      (patient) => (patient?.name || "").toLowerCase() === query.toLowerCase()
    );
    const firstMatch = exactMatch || filteredPatients[0];

    if (firstMatch?._id) {
      setSearch(firstMatch.name || query);
      setShowResults(false);
      navigate(`/dashboard/patients/${firstMatch._id}`);
      return;
    }

    // Fallback: go to patients table and keep top search text active.
    navigate("/dashboard/patients-table");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white px-3 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        {/* LEFT */}
        <div className="order-1 flex items-center gap-3">
        <button
          type="button"
          aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
          onClick={onToggleSidebar}
          className="rounded-md border border-gray-300 bg-white p-2 text-gray-800 transition hover:bg-black hover:text-white"
        >
          {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

          <h1 className="hidden text-sm text-gray-600 sm:block">
            {formatDoctorGreeting(doctorName)}
          </h1>
        </div>

        {/* CENTER: SEARCH */}
        <div className="relative order-3 w-full md:order-2 md:w-64">
        <input
          type="text"
          placeholder="Search patients..."
          value={search}
          onChange={(e) => {
            ensurePatientsLoaded();
            setSearch(e.target.value);
            setShowResults(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              openSearchResult();
            }
          }}
          onFocus={() => {
            ensurePatientsLoaded();
            setShowResults(true);
          }}
          onBlur={() => {
            window.setTimeout(() => setShowResults(false), 120);
          }}
          className="w-full rounded-md border border-gray-300 bg-white px-4 py-2
          text-sm text-gray-600 outline-none focus:border-gray-400"
        />

        {showResults && search.trim() && (
          <div className="absolute z-50 mt-2 max-h-72 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
            {filteredPatients.length > 0 ? (
              filteredPatients.map((patient) => (
                <button
                  key={patient?._id}
                  type="button"
                  onClick={() => {
                    setSearch(patient?.name || "");
                    setShowResults(false);
                    navigate(`/dashboard/patients/${patient?._id}`);
                  }}
                  className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm text-gray-800 transition last:border-b-0 hover:bg-gray-50"
                >
                  {patient?.name || "Unnamed patient"}
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-gray-500">No patients were found.</p>
            )}
          </div>
        )}
        </div>

        {/* RIGHT */}
        <button
          onClick={handleLogout}
          className="order-2 ml-auto rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 transition hover:bg-black hover:text-white md:order-3"
        >
          Logout
        </button>
      </div>
    </header>
  );
}

export default Topbar;
