import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import path from "path";

import addUserRoutes from "./APIs/adduser.js";
import userControllerRoutes from "./APIs/authController.js";
import historyRoutes, { flushFallback } from "./routes/history.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Connect to MongoDB with retry logic
const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/angry";
const mongoDbName = process.env.MONGO_DB || "angry";

async function connectWithRetry() {
  try {
    await mongoose.connect(mongoUri, { dbName: mongoDbName });
    console.log("✅ Connected to MongoDB");
    // flush any fallback history saved while DB was down
    try {
      await flushFallback();
    } catch (err) {
      console.warn('flushFallback failed', err);
    }
  } catch (err) {
    console.error("MongoDB connection error:", err?.message || err);
    console.log("Retrying MongoDB connection in 5s...");
    setTimeout(connectWithRetry, 5000);
  }
}

connectWithRetry();

mongoose.connection.on('connected', () => {
  console.log('Mongoose connected event');
  try { flushFallback(); } catch (e) { console.warn('flushFallback on connected failed', e); }
});

app.get("/", (req, res) => {
  res.send("🔥 Firebase + Express API is running!");
});

app.use("/users", addUserRoutes);
app.use("/users", userControllerRoutes);
app.use("/api/history", historyRoutes);

console.log("Firebase API Key:", process.env.FIREBASE_API_KEY);
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
