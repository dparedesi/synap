/**
 * Tests for show command
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const TEST_DIR = path.join(os.tmpdir(), `synap-test-show-${Date.now()}`);
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

describe('show command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('shows entry details by full ID', () => {
    const added = runCli('add "Test entry for show"');
    const result = runCli(`show ${added.entry.id}`);

    expect(result.success).toBe(true);
    expect(result.entry.id).toBe(added.entry.id);
    expect(result.entry.content).toBe('Test entry for show');
  });

  it('shows entry details by partial ID', () => {
    const added = runCli('add "Another test entry"');
    const shortId = added.entry.id.slice(0, 8);

    const result = runCli(`show ${shortId}`);

    expect(result.success).toBe(true);
    expect(result.entry.id).toBe(added.entry.id);
  });

  it('returns error for non-existent ID', () => {
    const result = runCli('show nonexistent123');

    expect(result.success).toBe(false);
    expect(result.code).toBe('ENTRY_NOT_FOUND');
  });

  it('includes all entry fields', () => {
    const added = runCli('add "Full entry" --type todo --priority 2 --tags work,urgent');
    const result = runCli(`show ${added.entry.id}`);

    expect(result.entry.content).toBe('Full entry');
    expect(result.entry.type).toBe('todo');
    expect(result.entry.priority).toBe(2);
    expect(result.entry.tags).toContain('work');
    expect(result.entry.status).toBeDefined();
    expect(result.entry.createdAt).toBeDefined();
    expect(result.entry.updatedAt).toBeDefined();
  });

  it('shows entry with children when --with-children flag is used', () => {
    const parent = runCli('add "Parent project" --type project');
    const parentId = parent.entry.id.slice(0, 8);

    runCli(`add "Child 1" --type feature --parent ${parentId}`);
    runCli(`add "Child 2" --type todo --parent ${parentId}`);

    const result = runCli(`show ${parentId} --with-children`);

    expect(result.success).toBe(true);
    expect(result.children).toBeDefined();
    expect(result.children.length).toBeGreaterThanOrEqual(2);
  });

  it('shows related entries when linked', () => {
    const entry1 = runCli('add "Entry one"');
    const entry2 = runCli('add "Entry two"');

    // Link them (adds to related array)
    runCli(`link ${entry1.entry.id.slice(0, 8)} ${entry2.entry.id.slice(0, 8)}`);

    const result = runCli(`show ${entry1.entry.id.slice(0, 8)}`);

    expect(result.success).toBe(true);
    // Related should contain entry2's ID
    expect(result.entry.related.length).toBeGreaterThan(0);
  });
});
