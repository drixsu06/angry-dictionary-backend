import express from 'express';
import mongoose from 'mongoose';
import { admin, isAdminInitialized } from '../firebase.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const nodeEnv = process.env.NODE_ENV || 'undefined';
    const firebaseApiKeyPresent = !!process.env.FIREBASE_API_KEY && process.env.FIREBASE_API_KEY.trim() !== '';
    const serviceAccountLoaded = !!isAdminInitialized;

    const mongoState = mongoose.connection.readyState; // 0 disconnected, 1 connected

    res.json({
      status: 'ok',
      nodeEnv,
      firebaseApiKeyPresent,
      serviceAccountLoaded,
      mongoState,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Health check failed', err);
    res.status(500).json({ status: 'error', error: err && err.message ? err.message : String(err) });
  }
});

export default router;
