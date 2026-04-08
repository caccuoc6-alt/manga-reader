/**
 * db.js — NeDB datastore initialization
 * File-based embedded database — no external service required.
 * Data is persisted to /data/*.db files automatically.
 */

const Datastore = require('@seald-io/nedb');
const path = require('path');
const fs = require('fs');

// Ensure the /data directory exists
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = {
  // Users collection
  users: new Datastore({
    filename: path.join(dataDir, 'users.db'),
    autoload: true,
  }),

  // Manga collection
  manga: new Datastore({
    filename: path.join(dataDir, 'manga.db'),
    autoload: true,
  }),
};

// Unique indexes
db.users.ensureIndex({ fieldName: 'email',    unique: true });
db.users.ensureIndex({ fieldName: 'username', unique: true });

module.exports = db;
