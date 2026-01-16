/**
 * Tests for stats command
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const TEST_DIR = path.join(os.tmpdir(), `synap-test-stats-${Date.now()}`);
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

describe('stats command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('returns empty stats for empty database', () => {
    const result = runCli('stats');

    expect(result.success).toBe(true);
    expect(result.total).toBe(0);
  });

  it('counts total entries', () => {
    runCli('add "Entry 1"');
    runCli('add "Entry 2"');
    runCli('add "Entry 3"');

    const result = runCli('stats');

    expect(result.success).toBe(true);
    expect(result.total).toBe(3);
  });

  it('breaks down by type', () => {
    runCli('add "Idea" --type idea');
    runCli('add "Todo 1" --type todo');
    runCli('add "Todo 2" --type todo');
    runCli('add "Project" --type project');

    const result = runCli('stats');

    expect(result.byType.idea).toBe(1);
    expect(result.byType.todo).toBe(2);
    expect(result.byType.project).toBe(1);
  });

  it('breaks down by status', () => {
    const entry1 = runCli('add "Raw entry"');
    const entry2 = runCli('add "Active entry"');
    const entry3 = runCli('add "Done entry"');

    runCli(`set ${entry2.entry.id.slice(0, 8)} --status active`);
    runCli(`done ${entry3.entry.id.slice(0, 8)}`);

    const result = runCli('stats');

    expect(result.byStatus.raw).toBe(1);
    expect(result.byStatus.active).toBe(1);
    expect(result.byStatus.done).toBe(1);
  });

  it('counts high priority entries', () => {
    runCli('add "P1 task" --priority 1');
    runCli('add "P2 task" --priority 2');
    runCli('add "No priority"');

    const result = runCli('stats');

    expect(result.highPriority).toBe(1);
    expect(result.highPriorityActive).toBe(1);
  });

  it('distinguishes active vs non-active P1 entries', () => {
    // Create P1 entries with different statuses
    const p1Active = runCli('add "P1 active" --priority 1');
    const p1Done = runCli('add "P1 done" --priority 1');
    const p1Wip = runCli('add "P1 wip" --priority 1');

    // Mark one as done, one as wip
    runCli(`done ${p1Done.entry.id.slice(0, 8)}`);
    runCli(`start ${p1Wip.entry.id.slice(0, 8)}`);

    const result = runCli('stats');

    expect(result.highPriority).toBe(3);        // Total P1 count
    expect(result.highPriorityActive).toBe(1);  // Only raw+active P1
  });

  it('includes success field', () => {
    runCli('add "Entry"');

    const result = runCli('stats');

    expect(result.success).toBe(true);
    expect(result.total).toBeGreaterThan(0);
  });
});
