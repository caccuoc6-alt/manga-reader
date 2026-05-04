/**
 * pipeline/scraper/phases/uploader.js
 * ─────────────────────────────────────────────────────────────────
 * Phase 3a — Upload to Cloudinary
 *
 * Uses the same Cloudinary v2 SDK already in your project.
 * The CLOUDINARY_URL env variable is all that's needed for auth.
 *
 * Each page is uploaded to:
 *   cloudinaryFolder/page_001, page_002, …
 *
 * Returns an array of page objects matching the schema your
 * Manga model expects:
 *   { filename, originalName, url }
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const { v2: cloudinary } = require('cloudinary');
const path   = require('path');
const logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');
const config = require('../config');

/**
 * Upload all local staged files to Cloudinary concurrently.
 *
 * @param {object}   opts
 * @param {Array}    opts.localFiles        - From downloader: [{index, localPath, filename, mimeType}]
 * @param {string}   opts.cloudinaryFolder  - Destination folder in Cloudinary
 * @returns {Promise<{filename, originalName, url}[]>} — sorted by page index
 */
async function uploadAll({ localFiles, cloudinaryFolder }) {
  if (!process.env.CLOUDINARY_URL && !(process.env.CLOUDINARY_CLOUD_NAME)) {
    throw new Error(
      'Cloudinary credentials not found.\n' +
      'Set CLOUDINARY_URL in your .env file.\n' +
      'Example: CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name'
    );
  }

  const results    = [];
  const BATCH_SIZE = config.cloudinaryUploadBatchSize; // default: 3 parallel uploads

  // Process in batches to avoid hammering Cloudinary rate limits
  for (let i = 0; i < localFiles.length; i += BATCH_SIZE) {
    const batch = localFiles.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(file => uploadOne(file, cloudinaryFolder))
    );
    results.push(...batchResults);
    logger.info(`  Uploaded batch ${Math.ceil((i + 1) / BATCH_SIZE)} / ${Math.ceil(localFiles.length / BATCH_SIZE)}`);

    // Short pause between batches
    if (i + BATCH_SIZE < localFiles.length) {
      await sleep(500);
    }
  }

  return results.sort((a, b) => a._index - b._index).map(({ _index, ...rest }) => rest);
}

async function uploadOne(file, folder) {
  const MAX_RETRIES = config.maxRetries;
  let   lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const publicId = path.basename(file.filename, path.extname(file.filename));

      const result = await cloudinary.uploader.upload(file.localPath, {
        folder,
        public_id:       publicId,
        resource_type:   'image',
        overwrite:       true,
        // Optimize on the fly: convert to WebP with quality auto
        transformation: [
          { quality: 'auto', fetch_format: 'auto' },
        ],
      });

      logger.debug(`  ☁ Uploaded: ${file.filename} → ${result.secure_url}`);

      return {
        _index:       file.index,
        filename:     result.public_id,
        originalName: file.filename,
        url:          result.secure_url,
      };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await sleep(attempt * 1500);
        logger.debug(`  Retry ${attempt} uploading ${file.filename}…`);
      }
    }
  }

  throw new Error(`Cloudinary upload failed for ${file.filename}: ${lastError?.message}`);
}

async function uploadUrl(remoteUrl, folder) {
  if (!process.env.CLOUDINARY_URL && !(process.env.CLOUDINARY_CLOUD_NAME)) return null;

  try {
    const result = await cloudinary.uploader.upload(remoteUrl, {
      folder,
      resource_type: 'image',
      overwrite: true,
      transformation: [
        { quality: 'auto', fetch_format: 'auto' },
      ],
    });
    logger.debug(`  ☁ Uploaded Cover: ${remoteUrl} → ${result.secure_url}`);
    return result.secure_url;
  } catch (err) {
    logger.warn(`  Cover upload failed: ${err.message}`);
    return null;
  }
}

module.exports = { uploadAll, uploadUrl };
