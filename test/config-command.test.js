/**
 * Tests for synap config command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

// Create a unique test directory for each test run
const TEST_CONFIG_DIR = path.join(os.tmpdir(), `synap-test-config-cmd-${Date.now()}`);

// Path to the CLI
const CLI_PATH = path.join(process.cwd(), 'src/cli.js');

describe('synap config command', () => {
  beforeEach(() => {
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

  const runCli = (args, expectError = false) => {
    try {
      const result = execSync(`node ${CLI_PATH} ${args}`, {
        env: { ...process.env, SYNAP_DIR: TEST_CONFIG_DIR },
        encoding: 'utf8'
      });
      return { success: true, output: result };
    } catch (err) {
      if (expectError) {
        return { success: false, output: err.stdout || err.stderr };
      }
      throw err;
    }
  };

  const runCliJson = (args, expectError = false) => {
    const result = runCli(`${args} --json`, expectError);
    return JSON.parse(result.output);
  };

  describe('show all config', () => {
    it('shows all config values with --json', () => {
      const result = runCliJson('config');

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.defaults).toBeDefined();
      expect(result.config.defaultType).toBe('idea');
      expect(result.config.dateFormat).toBe('relative');
    });

    it('shows human-readable output without --json', () => {
      const result = runCli('config');

      expect(result.success).toBe(true);
      expect(result.output).toContain('Configuration:');
      expect(result.output).toContain('defaultType');
      expect(result.output).toContain('dateFormat');
    });
  });

  describe('get specific key', () => {
    it('gets specific config value with --json', () => {
      const result = runCliJson('config defaultType');

      expect(result.success).toBe(true);
      expect(result.key).toBe('defaultType');
      expect(result.value).toBe('idea');
    });

    it('gets array value correctly', () => {
      // Set some tags first
      runCliJson('config defaultTags work,personal');
      const result = runCliJson('config defaultTags');

      expect(result.success).toBe(true);
      expect(result.value).toEqual(['work', 'personal']);
    });

    it('errors on unknown key', () => {
      const result = runCliJson('config unknownKey', true);

      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_KEY');
    });
  });

  describe('set config value', () => {
    it('sets defaultType', () => {
      const result = runCliJson('config defaultType todo');

      expect(result.success).toBe(true);
      expect(result.key).toBe('defaultType');
      expect(result.value).toBe('todo');

      // Verify it persisted
      const check = runCliJson('config defaultType');
      expect(check.value).toBe('todo');
    });

    it('sets dateFormat', () => {
      const result = runCliJson('config dateFormat absolute');

      expect(result.success).toBe(true);
      expect(result.value).toBe('absolute');
    });

    it('sets defaultTags as comma-separated list', () => {
      const result = runCliJson('config defaultTags work,urgent,priority');

      expect(result.success).toBe(true);
      expect(result.value).toEqual(['work', 'urgent', 'priority']);
    });

    it('sets editor', () => {
      const result = runCliJson('config editor vim');

      expect(result.success).toBe(true);
      expect(result.value).toBe('vim');
    });

    it('validates defaultType against VALID_TYPES', () => {
      const result = runCliJson('config defaultType invalid-type', true);

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.error).toContain('Invalid type');
    });

    it('validates dateFormat against VALID_DATE_FORMATS', () => {
      const result = runCliJson('config dateFormat invalid-format', true);

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.error).toContain('Invalid format');
    });
  });

  describe('reset config', () => {
    it('resets config to defaults', () => {
      // First set some values
      runCliJson('config defaultType todo');
      runCliJson('config dateFormat absolute');
      runCliJson('config defaultTags work,urgent');

      // Reset
      const result = runCliJson('config --reset');

      expect(result.success).toBe(true);
      expect(result.config.defaultType).toBe('idea');
      expect(result.config.dateFormat).toBe('relative');
      expect(result.config.defaultTags).toEqual([]);
    });
  });

  describe('config persistence', () => {
    it('persists config to file', () => {
      runCliJson('config defaultType project');

      // Check the file directly
      const configPath = path.join(TEST_CONFIG_DIR, 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      expect(config.defaultType).toBe('project');
    });

    it('newly set config affects new entries', () => {
      runCliJson('config defaultType note');

      const entry = runCliJson('add "Test entry"');

      expect(entry.entry.type).toBe('note');
    });

    it('defaultTags are applied to new entries', () => {
      runCliJson('config defaultTags auto-tag');

      const entry = runCliJson('add "Test entry"');

      expect(entry.entry.tags).toContain('auto-tag');
    });
  });
});
