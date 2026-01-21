/**
 * preferences.js - User preferences storage and helpers
 * 
 * User preferences are stored in DATA_DIR (syncable) not CONFIG_DIR
 */

const fs = require('fs');
const path = require('path');
const storage = require('./storage');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'user-preferences-template.md');
const MAX_LINES = 500;
const SECTION_ALIASES = new Map([
  ['about', 'About Me'],
  ['me', 'About Me'],
  ['projects', 'Important Projects'],
  ['important', 'Important Projects'],
  ['tags', 'Tag Meanings'],
  ['tag', 'Tag Meanings'],
  ['review', 'Review Preferences'],
  ['behavior', 'Behavioral Preferences'],
  ['behavioral', 'Behavioral Preferences']
]);

/**
 * Get current preferences file path (dynamic, based on DATA_DIR)
 */
function getPreferencesFilePath() {
  return path.join(storage.DATA_DIR, 'user-preferences.md');
}

function ensureDataDir() {
  const dataDir = storage.DATA_DIR;
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function getPreferencesPath() {
  return getPreferencesFilePath();
}

function readTemplate() {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Preferences template not found: ${TEMPLATE_PATH}`);
  }
  return fs.readFileSync(TEMPLATE_PATH, 'utf8');
}

function validatePreferences(content) {
  if (typeof content !== 'string') {
    return { valid: false, error: 'Preferences must be a string' };
  }

  if (content.includes('\0')) {
    return { valid: false, error: 'Preferences contain invalid null bytes' };
  }

  const trimmedContent = content.replace(/(\r?\n)+$/, '');
  const lineCount = trimmedContent.split(/\r?\n/).length;
  if (lineCount > MAX_LINES) {
    return { valid: false, error: `Preferences must be ${MAX_LINES} lines or fewer` };
  }

  return { valid: true };
}

function savePreferences(content) {
  const validation = validatePreferences(content);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  ensureDataDir();
  const preferencesFile = getPreferencesFilePath();
  const tmpPath = `${preferencesFile}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, preferencesFile);
  return content;
}

function loadPreferences() {
  ensureDataDir();
  const preferencesFile = getPreferencesFilePath();
  if (!fs.existsSync(preferencesFile)) {
    const template = readTemplate();
    savePreferences(template);
    return template;
  }

  const content = fs.readFileSync(preferencesFile, 'utf8');
  const validation = validatePreferences(content);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  return content;
}

function resetPreferences() {
  const template = readTemplate();
  return savePreferences(template);
}

function resolveSection(input) {
  const target = parseSectionTarget(input);
  const key = target.name.toLowerCase();
  return SECTION_ALIASES.get(key) || target.name;
}

function parseSectionTarget(section) {
  if (typeof section !== 'string') {
    throw new Error('Section name is required');
  }
  const trimmed = section.trim();
  if (!trimmed) {
    throw new Error('Section name is required');
  }

  const match = trimmed.match(/^(#{1,6})\s*(.+)$/);
  if (match) {
    return { level: match[1].length, name: match[2].trim() };
  }

  return { level: null, name: trimmed };
}

function normalizeEntry(entry) {
  return entry.trim();
}

function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('<!--');
}

function isHeadingLine(line) {
  return /^(#{1,6})\s+/.test(line.trim());
}

function findSection(lines, target) {
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!match) {
      continue;
    }
    const level = match[1].length;
    const name = match[2].trim();

    if (target.level && level !== target.level) {
      continue;
    }

    if (name.toLowerCase() === target.name.toLowerCase()) {
      return { index: i, level };
    }
  }
  return null;
}

function getSectionRange(lines, match) {
  if (!match) {
    return null;
  }

  let endIndex = lines.length;
  for (let i = match.index + 1; i < lines.length; i += 1) {
    const headingMatch = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!headingMatch) {
      continue;
    }
    const level = headingMatch[1].length;
    if (level <= match.level) {
      endIndex = i;
      break;
    }
  }

  return { start: match.index, end: endIndex };
}

function getEntriesInSection(section) {
  const resolved = resolveSection(section);
  const content = loadPreferences();
  const lines = content.split(/\r?\n/);
  const target = parseSectionTarget(resolved);
  const match = findSection(lines, target);

  if (!match) {
    return [];
  }

  const range = getSectionRange(lines, match);
  const entries = [];

  for (let i = match.index + 1; i < range.end; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || isCommentLine(trimmed) || isHeadingLine(trimmed)) {
      continue;
    }

    entries.push(trimmed);
  }

  return entries;
}

function setEntry(section, entry) {
  if (typeof entry !== 'string' || !entry.trim()) {
    throw new Error('Entry text is required');
  }

  const resolved = resolveSection(section);
  const normalized = normalizeEntry(entry);
  const entries = getEntriesInSection(resolved);
  const existed = entries.some((existing) => existing === normalized);

  if (existed) {
    return {
      added: false,
      existed: true,
      section: resolved,
      entry: normalized
    };
  }

  appendToSection(resolved, normalized);
  return {
    added: true,
    existed: false,
    section: resolved,
    entry: normalized
  };
}

function removeFromSection(section, { match, entry } = {}) {
  const hasMatch = typeof match === 'string' && match.trim();
  const hasEntry = typeof entry === 'string' && entry.trim();

  if (!hasMatch && !hasEntry) {
    throw new Error('Match or entry is required');
  }
  if (hasMatch && hasEntry) {
    throw new Error('Use either match or entry, not both');
  }

  const resolved = resolveSection(section);
  const content = loadPreferences();
  const lines = content.split(/\r?\n/);
  const target = parseSectionTarget(resolved);
  const sectionMatch = findSection(lines, target);

  if (!sectionMatch) {
    return { removed: false, count: 0, entries: [], section: resolved };
  }

  const range = getSectionRange(lines, sectionMatch);
  const sectionLines = lines.slice(sectionMatch.index + 1, range.end);
  const removedEntries = [];
  const normalizedEntry = hasEntry ? normalizeEntry(entry) : null;
  const matchNeedle = hasMatch ? match.trim().toLowerCase() : null;

  const updatedSectionLines = sectionLines.filter((line) => {
    const trimmed = line.trim();

    if (!trimmed || isCommentLine(trimmed) || isHeadingLine(trimmed)) {
      return true;
    }

    const matches = normalizedEntry
      ? trimmed === normalizedEntry
      : trimmed.toLowerCase().includes(matchNeedle);

    if (matches) {
      removedEntries.push(trimmed);
      return false;
    }

    return true;
  });

  if (removedEntries.length === 0) {
    return { removed: false, count: 0, entries: [], section: resolved };
  }

  const updatedLines = [
    ...lines.slice(0, sectionMatch.index + 1),
    ...updatedSectionLines,
    ...lines.slice(range.end)
  ];

  savePreferences(updatedLines.join('\n'));
  return {
    removed: true,
    count: removedEntries.length,
    entries: removedEntries,
    section: resolved
  };
}

function appendToSection(section, text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Append text is required');
  }

  const target = parseSectionTarget(section);
  const content = loadPreferences();
  const lines = content.split(/\r?\n/);
  const match = findSection(lines, target);
  const trimmedText = text.replace(/\s+$/, '');

  if (!match) {
    const headingLevel = target.level || 2;
    const headingLine = `${'#'.repeat(headingLevel)} ${target.name}`;
    const newLines = [...lines];

    if (newLines.length > 0 && newLines[newLines.length - 1].trim() !== '') {
      newLines.push('');
    }
    newLines.push(headingLine, '');
    newLines.push(...trimmedText.split(/\r?\n/));

    return savePreferences(newLines.join('\n'));
  }

  let insertIndex = lines.length;
  for (let i = match.index + 1; i < lines.length; i += 1) {
    const headingMatch = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!headingMatch) {
      continue;
    }
    const level = headingMatch[1].length;
    if (level <= match.level) {
      insertIndex = i;
      break;
    }
  }

  const insertLines = trimmedText.split(/\r?\n/);
  const lineBefore = lines[insertIndex - 1];
  if (lineBefore !== undefined && lineBefore.trim() !== '') {
    insertLines.unshift('');
  }

  const updated = [...lines];
  updated.splice(insertIndex, 0, ...insertLines);

  return savePreferences(updated.join('\n'));
}

module.exports = {
  getPreferencesPath,
  loadPreferences,
  savePreferences,
  resolveSection,
  setEntry,
  removeFromSection,
  getEntriesInSection,
  appendToSection,
  resetPreferences,
  validatePreferences,
  get PREFERENCES_FILE() { return getPreferencesFilePath(); },
  TEMPLATE_PATH
};
