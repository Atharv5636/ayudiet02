export const getFrontendEnvHealth = () => {
  const apiUrl = String(import.meta.env.VITE_API_URL || "").trim();
  const clerkEnabled = import.meta.env.VITE_ENABLE_CLERK_AUTH === "true";
  const clerkKey = String(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "").trim();

  const warnings = [];
  const isProd = import.meta.env.PROD;

  if (!apiUrl) {
    warnings.push("VITE_API_URL is not set. API calls may fail outside local defaults.");
  } else if (!/^https?:\/\//i.test(apiUrl)) {
    warnings.push("VITE_API_URL should include protocol (http:// or https://).");
  }

  if (isProd && /^http:\/\//i.test(apiUrl) && !/localhost|127\.0\.0\.1/i.test(apiUrl)) {
    warnings.push("VITE_API_URL is using http in production. Prefer https.");
  }

  if (clerkEnabled && !clerkKey) {
    warnings.push(
      "VITE_ENABLE_CLERK_AUTH=true but VITE_CLERK_PUBLISHABLE_KEY is missing."
    );
  }

  return {
    warnings,
    summary: {
      apiUrl: apiUrl || "(not set)",
      clerkEnabled,
      hasClerkKey: Boolean(clerkKey),
    },
  };
};

