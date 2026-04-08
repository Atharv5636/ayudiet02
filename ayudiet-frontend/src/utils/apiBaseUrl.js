const trimTrailingSlash = (value = "") => String(value || "").replace(/\/+$/g, "");

const isLocalHost = (hostname = "") =>
  hostname === "localhost" || hostname === "127.0.0.1";

const trimLeadingSlash = (value = "") => String(value || "").replace(/^\/+/, "");

export const getApiBaseUrl = () => {
  const configured = trimTrailingSlash(import.meta.env.VITE_API_URL || "");
  const localOverride = trimTrailingSlash(import.meta.env.VITE_LOCAL_API_URL || "");

  if (typeof window !== "undefined" && isLocalHost(window.location.hostname)) {
    if (localOverride) return localOverride;
    // In local dev we prefer the Vite proxy endpoint to avoid browser CORS issues.
    return "/api";
  }

  if (configured) return configured;
  return "http://localhost:5000";
};

export const resolveApiAssetUrl = (rawPath = "") => {
  const raw = String(rawPath || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;

  const base = getApiBaseUrl();
  if (!base) return raw;

  if (base === "/api") {
    return `/api/${trimLeadingSlash(raw)}`;
  }

  return `${base}/${trimLeadingSlash(raw)}`;
};
