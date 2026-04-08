/**
 * routes/manga.js — Manga CRUD routes using Mongoose + MongoDB Atlas
 */

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const Manga   = require('../models/Manga');

// ─── Auth guard ───────────────────────────────────────────────────────────────
const requireAuth = (req, res, next) => {
  if (!req.userId)
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  next();
};

// ─── Cloudinary + Multer storage ──────────────────────────────────────────────
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Cloudinary auto-configures if CLOUDINARY_URL is present in process.env
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'skibiditoiletarchive',
    allowed_formats: ['jpg', 'png', 'webp', 'gif', 'jpeg'],
  },
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Strip page arrays for list views ────────────────────────────────────────
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

// ─── GET /api/manga ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search, page = 1, limit = 12, genre, status } = req.query;
    const pageNum  = Math.max(1, parseInt(page)  || 1);
    const limitNum = Math.max(1, parseInt(limit) || 12);

    const query = {};
    if (search?.trim()) {
      const re = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ title: re }, { description: re }, { author: re }];
    }
    if (genre)  query.genres = genre;
    if (status) query.status = status;

    const total  = await Manga.countDocuments(query);
    const mangas = await Manga.find(query)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate('uploadedBy', 'username')
      .lean();

    res.json({
      mangas: mangas.map(stripPages),
      pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum), limit: limitNum },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// ─── GET /api/manga/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const manga = await Manga.findById(req.params.id)
      .populate('uploadedBy', 'username')
      .lean();
    if (!manga) return res.status(404).json({ error: 'Manga not found' });

    await Manga.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });

    res.json({ manga: { ...manga, uploader: manga.uploadedBy?.username || 'Unknown' } });
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// ─── POST /api/manga ──────────────────────────────────────────────────────────
router.post(
  '/',
  requireAuth,
  upload.fields([{ name: 'cover', maxCount: 1 }, { name: 'pages', maxCount: 200 }]),
  async (req, res) => {
    try {
      const { title, description, author, genres, status, chapterTitle, chapterNumber } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

      const parsedGenres = genres
        ? (Array.isArray(genres) ? genres : genres.split(',').map(g => g.trim())).filter(Boolean)
        : [];

      const manga = new Manga({
        title:       title.trim(),
        description: description?.trim() || '',
        author:      author?.trim() || 'Unknown',
        genres:      parsedGenres,
        status:      status || 'ongoing',
        uploadedBy:  req.userId,
        chapters:    [],
      });

      // Cover image
      if (req.files?.cover?.[0]) {
        manga.coverImage = req.files.cover[0].path; // Cloudinary secure URL
      }

      await manga.save();

      // Process chapter pages
      if (req.files?.pages?.length) {
        const chapNum = parseInt(chapterNumber) || 1;
        const pages = req.files.pages.map(f => ({
          filename:     f.filename,
          originalName: f.originalname,
          url:          f.path, // Cloudinary secure URL
        }));

        manga.chapters.push({
          chapterNumber: chapNum,
          title:         chapterTitle || `Chapter ${chapNum}`,
          pages,
          uploadedAt:    new Date(),
        });
        await manga.save();
      }

      res.status(201).json({ message: 'Manga uploaded successfully', manga });
    } catch (err) {
      res.status(500).json({ error: 'Upload failed', message: err.message });
    }
  }
);

// ─── POST /api/manga/:id/chapter ──────────────────────────────────────────────
router.post(
  '/:id/chapter',
  requireAuth,
  upload.fields([{ name: 'pages', maxCount: 200 }]),
  async (req, res) => {
    try {
      const manga = await Manga.findById(req.params.id);
      if (!manga) return res.status(404).json({ error: 'Manga not found' });

      const isOwner = manga.uploadedBy.toString() === req.userId;
      const isAdmin = req.userRole === 'admin';
      if (!isOwner && !isAdmin)
        return res.status(403).json({ error: 'Not authorized to add chapters' });

      if (!req.files?.pages?.length)
        return res.status(400).json({ error: 'At least one page image is required' });

      const chapNum = parseInt(req.body.chapterNumber) || (manga.chapters.length + 1);
      const pages = req.files.pages.map(f => ({
        filename:     f.filename,
        originalName: f.originalname,
        url:          f.path, // Cloudinary secure URL
      }));

      const newChapter = {
        chapterNumber: chapNum,
        title:         req.body.chapterTitle || `Chapter ${chapNum}`,
        pages,
        uploadedAt:    new Date(),
      };

      manga.chapters.push(newChapter);
      manga.chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
      await manga.save();

      res.status(201).json({ message: 'Chapter added successfully', chapter: newChapter });
    } catch (err) {
      res.status(500).json({ error: 'Failed to add chapter', message: err.message });
    }
  }
);

// ─── DELETE /api/manga/:id ────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const manga = await Manga.findById(req.params.id);
    if (!manga) return res.status(404).json({ error: 'Manga not found' });

    const isOwner = manga.uploadedBy.toString() === req.userId;
    const isAdmin = req.userRole === 'admin';
    if (!isOwner && !isAdmin)
      return res.status(403).json({ error: 'Not authorized to delete this manga' });

    // (Optional: We leave files on Cloudinary for now, or you could use cloudinary api to delete them)

    await Manga.findByIdAndDelete(req.params.id);
    res.json({ message: 'Manga deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed', message: err.message });
  }
});

// ─── POST /api/manga/:id/rate ─────────────────────────────────────────────────
router.post('/:id/rate', requireAuth, async (req, res) => {
  try {
    const r = parseInt(req.body.rating);
    if (r < 1 || r > 5) return res.status(400).json({ error: 'Rating must be 1–5' });

    const manga = await Manga.findByIdAndUpdate(
      req.params.id,
      { $inc: { 'rating.total': r, 'rating.count': 1 } },
      { new: true }
    );
    if (!manga) return res.status(404).json({ error: 'Manga not found' });
    res.json({ message: 'Rating submitted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Multer error handler ─────────────────────────────────────────────────────
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(400).json({ error: 'File too large. Maximum 10MB per file.' });
  if (err.message?.includes('Only image'))
    return res.status(400).json({ error: err.message });
  next(err);
});

module.exports = router;
