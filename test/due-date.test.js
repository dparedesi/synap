/**
 * Tests for due date support
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const CLI_PATH = path.join(process.cwd(), 'src/cli.js');
const CLI_DIR = path.join(os.tmpdir(), `synap-test-due-cli-${Date.now()}`);
const STORAGE_DIR = path.join(os.tmpdir(), `synap-test-due-storage-${Date.now()}`);
const DAY_MS = 24 * 60 * 60 * 1000;

let storage;

function runCli(args) {
  try {
    const result = execSync(`node ${CLI_PATH} ${args} --json`, {
      encoding: 'utf8',
      env: { ...process.env, SYNAP_DIR: CLI_DIR }
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

describe('due date CLI', () => {
  beforeEach(() => {
    fs.mkdirSync(CLI_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(CLI_DIR, { recursive: true, force: true });
  });

  it('accepts ISO due dates on add', () => {
    const result = runCli('add "ISO task" --due 2025-01-20');

    expect(result.success).toBe(true);
    expect(result.entry.due).toBeDefined();

    const due = new Date(result.entry.due);
    expect(due.getFullYear()).toBe(2025);
    expect(due.getMonth()).toBe(0);
    expect(due.getDate()).toBe(20);
  });

  it('accepts relative due dates on add', () => {
    const result = runCli('add "Relative task" --due 3d');

    expect(result.success).toBe(true);
    const due = new Date(result.entry.due);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const diffDays = Math.round((startOfDue - startOfToday) / DAY_MS);
    expect(diffDays).toBe(3);
  });

  it('accepts keyword due dates on add', () => {
    const result = runCli('add "Tomorrow task" --due tomorrow');

    expect(result.success).toBe(true);
    const due = new Date(result.entry.due);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const diffDays = Math.round((startOfDue - startOfToday) / DAY_MS);
    expect(diffDays).toBe(1);
  });

  it('rejects invalid due dates', () => {
    const result = runCli('add "Bad date" --due not-a-date');

    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_DUE_DATE');
  });

  it('does not add due when omitted', () => {
    const result = runCli('add "No due date"');

    expect(result.success).toBe(true);
    expect('due' in result.entry).toBe(false);
  });

  it('lists entries without due dates with --no-due', () => {
    runCli('add "Has due" --due 2025-01-10');
    runCli('add "No due"');

    const result = runCli('list --no-due');
    const contents = result.entries.map(e => e.content);

    expect(contents).toContain('No due');
    expect(contents).not.toContain('Has due');
  });

  it('sets and clears due dates', () => {
    const added = runCli('add "Update due"');
    const id = added.entry.id.slice(0, 8);

    const updated = runCli(`set ${id} --due 2025-01-12`);
    expect(updated.entry.due).toBeDefined();

    const cleared = runCli(`set ${id} --clear-due`);
    expect('due' in cleared.entry).toBe(false);
  });

  it('rejects invalid due dates in set', () => {
    const added = runCli('add "Bad update"');
    const id = added.entry.id.slice(0, 8);

    const result = runCli(`set ${id} --due not-a-date`);

    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_DUE_DATE');
  });

  it('includes overdue entries in focus and deduplicates P1', () => {
    const overdue = runCli('todo "Overdue item" --due yesterday');
    const p1Overdue = runCli('todo "P1 overdue" --priority 1 --due yesterday');

    const result = runCli('focus');

    expect(result.overdueItems.length).toBe(1);
    expect(result.overdueItems[0].id).toBe(overdue.entry.id);
    expect(result.p1Todos.some(item => item.id === p1Overdue.entry.id)).toBe(true);
  });
});

describe('due date filters and sort (storage)', () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env.SYNAP_DIR = STORAGE_DIR;
    if (fs.existsSync(STORAGE_DIR)) {
      fs.rmSync(STORAGE_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    storage = await import('../src/storage.js');
  });

  afterEach(() => {
    if (fs.existsSync(STORAGE_DIR)) {
      fs.rmSync(STORAGE_DIR, { recursive: true, force: true });
    }
  });

  it('filters by due-before', async () => {
    await storage.addEntry({ content: 'Early', type: 'todo', due: '2025-01-10' });
    await storage.addEntry({ content: 'Late', type: 'todo', due: '2025-01-20' });

    const result = await storage.listEntries({
      dueBefore: '2025-01-15',
      status: 'raw,active',
      includeDone: true
    });

    const contents = result.entries.map(e => e.content);
    expect(contents).toContain('Early');
    expect(contents).not.toContain('Late');
  });

  it('filters by due-after', async () => {
    await storage.addEntry({ content: 'Early', type: 'todo', due: '2025-01-10' });
    await storage.addEntry({ content: 'Late', type: 'todo', due: '2025-01-20' });

    const result = await storage.listEntries({
      dueAfter: '2025-01-15',
      status: 'raw,active',
      includeDone: true
    });

    const contents = result.entries.map(e => e.content);
    expect(contents).toContain('Late');
    expect(contents).not.toContain('Early');
  });

  it('filters entries with due dates', async () => {
    await storage.addEntry({ content: 'With due', type: 'todo', due: '2025-01-10' });
    await storage.addEntry({ content: 'No due', type: 'todo' });

    const result = await storage.listEntries({
      hasDue: true,
      status: 'raw,active',
      includeDone: true
    });

    const contents = result.entries.map(e => e.content);
    expect(contents).toContain('With due');
    expect(contents).not.toContain('No due');
  });

  it('filters entries without due dates', async () => {
    await storage.addEntry({ content: 'With due', type: 'todo', due: '2025-01-10' });
    await storage.addEntry({ content: 'No due', type: 'todo' });

    const result = await storage.listEntries({
      hasDue: false,
      status: 'raw,active',
      includeDone: true
    });

    const contents = result.entries.map(e => e.content);
    expect(contents).toContain('No due');
    expect(contents).not.toContain('With due');
  });

  it('filters overdue entries and excludes done', async () => {
    const overdueRaw = await storage.addEntry({ content: 'Overdue raw', type: 'todo', due: '2000-01-01' });
    const overdueDone = await storage.addEntry({ content: 'Overdue done', type: 'todo', due: '2000-01-02' });
    await storage.updateEntry(overdueDone.id, { status: 'done' });

    const result = await storage.listEntries({
      overdue: true,
      status: 'raw,active,done',
      includeDone: true
    });

    const contents = result.entries.map(e => e.content);
    expect(contents).toContain('Overdue raw');
    expect(contents).not.toContain('Overdue done');
    expect(result.entries.some(e => e.id === overdueRaw.id)).toBe(true);
  });

  it('sorts by due date with undated entries last', async () => {
    await storage.addEntry({ content: 'Later', type: 'todo', due: '2025-01-20' });
    await storage.addEntry({ content: 'Sooner', type: 'todo', due: '2025-01-05' });
    await storage.addEntry({ content: 'No due', type: 'todo' });

    const result = await storage.listEntries({
      sort: 'due',
      status: 'raw,active',
      includeDone: true
    });

    const contents = result.entries.map(e => e.content);
    expect(contents[0]).toBe('Sooner');
    expect(contents[1]).toBe('Later');
    expect(contents[2]).toBe('No due');
  });
});
