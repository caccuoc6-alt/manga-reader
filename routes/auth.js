/**
 * routes/auth.js — Auth routes using Mongoose + MongoDB Atlas
 */

const express = require('express');
const router  = express.Router();
const User    = require('../models/User');

// ─── POST /api/auth/register ──────────────────────────────────────────────────
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

    // First user → admin
    const count = await User.countDocuments();
    const role  = count === 0 ? 'admin' : 'user';

    // Password is hashed by the Mongoose pre-save hook in User model
    const user = await User.create({
      username: username.trim(),
      email:    email.toLowerCase(),
      password,
      role,
    });

    req.session.userId = user._id.toString();
    req.session.role   = user.role;

    res.status(201).json({
      message: 'Account created successfully',
      user: { id: user._id, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      return res.status(409).json({ error: `${field.charAt(0).toUpperCase() + field.slice(1)} is already taken` });
    }
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// ─── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    // Must explicitly select password since it could be excluded by default
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    req.session.userId = user._id.toString();
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
    const user = await User.findById(req.session.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: { id: user._id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
