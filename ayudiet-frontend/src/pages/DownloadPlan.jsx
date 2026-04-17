import React, { useEffect, useMemo, useState } from "react";
import BackNavLink from "@/components/common/BackNavLink";
import api from "@/utils/api";
import { fetchJson } from "@/services/api";
import { fetchPlansByPatient, generateSlotChart } from "@/services/plan.service";

const PLAN_SLOT_KEYS = [
  "earlyMorning",
  "morning",
  "afterExercise",
  "breakfast",
  "midMorning",
  "lunch",
  "after2Hours",
  "evening",
  "lateEvening",
  "dinner",
  "bedTime",
];
const DEFAULT_CLINIC_MOBILE = "9421912999";

const cleanMealText = (value = "") =>
  String(value || "")
    .split("|")[0]
    .replace(/\s+/g, " ")
    .trim();

const normalizeText = (value = "") => String(value || "").trim().toLowerCase();

const getGoalProfile = (goal = "", conditions = "") => {
  const text = `${normalizeText(goal)} ${normalizeText(conditions)}`;
  if (text.includes("muscle") || text.includes("weight gain") || text.includes("bulk")) {
    return "muscle_gain";
  }
  if (text.includes("diabet") || text.includes("sugar")) return "diabetes_support";
  if (text.includes("pcos")) return "pcos_support";
  if (text.includes("hyper") || text.includes("blood pressure")) return "hypertension_support";
  if (text.includes("thyroid")) return "thyroid_support";
  if (text.includes("digest") || text.includes("acidity") || text.includes("bloat")) {
    return "digestion_support";
  }
  if (text.includes("weight loss") || text.includes("fat loss")) return "weight_loss";
  return "general_wellness";
};

const pickByGoal = (goalProfile, mapByGoal, fallback) =>
  mapByGoal[goalProfile] || fallback;

const buildSlotPlanForDay = ({ dayMeal = {}, patient = {}, selectedPlan = {} }) => {
  const breakfast = cleanMealText(dayMeal?.breakfast);
  const lunch = cleanMealText(dayMeal?.lunch);
  const dinner = cleanMealText(dayMeal?.dinner);
  const goal = selectedPlan?.goal || patient?.planningInputs?.primaryGoal || "";
  const conditions = patient?.healthConditions || "";
  const goalProfile = getGoalProfile(goal, conditions);
  const dosha = normalizeText(selectedPlan?.doshaType || "");
  const planningInputs = patient?.planningInputs || {};
  const mealTimings = planningInputs?.mealTimings || {};
  const stressLevel = Number(planningInputs?.stressLevel || 3);
  const waterTarget = Number(planningInputs?.waterIntakeLiters || 2);
  const activityLevel = normalizeText(planningInputs?.activityLevel || "");

  const earlyMorningBase = pickByGoal(
    goalProfile,
    {
      weight_loss: "1 glass lukewarm water + lemon",
      diabetes_support: "1 glass lukewarm water + chia/flax seeds",
      pcos_support: "1 glass lukewarm water + soaked methi seeds",
      muscle_gain: "1 glass lukewarm water + 4 soaked almonds",
      digestion_support: "1 glass warm jeera water",
    },
    "1 glass lukewarm water"
  );

  const morningDrink = stressLevel >= 4 ? "1 cup herbal tea" : "1 cup tea / black coffee";
  const afterExercise = pickByGoal(
    goalProfile,
    {
      muscle_gain: "200 ml milk + protein-rich snack",
      weight_loss: "1 fruit + water",
      diabetes_support: "200 ml toned milk or handful nuts",
      digestion_support: "200 ml buttermilk",
    },
    "200 ml toned milk or 1 fruit"
  );

  const midMorning = pickByGoal(
    goalProfile,
    {
      diabetes_support: "1 low GI fruit (apple/guava) or nuts",
      weight_loss: "1 fruit or cucumber bowl",
      muscle_gain: "1 banana or fruit + nuts",
      digestion_support: "1 fruit (papaya/mosambi)",
    },
    "1 fruit / coconut water"
  );

  const after2Hours = pickByGoal(
    goalProfile,
    {
      hypertension_support: "Coconut water (unsalted day)",
      diabetes_support: "1 glass buttermilk (no sugar)",
      weight_loss: "1 glass buttermilk",
      muscle_gain: "1 glass lassi or buttermilk",
    },
    "1 glass buttermilk / coconut water"
  );

  const evening = pickByGoal(
    goalProfile,
    {
      weight_loss: "1 cup tea/coffee + roasted chana",
      muscle_gain: "1 cup tea/coffee + nuts",
      diabetes_support: "1 cup green tea + handful seeds",
      digestion_support: "1 cup herbal tea + light snack",
    },
    "1 cup tea/coffee + light snack"
  );

  const lateEvening = pickByGoal(
    goalProfile,
    {
      weight_loss: "Cucumber / tomato salad",
      muscle_gain: "Fruit bowl + nuts",
      diabetes_support: "Sprouts / salad bowl",
      digestion_support: "Stewed fruit or light salad",
    },
    "1 fruit / salad"
  );

  const bedTime = pickByGoal(
    goalProfile,
    {
      muscle_gain: "1 cup warm milk + haldi",
      diabetes_support: "1 cup warm turmeric milk (no sugar)",
      digestion_support: "1 cup warm milk or herbal infusion",
    },
    "1 cup warm milk"
  );

  const hydrationHint =
    waterTarget >= 3
      ? "Keep hydration high (3L/day target)"
      : waterTarget <= 1.5
        ? "Increase hydration through the day"
        : "Keep hydration balanced through the day";

  const doshaHint =
    dosha === "vata"
      ? "Prefer warm meals and drinks"
      : dosha === "pitta"
        ? "Prefer cooling, less spicy choices"
        : dosha === "kapha"
          ? "Prefer light and less oily choices"
          : "Follow balanced Ayurvedic choices";

  const activityHint =
    activityLevel.includes("high") || activityLevel.includes("active")
      ? "Post-workout slot prioritized"
      : "Maintain light activity routine";

  const withTime = (text = "", timeValue = "") => {
    const time = String(timeValue || "").trim();
    const value = String(text || "").trim();
    if (!time || !value) return value || "-";
    if (/^\d{1,2}:\d{2}\b/.test(value)) return value;
    return `${time} - ${value}`;
  };

  return {
    earlyMorning: withTime(
      `${earlyMorningBase} (${doshaHint})`,
      mealTimings?.wakeUpTime
    ),
    morning: withTime(morningDrink, mealTimings?.wakeUpTime),
    afterExercise: `${afterExercise} (${activityHint})`,
    breakfast: withTime(breakfast || "-", mealTimings?.breakfastTime),
    midMorning,
    lunch: withTime(lunch || "-", mealTimings?.lunchTime),
    after2Hours: `${after2Hours} (${hydrationHint})`,
    evening: withTime(evening, mealTimings?.eveningSnackTime),
    lateEvening: withTime(lateEvening, mealTimings?.eveningSnackTime),
    dinner: withTime(dinner || "-", mealTimings?.dinnerTime),
    bedTime: withTime(bedTime, mealTimings?.bedTime),
  };
};

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
  const [pdfMode, setPdfMode] = useState("english_only");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [slotPlans, setSlotPlans] = useState([]);
  const [message, setMessage] = useState("");
  const [previewBlobUrl, setPreviewBlobUrl] = useState("");
  const [loggedInDoctorMobile, setLoggedInDoctorMobile] = useState(() => {
    const stored = localStorage.getItem("doctorMobile")?.trim();
    return stored || "";
  });
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
    return () => {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewBlobUrl]);

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
        const mobile = String(
          response?.doctor?.clinicMobile ||
          response?.doctor?.mobile ||
          response?.doctor?.phone ||
          ""
        ).trim();
        if (mobile) {
          setLoggedInDoctorMobile(mobile);
          localStorage.setItem("doctorMobile", mobile);
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
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl("");
    }
    setShowPreview(false);
  }, [selectedPatientId, pdfMode]);

  useEffect(() => {
    const loadPlanForPatient = async () => {
      if (!selectedPatientId) {
        setSelectedPatient(null);
        setSelectedPlan(null);
        setSlotPlans([]);
        return;
      }

      const patient = patients.find((item) => item._id === selectedPatientId) || null;
      setSelectedPatient(patient);

      try {
        const response = await fetchPlansByPatient(selectedPatientId);
        const plans = response?.plans || [];

        const latestPlan =
          [...plans]
            .sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0))
            .sort((a, b) => Number(Boolean(b?.isActive)) - Number(Boolean(a?.isActive)))
            .sort(
              (a, b) => Number(Boolean(b?.status === "approved")) - Number(Boolean(a?.status === "approved"))
            )[0] || null;

        setSelectedPlan(latestPlan);

        const latestPlanMeals = Array.isArray(latestPlan?.meals) ? latestPlan.meals : [];
        const hasExplicitSlotData = latestPlanMeals.some((dayMeal) =>
          PLAN_SLOT_KEYS.some((slotKey) => String(dayMeal?.[slotKey] || "").trim())
        );

        if (latestPlan?._id && !hasExplicitSlotData) {
          try {
            const slotResponse = await generateSlotChart({
              patientId: selectedPatientId,
              planId: latestPlan._id,
            });
            setSlotPlans(
              Array.isArray(slotResponse?.slotPlans) ? slotResponse.slotPlans : []
            );
          } catch (error) {
            console.error("Unable to generate AI slot chart, using fallback", error);
            setSlotPlans([]);
          }
        } else {
          setSlotPlans([]);
        }
      } catch (error) {
        console.error(error);
        setSelectedPlan(null);
        setSlotPlans([]);
      }
    };

    loadPlanForPatient();
  }, [selectedPatientId, patients]);

  const pdfPatient = useMemo(() => {
    if (!selectedPatient) return null;

    const plan = Array.isArray(selectedPlan?.meals) ? selectedPlan.meals : [];

    const normalizedPlanSlots = plan.map((dayMeal) => {
      const normalized = {};
      PLAN_SLOT_KEYS.forEach((slotKey) => {
        normalized[slotKey] = cleanMealText(dayMeal?.[slotKey] || "");
      });
      return normalized;
    });

    const hasPlanSlotData = normalizedPlanSlots.some((daySlots) =>
      PLAN_SLOT_KEYS.some((slotKey) => String(daySlots?.[slotKey] || "").trim())
    );

    const fallbackSlotPlans = plan.map((dayMeal) =>
      buildSlotPlanForDay({
        dayMeal,
        patient: selectedPatient,
        selectedPlan,
      })
    );

    return {
      name: selectedPatient?.name || "N/A",
      age: selectedPatient?.age ?? "N/A",
      goal:
        String(
          selectedPlan?.goal ||
            selectedPatient?.planningInputs?.primaryGoal ||
            "General Wellness"
        ).trim() || "General Wellness",
      doshaType: String(selectedPlan?.doshaType || "-").trim() || "-",
      planTitle: String(selectedPlan?.title || "Diet Chart").trim() || "Diet Chart",
      plan,
      doctorName: loggedInDoctorName,
      clinicName: "AyuDiet",
      clinicMobile: loggedInDoctorMobile || DEFAULT_CLINIC_MOBILE,
      date: new Date().toISOString(),
      localRegion:
        selectedPatient?.planningInputs?.localRegion || selectedPatient?.localRegion || "",
      slotPlans: hasPlanSlotData
        ? normalizedPlanSlots
        : Array.isArray(slotPlans) && slotPlans.length === plan.length
          ? slotPlans
          : fallbackSlotPlans,
    };
  }, [selectedPatient, selectedPlan, loggedInDoctorName, loggedInDoctorMobile, slotPlans]);

  const requestPdfBlob = async () => {
    if (!pdfPatient) throw new Error("No patient selected");

    const payload = {
      patient: pdfPatient,
      pdfMode: "english_only",
      regionalLanguage: "auto",
    };

    const response = await api.post("/plans/download-pdf", payload, {
      responseType: "blob",
    });

    const contentType = String(response?.headers?.["content-type"] || "").toLowerCase();
    const blob = response?.data;

    if (!(blob instanceof Blob)) {
      throw new Error("Invalid PDF response");
    }

    if (!contentType.includes("application/pdf") && blob.type !== "application/pdf") {
      throw new Error("Server did not return a PDF file");
    }

    return blob;
  };

  const handleDownloadPdf = async () => {
    if (!pdfPatient || downloading) return;

    try {
      setDownloading(true);
      setMessage("");
      const blob = await requestPdfBlob();
      const filename = `${pdfPatient.name || "diet-plan"}-diet-plan.pdf`;

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);

      setMessage("PDF generated.");
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      setMessage("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const handlePreviewToggle = async () => {
    if (!pdfPatient) return;

    if (showPreview) {
      setShowPreview(false);
      return;
    }

    try {
      setPreviewLoading(true);
      setMessage("");
      const blob = await requestPdfBlob();
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
      const objectUrl = URL.createObjectURL(blob);
      setPreviewBlobUrl(objectUrl);
      setShowPreview(true);
    } catch (error) {
      console.error("Preview generation failed:", error);
      setMessage("Preview failed. Please try download directly.");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-gray-900">
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 space-y-6">
        <BackNavLink to="/dashboard" label="Back to Dashboard" />
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">Download Diet Plan</h1>
          <p className="mt-1 text-sm text-gray-600">
            Select a patient and generate a professional A4 PDF report.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_220px_auto_auto] md:items-end">
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

            <div>
              <label
                htmlFor="pdfMode"
                className="mb-2 block text-xs uppercase tracking-wide text-gray-500"
              >
                PDF Mode
              </label>
              <select
                id="pdfMode"
                value={pdfMode}
                onChange={(event) => setPdfMode(event.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-gray-400 focus:outline-none"
              >
                <option value="english_only">Entire English</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handlePreviewToggle}
              disabled={!pdfPatient || previewLoading}
              className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-800 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {showPreview ? "Hide Preview" : previewLoading ? "Preparing..." : "Preview PDF"}
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!pdfPatient || downloading}
              className="rounded-xl bg-yellow-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {!pdfPatient
                ? "Select patient"
                : downloading
                  ? "Preparing PDF..."
                  : "Download PDF"}
            </button>
          </div>

          {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}
        </div>

        {showPreview && previewBlobUrl ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <iframe
              title="Diet plan preview"
              src={previewBlobUrl}
              className="w-full"
              style={{ height: 760, border: "none" }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default DownloadPlan;
