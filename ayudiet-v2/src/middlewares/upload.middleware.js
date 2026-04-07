const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadDir = path.join(__dirname, "../../uploads/patient-docs");
fs.mkdirSync(uploadDir, { recursive: true });
const uploadPhotoDir = path.join(__dirname, "../../uploads/patient-photos");
fs.mkdirSync(uploadPhotoDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const uniqueName = `${Date.now()}-${safeOriginal}`;
    cb(null, uniqueName);
  },
});
const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadPhotoDir);
  },
  filename: (_req, file, cb) => {
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const uniqueName = `${Date.now()}-${safeOriginal}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (_req, file, cb) => {
  const isPdfMime = file.mimetype === "application/pdf";
  const isPdfExt = /\.pdf$/i.test(file.originalname || "");

  if (isPdfMime || isPdfExt) {
    cb(null, true);
    return;
  }

  cb(new Error("Only PDF files are allowed"), false);
};

const uploadPatientPdf = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const imageFileFilter = (_req, file, cb) => {
  const mime = String(file.mimetype || "").toLowerCase();
  const hasAllowedMime = ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(mime);
  const hasAllowedExt = /\.(jpe?g|png|webp)$/i.test(file.originalname || "");

  if (hasAllowedMime || hasAllowedExt) {
    cb(null, true);
    return;
  }

  cb(new Error("Only image files (JPG, PNG, WEBP) are allowed"), false);
};

const uploadPatientPhoto = multer({
  storage: photoStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 3 * 1024 * 1024,
  },
});

const uploadWindowMs = 10 * 60 * 1000;
const maxUploadsPerWindow = 20;
const uploadWindowByDoctor = new Map();

const limitPatientPdfUploads = (req, res, next) => {
  const doctorId = req?.user?.id || "anonymous";
  const now = Date.now();
  const currentWindow = uploadWindowByDoctor.get(doctorId);

  if (!currentWindow || now > currentWindow.resetAt) {
    uploadWindowByDoctor.set(doctorId, {
      count: 1,
      resetAt: now + uploadWindowMs,
    });
    next();
    return;
  }

  if (currentWindow.count >= maxUploadsPerWindow) {
    res.status(429).json({
      success: false,
      message: "Upload limit reached. Please try again in a few minutes.",
    });
    return;
  }

  currentWindow.count += 1;
  uploadWindowByDoctor.set(doctorId, currentWindow);
  next();
};

module.exports = {
  uploadPatientPdf,
  uploadPatientPhoto,
  limitPatientPdfUploads,
};
