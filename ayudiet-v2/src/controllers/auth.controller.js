const bcrypt = require("bcrypt");
const Doctor = require("../models/doctor.model");
const ApiError = require("../utils/ApiError");

// SIGNUP CONTROLLER
const signup = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // 1. Basic validation
    if (!name || !email || !password) {
      return next(new ApiError(400, "All fields are required"));
    }

    // 2. Check if doctor already exists
    const existingDoctor = await Doctor.findOne({ email });
    if (existingDoctor) {
      return next(new ApiError(400, "Doctor already exists"));
    }

    // 3. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Create new doctor
    const doctor = await Doctor.create({
      name,
      email,
      password: hashedPassword,
    });

    // 5. Send success response
    res.status(201).json({
      success: true,
      message: "Doctor registered successfully",
      doctor: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";

// LOGIN CONTROLLER
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1. Validate input
    if (!email || !password) {
      return next(new ApiError(400, "Email and password are required"));
    }

    // 2. Find doctor by email
    const doctor = await Doctor.findOne({ email });
    if (!doctor) {
      return next(new ApiError(400, "Invalid email or password"));
    }

    // 3. Compare entered password with stored hashed password
    const isPasswordCorrect = await bcrypt.compare(
      password,
      doctor.password
    );

    if (!isPasswordCorrect) {
      return next(new ApiError(400, "Invalid email or password"));
    }

    // 4. Generate JWT token (proof of login)
    const token = jwt.sign(
      { id: doctor._id, name: doctor.name, email: doctor.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // 5. Send success response
    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      doctor: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.user.id).select("_id name email");

    if (!doctor) {
      return next(new ApiError(404, "Doctor not found"));
    }

    res.status(200).json({
      success: true,
      doctor: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
      },
    });
  } catch (error) {
    next(error);
  }
};


module.exports = {
  signup,
  login,
  getMe,
};
