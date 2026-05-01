/**
 * pipeline/scraper/utils/helpers.js
 * ─────────────────────────────────────────────────────────────────
 * Shared utility functions.
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const config = require('../config');

/**
 * Sleep for a random duration within [min, max] ms.
 * Used to mimic human browsing rhythm and avoid triggering rate limits.
 *
 * @param {[number, number]} range - [minMs, maxMs]
 */
async function randomDelay([minMs, maxMs] = config.delayBetweenRequestsMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await sleep(ms);
}

/**
 * Sleep for exactly `ms` milliseconds.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Pick a random realistic browser User-Agent string.
 * Rotating UA helps avoid basic bot-detection heuristics.
 */
const USER_AGENTS = [
  // Chrome on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  // Chrome on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  // Firefox on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  // Safari on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  // Edge on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
];

function pickUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

module.exports = { randomDelay, sleep, pickUserAgent };
