/**
 * Tests for start and stop commands
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const TEST_DIR = path.join(os.tmpdir(), `synap-test-start-stop-${Date.now()}`);
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

describe('start command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('marks entry as wip and sets startedAt', () => {
    const added = runCli('add "Task to start"');
    const id = added.entry.id.slice(0, 8);

    const result = runCli(`start ${id}`);

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);

    const show = runCli(`show ${id}`);
    expect(show.entry.status).toBe('wip');
    expect(show.entry.startedAt).toBeDefined();
  });

  it('marks multiple entries as wip', () => {
    const entry1 = runCli('add "Task 1"');
    const entry2 = runCli('add "Task 2"');

    const result = runCli(`start ${entry1.entry.id.slice(0, 8)} ${entry2.entry.id.slice(0, 8)}`);

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });

  it('skips entries already in wip', () => {
    const added = runCli('add "Already started"');
    const id = added.entry.id.slice(0, 8);

    runCli(`start ${id}`);
    const result = runCli(`start ${id}`);

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
  });

  it('supports --dry-run', () => {
    const added = runCli('add "Dry run"');
    const id = added.entry.id.slice(0, 8);

    const result = runCli(`start ${id} --dry-run`);

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);

    const show = runCli(`show ${id}`);
    expect(show.entry.status).toBe('raw');
  });

  it('supports filtering by type and tags', () => {
    const target = runCli('add "Target" --type todo --tags work');
    const otherType = runCli('add "Other type" --type note --tags work');
    const otherTag = runCli('add "Other tag" --type todo');

    const result = runCli('start --type todo --tags work');

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);

    const targetShow = runCli(`show ${target.entry.id.slice(0, 8)}`);
    const otherTypeShow = runCli(`show ${otherType.entry.id.slice(0, 8)}`);
    const otherTagShow = runCli(`show ${otherTag.entry.id.slice(0, 8)}`);

    expect(targetShow.entry.status).toBe('wip');
    expect(otherTypeShow.entry.status).toBe('raw');
    expect(otherTagShow.entry.status).toBe('raw');
  });
});

describe('stop command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('marks wip entry as active and clears startedAt', () => {
    const added = runCli('add "Task to stop"');
    const id = added.entry.id.slice(0, 8);

    runCli(`start ${id}`);
    const result = runCli(`stop ${id}`);

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);

    const show = runCli(`show ${id}`);
    expect(show.entry.status).toBe('active');
    expect('startedAt' in show.entry).toBe(false);
  });

  it('stops all wip entries with --all', () => {
    const entry1 = runCli('add "Task 1"');
    const entry2 = runCli('add "Task 2"');

    runCli(`start ${entry1.entry.id.slice(0, 8)} ${entry2.entry.id.slice(0, 8)}`);
    const result = runCli('stop --all');

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });

  it('ignores non-wip entries', () => {
    const added = runCli('add "Not started"');
    const id = added.entry.id.slice(0, 8);

    const result = runCli(`stop ${id}`);

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
  });
});

describe('wip status listing', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('lists wip entries with --status wip', () => {
    const added = runCli('add "WIP item"');
    const id = added.entry.id.slice(0, 8);

    runCli(`start ${id}`);
    const result = runCli('list --status wip');

    expect(result.success).toBe(true);
    expect(result.entries.some(entry => entry.id === added.entry.id)).toBe(true);
  });
});
