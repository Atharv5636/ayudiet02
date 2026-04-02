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
    digestion: {
      type: String,
      enum: ["good", "bad"],
      required: true,
    },
    adherence: {
      type: Number,
      min: 0,
      max: 100,
      default: 30,
    },
    notes: {
      type: String,
      trim: true,
    },
    isMock: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProgressLog", progressLogSchema);
