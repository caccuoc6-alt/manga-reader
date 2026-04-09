/**
 * routes/comment.js — CRUD routes for chapter comments
 */

const express = require('express');
const router  = express.Router();
const Comment = require('../models/Comment');

// ─── Auth guard ───────────────────────────────────────────────────────────────
const requireAuth = (req, res, next) => {
  if (!req.userId)
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  next();
};

// ─── GET /api/comments ────────────────────────────────────────────────────────
// Query: ?mangaId=...&chapterNumber=...
router.get('/', async (req, res) => {
  try {
    const { mangaId, chapterNumber } = req.query;
    if (!mangaId || !chapterNumber) {
      return res.status(400).json({ error: 'mangaId and chapterNumber are required' });
    }

    const comments = await Comment.find({ manga: mangaId, chapterNumber })
      .sort({ createdAt: -1 }) // newest first
      .populate('user', 'username profilePicture role')
      .lean();

    res.json({ comments });
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// ─── POST /api/comments ───────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { mangaId, chapterNumber, content } = req.body;

    if (!mangaId || !chapterNumber) {
      return res.status(400).json({ error: 'mangaId and chapterNumber are required' });
    }
    if (!content?.trim()) {
      return res.status(400).json({ error: 'Comment content cannot be empty' });
    }

    const comment = new Comment({
      manga: mangaId,
      chapterNumber,
      user: req.userId,
      content: content.trim(),
    });

    await comment.save();
    
    // Populate user details before returning so frontend can display immediately
    await comment.populate('user', 'username profilePicture role');

    res.status(201).json({ message: 'Comment posted successfully', comment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to post comment', message: err.message });
  }
});

// ─── DELETE /api/comments/:id ─────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const commentId = req.params.id;
    const comment = await Comment.findById(commentId).populate('user', '_id');
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    // Check authorization: must be comment owner OR admin
    const isOwner = comment.user._id.toString() === req.userId;
    const isAdmin = req.userRole === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this comment' });
    }

    await Comment.findByIdAndDelete(commentId);
    res.json({ message: 'Comment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete comment', message: err.message });
  }
});

module.exports = router;
