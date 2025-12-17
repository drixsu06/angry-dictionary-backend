import mongoose from "mongoose";

const historySchema = new mongoose.Schema({
  userId: {
    type: String,
    index: true,
  },
  word: {
    type: String,
    required: true,
  },
  pilosopoAnswer: {
    type: String,
    required: true,
  },
  realMeaning: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("History", historySchema);
