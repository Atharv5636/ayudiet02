import { fetchJson } from "../services/api";

export function persistAuthSession(data) {
  const token = String(data?.token || "").trim();
  const doctorName = String(data?.doctor?.name || "").trim();
  const doctorEmail = String(data?.doctor?.email || "").trim().toLowerCase();

  if (token) {
    localStorage.setItem("token", token);
  }

  if (doctorName) {
    localStorage.setItem("doctorName", doctorName);
  }

  if (doctorEmail) {
    localStorage.setItem("doctorEmail", doctorEmail);
  }
}

export async function completeAuthLogin(data) {
  const token = String(data?.token || "").trim();
  if (!token) {
    throw new Error("Login succeeded but no app token was returned");
  }

  persistAuthSession(data);

  await fetchJson("/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  window.location.assign("/dashboard");
}

export function clearAuthSession() {
  const doctorEmail = String(localStorage.getItem("doctorEmail") || "").trim().toLowerCase();

  localStorage.removeItem("token");
  localStorage.removeItem("doctorName");
  localStorage.removeItem("doctorEmail");

  if (window.google?.accounts?.id) {
    window.google.accounts.id.disableAutoSelect();
    window.google.accounts.id.cancel();

    if (doctorEmail) {
      try {
        window.google.accounts.id.revoke(doctorEmail, () => {});
      } catch {
        // Ignore Google revoke failures during local logout cleanup.
      }
    }
  }
}
