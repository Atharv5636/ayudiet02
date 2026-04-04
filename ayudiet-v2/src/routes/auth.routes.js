const express = require("express");
const authMiddleware = require("../middlewares/auth.middleware");

// IMPORT BOTH FUNCTIONS FROM CONTROLLER
const { signup, login, getMe } = require("../controllers/auth.controller");

const router = express.Router();

// Signup route
router.post("/signup", signup);

// Login route
router.post("/login", login);
router.get("/me", authMiddleware, getMe);


module.exports = router;
