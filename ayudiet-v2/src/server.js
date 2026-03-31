require("dotenv").config();

const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 3000;

const validateEnv = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error("Missing JWT_SECRET. Add it to the backend .env file.");
  }
};

const startServer = async () => {
  try {
    console.log("Starting backend startup sequence...");
    console.log("JWT_SECRET:", process.env.JWT_SECRET);
    validateEnv();
    console.log("Calling connectDB()...");
    await connectDB();
    console.log("Database connected. Starting Express server...");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message || error);
    process.exit(1);
  }
};

startServer();
