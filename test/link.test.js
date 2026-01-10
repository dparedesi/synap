/**
 * Tests for link command
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const TEST_DIR = path.join(os.tmpdir(), `xbrain-test-link-${Date.now()}`);
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

describe('link command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('creates relationship between entries (adds to related)', () => {
    const entry1 = runCli('add "First entry"');
    const entry2 = runCli('add "Second entry"');

    const result = runCli(`link ${entry1.entry.id.slice(0, 8)} ${entry2.entry.id.slice(0, 8)}`);

    expect(result.success).toBe(true);

    // Verify first entry has the relationship
    const show1 = runCli(`show ${entry1.entry.id.slice(0, 8)}`);
    expect(show1.entry.related.length).toBeGreaterThan(0);
  });

  it('sets parent relationship with --as-parent flag', () => {
    const child = runCli('add "Child entry"');
    const parent = runCli('add "Parent entry" --type project');

    const result = runCli(`link ${child.entry.id.slice(0, 8)} ${parent.entry.id.slice(0, 8)} --as-parent`);

    expect(result.success).toBe(true);

    const showChild = runCli(`show ${child.entry.id.slice(0, 8)}`);
    expect(showChild.entry.parent).toBeDefined();
  });

  it('sets child relationship with --as-child flag', () => {
    const parent = runCli('add "Parent entry" --type project');
    const child = runCli('add "Child entry"');

    const result = runCli(`link ${parent.entry.id.slice(0, 8)} ${child.entry.id.slice(0, 8)} --as-child`);

    expect(result.success).toBe(true);

    const showChild = runCli(`show ${child.entry.id.slice(0, 8)}`);
    expect(showChild.entry.parent).toBeDefined();
  });

  it('returns error for non-existent first entry', () => {
    const entry = runCli('add "Valid entry"');

    const result = runCli(`link nonexistent ${entry.entry.id.slice(0, 8)}`);

    expect(result.success).toBe(false);
  });

  it('returns error for non-existent second entry', () => {
    const entry = runCli('add "Valid entry"');

    const result = runCli(`link ${entry.entry.id.slice(0, 8)} nonexistent`);

    expect(result.success).toBe(false);
  });

  it('can unlink entries with --unlink flag', () => {
    const entry1 = runCli('add "First"');
    const entry2 = runCli('add "Second"');

    // Link
    runCli(`link ${entry1.entry.id.slice(0, 8)} ${entry2.entry.id.slice(0, 8)}`);

    // Verify linked
    let show1 = runCli(`show ${entry1.entry.id.slice(0, 8)}`);
    expect(show1.entry.related.length).toBeGreaterThan(0);

    // Unlink
    runCli(`link ${entry1.entry.id.slice(0, 8)} ${entry2.entry.id.slice(0, 8)} --unlink`);

    // Verify unlinked
    show1 = runCli(`show ${entry1.entry.id.slice(0, 8)}`);
    expect(show1.entry.related.length).toBe(0);
  });
});
