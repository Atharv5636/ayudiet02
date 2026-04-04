const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    age: {
      type: Number,
      required: true,
    },

    gender: {
      type: String,
      enum: ["male", "female", "other"],
      required: true,
    },

    height: {
      type: Number, // cm
    },

    weight: {
      type: Number, // kg
    },

    healthConditions: {
      type: String,
    },

    currentMedications: {
      type: String,
    },

    allergies: {
      type: String,
    },

    prakriti: {
      dominantDosha: {
        type: String,
        enum: ["vata", "pitta", "kapha"],
      },
    },

    dietType: {
      type: String,
    },

    activityLevel: {
      type: Number, // 1–5
      min: 1,
      max: 5,
    },

    preferences: {
      type: [String],
    },

    planningInputs: {
      primaryGoal: {
        type: String,
        trim: true,
      },
      targetWeight: {
        type: Number,
      },
      timeframeWeeks: {
        type: Number,
      },
      mealPattern: {
        type: String,
        trim: true,
      },
      sleepHours: {
        type: Number,
      },
      stressLevel: {
        type: Number,
        min: 1,
        max: 5,
      },
      waterIntakeLiters: {
        type: Number,
      },
    },

    phone: {
      type: String,
      trim: true,
    },

    isMock: {
      type: Boolean,
      default: false,
    },

    progressLogs: [
      {
        weight: {
          type: Number,
        },
        energyLevel: {
          type: Number,
          min: 1,
          max: 5,
        },
        adherence: {
          type: Number,
          min: 0,
          max: 100,
        },
        note: {
          type: String,
          trim: true,
        },
        recordedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Patient", patientSchema);
