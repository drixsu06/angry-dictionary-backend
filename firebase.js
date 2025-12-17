import admin from "firebase-admin";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let credential;

if (process.env.GOOGLE_SERVICE_KEY) {
  try {
    const parsed = JSON.parse(process.env.GOOGLE_SERVICE_KEY);
    credential = admin.credential.cert(parsed);
  } catch (err) {
    console.error('Failed to parse GOOGLE_SERVICE_KEY:', err);
    // fallback to file if parsing fails
  }
}

if (!credential) {
  const serviceAccountPath = path.join(__dirname, "db/ServiceKeyy.json");
  credential = admin.credential.cert(serviceAccountPath);
}

admin.initializeApp({
  credential,
});

export const db = admin.firestore();
export { admin };
