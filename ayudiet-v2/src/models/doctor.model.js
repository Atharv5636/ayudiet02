const mongoose = require("mongoose");

const doctorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationOtpHash: {
      type: String,
      default: null,
      select: false,
    },
    emailVerificationOtpExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    clinicMobile: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

const Doctor = mongoose.model("Doctor", doctorSchema);

module.exports = Doctor;


// mongoose.Schema → structure of data

// required: true → validation at DB level

// unique: true → no duplicate emails

// timestamps → createdAt & updatedAt

// mongoose.model → creates collection
