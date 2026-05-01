/**
 * pipeline/scraper/batch.js
 * ─────────────────────────────────────────────────────────────────
 * Batch runner — scrape multiple chapters from a JSON manifest.
 *
 * Usage:
 *   node pipeline/scraper/batch.js --manifest pipeline/jobs/my-manga.json
 *
 * Manifest format (pipeline/jobs/example.json):
 * {
 *   "mangaId": "664abc123...",   // optional: existing Manga _id
 *   "mangaTitle": "One Piece",   // used if no mangaId
 *   "chapters": [
 *     { "url": "https://...", "chapter": 1 },
 *     { "url": "https://...", "chapter": 2 }
 *   ]
 * }
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const fs             = require('fs');
const path           = require('path');
const { parseArgs }  = require('util');
const { runPipeline } = require('./pipeline');
const logger         = require('./utils/logger');
const { sleep }      = require('./utils/helpers');

const { values } = parseArgs({
  options: { manifest: { type: 'string' } },
  strict: false,
});

if (!values.manifest) {
  logger.error('--manifest is required.');
  logger.error('  node pipeline/scraper/batch.js --manifest pipeline/jobs/my-manga.json');
  process.exit(1);
}

const manifestPath = path.resolve(values.manifest);
if (!fs.existsSync(manifestPath)) {
  logger.error(`Manifest not found: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

(async () => {
  const chapters = manifest.chapters || [];
  logger.info(`Batch: processing ${chapters.length} chapters from manifest`);

  const results = { success: [], failed: [] };

  for (let i = 0; i < chapters.length; i++) {
    const job = chapters[i];
    logger.info(`\n[${i + 1}/${chapters.length}] Chapter ${job.chapter ?? '?'}: ${job.url}`);

    try {
      await runPipeline({
        url:     job.url,
        mangaId: manifest.mangaId ?? null,
        chapter: job.chapter ?? null,
        title:   manifest.mangaTitle ?? null,
        dryRun:  false,
      });
      results.success.push(job.chapter ?? job.url);
    } catch (err) {
      logger.error(`  Chapter failed: ${err.message}`);
      results.failed.push({ chapter: job.chapter ?? job.url, error: err.message });
    }

    // Pause between chapters to respect server load
    if (i < chapters.length - 1) {
      const pause = 3000 + Math.random() * 2000;
      logger.info(`  Waiting ${Math.round(pause / 1000)}s before next chapter…`);
      await sleep(pause);
    }
  }

  logger.info('\n══════════════════ Batch Complete ══════════════════');
  logger.info(`  ✔ Success : ${results.success.length}`);
  logger.info(`  ✘ Failed  : ${results.failed.length}`);
  if (results.failed.length > 0) {
    results.failed.forEach(f => logger.warn(`    Chapter ${f.chapter}: ${f.error}`));
  }
})();
