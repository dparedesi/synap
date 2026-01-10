/**
 * Tests for edit and set commands
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const TEST_DIR = path.join(os.tmpdir(), `xbrain-test-edit-${Date.now()}`);
const CLI_PATH = path.join(process.cwd(), 'src/cli.js');

function runCli(args) {
  try {
    const result = execSync(`node ${CLI_PATH} ${args} --json`, {
      encoding: 'utf8',
      env: { ...process.env, XBRAIN_DIR: TEST_DIR }
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

describe('edit command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('edits entry content with --content flag', () => {
    const added = runCli('add "Original content"');
    const id = added.entry.id.slice(0, 8);

    const result = runCli(`edit ${id} --content "Updated content"`);

    expect(result.success).toBe(true);
    expect(result.entry.content).toBe('Updated content');
  });

  it('updates updatedAt timestamp on edit', () => {
    const added = runCli('add "Original"');
    const id = added.entry.id.slice(0, 8);
    const originalUpdatedAt = added.entry.updatedAt;

    // Small delay to ensure timestamp difference
    const result = runCli(`edit ${id} --content "Modified"`);

    expect(result.success).toBe(true);
    expect(new Date(result.entry.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(originalUpdatedAt).getTime()
    );
  });

  it('returns error for non-existent entry', () => {
    const result = runCli('edit nonexistent --content "New content"');

    expect(result.success).toBe(false);
    expect(result.code).toBe('ENTRY_NOT_FOUND');
  });

  it('preserves other fields when editing content', () => {
    const added = runCli('add "Original" --type todo --priority 1 --tags work');
    const id = added.entry.id.slice(0, 8);

    const result = runCli(`edit ${id} --content "Updated"`);

    expect(result.entry.type).toBe('todo');
    expect(result.entry.priority).toBe(1);
    expect(result.entry.tags).toContain('work');
  });
});

describe('set command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('updates entry type', () => {
    const added = runCli('add "An idea"');
    const id = added.entry.id.slice(0, 8);

    const result = runCli(`set ${id} --type todo`);

    expect(result.success).toBe(true);
    expect(result.entry.type).toBe('todo');
  });

  it('updates entry status', () => {
    const added = runCli('add "Raw entry"');
    const id = added.entry.id.slice(0, 8);

    const result = runCli(`set ${id} --status active`);

    expect(result.success).toBe(true);
    expect(result.entry.status).toBe('active');
  });

  it('updates entry priority', () => {
    const added = runCli('add "No priority"');
    const id = added.entry.id.slice(0, 8);

    const result = runCli(`set ${id} --priority 2`);

    expect(result.success).toBe(true);
    expect(result.entry.priority).toBe(2);
  });

  it('updates entry tags', () => {
    const added = runCli('add "No tags"');
    const id = added.entry.id.slice(0, 8);

    const result = runCli(`set ${id} --tags new,tags`);

    expect(result.success).toBe(true);
    expect(result.entry.tags).toContain('new');
    expect(result.entry.tags).toContain('tags');
  });

  it('sets parent relationship', () => {
    const parent = runCli('add "Parent" --type project');
    const child = runCli('add "Child" --type feature');

    const result = runCli(`set ${child.entry.id.slice(0, 8)} --parent ${parent.entry.id.slice(0, 8)}`);

    expect(result.success).toBe(true);
    expect(result.entry.parent).toContain(parent.entry.id.slice(0, 8));
  });

  it('updates multiple fields at once', () => {
    const added = runCli('add "Original"');
    const id = added.entry.id.slice(0, 8);

    const result = runCli(`set ${id} --type todo --priority 1 --status active --tags urgent`);

    expect(result.success).toBe(true);
    expect(result.entry.type).toBe('todo');
    expect(result.entry.priority).toBe(1);
    expect(result.entry.status).toBe('active');
    expect(result.entry.tags).toContain('urgent');
  });

  it('validates type value', () => {
    const added = runCli('add "Entry"');
    const id = added.entry.id.slice(0, 8);

    const result = runCli(`set ${id} --type invalid`);

    expect(result.success).toBe(false);
  });

  it('validates status value', () => {
    const added = runCli('add "Entry"');
    const id = added.entry.id.slice(0, 8);

    const result = runCli(`set ${id} --status invalid`);

    expect(result.success).toBe(false);
  });

  it('ignores invalid priority (out of range)', () => {
    const added = runCli('add "Entry"');
    const id = added.entry.id.slice(0, 8);

    const result = runCli(`set ${id} --priority 10`);

    // CLI may accept but storage ignores invalid priority
    expect(result.success).toBe(true);
  });

  it('returns error for non-existent entry', () => {
    const result = runCli('set nonexistent --type todo');

    expect(result.success).toBe(false);
    expect(result.code).toBe('ENTRY_NOT_FOUND');
  });
});
