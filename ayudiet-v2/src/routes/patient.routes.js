const express = require("express");
const authMiddleware = require("../middlewares/auth.middleware");
const {
  addPatient,
  getPatients,
  getPatientById,
  updatePatient,
  deletePatient,
  uploadPatientDocument,
  deletePatientDocument,
  downloadPatientDocument,
  uploadPatientPhoto,
  deletePatientPhoto,
} = require("../controllers/patient.controller");
const {
  uploadPatientPdf,
  uploadPatientPhoto: uploadPatientPhotoMiddleware,
  limitPatientPdfUploads,
} = require("../middlewares/upload.middleware");

const router = express.Router();

router.post("/", authMiddleware, addPatient);
router.get("/", authMiddleware, getPatients);
router.get("/:id", authMiddleware, getPatientById);
router.put("/:id", authMiddleware, updatePatient);
router.delete("/:id", authMiddleware, deletePatient);

router.post(
  "/:id/photo",
  authMiddleware,
  limitPatientPdfUploads,
  uploadPatientPhotoMiddleware.single("photo"),
  uploadPatientPhoto
);
router.delete("/:id/photo", authMiddleware, deletePatientPhoto);

router.post(
  "/:id/documents",
  authMiddleware,
  limitPatientPdfUploads,
  uploadPatientPdf.single("document"),
  uploadPatientDocument
);
router.get(
  "/:id/documents/:documentId/download",
  authMiddleware,
  downloadPatientDocument
);
router.delete(
  "/:id/documents/:documentId",
  authMiddleware,
  deletePatientDocument
);

module.exports = router;
