/**
 * Tests for skill installer behavior
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_HOME = path.join(os.tmpdir(), `synap-skill-${Date.now()}`);
const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;
const TARGET_SKILL_FILE = path.join(
  TEST_HOME,
  '.claude',
  'skills',
  'synap-assistant',
  'SKILL.md'
);

let skillInstaller;

describe('skill installer', () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env.HOME = TEST_HOME;
    process.env.USERPROFILE = TEST_HOME;
    if (fs.existsSync(TEST_HOME)) {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_HOME, { recursive: true });
    skillInstaller = await import('../src/skill-installer.js');
  });

  afterEach(() => {
    if (fs.existsSync(TEST_HOME)) {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    }
    process.env.HOME = ORIGINAL_HOME;
    process.env.USERPROFILE = ORIGINAL_USERPROFILE;
  });

  it('installs skill with source marker and hash', async () => {
    const result = await skillInstaller.install();

    expect(result.installed).toBe(true);
    const content = fs.readFileSync(TARGET_SKILL_FILE, 'utf8');
    expect(content).toMatch(/source:\s*synap-cli/);
    expect(content).toMatch(/hash:\s*[a-f0-9]{32}/);
  });

  it('skips when skill is already up to date', async () => {
    await skillInstaller.install();
    const result = await skillInstaller.install();

    expect(result.skipped).toBe(true);
  });

  it('requires force when target is modified', async () => {
    await skillInstaller.install();
    fs.appendFileSync(TARGET_SKILL_FILE, '\n<!-- user note -->\n', 'utf8');

    const result = await skillInstaller.install();

    expect(result.needsForce).toBe(true);
    const content = fs.readFileSync(TARGET_SKILL_FILE, 'utf8');
    expect(content).toContain('user note');
  });

  it('overwrites with force and creates backup', async () => {
    await skillInstaller.install();
    fs.appendFileSync(TARGET_SKILL_FILE, '\n<!-- user note -->\n', 'utf8');

    const result = await skillInstaller.install({ force: true });

    expect(result.installed).toBe(true);
    const backupFile = `${TARGET_SKILL_FILE}.backup`;
    expect(fs.existsSync(backupFile)).toBe(true);
    const backupContent = fs.readFileSync(backupFile, 'utf8');
    expect(backupContent).toContain('user note');
  });
});
