const mongoose = require("mongoose");

const mealDaySchema = new mongoose.Schema(
  {
    day: {
      type: String,
      required: true,
      trim: true,
    },
    breakfast: {
      type: String,
      default: "",
      trim: true,
    },
    lunch: {
      type: String,
      default: "",
      trim: true,
    },
    dinner: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false }
);

const hasAtLeastOneMeal = (mealDay) =>
  Boolean(mealDay.breakfast || mealDay.lunch || mealDay.dinner);

const planSchema = new mongoose.Schema(
  {
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },

    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    doshaType: {
      type: String,
      required: true,
      enum: ["vata", "pitta", "kapha"],
    },

    meals: {
      type: [mealDaySchema],
      required: true,
      validate: [
        {
          validator: (value) => Array.isArray(value) && value.length > 0,
          message: "At least one day is required",
        },
        {
          validator: (value) => value.every(hasAtLeastOneMeal),
          message: "Each day must include at least one meal",
        },
      ],
    },

    startDate: {
      type: Date,
      default: Date.now,
    },

    reviewDueDate: {
      type: Date,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    adjustments: {
      type: [String],
      default: [],
    },

    isMock: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Plan", planSchema);
