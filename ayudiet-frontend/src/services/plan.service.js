import api from "../utils/api";
import { getApiBaseUrl } from "../utils/apiBaseUrl";

const API_BASE_URL = getApiBaseUrl();
const PLANS_BASE_PATH = "/plans";
const STRICT_BACKEND_BASE_URLS = [
  `${API_BASE_URL}/plans/strict`,
  import.meta.env.VITE_LLM_BACKEND_URL,
  "https://ayudiet-llm-model.onrender.com",
].filter(Boolean);

const STRICT_BACKEND_TIMEOUT_MS = 40000;
const MIN_GENERATION_CONFIDENCE = 0.45;
const ALLOWED_DOSHAS = new Set(["vata", "pitta", "kapha"]);
const ALLOWED_RISK_FLAGS = new Set([
  "none",
  "diabetes",
  "high_blood_pressure",
  "obesity",
  "thyroid",
  "pcos",
  "high_cholesterol",
  "digestive_issues",
]);

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const fetchPendingPlans = async () => {
  const res = await api.get(`${PLANS_BASE_PATH}/pending`);
  return res.data;
};

export const fetchActivePlans = async () => {
  const res = await api.get(`${PLANS_BASE_PATH}/active`);
  return res.data;
};

export const fetchPlansByPatient = async (patientId) => {
  try {
    const res = await api.get(`${PLANS_BASE_PATH}/patient/${patientId}`);
    return res.data;
  } catch (error) {
    if (error?.response?.status === 404) {
      return { success: true, plans: [] };
    }
    throw new Error(error?.response?.data?.message || "Failed to fetch patient plans");
  }
};

export const approvePlan = async (planId) => {
  const res = await api.patch(`${PLANS_BASE_PATH}/${planId}/approve`);
  return res.data;
};

export const rejectPlan = async (planId) => {
  const res = await api.patch(`${PLANS_BASE_PATH}/${planId}/reject`);
  return res.data;
};

export const createPlan = async (planPayload) => {
  try {
    const res = await api.post(PLANS_BASE_PATH, planPayload);
    return res.data.plan;
  } catch (error) {
    throw new Error(error?.response?.data?.message || "Failed to create plan");
  }
};

export const updatePlan = async (planId, planPayload) => {
  try {
    const res = await api.put(`${PLANS_BASE_PATH}/${planId}`, planPayload);
    return res.data.plan;
  } catch (error) {
    throw new Error(error?.response?.data?.message || "Failed to update plan");
  }
};

export const generatePersonalizedMeals = async ({ patientId, goal, doshaType }) => {
  if (!patientId || !goal || !doshaType) {
    throw new Error("patientId, goal, and doshaType are required");
  }

  try {
    const res = await api.post(`${PLANS_BASE_PATH}/generate-ai`, {
      patientId,
      goal,
      doshaType,
    });
    return res.data;
  } catch (error) {
    throw new Error(
      error?.response?.data?.message || "Failed to generate personalized meals"
    );
  }
};

const readJsonSafe = async (res) => {
  try {
    return await res.json();
  } catch {
    return {};
  }
};

const normalizeConfidence = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
};

const normalizeRiskFlags = (riskFlags) => {
  if (!Array.isArray(riskFlags)) {
    return ["none"];
  }

  const cleaned = riskFlags
    .map((flag) => (typeof flag === "string" ? flag.trim().toLowerCase() : ""))
    .filter(Boolean)
    .filter((flag) => ALLOWED_RISK_FLAGS.has(flag));

  return cleaned.length ? [...new Set(cleaned)] : ["none"];
};

const normalizeDosha = (value, fallback = "vata") => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ALLOWED_DOSHAS.has(normalized) ? normalized : fallback;
};

const buildSafeFallbackProfile = (preferredDosha = "vata", reason = "schema_invalid") => ({
  risk_flags: ["none"],
  primary_dosha: normalizeDosha(preferredDosha, "vata"),
  confidence: 0.2,
  fallback: true,
  fallback_reason: reason,
});

const normalizeProfileResponse = (rawData, preferredDosha = "vata") => {
  if (!rawData || typeof rawData !== "object") {
    return buildSafeFallbackProfile(preferredDosha, "empty_response");
  }

  const profile = {
    risk_flags: normalizeRiskFlags(rawData.risk_flags),
    primary_dosha: normalizeDosha(rawData.primary_dosha, preferredDosha),
    confidence: normalizeConfidence(rawData.confidence, 0),
    fallback: Boolean(rawData.fallback),
    fallback_reason: rawData.fallback_reason || null,
  };

  const hasSchema =
    Array.isArray(profile.risk_flags) &&
    profile.risk_flags.length > 0 &&
    typeof profile.primary_dosha === "string" &&
    typeof profile.confidence === "number";

  if (!hasSchema) {
    return buildSafeFallbackProfile(preferredDosha, "schema_invalid");
  }

  if (profile.fallback || profile.confidence < MIN_GENERATION_CONFIDENCE) {
    return {
      ...buildSafeFallbackProfile(
        preferredDosha,
        profile.fallback ? profile.fallback_reason || "backend_fallback" : "low_confidence"
      ),
      confidence: profile.confidence,
      source_profile: profile,
    };
  }

  return profile;
};

const normalizeExplainResponse = (rawData, preferredDosha = "vata") => {
  if (!rawData || typeof rawData !== "object") {
    return {
      risk_flags: ["none"],
      primary_dosha: normalizeDosha(preferredDosha, "vata"),
      confidence: 0,
      fallback: true,
      fallback_reason: "empty_response",
    };
  }

  return {
    risk_flags: normalizeRiskFlags(rawData.risk_flags),
    primary_dosha: normalizeDosha(rawData.primary_dosha, preferredDosha),
    confidence: normalizeConfidence(rawData.confidence, 0),
    fallback: Boolean(rawData.fallback),
    fallback_reason: rawData.fallback_reason || null,
  };
};

const buildAiRequestPayload = (patientData = {}) => {
  const patientContext =
    patientData?.patientContext && typeof patientData.patientContext === "object"
      ? patientData.patientContext
      : {};
  const progressContext =
    patientData?.progressContext && typeof patientData.progressContext === "object"
      ? patientData.progressContext
      : {};
  const constraints =
    patientData?.constraints && typeof patientData.constraints === "object"
      ? patientData.constraints
      : {};

  return {
    symptoms: patientData?.symptoms || "",
    preferredDosha: normalizeDosha(patientData?.preferredDosha, "vata"),
    goal: patientData?.goal || "",
    patientContext,
    progressContext,
    constraints,
  };
};

const postToStrictBackend = async (path, payload) => {
  let lastError = new Error("Strict backend unavailable");

  for (const baseUrl of STRICT_BACKEND_BASE_URLS) {
    let timeoutId;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), STRICT_BACKEND_TIMEOUT_MS);
      const shouldAttachBearer = baseUrl.startsWith(API_BASE_URL);

      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(shouldAttachBearer ? getAuthHeaders() : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await readJsonSafe(res);
      if (!data.success) {
        throw new Error(data.error?.message || data.error || "Backend failed");
      }

      return data.data;
    } catch (err) {
      lastError =
        err?.name === "AbortError"
          ? new Error(`Timeout while connecting to ${baseUrl}${path}`)
          : err;
      console.warn(`Strict backend failed: ${baseUrl}${path}`, err);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError;
};

export const generatePlanFromBackend = async (patientData) => {
  try {
    const response = await postToStrictBackend(
      "/profile",
      buildAiRequestPayload(patientData)
    );

    return normalizeProfileResponse(response, patientData?.preferredDosha || "vata");
  } catch (err) {
    console.error("Backend error:", err);
    return buildSafeFallbackProfile(
      patientData?.preferredDosha || "vata",
      "backend_unavailable"
    );
  }
};

export const explainPlanFromBackend = async (patientData) => {
  try {
    const response = await postToStrictBackend(
      "/explain",
      buildAiRequestPayload(patientData)
    );

    return normalizeExplainResponse(response, patientData?.preferredDosha || "vata");
  } catch (err) {
    console.error("Backend error:", err);
    return {
      risk_flags: ["none"],
      primary_dosha: normalizeDosha(patientData?.preferredDosha, "vata"),
      confidence: 0,
      fallback: true,
      fallback_reason: "backend_unavailable",
    };
  }
};

export const chatWithBackend = async ({ message, sessionId } = {}) => {
  const normalizedMessage = String(message || "").trim();
  if (!normalizedMessage) {
    throw new Error("message is required");
  }

  const response = await postToStrictBackend("/chat", {
    message: normalizedMessage,
    ...(sessionId ? { session_id: sessionId } : {}),
  });

  return {
    reply: String(response?.reply || response?.response || "").trim(),
    sessionId:
      response?.session_id || response?.sessionId || String(sessionId || "").trim() || null,
    fallback: Boolean(response?.fallback),
  };
};
