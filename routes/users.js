/**
 * routes/users.js — Public user profile routes
 */

const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const Manga   = require('../models/Manga');

// ─── Strip page arrays for list views (re-used from manga.js logic) ─────────
function stripPages(manga) {
  return {
    ...manga,
    uploader: manga.uploadedBy?.username || 'Unknown',
    chapters: (manga.chapters || []).map(ch => ({
      chapterNumber: ch.chapterNumber,
      title:         ch.title,
      uploadedAt:    ch.uploadedAt,
      pageCount:     ch.pages?.length || 0,
    })),
  };
}

// ─── GET /api/users/:id/profile ───────────────────────────────────────────────
router.get('/:id/profile', async (req, res) => {
  try {
    const userId = req.params.id;

    // Fetch user public data + populate bookmarks 
    // We do NOT select email or password.
    const user = await User.findById(userId)
      .select('username profilePicture role createdAt bookmarks')
      .populate({
        path: 'bookmarks',
        populate: { path: 'uploadedBy', select: 'username' } // needed for stripPages
      })
      .lean();

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Fetch uploaded mangas
    const uploads = await Manga.find({ uploadedBy: userId })
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'username')
      .lean();

    // Map stripping
    const processedUploads = uploads.map(stripPages);
    const processedBookmarks = (user.bookmarks || []).map(stripPages);

    res.json({
      user: {
        _id: user._id,
        username: user.username,
        profilePicture: user.profilePicture,
        role: user.role,
        createdAt: user.createdAt,
      },
      stats: {
        uploadsCount: uploads.length,
        bookmarksCount: user.bookmarks?.length || 0,
      },
      uploads: processedUploads,
      bookmarks: processedBookmarks,
    });
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ error: 'Invalid user ID' });
    res.status(500).json({ error: 'Failed to load profile', message: err.message });
  }
});

module.exports = router;
