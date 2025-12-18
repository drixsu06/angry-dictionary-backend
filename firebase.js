import admin from "firebase-admin";
import path from "path";
import { fileURLToPath } from "url";

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
    credential = admin.credential.cert(serviceAccountPath);
    console.log('Loaded service account from local file db/ServiceKeyy.json');
  } catch (err) {
    console.warn('No valid service account loaded from env or local file:', (err && err.message) || err);
  }
}

admin.initializeApp({
  credential: credential || undefined,
});

export const db = admin.firestore();
export { admin };

// Helpful debug: log presence of FIREBASE_API_KEY (not the key value)
if (process.env.FIREBASE_API_KEY) {
  console.log('FIREBASE_API_KEY is set (length:', process.env.FIREBASE_API_KEY.length, ')');
} else {
  console.log('FIREBASE_API_KEY is NOT set');
}
