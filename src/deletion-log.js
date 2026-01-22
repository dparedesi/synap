/**
 * deletion-log.js - Audit logging for deleted entries, enables restore
 * 
 * The deletion log is stored in DATA_DIR (syncable across devices)
 */

const fs = require('fs');
const path = require('path');
const storage = require('./storage');

const MAX_DELETION_LOG_ENTRIES = 1000;

/**
 * Get deletion log file path (dynamic, based on DATA_DIR)
 */
function getDeletionLogPath() {
  return path.join(storage.DATA_DIR, 'deletion-log.json');
}

/**
 * Ensure data directory exists
 */
function ensureDataDir() {
  const dataDir = storage.DATA_DIR;
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
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
  ensureDataDir();
  const logFile = getDeletionLogPath();
  if (!fs.existsSync(logFile)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(logFile, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Save deletion log
 */
function saveLog(log) {
  ensureDataDir();
  atomicWriteSync(getDeletionLogPath(), log);
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

  // Keep last N deletions
  if (log.length > MAX_DELETION_LOG_ENTRIES) {
    log.length = MAX_DELETION_LOG_ENTRIES;
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
