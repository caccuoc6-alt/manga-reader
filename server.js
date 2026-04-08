/**
 * server.js — Express server (NeDB edition, no MongoDB required)
 */

const express    = require('express');
const session    = require('express-session');
const MemoryStore= require('memorystore')(session);
const cors       = require('cors');
const path       = require('path');
const connectDB  = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://caccuoc6-alt.github.io',
];
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Sessions ─────────────────────────────────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production';
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'manga-secret-key-local-dev-only',
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore({ checkPeriod: 86400000 }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax', // 'none' required for cross-origin (GitHub Pages → Render)
      secure:   isProd,                  // must be true when sameSite='none'
    },
  })
);

// ─── Routes ───────────────────────────────────────────────────────────────────
const authRoutes  = require('./routes/auth');
const mangaRoutes = require('./routes/manga');

app.use('/api/auth',  authRoutes);
app.use('/api/manga', mangaRoutes);

// ─── Catch-all: serve HTML pages (SPA-style) ─────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ SkibidiToiletArchive running at → http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
