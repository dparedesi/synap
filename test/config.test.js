/**
 * Tests for config.json validation in loadConfig()
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Create a unique test directory for each test run
const TEST_CONFIG_DIR = path.join(os.tmpdir(), `synap-test-${Date.now()}`);

// Set the environment variable before requiring storage
process.env.SYNAP_DIR = TEST_CONFIG_DIR;

// Dynamic import to ensure env var is set first
let storage;

describe('loadConfig', () => {
  beforeEach(async () => {
    // Fresh import for each test
    vi.resetModules();
    process.env.SYNAP_DIR = TEST_CONFIG_DIR;
    storage = await import('../src/storage.js');

    // Ensure clean test directory
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
    }
  });

  it('returns defaults when no config file exists', () => {
    const config = storage.loadConfig();

    expect(config.defaultType).toBe('idea');
    expect(config.defaultTags).toEqual([]);
    expect(config.dateFormat).toBe('relative');
    expect(config.editor).toBeNull();
  });

  it('validates defaultType against VALID_TYPES', () => {
    const configFile = path.join(TEST_CONFIG_DIR, 'config.json');
    fs.writeFileSync(configFile, JSON.stringify({ defaultType: 'invalid-type' }));

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = storage.loadConfig();

    expect(config.defaultType).toBe('idea');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid defaultType'));
    consoleSpy.mockRestore();
  });

  it('accepts valid defaultType values', () => {
    const configFile = path.join(TEST_CONFIG_DIR, 'config.json');

    for (const validType of storage.VALID_TYPES) {
      fs.writeFileSync(configFile, JSON.stringify({ defaultType: validType }));
      const config = storage.loadConfig();
      expect(config.defaultType).toBe(validType);
    }
  });

  it('validates dateFormat against allowed values', () => {
    const configFile = path.join(TEST_CONFIG_DIR, 'config.json');
    fs.writeFileSync(configFile, JSON.stringify({ dateFormat: 'invalid-format' }));

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = storage.loadConfig();

    expect(config.dateFormat).toBe('relative');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid dateFormat'));
    consoleSpy.mockRestore();
  });

  it('accepts valid dateFormat values', () => {
    const configFile = path.join(TEST_CONFIG_DIR, 'config.json');

    for (const validFormat of storage.VALID_DATE_FORMATS) {
      fs.writeFileSync(configFile, JSON.stringify({ dateFormat: validFormat }));
      const config = storage.loadConfig();
      expect(config.dateFormat).toBe(validFormat);
    }
  });

  it('handles non-array defaultTags gracefully', () => {
    const configFile = path.join(TEST_CONFIG_DIR, 'config.json');
    fs.writeFileSync(configFile, JSON.stringify({ defaultTags: 'not-an-array' }));

    const config = storage.loadConfig();

    expect(config.defaultTags).toEqual([]);
  });

  it('filters non-string values from defaultTags', () => {
    const configFile = path.join(TEST_CONFIG_DIR, 'config.json');
    fs.writeFileSync(configFile, JSON.stringify({
      defaultTags: ['valid', 123, null, 'also-valid', { obj: true }]
    }));

    const config = storage.loadConfig();

    expect(config.defaultTags).toEqual(['valid', 'also-valid']);
  });

  it('trims whitespace from defaultTags', () => {
    const configFile = path.join(TEST_CONFIG_DIR, 'config.json');
    fs.writeFileSync(configFile, JSON.stringify({
      defaultTags: ['  work  ', 'urgent ', ' personal']
    }));

    const config = storage.loadConfig();

    expect(config.defaultTags).toEqual(['work', 'urgent', 'personal']);
  });

  it('accepts valid config values', () => {
    const configFile = path.join(TEST_CONFIG_DIR, 'config.json');
    fs.writeFileSync(configFile, JSON.stringify({
      defaultType: 'todo',
      defaultTags: ['work', 'urgent'],
      dateFormat: 'absolute',
      editor: 'code'
    }));

    const config = storage.loadConfig();

    expect(config.defaultType).toBe('todo');
    expect(config.defaultTags).toEqual(['work', 'urgent']);
    expect(config.dateFormat).toBe('absolute');
    expect(config.editor).toBe('code');
  });

  it('handles malformed JSON gracefully', () => {
    const configFile = path.join(TEST_CONFIG_DIR, 'config.json');
    fs.writeFileSync(configFile, '{ invalid json }');

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = storage.loadConfig();

    // Should return defaults
    expect(config.defaultType).toBe('idea');
    expect(config.defaultTags).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Could not parse config.json'));
    consoleSpy.mockRestore();
  });

  it('merges partial config with defaults', () => {
    const configFile = path.join(TEST_CONFIG_DIR, 'config.json');
    fs.writeFileSync(configFile, JSON.stringify({
      defaultType: 'project'
      // other fields not specified
    }));

    const config = storage.loadConfig();

    expect(config.defaultType).toBe('project');
    expect(config.defaultTags).toEqual([]); // default
    expect(config.dateFormat).toBe('relative'); // default
    expect(config.editor).toBeNull(); // default
  });
});

describe('VALID_TYPES export', () => {
  it('exports VALID_TYPES array', async () => {
    const storage = await import('../src/storage.js');

    expect(storage.VALID_TYPES).toEqual([
      'idea', 'project', 'feature', 'todo', 'question', 'reference', 'note'
    ]);
  });
});

describe('VALID_DATE_FORMATS export', () => {
  it('exports VALID_DATE_FORMATS array', async () => {
    const storage = await import('../src/storage.js');

    expect(storage.VALID_DATE_FORMATS).toEqual(['relative', 'absolute', 'locale']);
  });
});
