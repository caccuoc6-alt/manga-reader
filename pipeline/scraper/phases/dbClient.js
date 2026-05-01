/**
 * pipeline/scraper/phases/dbClient.js
 * ─────────────────────────────────────────────────────────────────
 * Phase 3b — Database Ingestion
 *
 * Writes the scraped chapter directly into your MongoDB database
 * using Mongoose — the same models your Express server uses.
 *
 * Two modes:
 *  - mangaId provided  → adds a chapter to an existing Manga document
 *  - mangaId omitted   → creates a new Manga document (title required)
 *
 * The scraper runs as a separate process, so it connects to MongoDB
 * independently using the same MONGODB_URI from your .env file.
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const mongoose = require('mongoose');
const logger   = require('../utils/logger');

// Re-use the same Mongoose models
const Manga = require('../../../models/Manga');
const User  = require('../../../models/User');

let _connected = false;

async function connect() {
  if (_connected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set.\n' +
      'Add it to your .env file:\n' +
      '  MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname'
    );
  }
  await mongoose.connect(uri);
  _connected = true;
  logger.debug('  MongoDB connected');
}

async function disconnect() {
  if (_connected) {
    await mongoose.disconnect();
    _connected = false;
  }
}

/**
 * Ingest a chapter into the database.
 *
 * @param {object}  opts
 * @param {string|null} opts.mangaId       - Existing Manga _id, or null
 * @param {string}  opts.mangaTitle        - Used when creating a new entry
 * @param {number}  opts.chapterNumber
 * @param {string}  opts.chapterTitle
 * @param {Array}   opts.pages             - [{filename, originalName, url}]
 * @returns {Promise<{mangaId: string, chapterNumber: number}>}
 */
async function ingestChapter({ mangaId, mangaTitle, chapterNumber, chapterTitle, pages }) {
  await connect();

  try {
    let manga;

    if (mangaId) {
      // ── Add chapter to existing manga ──────────────────────────
      manga = await Manga.findById(mangaId);
      if (!manga) throw new Error(`Manga not found with ID: ${mangaId}`);

      // Check if chapter already exists (idempotent re-run support)
      const exists = manga.chapters.find(c => c.chapterNumber === chapterNumber);
      if (exists) {
        logger.warn(`  Chapter ${chapterNumber} already exists — overwriting pages.`);
        exists.pages      = pages;
        exists.uploadedAt = new Date();
      } else {
        manga.chapters.push({
          chapterNumber,
          title:      chapterTitle,
          pages,
          uploadedAt: new Date(),
        });
      }
    } else {
      // ── Create new manga entry ─────────────────────────────────
      // We need an uploader userId. Use the first admin user as the pipeline user.
      // Alternatively, create a dedicated "pipeline" service user.
      const pipelineUserId = await getPipelineUserId();

      manga = new Manga({
        title:       mangaTitle,
        description: `Imported via pipeline from external source.`,
        author:      'Unknown',
        genres:      [],
        status:      'ongoing',
        uploadedBy:  pipelineUserId,
        chapters:    [{
          chapterNumber,
          title:      chapterTitle,
          pages,
          uploadedAt: new Date(),
        }],
      });
    }

    // Keep chapters sorted
    manga.chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
    await manga.save();

    return { mangaId: manga._id.toString(), chapterNumber };
  } finally {
    await disconnect();
  }
}

/**
 * Find the pipeline service user (admin), or create one if none exists.
 * The returned user ID is used as `uploadedBy` for auto-imported manga.
 */
async function getPipelineUserId() {
  const PIPELINE_USER_ENV = process.env.PIPELINE_USER_ID;
  if (PIPELINE_USER_ENV) {
    // Explicitly configured service account ID
    return new mongoose.Types.ObjectId(PIPELINE_USER_ENV);
  }

  // Fallback: use the first admin user in the DB
  const admin = await User.findOne({ role: 'admin' }).select('_id').lean();
  if (admin) return admin._id;

  throw new Error(
    'No admin user found for pipeline attribution.\n' +
    'Set PIPELINE_USER_ID in your .env file:\n' +
    '  PIPELINE_USER_ID=<your-admin-user-objectid>'
  );
}

module.exports = { ingestChapter };
