const express = require("express");

const authMiddleware = require("../middlewares/auth.middleware");
const {
  createPlan,
  getPlansByPatient,
  getPendingPlans,
  getActivePlans,
  generateAiPlan,
  generateAiDay,
  generateAiSlotChart,
  fixAiPlan,
  strictProfileProxy,
  strictExplainProxy,
  strictChatProxy,
  approvePlan,
  updatePlan,
  rejectPlan,
  applyPlanAdjustments,
} = require("../controllers/plan.controller");
const { generatePlanPdf } = require("../controllers/pdf.controller");

const router = express.Router();

router.use(authMiddleware);

router.get("/pending", getPendingPlans);
router.get("/active", getActivePlans);
router.get("/patient/:patientId", getPlansByPatient);
router.post("/generate-ai", generateAiPlan);
router.post("/generate-day", generateAiDay);
router.post("/generate-slot-chart", generateAiSlotChart);
router.post("/fix-ai", fixAiPlan);
router.post("/strict/profile", strictProfileProxy);
router.post("/strict/explain", strictExplainProxy);
router.post("/strict/chat", strictChatProxy);
router.post("/download-pdf", generatePlanPdf);
router.post("/", createPlan);
router.put("/:id", updatePlan);
router.patch("/:id/approve", approvePlan);
router.patch("/:id/reject", rejectPlan);
router.patch("/:id/apply-adjustments", applyPlanAdjustments);

module.exports = router;
