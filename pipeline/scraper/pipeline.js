/**
 * pipeline/scraper/pipeline.js
 * ─────────────────────────────────────────────────────────────────
 * Orchestrator — ties all three phases together.
 *
 * Phase 1 → Extraction  (scraper.js)
 * Phase 2 → Processing  (downloader.js + imageValidator.js)
 * Phase 3 → Loading     (uploader.js + dbClient.js)
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const path       = require('path');
const fs         = require('fs');
const scraper    = require('./phases/scraper');
const downloader = require('./phases/downloader');
const uploader   = require('./phases/uploader');
const dbClient   = require('./phases/dbClient');
const logger     = require('./utils/logger');

/**
 * @param {object} opts
 * @param {string}  opts.url      - Chapter page URL to scrape
 * @param {string|null} opts.mangaId  - Existing Manga _id (or null → create new)
 * @param {number|null} opts.chapter  - Override chapter number
 * @param {string|null} opts.title    - Manga title (used if creating new entry)
 * @param {boolean} opts.dryRun   - Skip upload/DB write when true
 */
async function runPipeline(opts) {
  const { url, mangaId, chapter, title, dryRun } = opts;

  logger.info('═══════════════════════════════════════════════════');
  logger.info('  Manga Ingestion Pipeline — Starting              ');
  logger.info('═══════════════════════════════════════════════════');
  logger.info(`  Target URL : ${url}`);
  logger.info(`  Manga ID   : ${mangaId ?? '(will create new)'}`);
  logger.info(`  Dry Run    : ${dryRun}`);
  logger.info('═══════════════════════════════════════════════════');

  // ── Phase 1: Extraction ────────────────────────────────────────
  logger.info('\n📡 [Phase 1] Extracting chapter metadata & image URLs…');
  const scraped = await scraper.extractChapter(url);

  const mangaTitle   = title   || scraped.mangaTitle   || 'Unknown Manga';
  const chapterNum   = chapter || scraped.chapterNumber || 1;
  const chapterTitle = scraped.chapterTitle || `Chapter ${chapterNum}`;

  logger.info(`  ✔ Manga   : "${mangaTitle}"`);
  logger.info(`  ✔ Chapter : ${chapterNum} — "${chapterTitle}"`);
  logger.info(`  ✔ Pages   : ${scraped.imageUrls.length} images found`);

  if (scraped.imageUrls.length === 0) {
    throw new Error('No images found. The site structure may have changed — check the scraper selectors.');
  }

  // ── Phase 2: Download ──────────────────────────────────────────
  logger.info('\n⬇️  [Phase 2] Downloading & validating images…');

  // Local staging folder: ./pipeline/staging/<manga-slug>/<chapter>/
  const slug      = slugify(mangaTitle);
  const stagingDir = path.resolve(__dirname, '..', 'staging', slug, String(chapterNum));
  fs.mkdirSync(stagingDir, { recursive: true });

  const localFiles = await downloader.downloadAll({
    imageUrls:  scraped.imageUrls,
    destDir:    stagingDir,
    refererUrl: url,
  });

  logger.info(`  ✔ Downloaded ${localFiles.length} / ${scraped.imageUrls.length} pages successfully`);

  if (dryRun) {
    logger.info('\n⚠️  DRY RUN — skipping upload and database write.');
    logger.info(`  Staged files are at: ${stagingDir}`);
    return { dryRun: true, stagingDir, localFiles };
  }

  // ── Phase 3a: Upload to Cloudinary ────────────────────────────
  logger.info('\n☁️  [Phase 3a] Uploading pages to Cloudinary…');
  const uploadedPages = await uploader.uploadAll({
    localFiles,
    cloudinaryFolder: `skibiditoiletarchive/${slug}/ch${chapterNum}`,
  });

  logger.info(`  ✔ Uploaded ${uploadedPages.length} pages`);

  // ── Phase 3b: Create/Update database entry ────────────────────
  logger.info('\n🗄️  [Phase 3b] Writing chapter to database…');
  const result = await dbClient.ingestChapter({
    mangaId,
    mangaTitle,
    chapterNumber: chapterNum,
    chapterTitle,
    pages: uploadedPages,
  });

  logger.info(`  ✔ Chapter saved — Manga ID: ${result.mangaId}`);

  // ── Cleanup: remove staging files ─────────────────────────────
  logger.info('\n🧹 Cleaning up staging directory…');
  fs.rmSync(stagingDir, { recursive: true, force: true });

  logger.info('\n✅ Pipeline completed successfully!');
  logger.info(`  Manga ID  : ${result.mangaId}`);
  logger.info(`  Chapter   : ${chapterNum}`);
  logger.info(`  Pages     : ${uploadedPages.length}`);

  return result;
}

/** Convert a manga title to a safe folder slug */
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 64);
}

module.exports = { runPipeline, slugify };
