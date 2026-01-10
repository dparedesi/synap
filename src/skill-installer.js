/**
 * skill-installer.js - Install/uninstall Claude Code skill
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SKILL_NAME = 'xbrain-assistant';
const SKILL_SOURCE = 'xbrain-cli';
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

function extractFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { frontMatter: null, body: content };
  }
  return { frontMatter: match[1], body: content.slice(match[0].length) };
}

function parseFrontMatter(frontMatter) {
  const data = {};
  if (!frontMatter) {
    return data;
  }
  const lines = frontMatter.split('\n');
  for (const line of lines) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) {
      data[match[1]] = match[2].trim();
    }
  }
  return data;
}

function applyFrontMatterUpdates(content, updates) {
  const { frontMatter, body } = extractFrontMatter(content);
  const lines = frontMatter ? frontMatter.split('\n') : [];
  const updatedLines = [];
  const handled = new Set();

  for (const line of lines) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match && Object.prototype.hasOwnProperty.call(updates, match[1])) {
      const key = match[1];
      const value = updates[key];
      handled.add(key);
      if (value === null || value === undefined) {
        continue;
      }
      updatedLines.push(`${key}: ${value}`);
    } else {
      updatedLines.push(line);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (handled.has(key)) {
      continue;
    }
    if (value === null || value === undefined) {
      continue;
    }
    updatedLines.push(`${key}: ${value}`);
  }

  const front = `---\n${updatedLines.join('\n')}\n---\n`;
  return front + body;
}

function getCanonicalContent(content) {
  return applyFrontMatterUpdates(content, { source: SKILL_SOURCE, hash: null });
}

function buildSkillContent(content) {
  const canonical = getCanonicalContent(content);
  const hash = getHash(canonical);
  const withHash = applyFrontMatterUpdates(canonical, { source: SKILL_SOURCE, hash });
  return { canonical, hash, content: withHash };
}

function extractMetadata(content) {
  const { frontMatter } = extractFrontMatter(content);
  const data = parseFrontMatter(frontMatter);
  return {
    source: data.source || null,
    hash: data.hash || null
  };
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
  const { content: normalizedSourceContent, hash: sourceHash } = buildSkillContent(sourceContent);

  // Ensure target directory exists
  if (!fs.existsSync(TARGET_SKILL_DIR)) {
    fs.mkdirSync(TARGET_SKILL_DIR, { recursive: true });
  }

  // Check if target exists
  if (fs.existsSync(TARGET_SKILL_FILE)) {
    const targetContent = fs.readFileSync(TARGET_SKILL_FILE, 'utf8');
    const { source: targetSource, hash: targetHash } = extractMetadata(targetContent);
    const canonicalTarget = getCanonicalContent(targetContent);
    const canonicalTargetHash = getHash(canonicalTarget);
    const targetMatchesSource = canonicalTargetHash === sourceHash;

    if (targetSource !== SKILL_SOURCE && !options.force) {
      return { installed: false, needsForce: true };
    }

    if (targetSource === SKILL_SOURCE && !options.force) {
      if (targetMatchesSource && targetContent === normalizedSourceContent) {
        return { installed: false, skipped: true };
      }

      if (targetHash) {
        if (targetHash !== canonicalTargetHash) {
          return { installed: false, needsForce: true };
        }
      } else if (!targetMatchesSource) {
        return { installed: false, needsForce: true };
      }
    }

    const backupFile = TARGET_SKILL_FILE + '.backup';
    fs.writeFileSync(backupFile, targetContent);
  }

  // Install
  fs.writeFileSync(TARGET_SKILL_FILE, normalizedSourceContent);

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
