const express = require("express");

const authMiddleware = require("../middlewares/auth.middleware");
const {
  createPlan,
  getPlansByPatient,
  getPendingPlans,
  generateAiPlan,
  generateAiDay,
  fixAiPlan,
  strictProfileProxy,
  strictExplainProxy,
  approvePlan,
  updatePlan,
  rejectPlan,
  applyPlanAdjustments,
} = require("../controllers/plan.controller");

const router = express.Router();

router.use(authMiddleware);

router.get("/pending", getPendingPlans);
router.get("/patient/:patientId", getPlansByPatient);
router.post("/generate-ai", generateAiPlan);
router.post("/generate-day", generateAiDay);
router.post("/fix-ai", fixAiPlan);
router.post("/strict/profile", strictProfileProxy);
router.post("/strict/explain", strictExplainProxy);
router.post("/", createPlan);
router.put("/:id", authMiddleware, updatePlan);
router.patch("/:id/approve", approvePlan);
router.patch("/:id/reject", rejectPlan);
router.patch("/:id/apply-adjustments", applyPlanAdjustments);

module.exports = router;
