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
import healthRoutes from "./APIs/health.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Connect to MongoDB with retry logic. Only attempt connection when a MONGO_URI
// is provided in production. For local development we'll default to localhost.
const mongoDbName = process.env.MONGO_DB || "angry";
const isProd = process.env.NODE_ENV === 'production';
const mongoUriEnv = process.env.MONGO_URI;

async function connectWithRetry() {
  // Determine whether we should attempt a Mongo connection
  let mongoUriToUse = null;
  if (mongoUriEnv) {
    mongoUriToUse = mongoUriEnv;
  } else if (!isProd) {
    mongoUriToUse = "mongodb://127.0.0.1:27017/angry";
  }

  if (!mongoUriToUse) {
    console.warn('No MONGO_URI provided and running in production — skipping MongoDB connection. History will use in-memory fallback.');
    return;
  }

  try {
    await mongoose.connect(mongoUriToUse, { dbName: mongoDbName });
    console.log("✅ Connected to MongoDB");
    // flush any fallback history saved while DB was down
    try {
      await flushFallback();
    } catch (err) {
      console.warn('flushFallback failed', err);
    }
  } catch (err) {
    console.error("MongoDB connection error:", (err && err.message) || err);
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
app.use("/health", healthRoutes);

console.log("Firebase API Key:", process.env.FIREBASE_API_KEY);
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
