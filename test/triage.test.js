/**
 * Tests for triage command (non-interactive mode)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const TEST_DIR = path.join(os.tmpdir(), `synap-test-triage-${Date.now()}`);
const CLI_PATH = path.join(process.cwd(), 'src/cli.js');

function runCli(args) {
  try {
    const result = execSync(`node ${CLI_PATH} ${args} --json`, {
      encoding: 'utf8',
      env: { ...process.env, SYNAP_DIR: TEST_DIR }
    });
    return JSON.parse(result);
  } catch (error) {
    if (error.stdout) {
      try {
        return JSON.parse(error.stdout);
      } catch {
        return { success: false, error: error.stdout };
      }
    }
    return { success: false, error: error.message };
  }
}

describe('triage command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('returns success with no raw entries', () => {
    const result = runCli('triage');

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
    expect(result.message).toBe('No raw entries to triage');
  });

  it('lists raw entries in JSON mode', () => {
    runCli('add "Raw entry 1"');
    runCli('add "Raw entry 2"');

    const result = runCli('triage');

    expect(result.success).toBe(true);
    expect(result.rawEntries.length).toBe(2);
  });

  it('only shows entries with status raw', () => {
    runCli('add "Raw entry"');
    const active = runCli('add "Active entry"');
    runCli(`set ${active.entry.id.slice(0, 8)} --status active`);

    const result = runCli('triage');

    expect(result.rawEntries.length).toBe(1);
    expect(result.rawEntries[0].status).toBe('raw');
  });

  it('includes all entry details in response', () => {
    runCli('add "Tagged entry" --type idea --tags work,personal');

    const result = runCli('triage');

    expect(result.rawEntries[0].content).toBe('Tagged entry');
    expect(result.rawEntries[0].type).toBe('idea');
    expect(result.rawEntries[0].tags).toContain('work');
  });

  it('works with --auto flag', () => {
    runCli('add "Entry 1"');
    runCli('add "Entry 2"');

    const result = runCli('triage --auto');

    expect(result.success).toBe(true);
    expect(result.rawEntries.length).toBe(2);
  });

  it('respects limit on entries returned', () => {
    // Add many entries
    for (let i = 0; i < 5; i++) {
      runCli(`add "Entry ${i}"`);
    }

    const result = runCli('triage');

    // Should return all raw entries (default limit is 100)
    expect(result.rawEntries.length).toBe(5);
  });
});
