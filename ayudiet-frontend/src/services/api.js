import api from "../utils/api";
import { getApiBaseUrl } from "../utils/apiBaseUrl";

export const API_BASE_URL = getApiBaseUrl();
const API_PREFIX = "/api";
const API_PREFIX_STORAGE_KEY = "ayudiet:apiPrefix";

const readPersistedApiPrefix = () => {
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem(API_PREFIX_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
};

const persistApiPrefix = (prefix = "") => {
  if (typeof window === "undefined") return;
  try {
    if (prefix) {
      window.localStorage.setItem(API_PREFIX_STORAGE_KEY, prefix);
      return;
    }
    window.localStorage.removeItem(API_PREFIX_STORAGE_KEY);
  } catch {
    // Ignore storage errors (private mode, blocked storage, etc.)
  }
};

let preferApiPrefixForRelativePaths = readPersistedApiPrefix() === API_PREFIX;

const normalizeRequestData = (body, headers = {}) => {
  if (body === undefined) {
    return undefined;
  }

  const contentType = headers["Content-Type"] || headers["content-type"] || "";
  if (typeof body === "string" && contentType.includes("application/json")) {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }

  return body;
};

export async function fetchJson(path, options = {}) {
  const normalizedPath =
    preferApiPrefixForRelativePaths &&
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith(`${API_PREFIX}/`)
      ? `${API_PREFIX}${path}`
      : path;

  const requestConfig = {
    url: normalizedPath,
    method: options.method || "GET",
    headers: options.headers || {},
    data: normalizeRequestData(options.body, options.headers),
  };

  const shouldRetryWithApiPrefix =
    typeof normalizedPath === "string" &&
    normalizedPath.startsWith("/") &&
    !normalizedPath.startsWith(`${API_PREFIX}/`) &&
    !String(API_BASE_URL).endsWith(API_PREFIX);

  try {
    const response = await api.request(requestConfig);

    return response.data;
  } catch (error) {
    let effectiveError = error;

    if (error?.response?.status === 404 && shouldRetryWithApiPrefix) {
      try {
        const retryResponse = await api.request({
          ...requestConfig,
          url: `${API_PREFIX}${normalizedPath}`,
        });
        preferApiPrefixForRelativePaths = true;
        persistApiPrefix(API_PREFIX);
        return retryResponse.data;
      } catch (retryError) {
        if (retryError?.response?.status && retryError.response.status !== 404) {
          preferApiPrefixForRelativePaths = true;
          persistApiPrefix(API_PREFIX);
        }
        // Prefer the retry error so users see the real result from /api/*.
        effectiveError = retryError;
      }
    }

    const networkFailure = !effectiveError?.response;
    const rawMessage =
      typeof effectiveError?.response?.data === "string"
        ? effectiveError.response.data.trim()
        : "";
    const message =
      (networkFailure
        ? `Cannot reach API server (${API_BASE_URL}). Ensure backend is running and URL is correct.`
        : "") ||
      rawMessage ||
      effectiveError?.response?.data?.message ||
      effectiveError?.response?.data?.error?.message ||
      effectiveError?.message ||
      "Request failed";
    throw new Error(message);
  }
}
