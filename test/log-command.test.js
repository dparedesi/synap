/**
 * Tests for log command
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const TEST_DIR = path.join(os.tmpdir(), `synap-test-log-${Date.now()}`);
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

describe('log command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('creates child note under parent', () => {
    const parent = runCli('add "Parent project" --type project');
    const parentId = parent.entry.id.slice(0, 8);

    const result = runCli(`log ${parentId} "Started work"`);

    expect(result.success).toBe(true);
    expect(result.entry.parent).toBe(parent.entry.id);
    expect(result.entry.type).toBe('note');
  });

  it('includes timestamp in content format', () => {
    const parent = runCli('add "Parent"');
    const parentId = parent.entry.id.slice(0, 8);

    const result = runCli(`log ${parentId} "First update"`);

    expect(result.entry.content).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] First update$/);
  });

  it('extracts title from message', () => {
    const parent = runCli('add "Parent"');
    const parentId = parent.entry.id.slice(0, 8);

    const result = runCli(`log ${parentId} "Short message"`);

    expect(result.entry.title).toBe('Short message');
  });

  it('truncates long titles to 40 chars', () => {
    const parent = runCli('add "Parent"');
    const parentId = parent.entry.id.slice(0, 8);
    const message = 'This is a long log entry that should be truncated';

    const result = runCli(`log ${parentId} "${message}"`);

    expect(result.entry.title.length).toBe(40);
    expect(result.entry.title).toBe(`${message.slice(0, 37)}...`);
  });

  it('fails with ENTRY_NOT_FOUND when parent is missing', () => {
    const result = runCli('log missingparent "Nope"');

    expect(result.success).toBe(false);
    expect(result.code).toBe('ENTRY_NOT_FOUND');
  });

  it('supports partial parent IDs', () => {
    const parent = runCli('add "Parent"');
    const parentId = parent.entry.id.slice(0, 8);

    const result = runCli(`log ${parentId} "Partial"`);

    expect(result.success).toBe(true);
    expect(result.entry.parent).toBe(parent.entry.id);
  });

  it('copies tags with --inherit-tags', () => {
    const parent = runCli('add "Tagged parent" --tags work,alpha');
    const parentId = parent.entry.id.slice(0, 8);

    const result = runCli(`log ${parentId} "Inherit" --inherit-tags`);

    expect(result.entry.tags).toContain('work');
    expect(result.entry.tags).toContain('alpha');
  });

  it('does not copy tags without --inherit-tags', () => {
    const parent = runCli('add "Tagged parent" --tags work,alpha');
    const parentId = parent.entry.id.slice(0, 8);

    const result = runCli(`log ${parentId} "No inherit"`);

    expect(result.entry.tags).not.toContain('work');
    expect(result.entry.tags).not.toContain('alpha');
  });

  it('returns parent info in JSON response', () => {
    const parent = runCli('add "Parent"');
    const parentId = parent.entry.id.slice(0, 8);

    const result = runCli(`log ${parentId} "Check parent"`);

    expect(result.parent).toBeDefined();
    expect(result.parent.id).toBe(parent.entry.id);
  });

  it('shows log entry in tree view', () => {
    const parent = runCli('add "Parent" --type project');
    const parentId = parent.entry.id.slice(0, 8);

    const logged = runCli(`log ${parentId} "Tree check"`);
    const tree = runCli(`tree ${parentId}`);

    expect(tree.success).toBe(true);
    expect(tree.tree.length).toBe(1);
    expect(tree.tree[0].children.some(child => child.id === logged.entry.id)).toBe(true);
  });
});
