import admin from "firebase-admin";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let credential;
// Prefer explicit JSON in GOOGLE_SERVICE_KEY (raw JSON) or GOOGLE_SERVICE_KEY_B64 (base64-encoded JSON)
if (process.env.GOOGLE_SERVICE_KEY) {
  try {
    const parsed = JSON.parse(process.env.GOOGLE_SERVICE_KEY);
    credential = admin.credential.cert(parsed);
    console.log('Loaded service account from GOOGLE_SERVICE_KEY');
  } catch (err) {
    console.error('Failed to parse GOOGLE_SERVICE_KEY JSON:', (err && err.message) || err);
  }
}

if (!credential && process.env.GOOGLE_SERVICE_KEY_B64) {
  try {
    const decoded = Buffer.from(process.env.GOOGLE_SERVICE_KEY_B64, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    credential = admin.credential.cert(parsed);
    console.log('Loaded service account from GOOGLE_SERVICE_KEY_B64 (base64)');
  } catch (err) {
    console.error('Failed to decode/parse GOOGLE_SERVICE_KEY_B64:', (err && err.message) || err);
  }
}

if (!credential) {
  const serviceAccountPath = path.join(__dirname, "db/ServiceKeyy.json");
  try {
    if (fs.existsSync(serviceAccountPath)) {
      const raw = fs.readFileSync(serviceAccountPath, { encoding: 'utf8' });
      const parsed = JSON.parse(raw);
      credential = admin.credential.cert(parsed);
      console.log('Loaded service account from local file db/ServiceKeyy.json');
    } else {
      console.warn('Local service account file db/ServiceKeyy.json not found');
    }
  } catch (err) {
    console.warn('Failed to load local service account from db/ServiceKeyy.json:', (err && err.message) || err);
  }
}
let db = null;
let isAdminInitialized = false;
if (credential) {
  try {
    if (!admin.apps || !admin.apps.length) {
      admin.initializeApp({ credential: credential });
      console.log('Firebase Admin SDK initialized');
    } else {
      console.log('Firebase Admin SDK already initialized');
    }
    try {
      db = admin.firestore();
      isAdminInitialized = true;
    } catch (e) {
      console.warn('Firestore could not be initialized after Admin SDK init:', (e && e.message) || e);
    }
  } catch (err) {
    console.error('Failed to initialize Firebase Admin SDK:', (err && err.message) || err);
  }
} else {
  console.warn('Firebase Admin SDK not initialized: no service account available');
}

export { db, admin, isAdminInitialized };

// Helpful debug: log presence of FIREBASE_API_KEY (not the key value)
if (process.env.FIREBASE_API_KEY) {
  console.log('FIREBASE_API_KEY is set (length:', process.env.FIREBASE_API_KEY.length, ')');
} else {
  console.log('FIREBASE_API_KEY is NOT set');
}
