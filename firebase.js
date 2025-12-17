import admin from "firebase-admin";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.join(__dirname, "db/ServiceKeyy.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
});

export const db = admin.firestore();
export { admin };
