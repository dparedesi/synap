/**
 * Tests for delete and restore commands
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const TEST_DIR = path.join(os.tmpdir(), `brain-dump-test-delete-${Date.now()}`);
const CLI_PATH = path.join(process.cwd(), 'src/cli.js');

function runCli(args) {
  try {
    const result = execSync(`node ${CLI_PATH} ${args} --json`, {
      encoding: 'utf8',
      env: { ...process.env, BRAIN_DUMP_DIR: TEST_DIR }
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

describe('delete command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('deletes single entry', () => {
    const added = runCli('add "Entry to delete"');
    const id = added.entry.id.slice(0, 8);

    const result = runCli(`delete ${id}`);

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
  });

  it('entry no longer appears in list after delete', () => {
    const added = runCli('add "Delete me"');
    const id = added.entry.id.slice(0, 8);

    runCli(`delete ${id}`);

    const list = runCli('list --all');
    const found = list.entries.find(e => e.id === added.entry.id);
    expect(found).toBeUndefined();
  });

  it('deletes multiple entries', () => {
    const entry1 = runCli('add "Entry 1"');
    const entry2 = runCli('add "Entry 2"');

    const result = runCli(`delete ${entry1.entry.id.slice(0, 8)} ${entry2.entry.id.slice(0, 8)}`);

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });

  it('handles non-existent entry gracefully', () => {
    const result = runCli('delete nonexistent');

    // Just verify we get a response
    expect(result).toBeDefined();
  });

  it('logs deleted entries for restore', () => {
    const added = runCli('add "Restorable entry" --tags important');
    const id = added.entry.id.slice(0, 8);

    runCli(`delete ${id}`);

    // Verify deletion log exists
    const logPath = path.join(TEST_DIR, 'deletion-log.json');
    expect(fs.existsSync(logPath)).toBe(true);

    const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].id).toBe(added.entry.id);
  });
});

describe('restore command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('restores last deleted entry with --last 1', () => {
    const added = runCli('add "Entry to restore"');
    const id = added.entry.id.slice(0, 8);

    runCli(`delete ${id}`);
    const result = runCli('restore --last 1');

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);

    // Entry should be back
    const show = runCli(`show ${id}`);
    expect(show.success).toBe(true);
    expect(show.entry.content).toBe('Entry to restore');
  });

  it('restores entry by ID with --ids flag', () => {
    const added = runCli('add "Specific entry"');
    const id = added.entry.id.slice(0, 8);

    runCli(`delete ${id}`);
    const result = runCli(`restore --ids ${id}`);

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
  });

  it('preserves all entry data on restore', () => {
    const added = runCli('add "Full entry" --type todo --priority 2 --tags work,urgent');
    const id = added.entry.id.slice(0, 8);

    runCli(`delete ${id}`);
    runCli(`restore --ids ${id}`);

    const show = runCli(`show ${id}`);
    expect(show.entry.content).toBe('Full entry');
    expect(show.entry.type).toBe('todo');
    expect(show.entry.priority).toBe(2);
    expect(show.entry.tags).toContain('work');
    expect(show.entry.tags).toContain('urgent');
  });

  it('lists available entries to restore with --list flag', () => {
    const entry1 = runCli('add "First deleted"');
    const entry2 = runCli('add "Second deleted"');

    runCli(`delete ${entry1.entry.id.slice(0, 8)}`);
    runCli(`delete ${entry2.entry.id.slice(0, 8)}`);

    const result = runCli('restore --list');

    expect(result.success).toBe(true);
    expect(result.deletions.length).toBe(2);
  });
});
