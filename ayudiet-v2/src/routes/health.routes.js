const express = require("express");
const {
  healthCheck,
  getDashboardStats,
} = require("../controllers/health.controller");
const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();

// Health check
router.get("/",healthCheck);

// Dashboard stats
router.get("/dashboard-stats", authMiddleware, getDashboardStats);

module.exports = router;
