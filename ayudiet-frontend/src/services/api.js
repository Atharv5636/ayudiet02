import api from "../utils/api";
import { getApiBaseUrl } from "../utils/apiBaseUrl";

export const API_BASE_URL = getApiBaseUrl();

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
  try {
    const response = await api.request({
      url: path,
      method: options.method || "GET",
      headers: options.headers || {},
      data: normalizeRequestData(options.body, options.headers),
    });

    return response.data;
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error?.message ||
      error?.message ||
      "Request failed";
    throw new Error(message);
  }
}
