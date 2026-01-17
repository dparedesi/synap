/**
 * Tests for preferences module
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), `synap-preferences-${Date.now()}`);
const ORIGINAL_SYNAP_DIR = process.env.SYNAP_DIR;

let preferences;

describe('preferences', () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env.SYNAP_DIR = TEST_DIR;
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
    if (ORIGINAL_SYNAP_DIR === undefined) {
      delete process.env.SYNAP_DIR;
    } else {
      process.env.SYNAP_DIR = ORIGINAL_SYNAP_DIR;
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

  it('resolves section aliases', () => {
    expect(preferences.resolveSection('tags')).toBe('Tag Meanings');
    expect(preferences.resolveSection('About')).toBe('About Me');
    expect(preferences.resolveSection('## review')).toBe('Review Preferences');
  });

  it('sets entries idempotently', () => {
    preferences.resetPreferences();
    const first = preferences.setEntry('tags', '#urgent = must do today');
    const second = preferences.setEntry('Tag Meanings', '#urgent = must do today');
    const entries = preferences.getEntriesInSection('Tag Meanings');

    expect(first.added).toBe(true);
    expect(first.existed).toBe(false);
    expect(second.added).toBe(false);
    expect(second.existed).toBe(true);
    expect(entries).toEqual(['#urgent = must do today']);
  });

  it('removes entries by match or entry', () => {
    preferences.resetPreferences();
    preferences.setEntry('tags', '#urgent = must do today');
    preferences.setEntry('tags', '#later = next week');

    const matchResult = preferences.removeFromSection('tags', { match: 'urgent' });
    expect(matchResult.removed).toBe(true);
    expect(matchResult.count).toBe(1);
    expect(matchResult.entries).toEqual(['#urgent = must do today']);

    const entryResult = preferences.removeFromSection('tags', { entry: '#later = next week' });
    expect(entryResult.removed).toBe(true);
    expect(entryResult.count).toBe(1);
    expect(entryResult.entries).toEqual(['#later = next week']);
    expect(preferences.getEntriesInSection('tags')).toEqual([]);
  });
});
