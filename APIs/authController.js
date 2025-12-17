import express from "express";
import { db, admin } from "../firebase.js";

const router = express.Router();
const userCollection = db.collection("users");

/**
 * GET all users
 */
router.get("/", async (req, res) => {
  try {
    const snapshot = await userCollection.get();

    const users = snapshot.docs.map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,
        username: data.username,
        provider: data.provider,
        createdAt: data.createdAt
          ? data.createdAt.toDate().toLocaleString()
          : null,
      };
    });

    res.json(users);
  } catch (error) {
    console.error("Error getting users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

/**
 * GET single user by id
 */
router.get("/:id", async (req, res) => {
  try {
    const doc = await userCollection.doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'User not found' });

    const data = doc.data();
    res.json({ id: doc.id, ...data });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * UPDATE username (Firestore + Firebase Auth)
 */
router.put("/:id", async (req, res) => {
  try {
    const { username, profileDescription, settings, password } = req.body;

    // If password provided, update Firebase Auth password
    if (password) {
      await admin.auth().updateUser(req.params.id, { password });
    }

    // If username provided, update displayName
    if (username) {
      await admin.auth().updateUser(req.params.id, { displayName: username }).catch((e) => {
        console.warn('Failed to update auth displayName', e.message);
      });
    }

    const updateBody = {};
    if (username) updateBody.username = username;
    if (profileDescription) updateBody.profileDescription = profileDescription;
    if (settings) updateBody.settings = settings;
    updateBody.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await userCollection.doc(req.params.id).set(updateBody, { merge: true });

    const resp = { id: req.params.id, ...updateBody, message: 'User updated successfully' };
    res.json(resp);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * DELETE user (Firestore + Firebase Auth)
 */
router.delete("/:id", async (req, res) => {
  try {
    // Delete from Firebase Auth
    await admin.auth().deleteUser(req.params.id);

    // Delete from Firestore
    await userCollection.doc(req.params.id).delete();

    res.json({
      id: req.params.id,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

/**
 * FILTER users by provider (firebase / fallback)
 * example: /users/filter?provider=firebase
 */
router.get("/filter", async (req, res) => {
  try {
    const { provider } = req.query;

    if (!provider) {
      return res.status(400).json({ error: "Provider is required" });
    }

    const snapshot = await userCollection
      .where("provider", "==", provider)
      .get();

    const users = snapshot.docs.map((doc) => ({
      id: doc.id,
      username: doc.data().username,
      provider: doc.data().provider,
    }));

    res.json(users);
  } catch (error) {
    console.error("Error filtering users:", error);
    res.status(500).json({ error: "Failed to filter users" });
  }
});

/**
 * SORT users by username (descending)
 */
router.get("/sort/desc", async (req, res) => {
  try {
    const snapshot = await userCollection.get();

    const users = snapshot.docs.map((doc) => ({
      id: doc.id,
      username: doc.data().username || "",
    }));

    users.sort((a, b) =>
      b.username.localeCompare(a.username)
    );

    res.json(users);
  } catch (error) {
    console.error("Error sorting users:", error);
    res.status(500).json({ error: "Failed to sort users" });
  }
});

export default router;
