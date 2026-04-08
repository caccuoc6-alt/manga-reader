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

// ─── Multer storage ───────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = file.fieldname === 'pages'
      ? path.join(__dirname, '..', 'uploads', 'temp')
      : path.join(__dirname, '..', 'uploads');
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname).toLowerCase());
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /\.(jpe?g|png|gif|webp)$/i;
  if (allowed.test(path.extname(file.originalname)) && /image\//i.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpg, png, gif, webp)'));
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

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
        manga.coverImage = `/uploads/${req.files.cover[0].filename}`;
      }

      await manga.save();

      // Process chapter pages
      if (req.files?.pages?.length) {
        const chapNum    = parseInt(chapterNumber) || 1;
        const chapterDir = path.join(__dirname, '..', 'uploads', manga._id.toString(), `chapter-${chapNum}`);
        fs.mkdirSync(chapterDir, { recursive: true });

        const pages = [];
        for (const file of req.files.pages) {
          const dest = path.join(chapterDir, file.filename);
          fs.renameSync(file.path, dest);
          pages.push({
            filename:     file.filename,
            originalName: file.originalname,
            url:          `/uploads/${manga._id}/chapter-${chapNum}/${file.filename}`,
          });
        }

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

      const chapNum    = parseInt(req.body.chapterNumber) || (manga.chapters.length + 1);
      const chapterDir = path.join(__dirname, '..', 'uploads', manga._id.toString(), `chapter-${chapNum}`);
      fs.mkdirSync(chapterDir, { recursive: true });

      const pages = [];
      for (const file of req.files.pages) {
        const dest = path.join(chapterDir, file.filename);
        fs.renameSync(file.path, dest);
        pages.push({
          filename:     file.filename,
          originalName: file.originalname,
          url:          `/uploads/${manga._id}/chapter-${chapNum}/${file.filename}`,
        });
      }

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

    // Delete uploaded files
    const mangaFolder = path.join(__dirname, '..', 'uploads', manga._id.toString());
    if (fs.existsSync(mangaFolder)) fs.rmSync(mangaFolder, { recursive: true, force: true });

    if (manga.coverImage) {
      const coverPath = path.join(__dirname, '..', manga.coverImage.replace(/^\//, ''));
      if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
    }

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
