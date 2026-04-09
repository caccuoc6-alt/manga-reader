/**
 * routes/users.js — Public user profile routes
 */

const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const Manga   = require('../models/Manga');
const upload  = require('../middleware/upload');

// ─── Auth guard ───────────────────────────────────────────────────────────────
const requireAuth = (req, res, next) => {
  if (!req.userId)
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  next();
};

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
      .select('username profilePicture role createdAt bookmarks bio banner')
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
        banner: user.banner,
        bio: user.bio,
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

// ─── POST /api/users/profile ───────────────────────────────────────────────────
router.post('/profile', requireAuth, upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (req.body.bio !== undefined) {
      if (req.body.bio.trim().length > 300) {
        return res.status(400).json({ error: 'Bio must be less than 300 characters.' });
      }
      user.bio = req.body.bio.trim();
    }
    
    if (req.files?.avatar?.[0]) {
      user.profilePicture = req.files.avatar[0].path; // Cloudinary secure URL
    }
    if (req.files?.banner?.[0]) {
      user.banner = req.files.banner[0].path; // Cloudinary secure URL
    }

    await user.save();
    res.json({ message: 'Profile updated successfully!', user: {
      profilePicture: user.profilePicture,
      banner: user.banner,
      bio: user.bio
    }});
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile', message: err.message });
  }
});

module.exports = router;
