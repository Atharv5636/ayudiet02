import { fetchJson } from "./api";
import api from "../utils/api";

function getAuthHeaders(includeJsonContentType = false) {
  const token = localStorage.getItem("token");

  return {
    ...(includeJsonContentType ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchPatientById(patientId) {
  const response = await fetchJson(`/patients/${patientId}`, {
    headers: getAuthHeaders(),
  });

  return response.patient || response;
}

export async function updatePatient(patientId, payload) {
  const response = await fetchJson(`/patients/${patientId}`, {
    method: "PUT",
    headers: getAuthHeaders(true),
    body: JSON.stringify(payload),
  });

  return response.patient || response;
}

export async function deletePatient(patientId) {
  return fetchJson(`/patients/${patientId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

export async function uploadPatientDocument(patientId, file) {
  const formData = new FormData();
  formData.append("document", file);

  try {
    const response = await api.post(`/patients/${patientId}/documents`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      error?.message ||
      "Failed to upload document";
    throw new Error(message);
  }
}

export async function uploadPatientPhoto(patientId, file) {
  const formData = new FormData();
  formData.append("photo", file);

  try {
    const response = await api.post(`/patients/${patientId}/photo`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      error?.message ||
      "Failed to upload patient photo";
    throw new Error(message);
  }
}

export async function deletePatientPhoto(patientId) {
  const response = await fetchJson(`/patients/${patientId}/photo`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  return response.patient || response;
}

export async function deletePatientDocument(patientId, documentId) {
  const response = await fetchJson(`/patients/${patientId}/documents/${documentId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  return response.patient || response;
}

export async function openPatientDocument(patientId, documentId) {
  try {
    const response = await api.get(
      `/patients/${patientId}/documents/${documentId}/download`,
      {
        responseType: "blob",
      }
    );

    const blobUrl = URL.createObjectURL(response.data);
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60 * 1000);
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      error?.message ||
      "Failed to open document";
    throw new Error(message);
  }
}
