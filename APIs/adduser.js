import express from "express";
import { admin, db, isAdminInitialized } from "../firebase.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { username, password, confirmPassword } = req.body;
  if (!username || !password || !confirmPassword)
    return res.status(400).json({ error: "All fields are required" });

  if (password !== confirmPassword)
    return res.status(400).json({ error: "Passwords do not match" });

  const email = `${username}@example.com`;

  if (!isAdminInitialized) {
    return res.status(503).json({ error: 'Server misconfiguration: Admin SDK not initialized. Provide service account.' });
  }

  const userRecord = await admin.auth().createUser({ email, password, displayName: username });
  // If Firestore is available, persist the profile; otherwise return created user with serverFallback flag
  if (db) {
    try {
      await db.collection("users").doc(userRecord.uid).set({
        username,
        provider: "firebase",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return res.status(201).json({ message: "User created", uid: userRecord.uid, username });
    } catch (err) {
      console.error('Failed to write user profile to Firestore:', err);
      // Return created user but notify that Firestore write failed
      return res.status(201).json({ message: 'User created (auth-only). Firestore write failed.', uid: userRecord.uid, username, firestoreError: err?.message });
    }
  }

  return res.status(201).json({ message: 'User created (admin-only, no Firestore)', uid: userRecord.uid, username, serverFallback: true });
});
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const email = `${username}@example.com`;

    const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

    // Validate API key to avoid passing an invalid/placeholder key to Google APIs
    const isApiKeyValid = !!FIREBASE_API_KEY && !FIREBASE_API_KEY.toUpperCase().includes('YOUR') && FIREBASE_API_KEY.trim() !== '';

    if (!isApiKeyValid) {
      // If Admin SDK is initialized, try server-side fallback
      if (isAdminInitialized) {
        try {
          const user = await admin.auth().getUserByEmail(email);
          const customToken = await admin.auth().createCustomToken(user.uid);
          return res.status(200).json({ message: 'Server fallback: custom token created', uid: user.uid, token: customToken, serverFallback: true });
        } catch (fallbackErr) {
          console.error('FIREBASE_API_KEY missing and server-side fallback failed:', (fallbackErr && fallbackErr.message) || fallbackErr);
          return res.status(503).json({ error: 'Server misconfiguration: missing or invalid Firebase web API key AND server fallback failed. Set FIREBASE_API_KEY (Web API Key) in your Render environment variables or provide a valid service account.' });
        }
      }
      // No Admin SDK available
      return res.status(503).json({ error: 'Server misconfiguration: missing Firebase web API key and Admin SDK not initialized. Provide FIREBASE_API_KEY or service account.' });
    }

    const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;

    const fetch = (await import("node-fetch")).default;

    const response = await fetch(signInUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    // Optional: fetch user profile from Firestore if available
    let profile = null;
    if (db) {
      try {
        const userDoc = await db.collection("users").doc(data.localId).get();
        profile = userDoc.exists ? userDoc.data() : null;
      } catch (e) {
        console.warn('Failed to fetch profile from Firestore:', (e && e.message) || e);
      }
    }

    res.status(200).json({
      message: "Login successful",
      uid: data.localId,
      username: (profile && profile.username) || username,
      token: data.idToken,
    });
  } catch (error) {
    console.error("Login error:", error);
    if (error && (error.code === 5 || error.code === '5' || error.code === 'NOT_FOUND')) {
      return res.status(503).json({ error: 'Firestore resource not found or inaccessible. Check service account and project configuration.' });
    }
    res.status(500).json({ error: "Failed to login" });
  }
});

export default router;
