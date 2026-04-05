const mongoose = require("mongoose");

let eventsRegistered = false;

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("Missing MONGO_URI. Add it to your .env file.");
    }

    if (
      !process.env.MONGO_URI.includes("mongodb+srv://") ||
      !process.env.MONGO_URI.includes(".mongodb.net")
    ) {
      console.error("Invalid MongoDB URI format");
      process.exit(1);
    }

    console.log("Using DB:", process.env.MONGO_URI.split("@")[1]);

    if (!eventsRegistered) {
      mongoose.connection.on("connected", () => {
        console.log("Mongoose connected");
      });

      mongoose.connection.on("error", (err) => {
        console.log("Mongoose error:", err);
      });

      mongoose.connection.on("disconnected", () => {
        console.log("Mongoose disconnected");
      });

      eventsRegistered = true;
    }

    console.log("Connecting to MongoDB...");
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("DB Connection Error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
