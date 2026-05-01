/**
 * routes/pipeline.js
 * ─────────────────────────────────────────────────────────────────
 * Internal scrape-and-ingest API — triggers the full pipeline
 * from an HTTP request. This runs on your Render server which has
 * full internet access, bypassing local network restrictions.
 *
 * POST /api/pipeline/scrape
 * Body: { url, mangaId?, chapter?, title?, dryRun? }
 *
 * Protected: admin-only via JWT middleware.
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const { runPipeline } = require('../pipeline/scraper/pipeline');

// ── Admin guard ───────────────────────────────────────────────────
const requireAdmin = (req, res, next) => {
  if (!req.userId)      return res.status(401).json({ error: 'Unauthorized' });
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
};

/**
 * POST /api/pipeline/scrape
 *
 * Body (JSON):
 *   url       {string}  - Chapter URL to scrape             (required)
 *   mangaId   {string}  - Existing Manga _id                (optional)
 *   chapter   {number}  - Override chapter number            (optional)
 *   title     {string}  - Manga title for new entries        (optional)
 *   dryRun    {boolean} - Skip upload + DB write             (optional)
 */
router.post('/scrape', requireAdmin, async (req, res) => {
  const { url, mangaId, chapter, title, dryRun } = req.body;

  if (!url) {
    return res.status(400).json({ error: '`url` is required' });
  }

  // Respond immediately so the HTTP request doesn't time out
  // while the pipeline runs (can take minutes for large chapters)
  res.status(202).json({
    message: 'Pipeline started. Check server logs for progress.',
    url,
    mangaId: mangaId || null,
    dryRun:  dryRun  || false,
  });

  // Run pipeline in the background (non-blocking)
  runPipeline({
    url,
    mangaId: mangaId || null,
    chapter: chapter ? Number(chapter) : null,
    title:   title   || null,
    dryRun:  dryRun  || false,
  })
    .then(result => {
      console.log(`✅ Pipeline complete — Manga: ${result.mangaId}, Chapter: ${result.chapterNumber ?? 'dry-run'}`);
    })
    .catch(err => {
      console.error(`❌ Pipeline failed: ${err.message}`);
    });
});

/**
 * POST /api/pipeline/batch
 *
 * Body (JSON):
 *   mangaId    {string}  - Existing Manga _id                (optional)
 *   mangaTitle {string}  - Title for new entries             (optional)
 *   chapters   {Array}   - [{ url, chapter }]                (required)
 */
router.post('/batch', requireAdmin, async (req, res) => {
  const { mangaId, mangaTitle, chapters } = req.body;

  if (!Array.isArray(chapters) || chapters.length === 0) {
    return res.status(400).json({ error: '`chapters` array is required and must not be empty' });
  }

  res.status(202).json({
    message: `Batch pipeline started for ${chapters.length} chapter(s). Check server logs.`,
    chapters: chapters.length,
  });

  // Run sequentially in background
  (async () => {
    const { sleep } = require('../pipeline/scraper/utils/helpers');
    for (let i = 0; i < chapters.length; i++) {
      const job = chapters[i];
      try {
        console.log(`[Batch ${i + 1}/${chapters.length}] Scraping chapter ${job.chapter}: ${job.url}`);
        await runPipeline({
          url:     job.url,
          mangaId: mangaId || null,
          chapter: job.chapter || null,
          title:   mangaTitle || null,
          dryRun:  false,
        });
      } catch (err) {
        console.error(`[Batch] Chapter ${job.chapter} failed: ${err.message}`);
      }
      if (i < chapters.length - 1) await sleep(3000 + Math.random() * 2000);
    }
    console.log(`✅ Batch complete.`);
  })();
});

module.exports = router;
