/**
 * pipeline/scraper/phases/downloader.js
 * ─────────────────────────────────────────────────────────────────
 * Phase 2 — Processing
 *
 * Downloads images concurrently with:
 *  - Worker-pool concurrency limit (default: 5 simultaneous downloads)
 *  - Automatic retry with exponential back-off (default: 3 attempts)
 *  - Image integrity validation (magic bytes check, not just extension)
 *  - Standardized sequential naming: page_001.jpg, page_002.jpg, …
 *  - Randomized delays between each download to avoid IP bans
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const axios  = require('axios');
const logger = require('../utils/logger');
const { randomDelay, pickUserAgent, sleep } = require('../utils/helpers');
const { validateImage }  = require('../utils/imageValidator');
const config = require('../config');

/**
 * Download all pages with concurrency control and retry.
 *
 * @param {object} opts
 * @param {string[]} opts.imageUrls   - Ordered list of page image URLs
 * @param {string}   opts.destDir     - Local staging directory
 * @param {string}   opts.refererUrl  - Referer header for requests
 * @returns {Promise<{index, localPath, filename, mimeType}[]>}
 */
async function downloadAll({ imageUrls, destDir, refererUrl }) {
  const results    = [];
  const failed     = [];
  let   activeJobs = 0;
  let   cursor     = 0;

  const total     = imageUrls.length;
  const WORKERS   = config.concurrentDownloads; // default: 5

  return new Promise((resolve, reject) => {
    function scheduleNext() {
      // Launch workers up to the limit
      while (activeJobs < WORKERS && cursor < total) {
        const index = cursor++;
        activeJobs++;
        downloadOne({ url: imageUrls[index], index, destDir, refererUrl })
          .then(result => {
            results.push(result);
            logger.info(`  [${String(result.index + 1).padStart(3, '0')}/${total}] ✔ ${result.filename}`);
          })
          .catch(err => {
            failed.push({ index, url: imageUrls[index], error: err.message });
            logger.warn(`  [${String(index + 1).padStart(3, '0')}/${total}] ✘ FAILED: ${err.message}`);
          })
          .finally(() => {
            activeJobs--;
            scheduleNext();
            if (activeJobs === 0 && cursor >= total) {
              // Sort results by page index before resolving
              results.sort((a, b) => a.index - b.index);
              if (failed.length > 0) {
                logger.warn(`  ⚠ ${failed.length} page(s) failed to download after all retries:`);
                failed.forEach(f => logger.warn(`    Page ${f.index + 1}: ${f.error}`));
              }
              resolve(results);
            }
          });
      }
    }
    scheduleNext();
    // Edge case: empty list
    if (total === 0) resolve([]);
  });
}

/**
 * Download a single image with retry.
 */
async function downloadOne({ url, index, destDir, refererUrl }) {
  const MAX_RETRIES = config.maxRetries; // default: 3
  let   lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const ext      = guessExtension(url);
      const filename = `page_${String(index + 1).padStart(3, '0')}${ext}`;
      const destPath = path.join(destDir, filename);

      // Skip if already exists from a previous interrupted run
      if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
        logger.debug(`  Skipping (cached): ${filename}`);
        return { index, localPath: destPath, filename, mimeType: 'image/jpeg' };
      }

      await downloadStream(url, destPath, refererUrl);
      const { valid, mimeType } = await validateImage(destPath);

      if (!valid) {
        fs.unlinkSync(destPath); // delete corrupt file before retry
        throw new Error(`File is not a valid image (magic bytes check failed)`);
      }

      // Rename to correct extension if mime type differs
      const correctExt  = mimeToExt(mimeType);
      const correctName = `page_${String(index + 1).padStart(3, '0')}${correctExt}`;
      const correctPath = path.join(destDir, correctName);

      if (destPath !== correctPath) {
        fs.renameSync(destPath, correctPath);
        return { index, localPath: correctPath, filename: correctName, mimeType };
      }

      // Rate-limit between downloads
      await randomDelay(config.delayBetweenDownloadsMs);

      return { index, localPath: destPath, filename, mimeType };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        const backoff = attempt * 2000; // 2s, 4s back-off
        logger.debug(`  Attempt ${attempt} failed for page ${index + 1}. Retrying in ${backoff}ms… (${err.message})`);
        await sleep(backoff);
      }
    }
  }

  throw new Error(`Failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

/**
 * Stream a URL response to a local file.
 */
async function downloadStream(url, destPath, refererUrl) {
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: config.downloadTimeoutMs,
    headers: {
      'User-Agent':      pickUserAgent(),
      'Referer':         refererUrl,
      'Accept':          'image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
    },
    maxRedirects: 5,
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error',  reject);
    response.data.on('error', reject);
  });
}

// ─── Extension & MIME helpers ────────────────────────────────────
function guessExtension(url) {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(ext) ? ext : '.jpg';
}

function mimeToExt(mime) {
  const MAP = {
    'image/jpeg': '.jpg',
    'image/png':  '.png',
    'image/webp': '.webp',
    'image/gif':  '.gif',
    'image/avif': '.avif',
  };
  return MAP[mime] || '.jpg';
}

module.exports = { downloadAll };
