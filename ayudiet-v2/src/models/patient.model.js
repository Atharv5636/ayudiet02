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

    dateOfBirth: {
      type: Date,
    },

    bloodGroup: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    },

    emergencyContactName: {
      type: String,
      trim: true,
    },

    emergencyContactPhone: {
      type: String,
      trim: true,
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
      budgetTier: {
        type: String,
        enum: ["low", "medium", "high"],
      },
      localRegion: {
        type: String,
        trim: true,
      },
      mealTimings: {
        wakeUpTime: {
          type: String,
          trim: true,
        },
        breakfastTime: {
          type: String,
          trim: true,
        },
        lunchTime: {
          type: String,
          trim: true,
        },
        eveningSnackTime: {
          type: String,
          trim: true,
        },
        dinnerTime: {
          type: String,
          trim: true,
        },
        bedTime: {
          type: String,
          trim: true,
        },
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

    documents: [
      {
        originalName: {
          type: String,
          trim: true,
        },
        filename: {
          type: String,
          trim: true,
        },
        mimeType: {
          type: String,
          trim: true,
        },
        size: {
          type: Number,
        },
        url: {
          type: String,
          trim: true,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    photo: {
      originalName: {
        type: String,
        trim: true,
      },
      filename: {
        type: String,
        trim: true,
      },
      mimeType: {
        type: String,
        trim: true,
      },
      size: {
        type: Number,
      },
      url: {
        type: String,
        trim: true,
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    },

    planHistory: [
      {
        planId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Plan",
        },
        title: {
          type: String,
          trim: true,
        },
        goal: {
          type: String,
          trim: true,
        },
        doshaType: {
          type: String,
          trim: true,
        },
        generationSource: {
          type: String,
          trim: true,
        },
        status: {
          type: String,
          trim: true,
        },
        isActive: {
          type: Boolean,
          default: false,
        },
        mealsPreview: {
          breakfast: {
            type: String,
            trim: true,
          },
          lunch: {
            type: String,
            trim: true,
          },
          dinner: {
            type: String,
            trim: true,
          },
        },
        trackedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    preferenceHistory: [
      {
        dietType: {
          type: String,
          trim: true,
        },
        activityLevel: {
          type: Number,
          min: 1,
          max: 5,
        },
        preferences: {
          type: [String],
          default: [],
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
          },
          waterIntakeLiters: {
            type: Number,
          },
          budgetTier: {
            type: String,
            trim: true,
          },
          localRegion: {
            type: String,
            trim: true,
          },
        },
        source: {
          type: String,
          trim: true,
        },
        trackedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    adherenceHistory: [
      {
        planId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Plan",
        },
        adherence: {
          type: Number,
          min: 0,
          max: 100,
        },
        energyLevel: {
          type: Number,
          min: 1,
          max: 5,
        },
        digestion: {
          type: String,
          trim: true,
        },
        digestionDetail: {
          type: String,
          trim: true,
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
