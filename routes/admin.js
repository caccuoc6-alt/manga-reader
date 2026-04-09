/**
 * routes/admin.js — Admin-only statistics & management routes
 */

const express = require('express');
const router  = express.Router();
const Manga   = require('../models/Manga');
const User    = require('../models/User');

// ─── Admin guard middleware ────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (!req.userId)
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  if (req.userRole !== 'admin')
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  next();
}

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [
      totalManga,
      totalUsers,
      mangaList,
      userList,
      statusBreakdown,
    ] = await Promise.all([
      Manga.countDocuments(),
      User.countDocuments(),
      Manga.find({}, 'title views chapters genres status createdAt author rating uploadedBy')
           .populate('uploadedBy', 'username')
           .lean(),
      User.find({}, 'username email role createdAt').lean(),
      Manga.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    // Aggregate totals
    const totalViews    = mangaList.reduce((s, m) => s + (m.views || 0), 0);
    const totalChapters = mangaList.reduce((s, m) => s + (m.chapters?.length || 0), 0);
    const totalPages    = mangaList.reduce((s, m) =>
      s + m.chapters.reduce((cs, ch) => cs + (ch.pages?.length || 0), 0), 0);

    // Genre frequency map
    const genreMap = {};
    for (const m of mangaList) {
      for (const g of (m.genres || [])) {
        genreMap[g] = (genreMap[g] || 0) + 1;
      }
    }
    const topGenres = Object.entries(genreMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([genre, count]) => ({ genre, count }));

    // Top manga by views
    const topByViews = [...mangaList]
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, 10)
      .map(m => ({
        _id:      m._id,
        title:    m.title,
        author:   m.author,
        views:    m.views || 0,
        chapters: m.chapters?.length || 0,
        status:   m.status,
        uploader: m.uploadedBy?.username || 'Unknown',
        coverImage: m.coverImage,
      }));

    // Top manga by rating
    const topByRating = [...mangaList]
      .filter(m => m.rating?.count > 0)
      .sort((a, b) => {
        const ra = a.rating.count > 0 ? a.rating.total / a.rating.count : 0;
        const rb = b.rating.count > 0 ? b.rating.total / b.rating.count : 0;
        return rb - ra;
      })
      .slice(0, 5)
      .map(m => ({
        _id:    m._id,
        title:  m.title,
        rating: m.rating.count > 0 ? (m.rating.total / m.rating.count).toFixed(1) : '—',
        ratingCount: m.rating.count,
      }));

    // Uploads over last 30 days (day buckets)
    const now = new Date();
    const days30 = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (29 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });
    const uploadTimeline = days30.map(day => {
      const nextDay = new Date(day); nextDay.setDate(nextDay.getDate() + 1);
      return {
        date:  day.toISOString().slice(0, 10),
        count: mangaList.filter(m => {
          const c = new Date(m.createdAt);
          return c >= day && c < nextDay;
        }).length,
      };
    });

    // Status breakdown (clean)
    const statusMap = { ongoing: 0, completed: 0, hiatus: 0 };
    for (const s of statusBreakdown) statusMap[s._id] = s.count;

    // Recent uploads (last 10)
    const recentUploads = [...mangaList]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10)
      .map(m => ({
        _id:       m._id,
        title:     m.title,
        uploader:  m.uploadedBy?.username || 'Unknown',
        createdAt: m.createdAt,
        chapters:  m.chapters?.length || 0,
        status:    m.status,
      }));

    // Admin count
    const adminCount = userList.filter(u => u.role === 'admin').length;

    res.json({
      overview: {
        totalManga,
        totalUsers,
        totalViews,
        totalChapters,
        totalPages,
        adminCount,
        userCount: totalUsers - adminCount,
      },
      statusBreakdown: statusMap,
      topGenres,
      topByViews,
      topByRating,
      uploadTimeline,
      recentUploads,
      recentUsers: userList
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10)
        .map(u => ({ _id: u._id, username: u.username, email: u.email, role: u.role, createdAt: u.createdAt })),
    });
  } catch (err) {
    console.error('[ADMIN STATS ERROR]', err);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, 'username email role createdAt').lean();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// ─── PATCH /api/admin/users/:id/role ──────────────────────────────────────────
router.patch('/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role))
      return res.status(400).json({ error: 'Invalid role' });
    if (req.params.id === req.userId)
      return res.status(400).json({ error: 'Cannot change your own role' });
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: `Role updated to ${role}`, user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// ─── DELETE /api/admin/manga/:id ──────────────────────────────────────────────
router.delete('/manga/:id', requireAdmin, async (req, res) => {
  try {
    const manga = await Manga.findByIdAndDelete(req.params.id);
    if (!manga) return res.status(404).json({ error: 'Manga not found' });
    res.json({ message: 'Manga deleted by admin' });
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

module.exports = router;
