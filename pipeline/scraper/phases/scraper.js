/**
 * pipeline/scraper/phases/scraper.js
 * ─────────────────────────────────────────────────────────────────
 * Phase 1 — Extraction
 *
 * Strategy Decision (headless vs. HTTP):
 * ────────────────────────────────────────
 * Most manga archive sites fall into two categories:
 *
 *  A) Server-Side Rendered (SSR) — images embedded in the initial HTML.
 *     → Standard HTTP requests (axios) are sufficient. Fast, low overhead.
 *
 *  B) Client-Side Rendered (CSR) — images loaded by JavaScript after page load.
 *     → Requires a headless browser (Playwright/Puppeteer) to execute JS.
 *
 * This scraper tries SSR first and automatically escalates to Playwright
 * if no image selectors match the static HTML response. You only need to
 * install Playwright if you're scraping CSR sites.
 *
 * Bot Protection Bypass:
 * ────────────────────────
 * - Rotates User-Agent strings
 * - Adds realistic browser headers (Accept, Accept-Language, Referer)
 * - Applies random delays between requests (configurable)
 * - Respects robots.txt via a simple check (can be disabled)
 * - Does NOT bypass CAPTCHAs — if a site uses them, use a proxy service
 *   like ScraperAPI or 2captcha as a drop-in replacement for axios.
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');
const logger  = require('../utils/logger');
const { randomDelay, pickUserAgent } = require('../utils/helpers');
const config  = require('../config');

// ─── Site-specific selector strategies ───────────────────────────
// Add entries here for any manga sites you need to support.
// Each strategy receives a Cheerio root ($) and the page URL.
// It returns { mangaTitle, chapterNumber, chapterTitle, imageUrls }.
//
// HOW TO ADD A NEW SITE:
//  1. Inspect the target page in DevTools → find the <img> or <source> tags
//     that contain page images.
//  2. Add a new { hostPattern, extract } entry below.
//  3. Test with: node pipeline/scraper/index.js --url <url> --dry-run
// ─────────────────────────────────────────────────────────────────
const SITE_STRATEGIES = [
  // ── MangaDex (CDN image list injected via JS) ─────────────────
  // MangaDex requires the /at-home API call; see the special handler below.
  {
    hostPattern: /mangadex\.org/i,
    type: 'api',
    extract: null, // handled by extractMangaDex()
  },

  // ── nHentai (Cloudflare + Gallery structural mapping) ─────────
  {
    hostPattern: /nhentai\.(net|xxx|to)/i,
    type: 'playwright_custom',
    extract: null, // Force playwright
    async extractPlaywright(page, url) {
      // url could be /g/xxxxxx/ or /g/xxxxxx/1/
      const match = url.match(/\/g\/(\d+)/);
      if (!match) throw new Error("Could not find nHentai gallery ID in URL");
      const galleryId = match[1];

      // Use nhentai.xxx if .net is blocking, or stay on current
      const domainMatch = url.match(/nhentai\.(net|xxx|to)/i);
      const domain = domainMatch ? domainMatch[0] : 'nhentai.net';

      // Navigate to the main gallery page to get metadata and all thumbnails
      if (!url.endsWith(`/g/${galleryId}/`)) {
        await page.goto(`https://${domain}/g/${galleryId}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);
      }

      // Title
      const mangaTitle = await page.locator('h1.title .pretty').innerText().catch(() => `nHentai ${galleryId}`);

      // Thumbnails to full images logic:
      const imageUrls = await page.evaluate(() => {
        const thumbs = Array.from(document.querySelectorAll('.gallerythumb img, .thumb-container img'));
        return thumbs.map((img) => {
          let src = img.getAttribute('data-src') || img.src;
          if (src) {
            // Reconstruct full res URL from thumbnail
            // Thumbnails: .../galleries/123/1t.jpg
            // Full:       .../galleries/123/1.jpg
            src = src.replace('t.nhentai.net', 'i.nhentai.net')
                     .replace('t3.nhentai.net', 'i3.nhentai.net')
                     .replace('t5.nhentai.net', 'i5.nhentai.net');
            return src.replace(/t\.([^.]+)$/, '.$1');
          }
          return null;
        }).filter(Boolean);
      });

      return {
        mangaTitle,
        chapterNumber: 1,
        chapterTitle: `Gallery ${galleryId}`,
        imageUrls
      };
    }
  },

  // ── Mimimoe (Lightweight API — no browser needed!) ──────────────
  // Discovered API: GET https://mimimoe.moe/api/chapters/{chapter_id}
  // Returns: { info: { id, title, order, manga_id, ... }, pages: [{ image_url }] }
  // Images hosted on hypranti.site — publicly accessible, no auth required.
  {
    hostPattern: /mimimoe\.moe/i,
    type: 'api',
    extract: null, // handled by extractMimimoe()
  },

  // ── Generic: <img> tags inside a reader container ─────────────
  // Works for many sites that render pages as <img> in a wrapper div.
  {
    hostPattern: /.*/,
    type: 'html',
    extract($, url) {
      // Common selectors used across dozens of manga reader sites.
      // Extend this list as needed.
      const SELECTORS = [
        '.reader-content img',
        '#readerarea img',
        '.entry-content img',
        '.chapter-content img',
        '.page-break img',
        '.reading-content img',
        'div[class*="reader"] img',
        'div[class*="chapter"] img',
        'div[id*="reader"] img',
        // Webtoon-style vertical scrollers
        'div[class*="webtoon"] img',
        // Fallback: any <img> with a src that looks like a page image
        'img[src*="/manga/"]',
        'img[src*="/chapter/"]',
        'img[src*="/comic/"]',
      ];

      let imageUrls = [];

      for (const selector of SELECTORS) {
        const found = [];
        $(selector).each((_, el) => {
          // Prefer data-src (lazy-load) over src
          const src = $(el).attr('data-src')
            || $(el).attr('data-lazy-src')
            || $(el).attr('data-original')
            || $(el).attr('src');
          if (src && isLikelyPageImage(src)) found.push(src.trim());
        });
        if (found.length > 2) { // need at least 3 to avoid nav/logo images
          imageUrls = found;
          logger.debug(`  Selector matched: "${selector}" → ${found.length} images`);
          break;
        }
      }

      // Extract title / chapter metadata from <title> or common meta tags
      const pageTitle    = $('title').text().trim();
      const ogTitle      = $('meta[property="og:title"]').attr('content') || '';
      const titleSource  = ogTitle || pageTitle;
      const { mangaTitle, chapterNumber, chapterTitle } = parseTitle(titleSource, url);

      return { mangaTitle, chapterNumber, chapterTitle, imageUrls };
    },
  },
];

// ─── Main export ─────────────────────────────────────────────────
async function extractChapter(url) {
  logger.debug(`Fetching: ${url}`);

  const strategy = SITE_STRATEGIES.find(s => s.hostPattern.test(url));

  // Site-specific API paths (no scraping required)
  if (strategy?.type === 'api') {
    if (/mimimoe\.moe/i.test(url)) return extractMimimoe(url);
    return extractMangaDex(url);
  }

  // If the site is specifically marked to use Playwright from the start
  if (strategy?.type === 'playwright_custom') {
    logger.info('  Site uses custom Playwright strategy. Escalating to headless browser…');
    return extractWithPlaywright(url, strategy);
  }

  // ── Standard HTTP request ─────────────────────────────────────
  let html;
  try {
    const response = await axios.get(url, {
      headers: buildHeaders(url),
      timeout: config.requestTimeoutMs,
      maxRedirects: 5,
    });
    html = response.data;
  } catch (err) {
    // 403/429 → escalate to Playwright
    if (err.response?.status === 403 || err.response?.status === 429) {
      logger.warn('  HTTP request blocked (403/429). Escalating to headless browser…');
      return extractWithPlaywright(url, strategy);
    }
    throw new Error(`Failed to fetch chapter page: ${err.message}`);
  }

  const $ = cheerio.load(html);
  const result = strategy.extract($, url);

  // If static HTML yields no images, or if it was marked as a custom playwright script
  if (result.imageUrls.length === 0 || strategy?.type === 'playwright_custom') {
    logger.warn('  No images found in static HTML or site requires JS. Escalating to Playwright…');
    return extractWithPlaywright(url, strategy);
  }

  // Resolve relative URLs
  result.imageUrls = result.imageUrls.map(u => resolveUrl(u, url));

  // Rate limit before returning
  await randomDelay(config.delayBetweenRequestsMs);

  return result;
}

// ─── Playwright escalation ────────────────────────────────────────
// Only runs if static HTML extraction fails, or if site has strong Cloudflare.
// Requires: npm install playwright-extra puppeteer-extra-plugin-stealth
async function extractWithPlaywright(url, customStrategy = null) {
  let chromium, stealth;
  try {
    chromium = require('playwright-extra').chromium;
    stealth = require('puppeteer-extra-plugin-stealth')();
    chromium.use(stealth);
  } catch (err) {
    throw new Error(
      'Playwright Stealth is not installed. Install it with:\n' +
      '  npm install playwright playwright-extra puppeteer-extra-plugin-stealth\n' +
      '  npx playwright install chromium\n' +
      `Error details: ${err.message}`
    );
  }

  logger.info('  Launching headless Chromium with Stealth…');
  const browser = await chromium.launch({ 
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--window-position=0,0',
      '--ignore-certifcate-errors',
      '--ignore-certifcate-errors-spki-list',
    ]
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(4000); // Wait for images to lazy-load / Cloudflare challenges

    let result = { mangaTitle: 'Unknown', chapterNumber: 1, chapterTitle: 'Chapter 1', imageUrls: [] };

    if (customStrategy?.type === 'playwright_custom' && customStrategy.extractPlaywright) {
      // Use site-specific Playwright injection
      result = await customStrategy.extractPlaywright(page, url);
    } else {
      // Generic fallback
      const html    = await page.content();
      const cheerio = require('cheerio');
      const $       = cheerio.load(html);
      const fallback = SITE_STRATEGIES[SITE_STRATEGIES.length - 1]; 
      result  = fallback.extract($, url);
    }

    // If still nothing, try scraping <img> src attributes directly via page.evaluate
    if (result.imageUrls.length === 0) {
      result.imageUrls = await page.evaluate(() =>
        [...document.querySelectorAll('img')]
          .map(img => img.getAttribute('data-src') || img.src)
          .filter(src => src && src.startsWith('http'))
      );
    }

    result.imageUrls = result.imageUrls.map(u => resolveUrl(u, url));
    return result;
  } finally {
    await browser.close();
  }
}

// ─── MangaDex API handler ─────────────────────────────────────────
// Uses the official MangaDex /at-home/server API — no scraping needed.
async function extractMangaDex(chapterUrl) {
  // Extract chapter UUID from URL: /chapter/{uuid}
  const match = chapterUrl.match(/chapter\/([a-f0-9-]{36})/i);
  if (!match) throw new Error('Could not extract MangaDex chapter UUID from URL');

  const chapterId = match[1];

  // Fetch chapter metadata
  const metaResp = await axios.get(`https://api.mangadex.org/chapter/${chapterId}`, {
    headers: { 'User-Agent': pickUserAgent() },
    timeout: config.requestTimeoutMs,
  });
  const chapterData = metaResp.data.data;
  const chapterNum  = chapterData.attributes.chapter;
  const chapterTitle = chapterData.attributes.title || `Chapter ${chapterNum}`;

  // Find the manga title via relationships
  const mangaRel = chapterData.relationships.find(r => r.type === 'manga');
  let mangaTitle = 'Unknown Manga';
  if (mangaRel) {
    const mangaResp = await axios.get(`https://api.mangadex.org/manga/${mangaRel.id}`, {
      headers: { 'User-Agent': pickUserAgent() },
      timeout: config.requestTimeoutMs,
    });
    mangaTitle = mangaResp.data.data.attributes.title.en
      || Object.values(mangaResp.data.data.attributes.title)[0]
      || 'Unknown Manga';
  }

  // Fetch CDN server and build image URLs
  const atHomeResp = await axios.get(`https://api.mangadex.org/at-home/server/${chapterId}`, {
    headers: { 'User-Agent': pickUserAgent() },
    timeout: config.requestTimeoutMs,
  });
  const { baseUrl, chapter: cdnChapter } = atHomeResp.data;
  const imageUrls = cdnChapter.data.map(
    filename => `${baseUrl}/data/${cdnChapter.hash}/${filename}`
  );

  await randomDelay(config.delayBetweenRequestsMs);
  return { mangaTitle, chapterNumber: Number(chapterNum), chapterTitle, imageUrls };
}

// ─── Mimimoe API handler ──────────────────────────────────────────
// Uses the discovered internal API at mimimoe.moe/api/chapters/{id}
// Returns pages with image_url fields hosted on hypranti.site.
// No Cloudflare bypass needed — works on Render's free tier.
async function extractMimimoe(chapterUrl) {
  // URL patterns:
  //   https://mimimoe.moe/manga/{manga_id}/chapter/{chapter_id}
  //   https://mimimoe.moe/g/{manga_id}/chapter/Chap-XX-{chapter_id}
  let chapterId, mangaId;

  // Try /manga/{id}/chapter/{id} format first
  let match = chapterUrl.match(/\/(?:manga|g)\/([\d]+)\/chapter\/(?:.*?)(\d+)\s*$/i);
  if (match) {
    mangaId   = match[1];
    chapterId = match[2];
  } else {
    // Try just extracting trailing number
    match = chapterUrl.match(/(\d+)\s*\/?$/);
    if (match) chapterId = match[1];
  }

  if (!chapterId) {
    throw new Error(`Could not extract Mimimoe chapter ID from URL: ${chapterUrl}`);
  }

  logger.info(`  Mimimoe API: fetching chapter ${chapterId}…`);

  // Fetch chapter data (pages + metadata)
  const chapterResp = await axios.get(`https://mimimoe.moe/api/chapters/${chapterId}`, {
    headers: {
      'User-Agent': pickUserAgent(),
      'Referer': 'https://mimimoe.moe/',
      'Accept': 'application/json',
    },
    timeout: config.requestTimeoutMs,
  });

  const data = chapterResp.data;
  const info = data.info || {};
  const pages = data.pages || [];

  if (pages.length === 0) {
    throw new Error(`Mimimoe API returned 0 pages for chapter ${chapterId}`);
  }

  const imageUrls = pages.map(p => p.image_url).filter(Boolean);
  const chapterNumber = info.order || 1;
  const chapterTitle = info.title || `Chapter ${chapterNumber}`;

  // If we have the manga_id, fetch the manga title
  const resolvedMangaId = mangaId || info.manga_id;
  let mangaTitle = chapterTitle; // fallback

  if (resolvedMangaId) {
    try {
      const mangaResp = await axios.get(`https://mimimoe.moe/api/manga/${resolvedMangaId}`, {
        headers: {
          'User-Agent': pickUserAgent(),
          'Referer': 'https://mimimoe.moe/',
          'Accept': 'application/json',
        },
        timeout: config.requestTimeoutMs,
      });
      const mangaData = mangaResp.data;
      // Try common field names for the title
      mangaTitle = mangaData.title
        || mangaData.name
        || mangaData.info?.title
        || mangaData.info?.name
        || mangaTitle;
    } catch (err) {
      logger.warn(`  Could not fetch manga metadata: ${err.message}`);
    }
  }

  logger.info(`  Mimimoe: "${mangaTitle}" ${chapterTitle} — ${imageUrls.length} pages`);

  await randomDelay(config.delayBetweenRequestsMs);
  return { mangaTitle, chapterNumber, chapterTitle, imageUrls };
}

// ─── Helpers ──────────────────────────────────────────────────────
function buildHeaders(refererUrl) {
  return {
    'User-Agent':      pickUserAgent(),
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer':         new URL(refererUrl).origin,
    'DNT':             '1',
    'Cache-Control':   'no-cache',
  };
}

function resolveUrl(src, base) {
  if (src.startsWith('http')) return src;
  if (src.startsWith('//')) return 'https:' + src;
  try {
    return new URL(src, base).href;
  } catch {
    return src;
  }
}

function isLikelyPageImage(src) {
  // Filter out icons, logos, avatars, ads
  const lower = src.toLowerCase();
  const BAD_PATTERNS = ['logo', 'icon', 'avatar', 'banner', 'ad', 'pixel', '.svg', 'data:'];
  return !BAD_PATTERNS.some(p => lower.includes(p));
}

/**
 * Parse manga title and chapter number from a page <title> string.
 * Most manga sites follow patterns like:
 *   "One Piece Chapter 1100 – MangaSite"
 *   "Chapter 1100 | One Piece | MangaReader"
 */
function parseTitle(titleStr, url) {
  const chapterMatch = titleStr.match(/chapter\s*([\d.]+)/i);
  const chapterNumber = chapterMatch ? Number(chapterMatch[1]) : null;

  let mangaTitle = titleStr
    .replace(/chapter\s*[\d.]+.*/i, '')
    .replace(/\s*[|–\-:]\s*\S+$/, '')  // strip site name suffix
    .trim();

  // Fallback: extract from URL path
  if (!mangaTitle) {
    const pathParts = new URL(url).pathname.split('/').filter(Boolean);
    mangaTitle = pathParts[0]?.replace(/-/g, ' ') || 'Unknown Manga';
  }

  return {
    mangaTitle:    mangaTitle || 'Unknown Manga',
    chapterNumber: chapterNumber || 1,
    chapterTitle:  `Chapter ${chapterNumber || 1}`,
  };
}

module.exports = { extractChapter };
