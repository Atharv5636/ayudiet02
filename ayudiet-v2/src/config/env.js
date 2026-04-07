const maskValue = (value = "", visible = 4) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length <= visible) return "*".repeat(raw.length);
  return `${"*".repeat(Math.max(raw.length - visible, 0))}${raw.slice(-visible)}`;
};

const isPlaceholderValue = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;

  const placeholders = [
    "your_key",
    "your api key",
    "your_api_key",
    "your_groq_key",
    "your_openai_key",
    "replace_me",
    "changeme",
    "change_me",
    "test_key",
    "dummy",
  ];

  return placeholders.some((token) => normalized.includes(token));
};

const hasLikelyStrongSecret = (value = "") => String(value || "").trim().length >= 32;

const validateRuntimeEnv = (env = process.env) => {
  const errors = [];
  const warnings = [];
  const isProduction = String(env.NODE_ENV || "").toLowerCase() === "production";

  const required = ["MONGO_URI", "JWT_SECRET"];
  const missing = required.filter((key) => !String(env[key] || "").trim());
  if (missing.length > 0) {
    errors.push(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const jwtSecret = String(env.JWT_SECRET || "").trim();
  if (jwtSecret === "change_this_to_a_secure_random_secret") {
    errors.push("JWT_SECRET is using a placeholder value. Set a strong secret.");
  }
  if (jwtSecret && !hasLikelyStrongSecret(jwtSecret)) {
    const message = "JWT_SECRET should be at least 32 characters for safer token signing.";
    if (isProduction) errors.push(message);
    else warnings.push(message);
  }

  if (isProduction && !String(env.CORS_ORIGIN || env.FRONTEND_ORIGIN || "").trim()) {
    errors.push("Set CORS_ORIGIN (or FRONTEND_ORIGIN) in production.");
  }

  const aiKeyCandidates = [
    { key: "MEALS_LLM_API_KEY", value: env.MEALS_LLM_API_KEY },
    { key: "GROQ_API_KEY", value: env.GROQ_API_KEY },
    { key: "OPENAI_API_KEY", value: env.OPENAI_API_KEY },
    { key: "GEMINI_API_KEY", value: env.GEMINI_API_KEY },
    { key: "AYUDIET_LLM_API_KEY", value: env.AYUDIET_LLM_API_KEY || env.AYUDIET_API_KEY },
  ];

  const configuredAiKeys = aiKeyCandidates.filter(({ value }) => String(value || "").trim());
  if (configuredAiKeys.length === 0) {
    warnings.push(
      "No AI provider key is configured. AI generation/chat may fall back or fail in production."
    );
  }

  configuredAiKeys.forEach(({ key, value }) => {
    if (isPlaceholderValue(value)) {
      const message = `${key} looks like a placeholder value.`;
      if (isProduction) errors.push(message);
      else warnings.push(message);
    }
  });

  const mealsModel = String(env.MEALS_LLM_MODEL || "").trim();
  const mealsBase = String(env.MEALS_LLM_BASE_URL || env.GROQ_BASE_URL || "").trim().toLowerCase();
  if (mealsModel.startsWith("openai/") && mealsBase && !mealsBase.includes("groq.com")) {
    warnings.push(
      "MEALS_LLM_MODEL uses an OpenAI-prefixed Groq model, but MEALS_LLM_BASE_URL is not a Groq endpoint."
    );
  }

  return {
    isProduction,
    errors,
    warnings,
    summary: {
      nodeEnv: env.NODE_ENV || "development",
      hasMongoUri: Boolean(String(env.MONGO_URI || "").trim()),
      hasJwtSecret: Boolean(jwtSecret),
      corsOrigin: String(env.CORS_ORIGIN || env.FRONTEND_ORIGIN || "").trim() || "(not set)",
      mealsModel: mealsModel || "(default)",
      mealsBaseUrl: String(env.MEALS_LLM_BASE_URL || env.GROQ_BASE_URL || "").trim() || "(default)",
      configuredAiKeys: configuredAiKeys.map(({ key, value }) => ({
        key,
        masked: maskValue(value),
      })),
    },
  };
};

module.exports = {
  validateRuntimeEnv,
};

