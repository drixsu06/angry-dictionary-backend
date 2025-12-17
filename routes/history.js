import express from "express";
import mongoose from "mongoose";
import History from "../models/History.js";

// Simple in-memory fallback store used when MongoDB is unavailable.
// This keeps the feature working in development when Mongo isn't running.
const fallbackHistory = [];

const router = express.Router();

// Export a function to flush fallbackHistory into MongoDB when connection is available
export async function flushFallback() {
  try {
    if (mongoose.connection.readyState !== 1) return;
    if (!fallbackHistory.length) return;

    const items = [...fallbackHistory];
    // clear fallback first to avoid duplicates if saving fails on some item
    fallbackHistory.length = 0;

    for (const it of items) {
      try {
        const h = new History({ userId: it.userId || null, word: it.word, pilosopoAnswer: it.pilosopoAnswer, realMeaning: it.realMeaning, createdAt: it.createdAt });
        await h.save();
      } catch (e) {
        console.warn('Failed to flush fallback item', e);
      }
    }

    console.log(`Flushed ${items.length} fallback history items to MongoDB`);
  } catch (err) {
    console.error('flushFallback error', err);
  }
}

// POST /api/history - save searched word
router.post("/", async (req, res) => {
  try {
    const { word, pilosopoAnswer, realMeaning, userId } = req.body;
    // Validate incoming body
    if (!word || !pilosopoAnswer) {
      return res.status(400).json({ error: "Missing fields" });
    }
    // Require a userId so history belongs to a specific user
    if (!userId) {
      return res.status(400).json({ error: 'userId is required to save history' });
    }

    // Ensure MongoDB is connected before attempting to save
    const state = mongoose.connection.readyState; // 0 disconnected, 1 connected, 2 connecting
    if (state !== 1) {
      // Save to in-memory fallback store and return that object
      const local = {
        _id: `local-${Date.now()}`,
        userId: userId || null,
        word,
        pilosopoAnswer,
        realMeaning,
        createdAt: new Date(),
        fallback: true,
      };
      fallbackHistory.push(local);
      console.warn("MongoDB not connected (readyState=", state, ") - saved to fallback store");
      return res.status(201).json(local);
    }

    const history = new History({ userId: userId || null, word, pilosopoAnswer, realMeaning });
    await history.save();
    res.status(201).json(history);
  } catch (err) {
    console.error("Failed to save history", err && err.stack ? err.stack : err);
    res.status(500).json({ error: "Failed to save history", details: err?.message });
  }
});

// GET /api/history - get all searched words
router.get("/", async (req, res) => {
  try {
    const { userId } = req.query;

    // if no userId provided, return empty list (we require a user to fetch personal history)
    if (!userId) {
      return res.json([]);
    }

    // Check mongoose connection state
    const state = mongoose.connection.readyState; // 0 = disconnected, 1 = connected
    if (state !== 1) {
      console.warn("MongoDB not connected (readyState=", state, ") - returning fallback store only");
      // Return fallback store filtered by userId (most recent first)
      const filtered = fallbackHistory.filter((h) => (h.userId || null) === userId);
      const sorted = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return res.json(sorted);
    }

    // When connected, return DB results for this user plus any fallback items for that user
    const history = await History.find({ userId }).sort({ createdAt: -1 });
    // Merge fallback items (they are local only) at the top
    const filteredFallback = fallbackHistory.filter((h) => (h.userId || null) === userId);
    const merged = [
      ...[...filteredFallback].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      ...history,
    ];
    res.json(merged);
  } catch (err) {
    console.error("Failed to fetch history", err && err.stack ? err.stack : err);
    res.status(500).json({ error: "Failed to fetch history", details: err?.message });
  }
});

export default router;
