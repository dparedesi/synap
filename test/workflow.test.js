/**
 * Tests for tree, focus, and review commands
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const TEST_DIR = path.join(os.tmpdir(), `xbrain-test-workflow-${Date.now()}`);
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

describe('tree command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('shows empty tree for no entries', () => {
    const result = runCli('tree');

    expect(result.success).toBe(true);
    expect(result.tree).toEqual([]);
  });

  it('shows flat list when no parent-child relationships', () => {
    runCli('add "Entry 1"');
    runCli('add "Entry 2"');

    const result = runCli('tree');

    expect(result.success).toBe(true);
    expect(result.tree.length).toBe(2);
    expect(result.tree[0].children).toEqual([]);
  });

  it('shows hierarchical structure with parent-child', () => {
    const parent = runCli('add "Parent project" --type project');
    const parentId = parent.entry.id.slice(0, 8);

    runCli(`add "Child 1" --type feature --parent ${parentId}`);
    runCli(`add "Child 2" --type todo --parent ${parentId}`);

    const result = runCli('tree');

    expect(result.success).toBe(true);
    expect(result.tree.length).toBe(1); // Only root
    expect(result.tree[0].children.length).toBe(2);
  });

  it('shows nested hierarchy (grandchildren)', () => {
    const project = runCli('add "Project" --type project');
    const projectId = project.entry.id.slice(0, 8);

    const feature = runCli(`add "Feature" --type feature --parent ${projectId}`);
    const featureId = feature.entry.id.slice(0, 8);

    runCli(`add "Todo" --type todo --parent ${featureId}`);

    const result = runCli('tree');

    expect(result.tree.length).toBe(1);
    expect(result.tree[0].children.length).toBe(1);
    expect(result.tree[0].children[0].children.length).toBe(1);
  });

  it('shows tree from specific entry ID', () => {
    const project = runCli('add "Project" --type project');
    const projectId = project.entry.id.slice(0, 8);

    runCli(`add "Child" --parent ${projectId}`);
    runCli('add "Unrelated entry"');

    const result = runCli(`tree ${projectId}`);

    expect(result.success).toBe(true);
    expect(result.tree.length).toBe(1);
    expect(result.tree[0].id).toBe(project.entry.id);
  });

  it('returns error for non-existent entry ID', () => {
    const result = runCli('tree nonexistent');

    expect(result.success).toBe(false);
    expect(result.code).toBe('ENTRY_NOT_FOUND');
  });
});

describe('focus command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('returns empty focus with no entries', () => {
    const result = runCli('focus');

    expect(result.success).toBe(true);
    expect(result.p1Todos).toEqual([]);
    expect(result.activeProjects).toEqual([]);
  });

  it('shows P1 todos', () => {
    runCli('add "P1 task" --type todo --priority 1');
    runCli('add "P2 task" --type todo --priority 2');
    runCli('add "P3 task" --type todo --priority 3');

    const result = runCli('focus');

    expect(result.p1Todos.length).toBe(1);
    expect(result.p1Todos[0].priority).toBe(1);
  });

  it('shows active projects', () => {
    const project = runCli('add "My Project" --type project');
    runCli(`set ${project.entry.id.slice(0, 8)} --status active`);

    const result = runCli('focus');

    expect(result.activeProjects.length).toBe(1);
  });

  it('excludes done todos from P1 list', () => {
    const todo = runCli('add "P1 task" --type todo --priority 1');
    runCli(`done ${todo.entry.id.slice(0, 8)}`);

    const result = runCli('focus');

    expect(result.p1Todos.length).toBe(0);
  });
});

describe('review command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('daily review shows stats and raw count', () => {
    runCli('add "Raw entry 1"');
    runCli('add "Raw entry 2"');

    const result = runCli('review daily');

    expect(result.success).toBe(true);
    expect(result.scope).toBe('daily');
    expect(result.rawCount).toBe(2);
    expect(result.stats).toBeDefined();
  });

  it('daily review shows P1 items', () => {
    runCli('add "P1 task" --type todo --priority 1');

    const result = runCli('review daily');

    expect(result.p1Items.length).toBe(1);
  });

  it('weekly review shows completed items', () => {
    const todo = runCli('add "Completed task" --type todo');
    runCli(`done ${todo.entry.id.slice(0, 8)}`);

    const result = runCli('review weekly');

    expect(result.success).toBe(true);
    expect(result.scope).toBe('weekly');
    expect(result.completedThisWeek.length).toBe(1);
  });

  it('defaults to daily scope', () => {
    const result = runCli('review');

    expect(result.scope).toBe('daily');
  });
});
