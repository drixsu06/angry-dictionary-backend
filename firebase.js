import admin from 'firebase-admin';

/**
 * Initialize Firebase Admin SDK from environment variables.
 * Preferred sources (in order):
 *  - GOOGLE_SERVICE_KEY_B64 (base64-encoded service account JSON)
 *  - GOOGLE_SERVICE_KEY (raw JSON string)
 *
 * This file intentionally does NOT read local files so it works on Render.
 */

let db = null;
let isAdminInitialized = false;

function parseServiceAccountFromEnv() {
  // 1) Base64-encoded JSON
  const b64 = process.env.GOOGLE_SERVICE_KEY_B64;
  if (b64) {
    try {
      const json = Buffer.from(b64, 'base64').toString('utf8');
      const parsed = JSON.parse(json);
      console.log('GOOGLE_SERVICE_KEY_B64 found and parsed (redacted)');
      return parsed;
    } catch (err) {
      console.error('Failed to parse GOOGLE_SERVICE_KEY_B64:', err && err.message ? err.message : err);
    }
  }

  // 2) Raw JSON string
  if (process.env.GOOGLE_SERVICE_KEY) {
    try {
      const parsed = JSON.parse(process.env.GOOGLE_SERVICE_KEY);
      console.log('GOOGLE_SERVICE_KEY found and parsed (redacted)');
      return parsed;
    } catch (err) {
      console.error('Failed to parse GOOGLE_SERVICE_KEY JSON:', err && err.message ? err.message : err);
    }
  }

  return null;
}

const serviceAccount = parseServiceAccountFromEnv();

if (serviceAccount) {
  try {
    if (!admin.apps || admin.apps.length === 0) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log('Firebase Admin SDK initialized');
    } else {
      console.log('Firebase Admin SDK already initialized');
    }

    try {
      db = admin.firestore();
      isAdminInitialized = true;
      console.log('Firestore initialized');
    } catch (err) {
      console.error('Firestore initialization failed:', err && err.message ? err.message : err);
    }
  } catch (err) {
    console.error('Failed to initialize Firebase Admin SDK:', err && err.message ? err.message : err);
  }
} else {
  console.warn('No service account found in environment (GOOGLE_SERVICE_KEY_B64 or GOOGLE_SERVICE_KEY)');
}

// Log FIREBASE_API_KEY presence (do not print key)
if (process.env.FIREBASE_API_KEY) {
  console.log('FIREBASE_API_KEY is set (length:', process.env.FIREBASE_API_KEY.length, ')');
} else {
  console.log('FIREBASE_API_KEY is NOT set');
}

export { admin, db, isAdminInitialized };
