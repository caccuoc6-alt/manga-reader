/**
 * pipeline/scraper/utils/logger.js
 * ─────────────────────────────────────────────────────────────────
 * Lightweight structured logger.
 *  - Timestamps every line
 *  - Color-coded levels: INFO (green), WARN (yellow), ERROR (red), DEBUG (grey)
 *  - DEBUG lines only printed when LOG_LEVEL=debug
 *  - Writes to stdout AND appends to pipeline/logs/pipeline.log
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const LOG_DIR  = path.resolve(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'pipeline.log');

// Ensure log directory exists
fs.mkdirSync(LOG_DIR, { recursive: true });

const IS_DEBUG = (process.env.LOG_LEVEL || '').toLowerCase() === 'debug';

// ANSI colour codes
const C = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  grey:   '\x1b[90m',
  cyan:   '\x1b[36m',
};

function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function write(level, color, ...args) {
  const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ');
  const line = `[${timestamp()}] [${level}] ${msg}`;
  // Colorized to terminal
  console.log(`${color}${line}${C.reset}`);
  // Plain text to log file
  fs.appendFileSync(LOG_FILE, line + '\n');
}

const logger = {
  info:  (...args) => write('INFO ', C.green,  ...args),
  warn:  (...args) => write('WARN ', C.yellow, ...args),
  error: (...args) => write('ERROR', C.red,    ...args),
  debug: (...args) => { if (IS_DEBUG) write('DEBUG', C.grey, ...args); },
};

module.exports = logger;
