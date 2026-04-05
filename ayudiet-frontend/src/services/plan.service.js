import api from "../utils/api";

const API_BASE_URL = import.meta.env.VITE_API_URL;
const PLANS_BASE_PATH = "/plans";
const STRICT_BACKEND_BASE_URLS = [
  `${API_BASE_URL}/plans/strict`,
  import.meta.env.VITE_LLM_BACKEND_URL,
  "https://ayudiet-llm-model.onrender.com",
].filter(Boolean);

const STRICT_BACKEND_TIMEOUT_MS = 40000;

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const fetchPendingPlans = async () => {
  const res = await api.get(`${PLANS_BASE_PATH}/pending`);
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

const readJsonSafe = async (res) => {
  try {
    return await res.json();
  } catch {
    return {};
  }
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
    return await postToStrictBackend("/profile", {
      symptoms: patientData?.symptoms || "",
    });
  } catch (err) {
    console.error("Backend error:", err);
    throw err;
  }
};

export const explainPlanFromBackend = async (patientData) => {
  try {
    return await postToStrictBackend("/explain", {
      symptoms: patientData?.symptoms || "",
    });
  } catch (err) {
    console.error("Backend error:", err);
    throw err;
  }
};
