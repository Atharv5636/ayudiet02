import { useEffect, useMemo, useState } from "react";
import { PDFDownloadLink, PDFViewer } from "@react-pdf/renderer";
import DietPlanPDF from "@/components/DietPlanPDF";
import BackNavLink from "@/components/common/BackNavLink";
import { fetchJson } from "@/services/api";
import { fetchPlansByPatient } from "@/services/plan.service";

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

function DownloadPlan() {
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [loggedInDoctorName, setLoggedInDoctorName] = useState(() => {
    const storedName = localStorage.getItem("doctorName")?.trim();
    if (storedName) return storedName;

    const token = localStorage.getItem("token");
    const tokenName = getDoctorNameFromToken(token);
    if (tokenName) {
      localStorage.setItem("doctorName", tokenName);
      return tokenName;
    }

    return "Doctor";
  });

  useEffect(() => {
    const loadDoctorName = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        const tokenName = getDoctorNameFromToken(token);
        if (tokenName) {
          setLoggedInDoctorName(tokenName);
          localStorage.setItem("doctorName", tokenName);
        }

        const response = await fetchJson("/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const name = response?.doctor?.name?.trim();
        if (name) {
          setLoggedInDoctorName(name);
          localStorage.setItem("doctorName", name);
        }
      } catch (error) {
        console.error("Failed to load doctor profile:", error);
      }
    };

    loadDoctorName();
  }, []);

  useEffect(() => {
    const loadPatients = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem("token");
        const response = await fetchJson("/patients", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const patientList = response?.patients || [];
        setPatients(patientList);
        setMessage("");
      } catch (error) {
        console.error(error);
        setMessage(error.message || "Failed to load patients");
      } finally {
        setLoading(false);
      }
    };

    loadPatients();
  }, []);

  useEffect(() => {
    const loadPlanForPatient = async () => {
      if (!selectedPatientId) {
        setSelectedPatient(null);
        setSelectedPlan(null);
        return;
      }

      const patient = patients.find((item) => item._id === selectedPatientId) || null;
      setSelectedPatient(patient);

      try {
        const response = await fetchPlansByPatient(selectedPatientId);
        const plans = response?.plans || [];

        const latestPlan = [...plans].sort(
          (a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0)
        )[0] || null;

        setSelectedPlan(latestPlan);
      } catch (error) {
        console.error(error);
        setSelectedPlan(null);
      }
    };

    loadPlanForPatient();
  }, [selectedPatientId, patients]);

  const pdfPatient = useMemo(() => {
    if (!selectedPatient) return null;

    const score =
      selectedPlan?.analysis?.effectiveness?.score ??
      selectedPlan?.analysis?.effectiveness ??
      0;
    const issue = selectedPlan?.analysis?.primaryIssue || "Not enough data";
    const actions =
      selectedPlan?.adjustments?.length > 0
        ? selectedPlan.adjustments
        : ["No recommendations available"];
    const plan = Array.isArray(selectedPlan?.meals) ? selectedPlan.meals : [];
    const trendInfo = selectedPlan?.analysis?.effectivenessTrend || {};
    const chartData = [
      { value: typeof trendInfo.previous === "number" ? trendInfo.previous : 63 },
      { value: typeof score === "number" ? Math.round(score) : 60 },
      { value: 58 },
      { value: 55 },
      { value: typeof trendInfo.current === "number" ? trendInfo.current : 50 },
    ];
    const summary =
      selectedPlan?.analysis?.reasonSummary ||
      `Patient ${selectedPatient?.name || "N/A"} currently has an adherence score of ${
        typeof score === "number" ? Math.round(score) : 0
      }%. Focus area: ${issue}.`;

    return {
      name: selectedPatient?.name || "N/A",
      age: selectedPatient?.age ?? "N/A",
      score: typeof score === "number" ? Math.round(score) : 0,
      issue,
      actions,
      plan,
      doctorName: loggedInDoctorName,
      clinicName: "AyuDiet Clinic",
      date: new Date().toLocaleDateString(),
      summary,
      chartData,
      logoSrc: null,
    };
  }, [selectedPatient, selectedPlan, loggedInDoctorName]);

  return (
    <div className="min-h-screen text-gray-900">
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 space-y-6">
        <BackNavLink to="/dashboard" label="Back to Dashboard" />
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">Download Diet Plan</h1>
          <p className="mt-1 text-sm text-gray-600">
            Select a patient and generate a professional A4 PDF report.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
            <div>
              <label
                htmlFor="patientSelect"
                className="mb-2 block text-xs uppercase tracking-wide text-gray-500"
              >
                Patient
              </label>
              <select
                id="patientSelect"
                value={selectedPatientId}
                onChange={(event) => setSelectedPatientId(event.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
                disabled={loading}
              >
                <option value="">Select patient</option>
                {patients.map((patient) => (
                  <option key={patient._id} value={patient._id}>
                    {patient.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShowPreview((prev) => !prev)}
              disabled={!pdfPatient}
              className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-800 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {showPreview ? "Hide Preview" : "Preview PDF"}
            </button>

            <div className="rounded-xl bg-yellow-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60">
              {pdfPatient ? (
                <PDFDownloadLink
                  document={<DietPlanPDF patient={pdfPatient} />}
                  fileName={`${pdfPatient.name || "diet-plan"}-diet-plan.pdf`}
                >
                  {({ loading: preparing }) =>
                    preparing ? "Preparing PDF..." : "Download PDF"
                  }
                </PDFDownloadLink>
              ) : (
                <span>Select patient</span>
              )}
            </div>
          </div>

          {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}
        </div>

        {showPreview && pdfPatient ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <PDFViewer width="100%" height={760}>
              <DietPlanPDF patient={pdfPatient} />
            </PDFViewer>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default DownloadPlan;
