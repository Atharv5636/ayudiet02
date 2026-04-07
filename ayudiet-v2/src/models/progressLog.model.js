const mongoose = require("mongoose");

const progressLogSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    weight: {
      type: Number,
    },
    energyLevel: {
      type: Number,
      min: 1,
      max: 5,
    },
    symptomScore: {
      type: Number,
      min: 1,
      max: 10,
    },
    digestion: {
      type: String,
      enum: ["good", "bad"],
      required: true,
    },
    digestionDetail: {
      type: String,
      enum: ["normal", "bloating", "acidity", "constipation", "loose stools", "mixed"],
      default: "normal",
    },
    adherence: {
      type: Number,
      min: 0,
      max: 100,
      default: 30,
    },
    sleepHours: {
      type: Number,
      min: 0,
      max: 24,
    },
    waterIntakeLiters: {
      type: Number,
      min: 0,
      max: 20,
    },
    appetite: {
      type: String,
      enum: ["low", "normal", "high"],
    },
    activityMinutes: {
      type: Number,
      min: 0,
      max: 1440,
    },
    stressLevel: {
      type: Number,
      min: 1,
      max: 5,
    },
    notes: {
      type: String,
      trim: true,
    },
    recordedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    isMock: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProgressLog", progressLogSchema);
