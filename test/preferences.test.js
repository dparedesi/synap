/**
 * Tests for preferences module
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), `brain-dump-preferences-${Date.now()}`);
const ORIGINAL_BRAIN_DUMP_DIR = process.env.BRAIN_DUMP_DIR;

let preferences;

describe('preferences', () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env.BRAIN_DUMP_DIR = TEST_DIR;
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
    preferences = await import('../src/preferences.js');
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    if (ORIGINAL_BRAIN_DUMP_DIR === undefined) {
      delete process.env.BRAIN_DUMP_DIR;
    } else {
      process.env.BRAIN_DUMP_DIR = ORIGINAL_BRAIN_DUMP_DIR;
    }
  });

  it('creates preferences from the template when missing', () => {
    const content = preferences.loadPreferences();
    const template = fs.readFileSync(preferences.TEMPLATE_PATH, 'utf8');

    expect(content).toBe(template);
    expect(fs.existsSync(preferences.PREFERENCES_FILE)).toBe(true);
  });

  it('rejects preferences over the max line limit', () => {
    const content = Array.from({ length: 501 }, (_, i) => `line ${i}`).join('\n');
    expect(() => preferences.savePreferences(content)).toThrow(/500/);
  });

  it('appends to an existing section', () => {
    preferences.resetPreferences();
    preferences.appendToSection('## About Me', 'Loves automation.');

    const updated = fs.readFileSync(preferences.PREFERENCES_FILE, 'utf8');
    expect(updated).toContain('## About Me');
    expect(updated).toContain('Loves automation.');
  });

  it('creates a missing section when appending', () => {
    preferences.resetPreferences();
    preferences.appendToSection('New Section', 'Hello there.');

    const updated = fs.readFileSync(preferences.PREFERENCES_FILE, 'utf8');
    expect(updated).toContain('## New Section');
    expect(updated).toContain('Hello there.');
  });
});
