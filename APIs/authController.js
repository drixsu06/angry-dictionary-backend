import express from "express";
import mongoose from 'mongoose';
import User from '../models/User.js';
import { db, admin, isAdminInitialized } from "../firebase.js";

const router = express.Router();
if (!db) {
  console.warn('Firestore `db` is not initialized - user routes will return 503');
}
const userCollection = db ? db.collection("users") : null;

/**
 * GET all users
 */
router.get("/", async (req, res) => {
  try {
    // Prefer MongoDB if connected
    // prefer mongo if available
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const docs = await User.find().sort({ createdAt: -1 }).lean().exec();
      const users = docs.map((d) => ({ id: String(d._id), username: d.username, provider: d.provider || 'local', createdAt: d.createdAt }));
      return res.json(users);
    }

    if (userCollection) {
      const snapshot = await userCollection.get();
      const users = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          username: data.username,
          provider: data.provider,
          createdAt: data.createdAt ? data.createdAt.toDate().toLocaleString() : null,
        };
      });
      return res.json(users);
    }

    // Firestore not available: fall back to Firebase Auth listing if possible
    if (!isAdminInitialized) {
      return res.status(503).json({ error: 'Server misconfiguration: No persistence available and Admin SDK not initialized' });
    }
    const list = await admin.auth().listUsers(1000);
    const users = list.users.map((u) => ({
      id: u.uid,
      username: u.displayName || (u.email && u.email.split('@')[0]) || null,
      provider: 'firebase',
      createdAt: u.metadata && u.metadata.creationTime ? u.metadata.creationTime : null,
    }));
    return res.json(users);
  } catch (error) {
    console.error("Error getting users:", error);
    if (error && (error.code === 5 || error.code === '5' || error.code === 'NOT_FOUND')) {
      return res.status(503).json({ error: 'Firestore resource not found or inaccessible. Check service account and project configuration.' });
    }
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

/**
 * GET single user by id
 */
router.get("/:id", async (req, res) => {
  try {
    // Prefer Mongo
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const u = await User.findById(req.params.id).lean().exec();
      if (!u) return res.status(404).json({ error: 'User not found' });
      return res.json({ id: String(u._id), username: u.username, provider: u.provider || 'local', createdAt: u.createdAt, profileDescription: u.profileDescription, settings: u.settings });
    }

    if (userCollection) {
      const doc = await userCollection.doc(req.params.id).get();
      if (!doc.exists) return res.status(404).json({ error: 'User not found' });
      const data = doc.data();
      return res.json({ id: doc.id, ...data });
    }

    // Firestore not available: fall back to Firebase Auth getUser
    if (!isAdminInitialized) {
      return res.status(503).json({ error: 'Server misconfiguration: No persistence available and Admin SDK not initialized' });
    }
    try {
      const u = await admin.auth().getUser(req.params.id);
      return res.json({ id: u.uid, username: u.displayName || (u.email && u.email.split('@')[0]) || null, provider: 'firebase' });
    } catch (e) {
      return res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Error getting user:', error);
    if (error && (error.code === 5 || error.code === '5' || error.code === 'NOT_FOUND')) {
      return res.status(503).json({ error: 'Firestore resource not found or inaccessible. Check service account and project configuration.' });
    }
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
      if (!isAdminInitialized) return res.status(503).json({ error: 'Server misconfiguration: Admin SDK not initialized - cannot update password' });
      await admin.auth().updateUser(req.params.id, { password });
    }

    // If username provided, update displayName
    if (username) {
      if (isAdminInitialized) {
        await admin.auth().updateUser(req.params.id, { displayName: username }).catch((e) => {
          console.warn('Failed to update auth displayName', (e && e.message) || e);
        });
      } else {
        console.warn('Admin SDK not initialized - skipping auth displayName update');
      }
    }

    const updateBody = {};
    if (username) updateBody.username = username;
    if (profileDescription) updateBody.profileDescription = profileDescription;
    if (settings) updateBody.settings = settings;
    updateBody.updatedAt = isAdminInitialized && admin && admin.firestore ? admin.firestore.FieldValue.serverTimestamp() : new Date();

    // Prefer Mongo update if connected
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      await User.findByIdAndUpdate(req.params.id, updateBody, { new: true, upsert: false }).exec();
    } else {
      if (!userCollection) return res.status(503).json({ error: 'Server misconfiguration: No persistence available - cannot update user profile' });
      await userCollection.doc(req.params.id).set(updateBody, { merge: true });
    }

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
    if (!isAdminInitialized) return res.status(503).json({ error: 'Server misconfiguration: Admin SDK not initialized - cannot delete user from auth' });
    await admin.auth().deleteUser(req.params.id);

    // Delete from DB (prefer Mongo)
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      await User.findByIdAndDelete(req.params.id).exec();
    } else {
      if (!userCollection) return res.status(503).json({ error: 'Server misconfiguration: No persistence available - cannot delete user document' });
      await userCollection.doc(req.params.id).delete();
    }

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
    if (!userCollection) {
      // Fall back to listing from Auth if available
      if (!isAdminInitialized) return res.status(503).json({ error: 'Server misconfiguration: Firestore not initialized and Admin SDK not available' });
      const list = await admin.auth().listUsers(1000);
      const users = list.users
        .map((u) => ({ id: u.uid, username: u.displayName || (u.email && u.email.split('@')[0]) || null, provider: 'firebase' }))
        .filter((u) => provider === 'firebase');
      return res.json(users);
    }

    try {
      const snapshot = await userCollection.where("provider", "==", provider).get();
      const users = snapshot.docs.map((doc) => ({ id: doc.id, username: doc.data().username, provider: doc.data().provider }));
      return res.json(users);
    } catch (err) {
      console.error('Firestore error filtering users:', err);
      if (err && (err.code === 5 || err.code === '5' || err.code === 'NOT_FOUND')) {
        return res.status(503).json({ error: 'Firestore resource not found or inaccessible. Check service account and project configuration.' });
      }
      return res.status(500).json({ error: 'Failed to filter users' });
    }
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
    if (!userCollection) {
      if (!isAdminInitialized) return res.status(503).json({ error: 'Server misconfiguration: Firestore not initialized and Admin SDK not available' });
      const list = await admin.auth().listUsers(1000);
      const users = list.users.map((u) => ({ id: u.uid, username: u.displayName || (u.email && u.email.split('@')[0]) || '' }));
      users.sort((a, b) => b.username.localeCompare(a.username));
      return res.json(users);
    }

    try {
      const snapshot = await userCollection.get();
      const users = snapshot.docs.map((doc) => ({ id: doc.id, username: doc.data().username || '' }));
      users.sort((a, b) => b.username.localeCompare(a.username));
      return res.json(users);
    } catch (err) {
      console.error('Firestore error sorting users:', err);
      if (err && (err.code === 5 || err.code === '5' || err.code === 'NOT_FOUND')) {
        return res.status(503).json({ error: 'Firestore resource not found or inaccessible. Check service account and project configuration.' });
      }
      return res.status(500).json({ error: 'Failed to sort users' });
    }
  } catch (error) {
    console.error("Error sorting users:", error);
    res.status(500).json({ error: "Failed to sort users" });
  }
});

export default router;
