const express = require("express");
const cors = require("cors");
const path = require("path");

const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const patientRoutes = require("./routes/patient.routes");
const planRoutes = require("./routes/plan.routes");
const progressRoutes = require("./routes/progress.routes");

const errorHandler = require("./middlewares/error.middleware");

const app = express();
const isProduction = process.env.NODE_ENV === "production";

const debugLogsEnabled = process.env.DEBUG_LOGS === "true";
const normalizeOrigin = (value) => {
  if (!value || typeof value !== "string") return "";

  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
};

const allowedOrigins = [
  ...(process.env.CORS_ORIGIN || "").split(","),
  ...(process.env.FRONTEND_ORIGIN || "").split(","),
]
  .map(normalizeOrigin)
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    const requestOrigin = normalizeOrigin(origin);

    // Allow server-to-server or curl requests with no Origin header.
    if (!requestOrigin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(requestOrigin)) {
      return callback(null, true);
    }

    // In local/dev we allow unknown origins to avoid blocking local tools.
    if (!isProduction && allowedOrigins.length === 0) {
      return callback(null, true);
    }

    const error = new Error(`CORS blocked for origin: ${requestOrigin}`);
    error.statusCode = 403;
    return callback(error);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.set("trust proxy", 1);
app.use(express.json());
app.use(cors(corsOptions));

if (debugLogsEnabled) {
  app.use((req, res, next) => {
    const hasAuthHeader = Boolean(req.headers.authorization);
    console.log(`[REQ] ${req.method} ${req.originalUrl} | auth=${hasAuthHeader}`);
    next();
  });
}

app.get("/", (req, res) => {
  res.send("API is running");
});
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// routes
app.use("/health", healthRoutes);
app.use("/auth", authRoutes);
app.use("/patients", patientRoutes);
app.use("/plans", planRoutes);
app.use("/progress", progressRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// error middleware (always last)
app.use(errorHandler);

module.exports = app;
