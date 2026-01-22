/**
 * storage.js - Entry CRUD operations and JSON file handling
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// =============================================================================
// Directory Resolution (XDG-compliant with backward compatibility)
// =============================================================================

/**
 * Resolve the config directory path
 * Priority:
 *   1. SYNAP_CONFIG_DIR env var (explicit override for config only)
 *   2. SYNAP_DIR env var (legacy - affects both config and data)
 *   3. Default: ~/.config/synap
 */
function resolveConfigDir() {
  if (process.env.SYNAP_CONFIG_DIR) {
    return process.env.SYNAP_CONFIG_DIR;
  }
  if (process.env.SYNAP_DIR) {
    return process.env.SYNAP_DIR;
  }
  return path.join(os.homedir(), '.config', 'synap');
}

// Config directory - always local, not synced
const CONFIG_DIR = resolveConfigDir();
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load configuration (needed before resolving DATA_DIR)
 */
function loadConfigRaw() {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Resolve the data directory path
 * Priority:
 *   1. SYNAP_DATA_DIR env var (explicit override for data only)
 *   2. config.json -> dataDir setting
 *   3. SYNAP_DIR env var (legacy - affects both config and data)
 *   4. Default: ~/.local/share/synap (XDG compliant)
 */
function resolveDataDir() {
  // 1. Explicit env var override for data
  if (process.env.SYNAP_DATA_DIR) {
    return process.env.SYNAP_DATA_DIR;
  }

  // 2. Config file setting
  const rawConfig = loadConfigRaw();
  if (rawConfig.dataDir) {
    // Expand ~ to home directory
    const expanded = rawConfig.dataDir.replace(/^~/, os.homedir());
    return expanded;
  }

  // 3. Legacy env var (affects both config and data)
  if (process.env.SYNAP_DIR) {
    return process.env.SYNAP_DIR;
  }

  // 4. Default: XDG-compliant data directory
  return path.join(os.homedir(), '.local', 'share', 'synap');
}

// Resolve DATA_DIR at module load time
// This will be re-evaluated if config changes require restart
let DATA_DIR = resolveDataDir();

// Data files (syncable)
let ENTRIES_FILE = path.join(DATA_DIR, 'entries.json');
let ARCHIVE_FILE = path.join(DATA_DIR, 'archive.json');

/**
 * Refresh data directory paths (call after config change)
 */
function refreshDataDir() {
  DATA_DIR = resolveDataDir();
  ENTRIES_FILE = path.join(DATA_DIR, 'entries.json');
  ARCHIVE_FILE = path.join(DATA_DIR, 'archive.json');
}

/**
 * Get current data directory path
 */
function getDataDir() {
  return DATA_DIR;
}

/**
 * Ensure data directory exists
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Valid types, statuses, and date formats
const VALID_TYPES = ['idea', 'project', 'feature', 'todo', 'question', 'reference', 'note'];
const VALID_STATUSES = ['raw', 'active', 'wip', 'someday', 'done', 'archived'];
const VALID_DATE_FORMATS = ['relative', 'absolute', 'locale'];

/**
 * Atomic file write - write to temp file then rename
 * Uses PID + timestamp to avoid race conditions between processes
 */
function atomicWriteSync(filePath, data) {
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

/**
 * Load entries from file
 */
function loadEntries() {
  ensureDataDir();
  if (!fs.existsSync(ENTRIES_FILE)) {
    return { version: 1, entries: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(ENTRIES_FILE, 'utf8'));
  } catch (err) {
    console.error(`Warning: entries.json is corrupted: ${err.message}`);
    console.error(`File location: ${ENTRIES_FILE}`);
    return { version: 1, entries: [] };
  }
}

/**
 * Save entries to file
 */
function saveEntries(data) {
  ensureDataDir();
  atomicWriteSync(ENTRIES_FILE, data);
}

/**
 * Load archived entries
 */
function loadArchive() {
  ensureDataDir();
  if (!fs.existsSync(ARCHIVE_FILE)) {
    return { version: 1, entries: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf8'));
  } catch (err) {
    console.error(`Warning: archive.json is corrupted: ${err.message}`);
    console.error(`File location: ${ARCHIVE_FILE}`);
    return { version: 1, entries: [] };
  }
}

/**
 * Save archived entries
 */
function saveArchive(data) {
  ensureDataDir();
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
    editor: null, // Falls back to EDITOR env var in CLI
    dateFormat: 'relative',
    dataDir: null // Custom data directory (null = use default)
  };

  if (!fs.existsSync(CONFIG_FILE)) {
    return defaultConfig;
  }

  try {
    const userConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const config = { ...defaultConfig, ...userConfig };

    // Validate defaultType
    if (!VALID_TYPES.includes(config.defaultType)) {
      console.warn(`Warning: Invalid defaultType "${config.defaultType}" in config. Using "idea".`);
      config.defaultType = 'idea';
    }

    // Validate dateFormat
    if (!VALID_DATE_FORMATS.includes(config.dateFormat)) {
      console.warn(`Warning: Invalid dateFormat "${config.dateFormat}" in config. Using "relative".`);
      config.dateFormat = 'relative';
    }

    // Validate defaultTags is array of strings
    if (!Array.isArray(config.defaultTags)) {
      config.defaultTags = [];
    } else {
      config.defaultTags = config.defaultTags
        .filter(t => typeof t === 'string')
        .map(t => t.trim());
    }

    // Validate dataDir if set
    if (config.dataDir !== null && typeof config.dataDir !== 'string') {
      console.warn(`Warning: Invalid dataDir in config. Ignoring.`);
      config.dataDir = null;
    }

    return config;
  } catch (err) {
    console.warn(`Warning: Could not parse config.json: ${err.message}`);
    return defaultConfig;
  }
}

/**
 * Get default configuration values
 */
function getDefaultConfig() {
  return {
    defaultType: 'idea',
    defaultTags: [],
    editor: null,
    dateFormat: 'relative',
    dataDir: null
  };
}

/**
 * Validate a config key-value pair
 * @returns {object} { valid: boolean, error?: string }
 */
function validateConfigValue(key, value) {
  const defaults = getDefaultConfig();

  if (!(key in defaults)) {
    return { valid: false, error: `Unknown config key: ${key}. Valid keys: ${Object.keys(defaults).join(', ')}` };
  }

  switch (key) {
    case 'defaultType':
      if (!VALID_TYPES.includes(value)) {
        return { valid: false, error: `Invalid type "${value}". Valid types: ${VALID_TYPES.join(', ')}` };
      }
      break;
    case 'dateFormat':
      if (!VALID_DATE_FORMATS.includes(value)) {
        return { valid: false, error: `Invalid format "${value}". Valid formats: ${VALID_DATE_FORMATS.join(', ')}` };
      }
      break;
    case 'defaultTags':
      // Will be parsed as comma-separated string
      break;
    case 'editor':
      // Any string or null is valid
      break;
    case 'dataDir':
      // Path validation - must be a valid path string or null
      if (value !== null && value !== 'null' && typeof value === 'string') {
        const expanded = value.replace(/^~/, os.homedir());
        // Check if parent directory exists (we'll create the target if needed)
        const parentDir = path.dirname(expanded);
        if (!fs.existsSync(parentDir)) {
          return { valid: false, error: `Parent directory does not exist: ${parentDir}` };
        }
      }
      break;
  }
  return { valid: true };
}

/**
 * Save configuration to file
 */
function saveConfig(config) {
  ensureConfigDir();
  atomicWriteSync(CONFIG_FILE, config);
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
 * Parse date input to ISO string
 * Supports: ISO dates ("2025-01-15"), relative ("3d", "1w"), natural language ("tomorrow", "next Monday")
 * @param {string} input - Date input string
 * @returns {string|null} - ISO date string or null if invalid
 */
function parseDate(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  const dayMs = 24 * 60 * 60 * 1000;

  const endOfDay = (date) => {
    const next = new Date(date);
    next.setHours(23, 59, 59, 999);
    return next;
  };

  if (lowered === 'today') {
    return endOfDay(new Date()).toISOString();
  }
  if (lowered === 'tomorrow') {
    return endOfDay(new Date(Date.now() + dayMs)).toISOString();
  }
  if (lowered === 'yesterday') {
    return endOfDay(new Date(Date.now() - dayMs)).toISOString();
  }

  const nextWeekdayMatch = lowered.match(/^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (nextWeekdayMatch) {
    const weekdays = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6
    };
    const target = weekdays[nextWeekdayMatch[1]];
    const now = new Date();
    const current = now.getDay();
    let diff = (target + 7 - current) % 7;
    if (diff === 0) diff = 7;
    return endOfDay(new Date(now.getTime() + diff * dayMs)).toISOString();
  }

  // Bare weekday names (e.g., "monday", "friday")
  const bareWeekdayMatch = lowered.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (bareWeekdayMatch) {
    const weekdays = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6
    };
    const target = weekdays[bareWeekdayMatch[1]];
    const now = new Date();
    const current = now.getDay();
    let diff = (target - current + 7) % 7;
    if (diff === 0) diff = 7;
    return endOfDay(new Date(now.getTime() + diff * dayMs)).toISOString();
  }

  const inMatch = lowered.match(/^in\s+(\d+)\s*(hour|hours|day|days|week|weeks|month|months)$/);
  if (inMatch) {
    const value = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    const multipliers = {
      hour: 60 * 60 * 1000,
      hours: 60 * 60 * 1000,
      day: dayMs,
      days: dayMs,
      week: 7 * dayMs,
      weeks: 7 * dayMs,
      month: 30 * dayMs,
      months: 30 * dayMs
    };
    return new Date(Date.now() + value * multipliers[unit]).toISOString();
  }

  // Try relative duration first (3d, 1w, etc.) - for FUTURE dates
  const durationMs = parseDuration(trimmed);
  if (durationMs !== null) {
    return new Date(Date.now() + durationMs).toISOString();
  }

  // Try ISO date (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed + 'T23:59:59');
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}

/**
 * Create an entry object from options (shared by addEntry and addEntries)
 */
function createEntry(options, existingEntries, timestamp) {
  // Resolve partial parent ID to full ID
  let parentId = options.parent;
  if (parentId) {
    const parentEntry = existingEntries.find(e => e.id.startsWith(parentId));
    if (parentEntry) {
      parentId = parentEntry.id;
    }
  }

  // Parse due date if provided
  let dueDate = undefined;
  const dueInput = typeof options.due === 'string' ? options.due.trim() : options.due;
  if (dueInput) {
    dueDate = parseDate(dueInput);
    if (!dueDate) {
      throw new Error(`Invalid due date: ${options.due}`);
    }
  }

  const entry = {
    id: uuidv4(),
    content: options.content,
    title: options.title || extractTitle(options.content),
    type: VALID_TYPES.includes(options.type) ? options.type : 'idea',
    status: VALID_STATUSES.includes(options.status) ? options.status : (options.priority ? 'active' : 'raw'),
    priority: options.priority && [1, 2, 3].includes(options.priority) ? options.priority : undefined,
    tags: options.tags || [],
    parent: parentId || undefined,
    related: [],
    due: dueDate,
    createdAt: timestamp,
    updatedAt: timestamp,
    source: options.source || 'cli'
  };

  // Clean up undefined fields
  Object.keys(entry).forEach(key => {
    if (entry[key] === undefined) delete entry[key];
  });

  return entry;
}

/**
 * Add a new entry
 */
async function addEntry(options) {
  const data = loadEntries();
  const now = new Date().toISOString();
  const entry = createEntry(options, data.entries, now);

  data.entries.push(entry);
  saveEntries(data);

  return entry;
}

/**
 * Add multiple entries in a single batch
 * @param {Array} entriesData - Array of entry options
 * @returns {Array} - Array of created entries
 */
async function addEntries(entriesData) {
  const data = loadEntries();
  const created = [];
  const now = new Date().toISOString();

  for (const options of entriesData) {
    const entry = createEntry(options, data.entries, now);
    data.entries.push(entry);
    created.push(entry);
  }

  saveEntries(data);
  return created;
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

  // Try partial match
  const matches = data.entries.filter(e => e.id.startsWith(id));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const error = new Error(`Ambiguous ID: ${id} matches ${matches.length} entries`);
    error.code = 'AMBIGUOUS_ID';
    error.matches = matches.map(e => ({ id: e.id, title: e.title }));
    throw error;
  }

  // Check archive
  const archive = loadArchive();
  entry = archive.entries.find(e => e.id === id);
  if (entry) return entry;

  const archiveMatches = archive.entries.filter(e => e.id.startsWith(id));
  if (archiveMatches.length === 1) return archiveMatches[0];
  if (archiveMatches.length > 1) {
    const error = new Error(`Ambiguous ID: ${id} matches ${archiveMatches.length} archived entries`);
    error.code = 'AMBIGUOUS_ID';
    error.matches = archiveMatches.map(e => ({ id: e.id, title: e.title }));
    throw error;
  }

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

  // Filter by any tags (OR logic)
  if (query.anyTags && query.anyTags.length > 0) {
    entries = entries.filter(e =>
      query.anyTags.some(tag => e.tags && e.tags.includes(tag))
    );
  }

  // Exclude type
  if (query.notType) {
    entries = entries.filter(e => e.type !== query.notType);
  }

  // Exclude tags
  if (query.notTags && query.notTags.length > 0) {
    entries = entries.filter(e =>
      !query.notTags.some(tag => e.tags && e.tags.includes(tag))
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

  // Filter by since (created after)
  if (query.since) {
    const ms = parseDuration(query.since);
    if (ms) {
      const cutoff = new Date(Date.now() - ms);
      entries = entries.filter(e => new Date(e.createdAt) >= cutoff);
    }
  }

  // Filter by before (created before)
  if (query.before) {
    const ms = parseDuration(query.before);
    if (ms) {
      const cutoff = new Date(Date.now() - ms);
      entries = entries.filter(e => new Date(e.createdAt) < cutoff);
    }
  }

  // Filter by date range (between)
  if (query.between) {
    const { start, end } = query.between;
    const startDate = new Date(start);
    const endDate = new Date(end);
    entries = entries.filter(e => {
      const created = new Date(e.createdAt);
      return created >= startDate && created <= endDate;
    });
  }

  // Filter by due before
  if (query.dueBefore) {
    const cutoffDate = parseDate(query.dueBefore);
    if (cutoffDate) {
      entries = entries.filter(e => e.due && new Date(e.due) <= new Date(cutoffDate));
    }
  }

  // Filter by due after
  if (query.dueAfter) {
    const cutoffDate = parseDate(query.dueAfter);
    if (cutoffDate) {
      entries = entries.filter(e => e.due && new Date(e.due) >= new Date(cutoffDate));
    }
  }

  // Filter overdue (due before now, not done/archived)
  if (query.overdue) {
    const now = new Date();
    entries = entries.filter(e =>
      e.due &&
      new Date(e.due) < now &&
      e.status !== 'done' &&
      e.status !== 'archived'
    );
  }

  // Filter entries with/without due date
  if (query.hasDue === true) {
    entries = entries.filter(e => e.due);
  } else if (query.hasDue === false) {
    entries = entries.filter(e => !e.due);
  }

  // Include done if requested
  if (!query.includeDone && query.status !== 'done') {
    entries = entries.filter(e => e.status !== 'done');
  }

  // Sort
  const sortField = query.sort || 'created';
  entries.sort((a, b) => {
    if (sortField === 'due') {
      // Entries without due dates go to the end
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return new Date(a.due) - new Date(b.due);
    }
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

  // Include archived entries if requested
  if (options.includeArchived) {
    const archive = loadArchive();
    entries = [...entries, ...archive.entries];
  }

  const lowerQuery = query.toLowerCase();

  // Text search (content, title, and tags)
  entries = entries.filter(e => {
    const content = (e.content || '').toLowerCase();
    const title = (e.title || '').toLowerCase();
    const tagsStr = (e.tags || []).join(' ').toLowerCase();
    return content.includes(lowerQuery) || title.includes(lowerQuery) || tagsStr.includes(lowerQuery);
  });

  // Apply filters
  if (options.type) {
    entries = entries.filter(e => e.type === options.type);
  }
  if (options.notType) {
    entries = entries.filter(e => e.type !== options.notType);
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
  if (updates.due === null) delete entry.due;
  if (updates.startedAt === null) delete entry.startedAt;

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
    highPriorityActive: 0,
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
    if (entry.priority === 1) {
      stats.highPriority++;
      if (entry.status === 'raw' || entry.status === 'active') {
        stats.highPriorityActive++;
      }
    }

    // Created this week
    if (new Date(entry.createdAt) >= oneWeekAgo) stats.createdThisWeek++;

    // Updated today
    if (new Date(entry.updatedAt) >= today) stats.updatedToday++;
  }

  return stats;
}

/**
 * Get all tags with counts
 */
async function getAllTags() {
  const data = loadEntries();
  const archive = loadArchive();
  const allEntries = [...data.entries, ...archive.entries];

  const tagCounts = {};
  for (const entry of allEntries) {
    for (const tag of entry.tags || []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  return Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Rename a tag across all entries
 */
async function renameTag(oldTag, newTag) {
  const data = loadEntries();
  const archive = loadArchive();
  let count = 0;

  for (const entry of data.entries) {
    const idx = entry.tags.indexOf(oldTag);
    if (idx !== -1) {
      entry.tags[idx] = newTag;
      entry.tags = [...new Set(entry.tags)];
      entry.updatedAt = new Date().toISOString();
      count++;
    }
  }

  for (const entry of archive.entries) {
    const idx = entry.tags.indexOf(oldTag);
    if (idx !== -1) {
      entry.tags[idx] = newTag;
      entry.tags = [...new Set(entry.tags)];
      entry.updatedAt = new Date().toISOString();
      count++;
    }
  }

  saveEntries(data);
  saveArchive(archive);

  return { oldTag, newTag, entriesUpdated: count };
}

/**
 * Build tree structure from entries
 */
async function buildEntryTree(rootIds = null, maxDepth = 10) {
  const data = loadEntries();
  const entriesById = {};
  const childrenByParent = {};

  // Index entries
  for (const entry of data.entries) {
    entriesById[entry.id] = entry;
    const parentKey = entry.parent || 'root';
    if (!childrenByParent[parentKey]) childrenByParent[parentKey] = [];
    childrenByParent[parentKey].push(entry);
  }

  // Build tree node recursively
  function buildNode(entry, depth) {
    if (depth >= maxDepth) return { ...entry, children: [] };
    const children = (childrenByParent[entry.id] || [])
      .map(c => buildNode(c, depth + 1));
    return { ...entry, children };
  }

  // Get roots
  let roots;
  if (rootIds && rootIds.length > 0) {
    roots = rootIds.map(id => {
      // Support partial ID match
      const entry = data.entries.find(e => e.id.startsWith(id));
      return entry;
    }).filter(Boolean);
  } else {
    // Get entries without parents
    roots = childrenByParent['root'] || [];
  }

  return roots.map(e => buildNode(e, 0));
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
  let skipped = 0;

  for (const entry of entries) {
    // Validate required fields
    if (!entry.id || typeof entry.id !== 'string' ||
        !entry.content || typeof entry.content !== 'string' ||
        !entry.createdAt || typeof entry.createdAt !== 'string') {
      skipped++;
      continue;
    }

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

  return { added, updated, skipped };
}

module.exports = {
  addEntry,
  addEntries,
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
  getAllTags,
  renameTag,
  buildEntryTree,
  exportEntries,
  importEntries,
  loadConfig,
  getDefaultConfig,
  validateConfigValue,
  saveConfig,
  parseDate,
  refreshDataDir,
  getDataDir,
  CONFIG_DIR,
  get DATA_DIR() { return DATA_DIR; },
  get ENTRIES_FILE() { return ENTRIES_FILE; },
  get ARCHIVE_FILE() { return ARCHIVE_FILE; },
  VALID_TYPES,
  VALID_STATUSES,
  VALID_DATE_FORMATS
};
