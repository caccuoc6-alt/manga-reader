/**
 * routes/auth.js — Auth routes using NeDB
 */

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const db      = require('../db');

// Helper: find user by field
const findUser = (query) => db.users.findOneAsync(query);

// ─── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ error: 'All fields are required' });
    if (username.trim().length < 3)
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!/^\S+@\S+\.\S+$/.test(email))
      return res.status(400).json({ error: 'Please enter a valid email address' });

    // Check duplicates
    const existingEmail    = await findUser({ email: email.toLowerCase() });
    if (existingEmail)     return res.status(409).json({ error: 'Email is already registered' });
    const existingUsername = await findUser({ username: username.trim() });
    if (existingUsername)  return res.status(409).json({ error: 'Username is already taken' });

    // First user → admin
    const count = await db.users.countAsync({});
    const role  = count === 0 ? 'admin' : 'user';

    const hashed = await bcrypt.hash(password, 12);
    const user = await db.users.insertAsync({
      username:  username.trim(),
      email:     email.toLowerCase(),
      password:  hashed,
      role,
      bookmarks: [],
      createdAt: new Date(),
    });

    req.session.userId = user._id;
    req.session.role   = user.role;

    res.status(201).json({
      message: 'Account created successfully',
      user: { id: user._id, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    if (err.errorType === 'uniqueViolated')
      return res.status(409).json({ error: 'Username or email already exists' });
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// ─── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    const user = await findUser({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    req.session.userId = user._id;
    req.session.role   = user.role;

    res.json({
      message: 'Logged in successfully',
      user: { id: user._id, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// ─── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

// ─── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  if (!req.session?.userId)
    return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await findUser({ _id: req.session.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: { id: user._id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
