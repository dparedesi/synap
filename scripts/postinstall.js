#!/usr/bin/env node

/**
 * postinstall.js - Run after npm install
 * Auto-installs/updates the Claude skill
 */

// ANSI colors
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

async function main() {
  console.log('');
  console.log(`${BOLD}synap${RESET} - A CLI for externalizing your working memory`);
  console.log('');

  // Auto-install/update skill
  try {
    const skillInstaller = require('../src/skill-installer');
    const result = await skillInstaller.install();
    if (result.installed) {
      console.log(`${CYAN}Claude skill installed.${RESET}`);
    } else if (result.skipped) {
      console.log(`${CYAN}Claude skill up to date.${RESET}`);
    } else if (result.needsForce) {
      console.log(`${CYAN}Skill modified locally.${RESET} Run 'synap install-skill --force' to update.`);
    }
  } catch (err) {
    console.log(`${CYAN}Skill install failed.${RESET} Run 'synap install-skill' to retry.`);
  }

  console.log('');
  console.log('Quick start:');
  console.log(`  ${CYAN}synap add "My first idea"${RESET}      # Capture a thought`);
  console.log(`  ${CYAN}synap todo "Something to do"${RESET}   # Add a todo`);
  console.log(`  ${CYAN}synap list${RESET}                     # See all entries`);
  console.log(`  ${CYAN}synap stats${RESET}                    # Overview statistics`);
  console.log('');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
