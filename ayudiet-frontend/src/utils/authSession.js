const getAuthTokenFromPayload = (payload) =>
  String(
    payload?.token ||
      payload?.accessToken ||
      payload?.jwt ||
      payload?.data?.token ||
      payload?.data?.accessToken ||
      payload?.data?.jwt ||
      ""
  ).trim();

const getDoctorFromPayload = (payload) =>
  payload?.doctor || payload?.data?.doctor || null;

export function persistAuthSession(data) {
  const token = getAuthTokenFromPayload(data);
  const doctor = getDoctorFromPayload(data);
  const doctorName = String(doctor?.name || "").trim();
  const doctorEmail = String(doctor?.email || "").trim().toLowerCase();

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

export async function completeAuthLogin(data, navigate) {
  const token = getAuthTokenFromPayload(data);
  if (!token) {
    const topLevelKeys = Object.keys(data || {});
    const nestedKeys =
      data?.data && typeof data.data === "object" ? Object.keys(data.data) : [];
    const availableKeys = [...topLevelKeys, ...nestedKeys.map((key) => `data.${key}`)];
    throw new Error(
      `Login succeeded but no app token was returned. Response keys: ${
        availableKeys.join(", ") || "none"
      }`
    );
  }

  persistAuthSession(data);
  if (typeof navigate === "function") {
    navigate("/dashboard", { replace: true });
    return;
  }

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
