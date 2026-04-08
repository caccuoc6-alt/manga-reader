/**
 * routes/auth.js — Auth routes using Mongoose + JWT
 */

const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');

const JWT_SECRET  = process.env.JWT_SECRET || 'skibidi-jwt-secret-local-dev';
const JWT_EXPIRES = '30d';

function signToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

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

    const count = await User.countDocuments();
    const role  = count === 0 ? 'admin' : 'user';

    const user = await User.create({
      username: username.trim(),
      email:    email.toLowerCase(),
      password,
      role,
    });

    const token = signToken(user);

    res.status(201).json({
      message: 'Account created successfully',
      token,
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

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken(user);

    res.json({
      message: 'Logged in successfully',
      token,
      user: { id: user._id, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// ─── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  // JWT is stateless — client just deletes the token
  res.json({ message: 'Logged out successfully' });
});

// ─── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  if (!req.userId)
    return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: { id: user._id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
