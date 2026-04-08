import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, TriangleAlert } from "lucide-react";
import { useOutletContext } from "react-router-dom";

import PatientsTable from "../../components/dashboard/PatientsTable";
import BackNavLink from "../../components/common/BackNavLink";
import { deletePatient } from "../../services/patient.service";
import { fetchPlansByPatient } from "../../services/plan.service";
import { fetchJson } from "../../services/api";
import { getTrend, getTrendLabel } from "@/utils/trendUtils";

function PatientsTablePage() {
  const outletContext = useOutletContext();
  const search = outletContext?.search || "";

  const [patients, setPatients] = useState([]);
  const [activePlans, setActivePlans] = useState([]);
  const [message, setMessage] = useState("");
  const [showMockData, setShowMockData] = useState(true);

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
      return `${trend.previous} → ${trend.current}`;
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

  const getLatestPlanForPatient = (patient) =>
    filteredPlans.find((plan) => {
      const planPatientId =
        typeof plan?.patient === "object" ? plan?.patient?._id : plan?.patient;
      return planPatientId === patient._id;
    }) || null;

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

  const formatTrendLabel = (trend) => getTrendLabel(trend);

  const getTrendTone = (trend) => {
    if (trend === "down") {
      return "text-gray-700";
    }

    if (trend === "up") {
      return "text-gray-700";
    }

    return "text-gray-700";
  };

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

  const filteredPatients = patients.filter((patient) =>
    patient.name.toLowerCase().includes(search.toLowerCase())
  );

  const enrichedPatients = filteredPatients.map((patient) => ({
    ...patient,
    dashboardIntelligence: getPatientIntelligence(patient),
  }));

  const loadActivePlans = useCallback(async (patientList = []) => {
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
  }, []);

  useEffect(() => {
    const loadPatientsTableData = async () => {
      try {
        const token = localStorage.getItem("token");
        const patientsResponse = await fetchJson("/patients", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const loadedPatients = patientsResponse?.patients || [];
        setPatients(loadedPatients);
        setMessage("");

        await loadActivePlans(loadedPatients);
      } catch (error) {
        setMessage(error.message || "Unable to load patient intelligence data.");
        console.error("Failed to fetch patient intelligence data", error);
      }
    };

    loadPatientsTableData();
  }, [loadActivePlans]);

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
      alert("Unable to delete the patient. Please try again.");
    }
  };

  return (
    <div className="min-h-screen text-gray-900">
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 space-y-4">
        <BackNavLink to="/dashboard" label="Back to Dashboard" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Patients Table</h1>
            <p className="mt-1 text-sm text-gray-600">
              Dedicated view for patient intelligence and quick case actions.
            </p>
          </div>

          <button
            onClick={() => setShowMockData((prev) => !prev)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-800 transition hover:bg-black hover:text-white"
          >
            {showMockData ? "Hide Mock Data" : "Show Mock Data"}
          </button>
        </div>

        <PatientsTable
          patients={enrichedPatients}
          onDelete={handleDeletePatient}
          formatTrendLabel={formatTrendLabel}
          getTrendTone={getTrendTone}
          getTrendMeta={getTrendMeta}
        />

        {message && (
          <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default PatientsTablePage;
