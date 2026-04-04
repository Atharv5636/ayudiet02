const Patient = require("../models/patient.model");
const ApiError = require("../utils/ApiError");

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

module.exports = {
  addPatient,
  getPatients,
  getPatientById,
  updatePatient,
  deletePatient,
};


