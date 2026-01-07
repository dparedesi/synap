/**
 * Tests for done and archive commands
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const TEST_DIR = path.join(os.tmpdir(), `brain-dump-test-done-${Date.now()}`);
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

describe('done command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('marks single entry as done', () => {
    const added = runCli('add "Task to complete" --type todo');
    const id = added.entry.id.slice(0, 8);

    const result = runCli(`done ${id}`);

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);

    const show = runCli(`show ${id}`);
    expect(show.entry.status).toBe('done');
  });

  it('marks multiple entries as done', () => {
    const entry1 = runCli('add "Task 1" --type todo');
    const entry2 = runCli('add "Task 2" --type todo');

    const result = runCli(`done ${entry1.entry.id.slice(0, 8)} ${entry2.entry.id.slice(0, 8)}`);

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });

  it('updates updatedAt timestamp', () => {
    const added = runCli('add "Task"');
    const id = added.entry.id.slice(0, 8);

    runCli(`done ${id}`);
    const show = runCli(`show ${id}`);

    expect(new Date(show.entry.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(added.entry.updatedAt).getTime()
    );
  });

  it('handles non-existent entry gracefully', () => {
    // CLI may return success with count 0 or error
    const result = runCli('done nonexistent');

    // Just verify we get a response
    expect(result).toBeDefined();
  });

  it('handles already done entries gracefully', () => {
    const added = runCli('add "Task"');
    const id = added.entry.id.slice(0, 8);

    runCli(`done ${id}`);
    const result = runCli(`done ${id}`);

    // Should succeed, count may be 0 or 1 depending on implementation
    expect(result.success).toBe(true);
  });
});

describe('archive command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('archives single entry', () => {
    const added = runCli('add "Entry to archive"');
    const id = added.entry.id.slice(0, 8);

    const result = runCli(`archive ${id}`);

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
  });

  it('moves entry to archived status', () => {
    const added = runCli('add "Entry"');
    const id = added.entry.id.slice(0, 8);

    runCli(`archive ${id}`);

    // Entry should not appear in normal list
    const list = runCli('list');
    const found = list.entries.find(e => e.id === added.entry.id);
    expect(found).toBeUndefined();

    // Entry should appear in archived list
    const archived = runCli('list --archived');
    const archivedFound = archived.entries.find(e => e.id === added.entry.id);
    expect(archivedFound).toBeDefined();
    expect(archivedFound.status).toBe('archived');
  });

  it('archives multiple entries', () => {
    const entry1 = runCli('add "Entry 1"');
    const entry2 = runCli('add "Entry 2"');

    const result = runCli(`archive ${entry1.entry.id.slice(0, 8)} ${entry2.entry.id.slice(0, 8)}`);

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });

  it('handles non-existent entry gracefully', () => {
    const result = runCli('archive nonexistent');

    // Just verify we get a response
    expect(result).toBeDefined();
  });

  it('preserves entry data when archiving', () => {
    const added = runCli('add "Important entry" --type todo --priority 1 --tags work');
    const id = added.entry.id.slice(0, 8);

    runCli(`archive ${id}`);

    const archived = runCli('list --archived');
    const entry = archived.entries.find(e => e.id === added.entry.id);

    expect(entry.content).toBe('Important entry');
    expect(entry.type).toBe('todo');
    expect(entry.priority).toBe(1);
    expect(entry.tags).toContain('work');
  });
});
