/**
 * deletion-log.js - Audit logging for deleted entries, enables restore
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Storage directory
const CONFIG_DIR = process.env.SYNAP_DIR || path.join(os.homedir(), '.config', 'synap');
const DELETION_LOG_FILE = path.join(CONFIG_DIR, 'deletion-log.json');

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Atomic file write
 */
function atomicWriteSync(filePath, data) {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

/**
 * Load deletion log
 */
function loadLog() {
  ensureConfigDir();
  if (!fs.existsSync(DELETION_LOG_FILE)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(DELETION_LOG_FILE, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Save deletion log
 */
function saveLog(log) {
  ensureConfigDir();
  atomicWriteSync(DELETION_LOG_FILE, log);
}

/**
 * Log entries before deletion
 * Each entry gets a deletedAt timestamp for tracking
 */
async function logDeletions(entries) {
  const log = loadLog();
  const now = new Date().toISOString();

  for (const entry of entries) {
    log.unshift({
      ...entry,
      deletedAt: now
    });
  }

  // Keep last 1000 deletions
  if (log.length > 1000) {
    log.length = 1000;
  }

  saveLog(log);
}

/**
 * Get deletion log
 */
async function getLog() {
  return loadLog();
}

/**
 * Remove entries from deletion log after restore
 */
async function removeFromLog(ids) {
  const log = loadLog();
  const filtered = log.filter(e => !ids.some(id => e.id === id || e.id.startsWith(id)));
  saveLog(filtered);
}

/**
 * Clear the entire deletion log
 */
async function clearLog() {
  saveLog([]);
}

module.exports = {
  logDeletions,
  getLog,
  removeFromLog,
  clearLog
};
