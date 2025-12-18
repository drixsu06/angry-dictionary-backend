import express from "express";
import bcrypt from "bcrypt";
import { admin, db, isAdminInitialized } from "../firebase.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { username, password, confirmPassword } = req.body;
  if (!username || !password || !confirmPassword)
    return res.status(400).json({ error: "All fields are required" });

  if (password !== confirmPassword)
    return res.status(400).json({ error: "Passwords do not match" });

  const email = `${username}@example.com`;
  // Prefer to create user in Firebase Auth (if Admin SDK available) and also store a hashed password in Firestore
  let userRecord = null;
  if (isAdminInitialized) {
    try {
      userRecord = await admin.auth().createUser({ email, password, displayName: username });
    } catch (e) {
      console.error('Failed to create user in Firebase Auth', e);
      // Continue to try to persist locally in Firestore if possible
    }
  }

  // If Firestore available, store profile + password hash so server can authenticate without FIREBASE_API_KEY
  if (db) {
    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const docId = userRecord ? userRecord.uid : `local-${Date.now()}`;
      await db.collection("users").doc(docId).set({
        username,
        provider: userRecord ? 'firebase' : 'local',
        createdAt: admin && admin.firestore && admin.firestore.FieldValue ? admin.firestore.FieldValue.serverTimestamp() : new Date(),
        passwordHash,
      });
      return res.status(201).json({ message: "User created", uid: docId, username });
    } catch (err) {
      console.error('Failed to write user profile to Firestore:', err);
      if (userRecord) {
        return res.status(201).json({ message: 'User created (auth-only). Firestore write failed.', uid: userRecord.uid, username, firestoreError: err?.message });
      }
      return res.status(201).json({ message: 'User created locally but Firestore write failed', uid: null, username, firestoreError: err?.message });
    }
  }

  // If no Firestore, but Admin created user, respond with auth-only
  if (userRecord) {
    return res.status(201).json({ message: 'User created (auth-only, no Firestore)', uid: userRecord.uid, username, serverFallback: true });
  }

  return res.status(500).json({ error: 'Failed to create user: no persistence available' });
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
      // Try server-side Firestore password check first (if available)
      if (db) {
        try {
          const q = await db.collection('users').where('username', '==', username).limit(1).get();
          if (!q.empty) {
            const doc = q.docs[0];
            const data = doc.data();
            if (data && data.passwordHash) {
              const ok = await bcrypt.compare(password, data.passwordHash);
              if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
              // Auth succeeded with Firestore-stored password. Create custom token if Admin available
              if (isAdminInitialized) {
                try {
                  const uid = doc.id;
                  const customToken = await admin.auth().createCustomToken(uid);
                  return res.status(200).json({ message: 'Login successful (server-password)', uid, token: customToken, serverFallback: true });
                } catch (e) {
                  console.warn('Failed to create custom token after password auth:', e);
                  return res.status(200).json({ message: 'Login successful (server-password)', uid: doc.id, serverFallback: true });
                }
              }
              return res.status(200).json({ message: 'Login successful (server-password)', uid: doc.id, serverFallback: true });
            }
          }
        } catch (e) {
          console.warn('Firestore password auth failed:', e);
        }
      }

      // If Firestore/password fallback didn't work, try Admin.getUserByEmail fallback
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

      // No Admin SDK available and no password fallback
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
