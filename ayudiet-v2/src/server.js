require("dotenv").config();

const app = require("./app");
const connectDB = require("./config/db");
const { validateRuntimeEnv } = require("./config/env");

const PORT = process.env.PORT || 5000;

const validateEnv = () => {
  const result = validateRuntimeEnv(process.env);

  if (result.warnings.length > 0) {
    result.warnings.forEach((warning) => {
      console.warn(`[ENV WARNING] ${warning}`);
    });
  }

  if (result.errors.length > 0) {
    throw new Error(result.errors.join(" "));
  }

  const aiProviders =
    result.summary.configuredAiKeys.length > 0
      ? result.summary.configuredAiKeys
          .map((entry) => `${entry.key}:${entry.masked}`)
          .join(", ")
      : "none";

  console.log(
    [
      "Environment checks passed:",
      `node=${result.summary.nodeEnv}`,
      `cors=${result.summary.corsOrigin}`,
      `mealsModel=${result.summary.mealsModel}`,
      `mealsBase=${result.summary.mealsBaseUrl}`,
      `aiKeys=${aiProviders}`,
    ].join(" ")
  );
};

const startServer = async () => {
  try {
    console.log("Starting backend startup sequence...");
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`Port: ${PORT}`);
    validateEnv();
    console.log("Calling connectDB()...");
    await connectDB();
    console.log("Database connected. Starting Express server...");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message || error);
    process.exit(1);
  }
};

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

startServer();
