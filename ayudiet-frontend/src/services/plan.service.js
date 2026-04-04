const BASE_URL = "http://localhost:3000/plans";
const STRICT_BACKEND_BASE_URLS = [
  "http://localhost:3000/plans/strict",
  import.meta.env.VITE_LLM_BACKEND_URL,
  "https://ayudiet-llm-model.onrender.com",
].filter(Boolean);

const STRICT_BACKEND_TIMEOUT_MS = 40000;
const LOCAL_PROXY_TIMEOUT_MS = 70000;

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");

  return token ? { Authorization: `Bearer ${token}` } : {};
};

const readJsonSafe = async (res) => {
  try {
    return await res.json();
  } catch {
    return {};
  }
};

export const fetchPendingPlans = async () => {
  const res = await fetch(`${BASE_URL}/pending`, {
    headers: getAuthHeaders(),
  });
  return res.json();
};

export const fetchPlansByPatient = async (patientId) => {
  const res = await fetch(`${BASE_URL}/patient/${patientId}`, {
    headers: getAuthHeaders(),
  });

  if (res.status === 404) {
    return { success: true, plans: [] };
  }

  const data = await readJsonSafe(res);
  if (!res.ok) {
    throw new Error(data?.message || "Failed to fetch patient plans");
  }

  return data;
};

export const approvePlan = async (planId) => {
  const res = await fetch(`${BASE_URL}/${planId}/approve`, {
    method: "PATCH",
    headers: getAuthHeaders(),
  });
  return res.json();
};

export const rejectPlan = async (planId) => {
  const res = await fetch(`${BASE_URL}/${planId}/reject`, {
    method: "PATCH",
    headers: getAuthHeaders(),
  });
  return res.json();
};

export const createPlan = async (planPayload) => {
  const res = await fetch(`${BASE_URL}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(planPayload),
  });

  const data = await readJsonSafe(res);
  if (!res.ok) {
    throw new Error(data?.message || "Failed to create plan");
  }
  return data.plan;
};

export const updatePlan = async (planId, planPayload) => {
  const res = await fetch(`${BASE_URL}/${planId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(planPayload),
  });

  const data = await readJsonSafe(res);
  if (!res.ok) {
    throw new Error(data?.message || "Failed to update plan");
  }
  return data.plan;
};

const postToStrictBackend = async (path, payload) => {
  let lastError = new Error("Strict backend unavailable");

  for (const baseUrl of STRICT_BACKEND_BASE_URLS) {
    let timeoutId;
    try {
      const controller = new AbortController();
      const timeoutMs = baseUrl.startsWith("http://localhost:3000")
        ? LOCAL_PROXY_TIMEOUT_MS
        : STRICT_BACKEND_TIMEOUT_MS;
      timeoutId = setTimeout(
        () => controller.abort(),
        timeoutMs
      );

      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(baseUrl.startsWith("http://localhost:3000")
            ? getAuthHeaders()
            : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

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
