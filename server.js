/**
 * server.js — Express server (NeDB edition, no MongoDB required)
 */

const express = require('express');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const cors = require('cors');
const path = require('path');

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

// ─── Sessions (file-persisted via memorystore — no external DB needed) ────────
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'manga-secret-key-local-dev-only',
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore({ checkPeriod: 86400000 }), // prune expired entries every 24h
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
      httpOnly: true,
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
app.listen(PORT, () => {
  console.log(`✅ MangaVault running at → http://localhost:${PORT}`);
  console.log(`📂 Database stored in    → ${path.join(__dirname, 'data')}`);
});
