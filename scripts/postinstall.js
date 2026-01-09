#!/usr/bin/env node

/**
 * postinstall.js - Run after npm install
 * Shows hints and optionally auto-updates the skill
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SKILL_NAME = 'brain-dump-assistant';
const TARGET_SKILL_DIR = path.join(os.homedir(), '.claude', 'skills', SKILL_NAME);
const TARGET_SKILL_FILE = path.join(TARGET_SKILL_DIR, 'SKILL.md');

// ANSI colors
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

async function main() {
  console.log('');
  console.log(`${BOLD}brain-dump${RESET} - A CLI for externalizing your working memory`);
  console.log('');

  // Check if skill is installed
  if (fs.existsSync(TARGET_SKILL_FILE)) {
    try {
      const skillInstaller = require('../src/skill-installer');
      const result = await skillInstaller.install();
      if (result.installed) {
        console.log(`${CYAN}Skill auto-updated.${RESET}`);
      } else if (result.skipped) {
        console.log(`${CYAN}Skill already up to date.${RESET}`);
      } else if (result.needsForce) {
        console.log(`${CYAN}Skill modified locally.${RESET} Run 'brain install-skill --force' to update.`);
      }
    } catch (err) {
      console.log(`${CYAN}Skill update failed.${RESET} Run 'brain install-skill' to retry.`);
    }
  } else {
    console.log('To enable AI agent integration, run:');
    console.log(`  ${CYAN}brain install-skill${RESET}`);
  }

  console.log('');
  console.log('Quick start:');
  console.log(`  ${CYAN}brain add "My first idea"${RESET}      # Capture a thought`);
  console.log(`  ${CYAN}brain todo "Something to do"${RESET}   # Add a todo`);
  console.log(`  ${CYAN}brain list${RESET}                     # See all entries`);
  console.log(`  ${CYAN}brain stats${RESET}                    # Overview statistics`);
  console.log('');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
