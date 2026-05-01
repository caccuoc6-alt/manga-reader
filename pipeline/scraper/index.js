#!/usr/bin/env node
/**
 * pipeline/scraper/index.js
 * ─────────────────────────────────────────────────────────────────
 * Manga Image Extraction & Ingestion Pipeline — CLI Entry Point
 *
 * Usage:
 *   node pipeline/scraper/index.js --url <chapter-url> --manga-id <mongo-id>
 *
 * Options:
 *   --url         Chapter URL to scrape                    (required)
 *   --manga-id    Existing Manga _id in your database      (optional)
 *                 If omitted, a new Manga entry is created
 *   --chapter     Chapter number override                  (optional)
 *   --title       Manga title (used when creating new entry)(optional)
 *   --dry-run     Download images but skip upload/DB write (flag)
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const { parseArgs }   = require('util');
const { runPipeline } = require('./pipeline');
const logger          = require('./utils/logger');

// ── Argument parsing ──────────────────────────────────────────────
const { values } = parseArgs({
  options: {
    url:       { type: 'string' },
    'manga-id': { type: 'string' },
    chapter:   { type: 'string' },
    title:     { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
  strict: false,
});

if (!values.url) {
  logger.error('--url is required. Example:');
  logger.error('  node pipeline/scraper/index.js --url "https://example.com/manga/one-piece/chapter-1"');
  process.exit(1);
}

// ── Run ───────────────────────────────────────────────────────────
runPipeline({
  url:       values.url,
  mangaId:   values['manga-id']  || null,
  chapter:   values.chapter      ? Number(values.chapter) : null,
  title:     values.title        || null,
  dryRun:    values['dry-run']   || false,
}).catch(err => {
  logger.error('Fatal pipeline error:', err.message);
  process.exit(1);
});
