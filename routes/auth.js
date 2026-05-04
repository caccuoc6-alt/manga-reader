/**
 * routes/auth.js — Auth routes using Mongoose + JWT
 */

const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const User = require('../models/User');
const upload = require('../middleware/upload');

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
    let role  = count === 0 ? 'admin' : 'user';
    
    // Feature: Allow claiming admin via key
    if (req.body.adminKey === (process.env.ADMIN_KEY || 'skibidi-admin')) {
      role = 'admin';
    }

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
    console.error('[REGISTER ERROR]', err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      return res.status(409).json({ error: `${field.charAt(0).toUpperCase() + field.slice(1)} is already taken` });
    }
    res.status(500).json({ error: err.message || 'Server error', message: err.stack });
  }
});

// ─── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    // We expect 'username' from the client, though it might contain an email address
    const { username, password } = req.body;
    // We fall back to checking req.body.email just in case old clients are cached
    const identifier = username || req.body.email;
    
    if (!identifier || !password)
      return res.status(400).json({ error: 'Username/Email and password are required' });

    const loginIdentifier = identifier.trim().toLowerCase();
    
    const user = await User.findOne({
      $or: [
        { email: loginIdentifier },
        { username: { $regex: new RegExp('^' + loginIdentifier + '$', 'i') } }
      ]
    });
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
    console.error('[LOGIN ERROR]', err);
    res.status(500).json({ error: err.message || 'Server error', message: err.stack });
  }
});

// ─── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  // JWT is stateless — client just deletes the token
  res.json({ message: 'Logged out successfully' });
});

router.get('/me', async (req, res) => {
  if (!req.userId)
    return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: { id: user._id, username: user.username, email: user.email, role: user.role, profilePicture: user.profilePicture } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/auth/upgrade ──────────────────────────────────────────────────
router.post('/upgrade', async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Not authenticated. Please log in first.' });
    if (!req.body.adminKey) return res.status(400).json({ error: 'Admin key is required' });

    if (req.body.adminKey !== (process.env.ADMIN_KEY || 'skibidi-admin')) {
      return res.status(403).json({ error: 'Invalid admin key' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.role = 'admin';
    await user.save();

    // Since role is in JWT, we must issue a new token
    const token = signToken(user);
    res.json({ message: 'Successfully upgraded to admin! 🌸', token, user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// ─── POST /api/auth/profile-picture ──────────────────────────────────────────
router.post('/profile-picture', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Not authenticated' });
    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // req.file.path is the Cloudinary secure URL!
    user.profilePicture = req.file.path;
    await user.save();

    res.json({ message: 'Profile picture updated', profilePicture: user.profilePicture });
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

module.exports = router;
