/**
 * pipeline/scraper/config.js
 * ─────────────────────────────────────────────────────────────────
 * All tunable pipeline parameters in one place.
 * Override any value via environment variables.
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

// Load .env from project root
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

module.exports = {
  // ── Rate limiting ──────────────────────────────────────────────
  // Random delay between page requests [min, max] ms
  // Simulates human browsing; reduces risk of IP ban
  delayBetweenRequestsMs: [
    parseInt(process.env.DELAY_MIN_MS, 10) || 1500,
    parseInt(process.env.DELAY_MAX_MS, 10) || 4000,
  ],

  // Random delay between each image download [min, max] ms
  delayBetweenDownloadsMs: [
    parseInt(process.env.DL_DELAY_MIN_MS, 10) || 200,
    parseInt(process.env.DL_DELAY_MAX_MS, 10) || 800,
  ],

  // ── Concurrency ────────────────────────────────────────────────
  // Max simultaneous image downloads
  // Higher = faster, but more likely to trigger server-side rate limits
  concurrentDownloads: parseInt(process.env.CONCURRENT_DOWNLOADS, 10) || 5,

  // Max simultaneous Cloudinary uploads
  cloudinaryUploadBatchSize: parseInt(process.env.CLOUDINARY_BATCH_SIZE, 10) || 3,

  // ── Retry ──────────────────────────────────────────────────────
  maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 3,

  // ── Timeouts ───────────────────────────────────────────────────
  // HTTP GET timeout for scraping chapter page
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 15000,

  // HTTP GET timeout for downloading an image file
  downloadTimeoutMs: parseInt(process.env.DOWNLOAD_TIMEOUT_MS, 10) || 30000,
};
