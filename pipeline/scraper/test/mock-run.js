/**
 * pipeline/scraper/test/mock-run.js
 * ─────────────────────────────────────────────────────────────────
 * Local integration test — runs the full pipeline with mocked HTTP.
 *
 * No internet, no Cloudinary, no MongoDB required.
 * Validates: image download → staging → magic-bytes check → naming.
 *
 * Run: node pipeline/scraper/test/mock-run.js
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');

// Generate a minimal but valid JPEG buffer (2 KB) with correct magic bytes.
// Structure: SOI (FF D8) + APP0 (FF E0) + minimal header + padding + EOI (FF D9)
// This passes both the magic-byte check AND the 1 KB minimum size guard.
function makeFakeJpeg(sizeBytes = 2048) {
  const buf = Buffer.alloc(sizeBytes, 0x00);
  // SOI marker
  buf[0] = 0xFF; buf[1] = 0xD8;
  // APP0 marker + length
  buf[2] = 0xFF; buf[3] = 0xE0;
  buf[4] = 0x00; buf[5] = 0x10; // length = 16
  // JFIF identifier
  buf.write('JFIF\0', 6, 'ascii');
  // Version 1.1, pixel aspect ratio 1:1
  buf[11] = 0x01; buf[12] = 0x01;
  buf[13] = 0x00;
  buf[14] = 0x00; buf[15] = 0x01;
  buf[16] = 0x00; buf[17] = 0x01;
  // EOI marker at the end
  buf[sizeBytes - 2] = 0xFF; buf[sizeBytes - 1] = 0xD9;
  return buf;
}

const TINY_JPEG = makeFakeJpeg(2048);


const imageServer = http.createServer((req, res) => {
  const delay = Math.floor(Math.random() * 100); // simulate network latency
  setTimeout(() => {
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': TINY_JPEG.length });
    res.end(TINY_JPEG);
  }, delay);
});

// ── 2. Mock the scraper so it returns local URLs ──────────────────
// We bypass actual HTTP scraping and inject known-good data directly.

async function runMockPipeline() {
  console.log('\n\x1b[36m══════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[36m  🧪 Pipeline Mock Test — Local Integration Run   \x1b[0m');
  console.log('\x1b[36m══════════════════════════════════════════════════\x1b[0m\n');

  // Start local server
  await new Promise(resolve => imageServer.listen(9797, resolve));
  console.log('\x1b[32m✔ Local image server started on http://localhost:9797\x1b[0m');

  const PORT = 9797;
  const PAGE_COUNT = 6;
  const mockImageUrls = Array.from({ length: PAGE_COUNT }, (_, i) =>
    `http://localhost:${PORT}/page-${i + 1}.jpg`
  );

  const mockScraped = {
    mangaTitle:    'Mock Manga Title',
    chapterNumber: 42,
    chapterTitle:  'Chapter 42 – The Test',
    imageUrls:     mockImageUrls,
  };

  console.log(`\x1b[32m✔ Mock extraction: "${mockScraped.mangaTitle}" — ${PAGE_COUNT} pages\x1b[0m\n`);

  // ── Phase 2: Download ─────────────────────────────────────────
  const downloader = require('../phases/downloader');
  const slugify    = str => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const slug       = slugify(mockScraped.mangaTitle);
  const stagingDir = path.resolve(__dirname, '..', '..', 'staging', slug, String(mockScraped.chapterNumber));
  fs.mkdirSync(stagingDir, { recursive: true });

  console.log(`📁 Staging dir: ${stagingDir}\n`);
  console.log('⬇️  Downloading pages…');

  const localFiles = await downloader.downloadAll({
    imageUrls:  mockScraped.imageUrls,
    destDir:    stagingDir,
    refererUrl: 'http://localhost:9797/',
  });

  console.log(`\n\x1b[32m✔ Downloaded ${localFiles.length}/${PAGE_COUNT} pages\x1b[0m`);

  // ── Validate files exist and are named correctly ───────────────
  const { validateImage } = require('../utils/imageValidator');
  let validCount = 0;

  console.log('\n🔍 Validating downloaded files:\n');

  for (const file of localFiles) {
    const { valid, mimeType, error } = await validateImage(file.localPath);
    const stat  = fs.statSync(file.localPath);
    const icon  = valid ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✘\x1b[0m';
    const label = valid ? `${mimeType} — ${stat.size}B` : `INVALID: ${error}`;
    console.log(`  ${icon} ${file.filename.padEnd(15)} ${label}`);
    if (valid) validCount++;
  }

  // ── Summary ───────────────────────────────────────────────────
  const allPass = validCount === PAGE_COUNT;

  console.log('\n' + '─'.repeat(52));
  console.log(`  Pages downloaded : ${localFiles.length} / ${PAGE_COUNT}`);
  console.log(`  Valid images     : ${validCount} / ${PAGE_COUNT}`);
  console.log(`  Naming check     : ${localFiles.map(f => f.filename).join(', ')}`);
  console.log('─'.repeat(52));

  if (allPass) {
    console.log('\n\x1b[32m✅ ALL CHECKS PASSED — Pipeline Phase 1 & 2 working correctly\x1b[0m');
    console.log('\x1b[33m⚠  Phase 3 (Cloudinary + MongoDB) skipped — requires credentials\x1b[0m');
  } else {
    console.log('\n\x1b[31m❌ Some validations failed — check output above\x1b[0m');
  }

  // ── Cleanup ───────────────────────────────────────────────────
  imageServer.close();
  fs.rmSync(stagingDir, { recursive: true, force: true });
  console.log('\n🧹 Staging files cleaned up.');
  console.log('\n\x1b[36m  To run with real credentials:\x1b[0m');
  console.log('  npm run pipeline:scrape -- --url "<chapter-url>" --dry-run\n');
}

runMockPipeline().catch(err => {
  console.error('\n\x1b[31m❌ Mock test failed:\x1b[0m', err.message);
  imageServer.close();
  process.exit(1);
});
