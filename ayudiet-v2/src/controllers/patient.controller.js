const Patient = require("../models/patient.model");
const ApiError = require("../utils/ApiError");
const fs = require("fs");
const path = require("path");

const isValidPdfSignature = (filePath) => {
  try {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(5);
    fs.readSync(fd, buffer, 0, 5, 0);
    fs.closeSync(fd);
    return buffer.toString("utf8") === "%PDF-";
  } catch {
    return false;
  }
};

const resolveDocFilePath = (relativeUrl = "") =>
  path.join(__dirname, "../../", relativeUrl.replace(/^\/+/, ""));
const resolveUploadFilePath = (relativeUrl = "") =>
  path.join(__dirname, "../../", relativeUrl.replace(/^\/+/, ""));

// ADD PATIENT CONTROLLER
// This creates a new patient for the logged-in doctor
const addPatient = async (req, res, next) => {
  try {
    const {
      name,
      age,
      gender,
      height,
      weight,
      dateOfBirth,
      bloodGroup,
      phone,
      emergencyContactName,
      emergencyContactPhone,
      healthConditions,
      currentMedications,
      allergies,
      dominantDosha,
      dietType,
      activityLevel,
      preferences,
      planningInputs,
    } = req.body;

    if (!name || !age || !gender) {
      return next(new ApiError(400, "Name, age and gender are required"));
    }

    const patient = await Patient.create({
      name,
      age,
      gender,
      height,
      weight,
      dateOfBirth,
      bloodGroup,
      phone,
      emergencyContactName,
      emergencyContactPhone,
      healthConditions,
      currentMedications,
      allergies,
      prakriti: {
        dominantDosha,
      },
      dietType,
      activityLevel,
      preferences,
      planningInputs,
      doctor: req.user.id,
    });

    res.status(201).json({
      success: true,
      patient,
    });
  } catch (error) {
    next(error);
  }
};

// GET ALL PATIENTS FOR LOGGED-IN DOCTOR
const getPatients = async (req, res, next) => {
  try {
    // req.user.id comes from JWT middleware
    const doctorId = req.user.id;

    // Find only patients created by this doctor
    const patients = await Patient.find({ doctor: doctorId });

    res.status(200).json({
      success: true,
      count: patients.length,
      patients,
    });
  } catch (error) {
    next(error);
  }
};
////////GET PATIENT BY ID
const getPatientById = async (req, res, next) => {
  try {
    const patientId = req.params.id;
    const doctorId = req.user.id;

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return next(new ApiError(404, "Patient not found"));
    }

    // Ownership check
    if (patient.doctor.toString() !== doctorId) {
      return next(new ApiError(403, "Not authorized"));
    }

    res.status(200).json({
      success: true,
      patient,
    });
  } catch (error) {
    next(error);
  }
};

// UPDATE PATIENT
const updatePatient = async (req, res, next) => {
  try {
    const patientId = req.params.id;
    const doctorId = req.user.id;

    // 1. Find patient
    const patient = await Patient.findById(patientId);

    if (!patient) {
      return next(new ApiError(404, "Patient not found"));
    }

    // 2. Ownership check
    if (patient.doctor.toString() !== doctorId) {
      return next(new ApiError(403, "Not authorized to update this patient"));
    }

    // 3. Update patient
    const updatedPatient = await Patient.findByIdAndUpdate(
      patientId,
      req.body,
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Patient updated successfully",
      patient: updatedPatient,
    });
  } catch (error) {
    next(error);
  }
};
// DELETE PATIENT
const deletePatient = async (req, res, next) => {
  try {
    const patientId = req.params.id;
    const doctorId = req.user.id;

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return next(new ApiError(404, "Patient not found"));
    }

    // Ownership check
    if (patient.doctor.toString() !== doctorId) {
      return next(new ApiError(403, "Not authorized to delete this patient"));
    }

    await patient.deleteOne();

    res.status(200).json({
      success: true,
      message: "Patient deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

const uploadPatientDocument = async (req, res, next) => {
  try {
    const patientId = req.params.id;
    const doctorId = req.user.id;

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return next(new ApiError(404, "Patient not found"));
    }

    if (patient.doctor.toString() !== doctorId) {
      return next(new ApiError(403, "Not authorized to update this patient"));
    }

    if (!req.file) {
      return next(new ApiError(400, "PDF file is required"));
    }

    if (!isValidPdfSignature(req.file.path)) {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return next(new ApiError(400, "Invalid PDF content"));
    }

    const relativeUrl = `/uploads/patient-docs/${req.file.filename}`;

    patient.documents.push({
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: relativeUrl,
    });

    await patient.save();

    res.status(201).json({
      success: true,
      message: "Document uploaded successfully",
      document: patient.documents[patient.documents.length - 1],
      patient,
    });
  } catch (error) {
    next(error);
  }
};

const deletePatientDocument = async (req, res, next) => {
  try {
    const patientId = req.params.id;
    const documentId = req.params.documentId;
    const doctorId = req.user.id;

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return next(new ApiError(404, "Patient not found"));
    }

    if (patient.doctor.toString() !== doctorId) {
      return next(new ApiError(403, "Not authorized to update this patient"));
    }

    const doc = patient.documents.id(documentId);

    if (!doc) {
      return next(new ApiError(404, "Document not found"));
    }

    const filePath = resolveDocFilePath(doc.url || "");
    if (doc.url && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    doc.deleteOne();
    await patient.save();

    res.status(200).json({
      success: true,
      message: "Document deleted successfully",
      patient,
    });
  } catch (error) {
    next(error);
  }
};

const downloadPatientDocument = async (req, res, next) => {
  try {
    const patientId = req.params.id;
    const documentId = req.params.documentId;
    const doctorId = req.user.id;

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return next(new ApiError(404, "Patient not found"));
    }

    if (patient.doctor.toString() !== doctorId) {
      return next(new ApiError(403, "Not authorized to access this patient"));
    }

    const doc = patient.documents.id(documentId);
    if (!doc) {
      return next(new ApiError(404, "Document not found"));
    }

    const filePath = resolveDocFilePath(doc.url || "");
    if (!fs.existsSync(filePath)) {
      return next(new ApiError(404, "Document file missing on server"));
    }

    res.setHeader("Content-Type", doc.mimeType || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${doc.originalName || doc.filename || "document.pdf"}"`
    );
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
};

const uploadPatientPhoto = async (req, res, next) => {
  try {
    const patientId = req.params.id;
    const doctorId = req.user.id;

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return next(new ApiError(404, "Patient not found"));
    }

    if (patient.doctor.toString() !== doctorId) {
      return next(new ApiError(403, "Not authorized to update this patient"));
    }

    if (!req.file) {
      return next(new ApiError(400, "Image file is required"));
    }

    if (patient?.photo?.url) {
      const oldFilePath = resolveUploadFilePath(patient.photo.url);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    const relativeUrl = `/uploads/patient-photos/${req.file.filename}`;

    patient.photo = {
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: relativeUrl,
      uploadedAt: new Date(),
    };

    await patient.save();

    res.status(201).json({
      success: true,
      message: "Patient photo uploaded successfully",
      photo: patient.photo,
      patient,
    });
  } catch (error) {
    next(error);
  }
};

const deletePatientPhoto = async (req, res, next) => {
  try {
    const patientId = req.params.id;
    const doctorId = req.user.id;

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return next(new ApiError(404, "Patient not found"));
    }

    if (patient.doctor.toString() !== doctorId) {
      return next(new ApiError(403, "Not authorized to update this patient"));
    }

    if (patient?.photo?.url) {
      const filePath = resolveUploadFilePath(patient.photo.url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    patient.photo = undefined;
    await patient.save();

    res.status(200).json({
      success: true,
      message: "Patient photo deleted successfully",
      patient,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
};


