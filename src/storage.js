/**
 * storage.js - Entry CRUD operations and JSON file handling
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// Storage directory
const CONFIG_DIR = process.env.BRAIN_DUMP_DIR || path.join(os.homedir(), '.config', 'brain-dump');
const ENTRIES_FILE = path.join(CONFIG_DIR, 'entries.json');
const ARCHIVE_FILE = path.join(CONFIG_DIR, 'archive.json');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Valid types and statuses
const VALID_TYPES = ['idea', 'project', 'feature', 'todo', 'question', 'reference', 'note'];
const VALID_STATUSES = ['raw', 'active', 'someday', 'done', 'archived'];

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Atomic file write - write to temp file then rename
 */
function atomicWriteSync(filePath, data) {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

/**
 * Load entries from file
 */
function loadEntries() {
  ensureConfigDir();
  if (!fs.existsSync(ENTRIES_FILE)) {
    return { version: 1, entries: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(ENTRIES_FILE, 'utf8'));
  } catch {
    return { version: 1, entries: [] };
  }
}

/**
 * Save entries to file
 */
function saveEntries(data) {
  ensureConfigDir();
  atomicWriteSync(ENTRIES_FILE, data);
}

/**
 * Load archived entries
 */
function loadArchive() {
  ensureConfigDir();
  if (!fs.existsSync(ARCHIVE_FILE)) {
    return { version: 1, entries: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf8'));
  } catch {
    return { version: 1, entries: [] };
  }
}

/**
 * Save archived entries
 */
function saveArchive(data) {
  ensureConfigDir();
  atomicWriteSync(ARCHIVE_FILE, data);
}

/**
 * Load configuration
 */
function loadConfig() {
  ensureConfigDir();
  const defaultConfig = {
    defaultType: 'idea',
    defaultTags: [],
    editor: process.env.EDITOR || 'vi',
    dateFormat: 'relative'
  };

  if (!fs.existsSync(CONFIG_FILE)) {
    return defaultConfig;
  }

  try {
    const userConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const config = { ...defaultConfig, ...userConfig };

    // Validate types to prevent runtime errors
    if (!Array.isArray(config.defaultTags)) {
      config.defaultTags = [];
    }

    return config;
  } catch {
    return defaultConfig;
  }
}

/**
 * Parse duration string to milliseconds
 * e.g., "7d" -> 7 days, "24h" -> 24 hours
 */
function parseDuration(duration) {
  if (!duration) return null;
  const match = duration.match(/^(\d+)([dhwm])$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = {
    h: 60 * 60 * 1000,           // hours
    d: 24 * 60 * 60 * 1000,      // days
    w: 7 * 24 * 60 * 60 * 1000,  // weeks
    m: 30 * 24 * 60 * 60 * 1000  // months (approx)
  };
  return value * multipliers[unit];
}

/**
 * Add a new entry
 */
async function addEntry(options) {
  const data = loadEntries();

  const now = new Date().toISOString();
  const entry = {
    id: uuidv4(),
    content: options.content,
    title: options.title || extractTitle(options.content),
    type: VALID_TYPES.includes(options.type) ? options.type : 'idea',
    status: 'raw',
    priority: options.priority && [1, 2, 3].includes(options.priority) ? options.priority : undefined,
    tags: options.tags || [],
    parent: options.parent || undefined,
    related: [],
    createdAt: now,
    updatedAt: now,
    source: options.source || 'cli'
  };

  // Clean up undefined fields
  Object.keys(entry).forEach(key => {
    if (entry[key] === undefined) delete entry[key];
  });

  data.entries.push(entry);
  saveEntries(data);

  return entry;
}

/**
 * Extract title from content (first line, max 60 chars)
 */
function extractTitle(content) {
  const firstLine = content.split('\n')[0].trim();
  if (firstLine.length <= 60) return firstLine;
  return firstLine.slice(0, 57) + '...';
}

/**
 * Get a single entry by ID (supports partial matching)
 */
async function getEntry(id) {
  const data = loadEntries();

  // Try exact match first
  let entry = data.entries.find(e => e.id === id);
  if (entry) return entry;

  // Try partial match (first 8 chars)
  const matches = data.entries.filter(e => e.id.startsWith(id));
  if (matches.length === 1) return matches[0];

  // Check archive
  const archive = loadArchive();
  entry = archive.entries.find(e => e.id === id);
  if (entry) return entry;

  const archiveMatches = archive.entries.filter(e => e.id.startsWith(id));
  if (archiveMatches.length === 1) return archiveMatches[0];

  return null;
}

/**
 * Get multiple entries by IDs
 */
async function getEntriesByIds(ids) {
  const entries = [];
  for (const id of ids) {
    const entry = await getEntry(id);
    if (entry) entries.push(entry);
  }
  return entries;
}

/**
 * Get children of an entry
 */
async function getChildren(parentId) {
  const data = loadEntries();
  return data.entries.filter(e => e.parent && e.parent.startsWith(parentId));
}

/**
 * List entries with filtering
 */
async function listEntries(query = {}) {
  const data = loadEntries();
  let entries = [...data.entries];

  // Include archive if requested
  if (query.status === 'archived') {
    const archive = loadArchive();
    entries = archive.entries;
  }

  // Filter by type
  if (query.type) {
    entries = entries.filter(e => e.type === query.type);
  }

  // Filter by status
  if (query.status && query.status !== 'archived') {
    const statuses = query.status.split(',').map(s => s.trim());
    entries = entries.filter(e => statuses.includes(e.status));
  }

  // Filter by tags (AND logic)
  if (query.tags && query.tags.length > 0) {
    entries = entries.filter(e =>
      query.tags.every(tag => e.tags && e.tags.includes(tag))
    );
  }

  // Filter by priority
  if (query.priority) {
    entries = entries.filter(e => e.priority === query.priority);
  }

  // Filter by parent
  if (query.parent) {
    entries = entries.filter(e => e.parent && e.parent.startsWith(query.parent));
  }

  // Filter orphans only
  if (query.orphans) {
    entries = entries.filter(e => !e.parent);
  }

  // Filter by since
  if (query.since) {
    const ms = parseDuration(query.since);
    if (ms) {
      const cutoff = new Date(Date.now() - ms);
      entries = entries.filter(e => new Date(e.createdAt) >= cutoff);
    }
  }

  // Include done if requested
  if (!query.includeDone && query.status !== 'done') {
    entries = entries.filter(e => e.status !== 'done');
  }

  // Sort
  const sortField = query.sort || 'created';
  entries.sort((a, b) => {
    if (sortField === 'priority') {
      const pA = a.priority || 99;
      const pB = b.priority || 99;
      return pA - pB;
    }
    if (sortField === 'updated') {
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    }
    // Default: created
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  if (query.reverse) {
    entries.reverse();
  }

  const total = entries.length;

  // Limit
  if (query.limit) {
    entries = entries.slice(0, query.limit);
  }

  return { entries, total };
}

/**
 * Search entries by text
 */
async function searchEntries(query, options = {}) {
  const data = loadEntries();
  let entries = [...data.entries];

  const lowerQuery = query.toLowerCase();

  // Text search
  entries = entries.filter(e => {
    const content = (e.content || '').toLowerCase();
    const title = (e.title || '').toLowerCase();
    return content.includes(lowerQuery) || title.includes(lowerQuery);
  });

  // Apply filters
  if (options.type) {
    entries = entries.filter(e => e.type === options.type);
  }
  if (options.status) {
    const statuses = options.status.split(',').map(s => s.trim());
    entries = entries.filter(e => statuses.includes(e.status));
  }
  if (options.since) {
    const ms = parseDuration(options.since);
    if (ms) {
      const cutoff = new Date(Date.now() - ms);
      entries = entries.filter(e => new Date(e.createdAt) >= cutoff);
    }
  }

  // Sort by relevance (simple: exact matches first)
  entries.sort((a, b) => {
    const aExact = a.title?.toLowerCase() === lowerQuery || a.content?.toLowerCase() === lowerQuery;
    const bExact = b.title?.toLowerCase() === lowerQuery || b.content?.toLowerCase() === lowerQuery;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const total = entries.length;

  if (options.limit) {
    entries = entries.slice(0, options.limit);
  }

  return { entries, total };
}

/**
 * Update an entry
 */
async function updateEntry(id, updates) {
  const data = loadEntries();
  const index = data.entries.findIndex(e => e.id === id || e.id.startsWith(id));

  if (index === -1) {
    // Check archive
    const archive = loadArchive();
    const archiveIndex = archive.entries.findIndex(e => e.id === id || e.id.startsWith(id));
    if (archiveIndex !== -1) {
      const entry = archive.entries[archiveIndex];
      Object.assign(entry, updates, { updatedAt: new Date().toISOString() });
      saveArchive(archive);
      return entry;
    }
    return null;
  }

  const entry = data.entries[index];

  // Validate type if provided
  if (updates.type && !VALID_TYPES.includes(updates.type)) {
    throw new Error(`Invalid type: ${updates.type}`);
  }

  // Validate status if provided
  if (updates.status && !VALID_STATUSES.includes(updates.status)) {
    throw new Error(`Invalid status: ${updates.status}`);
  }

  // Apply updates
  Object.assign(entry, updates, { updatedAt: new Date().toISOString() });

  // Handle null values (clear fields)
  if (updates.priority === null) delete entry.priority;
  if (updates.parent === null) delete entry.parent;

  saveEntries(data);

  return entry;
}

/**
 * Archive entries
 */
async function archiveEntries(ids) {
  const data = loadEntries();
  const archive = loadArchive();

  const toArchive = [];
  const remaining = [];

  for (const entry of data.entries) {
    const shouldArchive = ids.some(id => entry.id === id || entry.id.startsWith(id));
    if (shouldArchive) {
      entry.status = 'archived';
      entry.updatedAt = new Date().toISOString();
      toArchive.push(entry);
    } else {
      remaining.push(entry);
    }
  }

  archive.entries.push(...toArchive);
  data.entries = remaining;

  saveEntries(data);
  saveArchive(archive);

  return toArchive;
}

/**
 * Delete entries
 */
async function deleteEntries(ids) {
  const data = loadEntries();
  const archive = loadArchive();

  // Remove from entries
  data.entries = data.entries.filter(e =>
    !ids.some(id => e.id === id || e.id.startsWith(id))
  );

  // Remove from archive
  archive.entries = archive.entries.filter(e =>
    !ids.some(id => e.id === id || e.id.startsWith(id))
  );

  saveEntries(data);
  saveArchive(archive);
}

/**
 * Restore entries from deletion log
 */
async function restoreEntries(entries) {
  const data = loadEntries();

  for (const entry of entries) {
    // Remove deletedAt if present
    delete entry.deletedAt;
    // Set status back to raw if it was archived
    if (entry.status === 'archived') {
      entry.status = 'raw';
    }
    data.entries.push(entry);
  }

  saveEntries(data);
}

/**
 * Get statistics
 */
async function getStats() {
  const data = loadEntries();
  const archive = loadArchive();
  const allEntries = [...data.entries, ...archive.entries];

  const stats = {
    total: allEntries.length,
    byStatus: {},
    byType: {},
    highPriority: 0,
    createdThisWeek: 0,
    updatedToday: 0
  };

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const entry of allEntries) {
    // By status
    stats.byStatus[entry.status] = (stats.byStatus[entry.status] || 0) + 1;

    // By type
    stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;

    // High priority
    if (entry.priority === 1) stats.highPriority++;

    // Created this week
    if (new Date(entry.createdAt) >= oneWeekAgo) stats.createdThisWeek++;

    // Updated today
    if (new Date(entry.updatedAt) >= today) stats.updatedToday++;
  }

  return stats;
}

/**
 * Export entries
 */
async function exportEntries(options = {}) {
  const data = loadEntries();
  const archive = loadArchive();
  let entries = [...data.entries, ...archive.entries];

  if (options.type) {
    entries = entries.filter(e => e.type === options.type);
  }
  if (options.status) {
    entries = entries.filter(e => e.status === options.status);
  }

  return { version: 1, entries, exportedAt: new Date().toISOString() };
}

/**
 * Import entries
 */
async function importEntries(entries, options = {}) {
  const data = loadEntries();
  let added = 0;
  let updated = 0;

  for (const entry of entries) {
    const existing = data.entries.find(e => e.id === entry.id);

    if (existing) {
      if (options.merge) {
        Object.assign(existing, entry);
        updated++;
      }
      // If skipExisting, do nothing
    } else {
      data.entries.push(entry);
      added++;
    }
  }

  saveEntries(data);

  return { added, updated };
}

module.exports = {
  addEntry,
  getEntry,
  getEntriesByIds,
  getChildren,
  listEntries,
  searchEntries,
  updateEntry,
  archiveEntries,
  deleteEntries,
  restoreEntries,
  getStats,
  exportEntries,
  importEntries,
  loadConfig,
  CONFIG_DIR,
  ENTRIES_FILE,
  ARCHIVE_FILE
};
