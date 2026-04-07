const express = require("express");
const authMiddleware = require("../middlewares/auth.middleware");

// IMPORT BOTH FUNCTIONS FROM CONTROLLER
const {
  signup,
  login,
  googleLogin,
  clerkExchangeLogin,
  verifyEmail,
  getMe,
} = require("../controllers/auth.controller");

const router = express.Router();

// Signup route
router.post("/signup", signup);
router.post("/verify-email", verifyEmail);

// Login route
router.post("/login", login);
router.post("/google", googleLogin);
router.post("/clerk/exchange", clerkExchangeLogin);
router.get("/me", authMiddleware, getMe);


module.exports = router;
