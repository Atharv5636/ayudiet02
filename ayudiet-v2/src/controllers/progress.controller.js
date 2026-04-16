const mongoose = require("mongoose");
const ProgressLog = require("../models/progressLog.model");
const Patient = require("../models/patient.model");
const Plan = require("../models/plan.model");
const ApiError = require("../utils/ApiError");
const { modifyPlanBasedOnProgress } = require("../services/adaptivePlanService");
const { trackAdherenceFeedback } = require("../services/userHistoryService");
const debugLogsEnabled = process.env.DEBUG_LOGS === "true";
const debugLog = (...args) => {
  if (debugLogsEnabled) {
    console.log(...args);
  }
};

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const normalizeGoalText = (goal = "") => {
  const normalized = String(goal || "").trim();
  return normalized || "general wellness";
};
const toGoalKey = (goal = "") => normalizeGoalText(goal).toLowerCase();
const normalizeAdherenceScore = (value) => {
  const parsedValue = Number(value);

  if (Number.isNaN(parsedValue)) {
    return 30;
  }

  return Math.min(Math.max(parsedValue, 0), 100);
};

const normalizeOptionalNumber = (value, { min, max, fieldName }) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsedValue = Number(value);

  if (Number.isNaN(parsedValue)) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }

  if (typeof min === "number" && parsedValue < min) {
    throw new ApiError(400, `${fieldName} must be at least ${min}`);
  }

  if (typeof max === "number" && parsedValue > max) {
    throw new ApiError(400, `${fieldName} must be at most ${max}`);
  }

  return parsedValue;
};

const parseRecordedAt = (value) => {
  if (!value) {
    return new Date();
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new ApiError(400, "Invalid progress log date/time");
  }

  return parsedDate;
};

const createProgressLog = async (req, res, next) => {
  try {
    const {
      patient: patientFromBody,
      patientId: patientIdFromBody,
      planId: planIdFromBody,
      goal,
      weight,
      energy,
      energyLevel,
      symptomScore,
      digestion,
      digestionDetail,
      adherence,
      sleepHours,
      waterIntakeLiters,
      appetite,
      activityMinutes,
      stressLevel,
      notes,
      recordedAt,
      loggedAt,
      createdAt,
    } = req.body;
    const patientId = patientFromBody || patientIdFromBody;
    const normalizedEnergyLevel = energyLevel ?? energy;
    const normalizedRecordedAt = parseRecordedAt(
      recordedAt ?? loggedAt ?? createdAt
    );

    if (!patientId || weight === undefined || !normalizedEnergyLevel || !digestion) {
      return next(
        new ApiError(
          400,
          "patient, weight, energyLevel, and digestion are required"
        )
      );
    }

    if (!isValidObjectId(patientId)) {
      return next(new ApiError(400, "Invalid patient id"));
    }

    const existingPatient = await Patient.findOne({
      _id: patientId,
      doctor: req.user.id,
    });

    if (!existingPatient) {
      return next(new ApiError(404, "Patient not found"));
    }

    let activePlan = null;
    if (planIdFromBody && isValidObjectId(planIdFromBody)) {
      activePlan = await Plan.findOne({
        _id: planIdFromBody,
        patient: patientId,
        doctor: req.user.id,
        isActive: true,
      });
    }

    if (!activePlan && String(goal || "").trim()) {
      activePlan = await Plan.findOne({
        patient: patientId,
        doctor: req.user.id,
        isActive: true,
        goalKey: toGoalKey(goal),
      }).sort({ createdAt: -1 });
    }

    if (!activePlan) {
      activePlan = await Plan.findOne({
        patient: patientId,
        doctor: req.user.id,
        isActive: true,
      }).sort({ createdAt: -1 });
    }

    const progressLog = await ProgressLog.create({
      patient: patientId,
      plan: activePlan?._id || undefined,
      doctor: req.user.id,
      weight: Number(weight),
      energyLevel: Number(normalizedEnergyLevel),
      symptomScore: normalizeOptionalNumber(symptomScore, {
        min: 1,
        max: 10,
        fieldName: "symptom score",
      }),
      digestion,
      digestionDetail: digestionDetail || undefined,
      adherence: normalizeAdherenceScore(adherence),
      sleepHours: normalizeOptionalNumber(sleepHours, {
        min: 0,
        max: 24,
        fieldName: "sleep hours",
      }),
      waterIntakeLiters: normalizeOptionalNumber(waterIntakeLiters, {
        min: 0,
        max: 20,
        fieldName: "water intake",
      }),
      appetite: appetite || undefined,
      activityMinutes: normalizeOptionalNumber(activityMinutes, {
        min: 0,
        max: 1440,
        fieldName: "activity minutes",
      }),
      stressLevel: normalizeOptionalNumber(stressLevel, {
        min: 1,
        max: 5,
        fieldName: "stress level",
      }),
      notes: notes?.trim() || "",
      recordedAt: normalizedRecordedAt,
    });
    await trackAdherenceFeedback({
      patientId,
      progressLog,
    }).catch(() => {});

    const result = await modifyPlanBasedOnProgress(patientId, {
      ...(activePlan?._id ? { planId: activePlan._id } : {}),
      ...(String(goal || "").trim() ? { goal: String(goal).trim() } : {}),
    });
    const plan = activePlan?._id
      ? await Plan.findOne({ _id: activePlan._id, patient: patientId, isActive: true })
      : await Plan.findOne({ patient: patientId, isActive: true }).sort({
          createdAt: -1,
        });

    if (!plan) {
      debugLog("No active plan found for patient:", patientId);
    } else if (!result || !result.analysis) {
      debugLog("No analysis computed for patient:", patientId);
    } else {
      debugLog("Analysis result:", result);
      plan.analysis = result.analysis;
      plan.analysis.computedAt = new Date();
      await plan.save();
      debugLog("Updated analysis saved to plan:", plan.analysis);
    }

    res.status(201).json({
      success: true,
      progressLog,
    });
  } catch (error) {
    next(error);
  }
};

const getProgressLogsByPatient = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    if (!isValidObjectId(patientId)) {
      return next(new ApiError(400, "Invalid patient id"));
    }

    const patient = await Patient.findOne({
      _id: patientId,
      doctor: req.user.id,
    });

    if (!patient) {
      return next(new ApiError(404, "Patient not found"));
    }

    const logs = await ProgressLog.find({
      patient: patientId,
      doctor: req.user.id,
    })
      .sort({ _id: -1, createdAt: -1, recordedAt: -1 })
      .populate("plan", "title isActive");

    res.status(200).json({
      success: true,
      logs,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProgressLog,
  getProgressLogsByPatient,
};
