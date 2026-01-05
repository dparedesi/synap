/**
 * skill-installer.js - Install/uninstall Claude Code skill
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SKILL_NAME = 'brain-dump-assistant';
const SKILL_SOURCE = 'brain-dump';
const SOURCE_SKILL_DIR = path.join(__dirname, '..', '.claude', 'skills', SKILL_NAME);
const TARGET_SKILL_DIR = path.join(os.homedir(), '.claude', 'skills', SKILL_NAME);
const SOURCE_SKILL_FILE = path.join(SOURCE_SKILL_DIR, 'SKILL.md');
const TARGET_SKILL_FILE = path.join(TARGET_SKILL_DIR, 'SKILL.md');

/**
 * Get MD5 hash of content
 */
function getHash(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Extract source from skill front matter
 */
function extractSource(content) {
  const match = content.match(/^---\n[\s\S]*?source:\s*([^\n]+)/m);
  return match ? match[1].trim() : null;
}

/**
 * Install the skill
 */
async function install(options = {}) {
  // Check if source skill exists
  if (!fs.existsSync(SOURCE_SKILL_FILE)) {
    throw new Error(`Source skill not found: ${SOURCE_SKILL_FILE}`);
  }

  const sourceContent = fs.readFileSync(SOURCE_SKILL_FILE, 'utf8');
  const sourceHash = getHash(sourceContent);

  // Ensure target directory exists
  if (!fs.existsSync(TARGET_SKILL_DIR)) {
    fs.mkdirSync(TARGET_SKILL_DIR, { recursive: true });
  }

  // Check if target exists
  if (fs.existsSync(TARGET_SKILL_FILE)) {
    const targetContent = fs.readFileSync(TARGET_SKILL_FILE, 'utf8');
    const targetHash = getHash(targetContent);

    // Check if same content
    if (sourceHash === targetHash) {
      return { installed: false, skipped: true };
    }

    // Check ownership
    const targetSource = extractSource(targetContent);
    if (targetSource !== SKILL_SOURCE && !options.force) {
      return { installed: false, needsForce: true };
    }

    // Create backup if modified
    if (targetSource === SKILL_SOURCE) {
      const backupFile = TARGET_SKILL_FILE + '.backup';
      fs.writeFileSync(backupFile, targetContent);
    }
  }

  // Install
  fs.writeFileSync(TARGET_SKILL_FILE, sourceContent);

  return { installed: true };
}

/**
 * Uninstall the skill
 */
async function uninstall() {
  if (fs.existsSync(TARGET_SKILL_FILE)) {
    fs.unlinkSync(TARGET_SKILL_FILE);
  }
  if (fs.existsSync(TARGET_SKILL_DIR)) {
    try {
      fs.rmdirSync(TARGET_SKILL_DIR);
    } catch {
      // Directory not empty, that's ok
    }
  }
  return { uninstalled: true };
}

module.exports = {
  install,
  uninstall
};
