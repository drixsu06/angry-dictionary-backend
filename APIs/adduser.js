import express from "express";
import { admin, db } from "../firebase.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { username, password, confirmPassword } = req.body;
  if (!username || !password || !confirmPassword)
    return res.status(400).json({ error: "All fields are required" });

  if (password !== confirmPassword)
    return res.status(400).json({ error: "Passwords do not match" });

  const email = `${username}@example.com`;

  const userRecord = await admin.auth().createUser({ email, password, displayName: username });
  await db.collection("users").doc(userRecord.uid).set({
    username,
    provider: "firebase",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.status(201).json({ message: "User created", uid: userRecord.uid, username });
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
    const isProd = process.env.NODE_ENV === 'production';
    if (!FIREBASE_API_KEY || FIREBASE_API_KEY.toUpperCase().includes('YOUR') || FIREBASE_API_KEY.trim() === '') {
      if (isProd) {
        return res.status(500).json({ error: 'Server misconfiguration: invalid Firebase web API key. Set FIREBASE_API_KEY to a valid web API key.' });
      }

      // Development-only fallback: create a custom token via Admin SDK if the user exists.
      try {
        const user = await admin.auth().getUserByEmail(email);
        const customToken = await admin.auth().createCustomToken(user.uid);
        return res.status(200).json({ message: 'Dev login: custom token created', uid: user.uid, token: customToken, dev: true });
      } catch (devErr) {
        return res.status(400).json({ error: 'Dev login failed: user not found' });
      }
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

    // Optional: fetch user profile from Firestore
    const userDoc = await db.collection("users").doc(data.localId).get();
    const profile = userDoc.exists ? userDoc.data() : null;

    res.status(200).json({
      message: "Login successful",
      uid: data.localId,
      username: profile?.username || username,
      token: data.idToken,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

export default router;
