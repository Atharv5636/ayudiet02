const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";

// JWT authentication middleware
// This middleware protects routes by verifying JWT tokens
const authMiddleware = (req, res, next) => {
  try {
    // 1. Read Authorization header
    // Expected format: "Bearer <token>"
    const authHeader = req.headers.authorization;

    // 2. If Authorization header is missing
    if (!authHeader) {
      return next(new ApiError(401, "Authorization token missing"));
    }

    // 3. Extract token from "Bearer <token>"
    const token = authHeader.split(" ")[1];

    // 4. Verify token using JWT secret
    const decoded = jwt.verify(token, JWT_SECRET);

    // 5. Attach decoded user info to request object
    // This allows controllers to know who the logged-in user is
    req.user = decoded;

    // 6. Move to next middleware or controller
    next();
  } catch (error) {
    // If token is invalid or expired
    return next(new ApiError(401, "Invalid or expired token"));
  }
};

module.exports = authMiddleware;
