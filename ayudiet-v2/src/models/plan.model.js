const mongoose = require("mongoose");

const mealDaySchema = new mongoose.Schema(
  {
    day: {
      type: String,
      required: true,
      trim: true,
    },
    earlyMorning: {
      type: String,
      default: "",
      trim: true,
    },
    morning: {
      type: String,
      default: "",
      trim: true,
    },
    afterExercise: {
      type: String,
      default: "",
      trim: true,
    },
    breakfast: {
      type: String,
      default: "",
      trim: true,
    },
    midMorning: {
      type: String,
      default: "",
      trim: true,
    },
    lunch: {
      type: String,
      default: "",
      trim: true,
    },
    after2Hours: {
      type: String,
      default: "",
      trim: true,
    },
    evening: {
      type: String,
      default: "",
      trim: true,
    },
    lateEvening: {
      type: String,
      default: "",
      trim: true,
    },
    dinner: {
      type: String,
      default: "",
      trim: true,
    },
    bedTime: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false }
);

const hasAtLeastOneMeal = (mealDay) =>
  Boolean(
    mealDay.earlyMorning ||
      mealDay.morning ||
      mealDay.afterExercise ||
      mealDay.breakfast ||
      mealDay.midMorning ||
      mealDay.lunch ||
      mealDay.after2Hours ||
      mealDay.evening ||
      mealDay.lateEvening ||
      mealDay.dinner ||
      mealDay.bedTime
  );

const normalizeGoalText = (goal = "") => {
  const normalized = String(goal || "").trim();
  return normalized || "general wellness";
};

const toGoalKey = (goal = "") => normalizeGoalText(goal).toLowerCase();

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

    goal: {
      type: String,
      trim: true,
      default: "general wellness",
    },

    goalKey: {
      type: String,
      trim: true,
      lowercase: true,
      default: "general wellness",
      index: true,
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

    adjustmentsApplied: {
      type: Boolean,
      default: false,
    },

    appliedAt: {
      type: Date,
    },

    isMock: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

planSchema.pre("validate", function syncGoalFields() {
  const normalizedGoal = normalizeGoalText(this.goal);
  this.goal = normalizedGoal;
  this.goalKey = toGoalKey(normalizedGoal);
});

planSchema.index({
  doctor: 1,
  patient: 1,
  isActive: 1,
  goalKey: 1,
  createdAt: -1,
});

module.exports = mongoose.model("Plan", planSchema);
