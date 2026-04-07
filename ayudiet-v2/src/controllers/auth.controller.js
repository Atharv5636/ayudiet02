const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { createClerkClient, verifyToken } = require("@clerk/backend");
const Doctor = require("../models/doctor.model");
const ApiError = require("../utils/ApiError");
const jwt = require("jsonwebtoken");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const EMAIL_OTP_EXPIRY_MINUTES = 10;
const debugLogsEnabled = process.env.DEBUG_LOGS === "true";
const isGoogleAuthEnabled = () => process.env.ENABLE_GOOGLE_AUTH === "true";
const isClerkAuthEnabled = () => process.env.ENABLE_CLERK_AUTH === "true";
const isEmailOtpVerificationEnabled = () =>
  process.env.ENABLE_EMAIL_OTP_VERIFICATION === "true";
const getAllowedGoogleAudiences = () =>
  String(process.env.GOOGLE_CLIENT_ID || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
const parseCsvEnv = (value = "") =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const getJwtSecretOrThrow = () => {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    throw new ApiError(500, "Server misconfiguration: JWT secret missing");
  }
  return JWT_SECRET;
};

const createAppJwt = (doctor) => {
  const JWT_SECRET = getJwtSecretOrThrow();
  return jwt.sign(
    { id: doctor._id, name: doctor.name, email: doctor.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const buildAuthSuccessResponse = (message, token, doctor) => ({
  success: true,
  message,
  token,
  doctor: {
    id: doctor._id,
    name: doctor.name,
    email: doctor.email,
  },
});

const verifyGoogleIdToken = async (idToken) => {
  const token = String(idToken || "").trim();

  if (!token) {
    throw new ApiError(400, "Google token is required");
  }

  let payload;
  try {
    const response = await fetch(
      `${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(token)}`
    );

    if (!response.ok) {
      throw new ApiError(401, "Invalid Google token");
    }

    payload = await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(502, "Failed to verify Google token");
  }

  const allowedAudiences = getAllowedGoogleAudiences();
  if (!allowedAudiences.length) {
    throw new ApiError(500, "Server misconfiguration: GOOGLE_CLIENT_ID missing");
  }

  if (!allowedAudiences.includes(payload?.aud)) {
    throw new ApiError(401, "Google token audience mismatch");
  }

  if (payload?.email_verified !== "true") {
    throw new ApiError(401, "Google email is not verified");
  }

  const email = String(payload?.email || "").trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    throw new ApiError(400, "Google account email is invalid");
  }

  return {
    email,
    name: String(payload?.name || "").trim() || email.split("@")[0],
  };
};

const hashOtp = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const sendVerificationEmail = async ({ email, otp, name }) => {
  const resendApiKey = process.env.RESEND_API_KEY;
  const senderEmail = process.env.RESEND_FROM_EMAIL;

  if (!resendApiKey || !senderEmail) {
    throw new ApiError(
      500,
      "Email verification is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL missing)"
    );
  }
  if (!EMAIL_REGEX.test(String(senderEmail).trim())) {
    throw new ApiError(
      500,
      "RESEND_FROM_EMAIL must be a valid sender email (example: noreply@yourdomain.com)"
    );
  }

  const text = `Hi ${name || "Doctor"}, your AyuDiet verification code is ${otp}. This code expires in ${EMAIL_OTP_EXPIRY_MINUTES} minutes.`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: senderEmail,
      to: email,
      subject: "AyuDiet email verification code",
      text,
    }),
  });

  if (!response.ok) {
    let errorBody = "";
    try {
      errorBody = await response.text();
    } catch {
      errorBody = "";
    }
    console.error("[EMAIL] Resend failed:", response.status, errorBody);
    throw new ApiError(502, "Failed to send verification email");
  }

  if (debugLogsEnabled) {
    console.log(`[EMAIL] Verification OTP sent to ${email}`);
  }
};

// SIGNUP CONTROLLER
const signup = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const normalizedName = String(name || "").trim();
    const normalizedEmail = String(email || "").trim().toLowerCase();

    // 1. Basic validation
    if (!normalizedName || !normalizedEmail || !password) {
      return next(new ApiError(400, "All fields are required"));
    }
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return next(new ApiError(400, "Please provide a valid email address"));
    }

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const existingDoctor = await Doctor.findOne({ email: normalizedEmail });

    if (!isEmailOtpVerificationEnabled()) {
      if (existingDoctor) {
        return next(new ApiError(400, "Doctor already exists"));
      }

      const doctor = await Doctor.create({
        name: normalizedName,
        email: normalizedEmail,
        password: hashedPassword,
        emailVerified: true,
      });

      res.status(201).json({
        success: true,
        message: "Doctor registered successfully",
        doctor: {
          id: doctor._id,
          name: doctor.name,
          email: doctor.email,
        },
      });
      return;
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const otpExpiry = new Date(Date.now() + EMAIL_OTP_EXPIRY_MINUTES * 60 * 1000);

    if (existingDoctor?.emailVerified) {
      return next(new ApiError(400, "Doctor already exists"));
    }

    const doctor = existingDoctor
      ? await Doctor.findByIdAndUpdate(
          existingDoctor._id,
          {
            $set: {
              name: normalizedName,
              password: hashedPassword,
              emailVerified: false,
              emailVerificationOtpHash: otpHash,
              emailVerificationOtpExpiresAt: otpExpiry,
            },
          },
          { new: true }
        )
      : await Doctor.create({
          name: normalizedName,
          email: normalizedEmail,
          password: hashedPassword,
          emailVerified: false,
          emailVerificationOtpHash: otpHash,
          emailVerificationOtpExpiresAt: otpExpiry,
        });

    await sendVerificationEmail({
      email: normalizedEmail,
      otp,
      name: normalizedName,
    });

    res.status(201).json({
      success: true,
      message: "Verification code sent to your email",
      requiresVerification: true,
      email: doctor.email,
    });
  } catch (error) {
    next(error);
  }
};

const verifyEmail = async (req, res, next) => {
  try {
    if (!isEmailOtpVerificationEnabled()) {
      return next(new ApiError(404, "Email verification is disabled"));
    }

    const email = String(req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();

    if (!EMAIL_REGEX.test(email) || !otp) {
      return next(new ApiError(400, "Email and verification code are required"));
    }

    const doctor = await Doctor.findOne({ email }).select(
      "+emailVerificationOtpHash +emailVerificationOtpExpiresAt"
    );

    if (!doctor) {
      return next(new ApiError(404, "Account not found"));
    }

    if (doctor.emailVerified) {
      return res.status(200).json({
        success: true,
        message: "Email already verified",
      });
    }

    const isOtpExpired =
      !doctor.emailVerificationOtpExpiresAt ||
      new Date(doctor.emailVerificationOtpExpiresAt).getTime() < Date.now();

    if (isOtpExpired) {
      return next(new ApiError(400, "Verification code expired. Please sign up again."));
    }

    if (doctor.emailVerificationOtpHash !== hashOtp(otp)) {
      return next(new ApiError(400, "Invalid verification code"));
    }

    doctor.emailVerified = true;
    doctor.emailVerificationOtpHash = null;
    doctor.emailVerificationOtpExpiresAt = null;
    await doctor.save();

    res.status(200).json({
      success: true,
      message: "Email verified successfully. Please log in.",
    });
  } catch (error) {
    next(error);
  }
};

// LOGIN CONTROLLER
const login = async (req, res, next) => {
  try {
    getJwtSecretOrThrow();

    const { email, password } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    // 1. Validate input
    if (!normalizedEmail || !password) {
      return next(new ApiError(400, "Email and password are required"));
    }
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return next(new ApiError(400, "Please provide a valid email address"));
    }

    // 2. Find doctor by email
    const doctor = await Doctor.findOne({ email: normalizedEmail });
    if (!doctor) {
      return next(new ApiError(400, "Invalid email or password"));
    }
    if (isEmailOtpVerificationEnabled() && !doctor.emailVerified) {
      return next(new ApiError(403, "Please verify your email before logging in"));
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
    const token = createAppJwt(doctor);

    if (process.env.DEBUG_LOGS === "true") {
      console.log(`[AUTH] Login success for ${doctor.email}`);
    }

    // 5. Send success response
    res.status(200).json(buildAuthSuccessResponse("Login successful", token, doctor));
  } catch (error) {
    next(error);
  }
};

const googleLogin = async (req, res, next) => {
  try {
    if (!isGoogleAuthEnabled()) {
      return next(new ApiError(404, "Google login is disabled"));
    }

    getJwtSecretOrThrow();

    const { idToken } = req.body || {};
    const profile = await verifyGoogleIdToken(idToken);

    let doctor = await Doctor.findOne({ email: profile.email });

    if (!doctor) {
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      doctor = await Doctor.create({
        name: profile.name,
        email: profile.email,
        password: hashedPassword,
      });
    }

    if (!doctor.emailVerified) {
      doctor.emailVerified = true;
      await doctor.save();
    }

    const token = createAppJwt(doctor);

    res
      .status(200)
      .json(buildAuthSuccessResponse("Google login successful", token, doctor));
  } catch (error) {
    next(error);
  }
};

const clerkExchangeLogin = async (req, res, next) => {
  try {
    if (!isClerkAuthEnabled()) {
      return next(new ApiError(404, "Clerk login is disabled"));
    }

    getJwtSecretOrThrow();

    const clerkSecretKey = String(process.env.CLERK_SECRET_KEY || "").trim();
    if (!clerkSecretKey) {
      return next(new ApiError(500, "Server misconfiguration: CLERK_SECRET_KEY missing"));
    }

    const clerkToken = String(
      req.body?.clerkToken || req.body?.token || req.body?.sessionToken || ""
    ).trim();

    if (!clerkToken) {
      return next(new ApiError(400, "Clerk session token is required"));
    }

    const audience = parseCsvEnv(process.env.CLERK_AUDIENCE);
    const authorizedParties = parseCsvEnv(process.env.CLERK_AUTHORIZED_PARTIES);

    const claims = await verifyToken(clerkToken, {
      secretKey: clerkSecretKey,
      ...(audience.length ? { audience } : {}),
      ...(authorizedParties.length ? { authorizedParties } : {}),
    });

    const clerkUserId = claims?.sub;
    if (!clerkUserId) {
      return next(new ApiError(401, "Invalid Clerk token subject"));
    }

    const clerkClient = createClerkClient({ secretKey: clerkSecretKey });
    const clerkUser = await clerkClient.users.getUser(clerkUserId);

    const primaryEmailRecord =
      clerkUser?.emailAddresses?.find(
        (item) => item.id === clerkUser?.primaryEmailAddressId
      ) || clerkUser?.emailAddresses?.[0];

    const email = String(primaryEmailRecord?.emailAddress || "")
      .trim()
      .toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      return next(
        new ApiError(400, "Unable to resolve a valid email from Clerk user profile")
      );
    }

    const fullName = `${String(clerkUser?.firstName || "").trim()} ${String(
      clerkUser?.lastName || ""
    ).trim()}`.trim();
    const resolvedName =
      fullName ||
      String(clerkUser?.username || "").trim() ||
      String(clerkUser?.fullName || "").trim() ||
      email.split("@")[0];

    let doctor = await Doctor.findOne({ email });

    if (!doctor) {
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      doctor = await Doctor.create({
        name: resolvedName,
        email,
        password: hashedPassword,
        emailVerified: true,
      });
    } else {
      const updates = {};
      if (!doctor.emailVerified) updates.emailVerified = true;
      if (!doctor.name && resolvedName) updates.name = resolvedName;
      if (Object.keys(updates).length > 0) {
        doctor = await Doctor.findByIdAndUpdate(
          doctor._id,
          { $set: updates },
          { new: true }
        );
      }
    }

    const token = createAppJwt(doctor);
    res
      .status(200)
      .json(buildAuthSuccessResponse("Clerk login successful", token, doctor));
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
  googleLogin,
  clerkExchangeLogin,
  verifyEmail,
  getMe,
};
