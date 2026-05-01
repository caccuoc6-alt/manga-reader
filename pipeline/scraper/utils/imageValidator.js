/**
 * pipeline/scraper/utils/imageValidator.js
 * ─────────────────────────────────────────────────────────────────
 * Validates downloaded files are genuine images by reading their
 * magic bytes (file signature) — NOT by trusting the file extension.
 *
 * Why magic bytes?
 *   - A server returning a 200 with an HTML error page saved as .jpg
 *     would be detected and rejected.
 *   - A truncated/corrupt partial download is caught before upload.
 *
 * Supported formats: JPEG, PNG, WebP, GIF, AVIF
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');

/** Minimum acceptable file size (1 KB) — filters empty/partial files */
const MIN_SIZE_BYTES = 1024;

/**
 * Magic byte signatures for common image formats.
 * Format: { mime, offset, bytes[] }
 */
const SIGNATURES = [
  { mime: 'image/jpeg', offset: 0, bytes: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/png',  offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { mime: 'image/gif',  offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  { mime: 'image/webp', offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // WEBP at offset 8
  { mime: 'image/avif', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // ftyp box
];

/**
 * @param {string} filePath - Absolute path to a downloaded file
 * @returns {Promise<{valid: boolean, mimeType: string|null, error: string|null}>}
 */
async function validateImage(filePath) {
  try {
    const stat = fs.statSync(filePath);

    if (stat.size < MIN_SIZE_BYTES) {
      return { valid: false, mimeType: null, error: `File too small: ${stat.size} bytes` };
    }

    // Read first 16 bytes to check signatures
    const fd     = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    for (const sig of SIGNATURES) {
      const slice = [...buffer.slice(sig.offset, sig.offset + sig.bytes.length)];
      if (sig.bytes.every((b, i) => b === slice[i])) {
        return { valid: true, mimeType: sig.mime, error: null };
      }
    }

    return {
      valid:    false,
      mimeType: null,
      error:    `Unrecognized file signature: ${buffer.slice(0, 8).toString('hex')}`,
    };
  } catch (err) {
    return { valid: false, mimeType: null, error: err.message };
  }
}

module.exports = { validateImage };
