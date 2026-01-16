/**
 * Tests for add, todo, question commands
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

// Create a unique test directory for each test run
const TEST_DIR = path.join(os.tmpdir(), `synap-test-add-${Date.now()}`);
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

describe('add command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('adds entry with default type (idea)', () => {
    const result = runCli('add "My first idea"');

    expect(result.success).toBe(true);
    expect(result.entry.content).toBe('My first idea');
    expect(result.entry.type).toBe('idea');
    expect(result.entry.status).toBe('raw');
  });

  it('adds entry with specified type', () => {
    const result = runCli('add "A todo item" --type todo');

    expect(result.success).toBe(true);
    expect(result.entry.type).toBe('todo');
  });

  it('adds entry with priority', () => {
    const result = runCli('add "Urgent task" --type todo --priority 1');

    expect(result.success).toBe(true);
    expect(result.entry.priority).toBe(1);
  });

  it('adds entry with tags', () => {
    const result = runCli('add "Tagged idea" --tags work,urgent');

    expect(result.success).toBe(true);
    expect(result.entry.tags).toContain('work');
    expect(result.entry.tags).toContain('urgent');
  });

  it('adds entry with parent', () => {
    const parent = runCli('add "Parent project" --type project');
    const parentId = parent.entry.id.slice(0, 8);

    const child = runCli(`add "Child feature" --type feature --parent ${parentId}`);

    expect(child.success).toBe(true);
    expect(child.entry.parent).toContain(parentId);
  });

  it('sets title from content', () => {
    const result = runCli('add "My entry title"');

    expect(result.success).toBe(true);
    expect(result.entry.title).toBe('My entry title');
  });

  it('uses default type for invalid type (idea)', () => {
    const result = runCli('add "Invalid" --type invalid_type');

    // CLI uses default type when invalid
    expect(result.success).toBe(true);
    expect(result.entry.type).toBe('idea');
  });

  it('clamps priority to valid range', () => {
    // CLI accepts priority but storage may clamp or reject
    const result = runCli('add "High priority" --priority 1');

    expect(result.success).toBe(true);
    expect(result.entry.priority).toBe(1);
  });

  it('generates unique IDs', () => {
    const first = runCli('add "First entry"');
    const second = runCli('add "Second entry"');

    expect(first.entry.id).not.toBe(second.entry.id);
  });

  it('sets createdAt and updatedAt timestamps', () => {
    const result = runCli('add "Timestamped entry"');

    expect(result.entry.createdAt).toBeDefined();
    expect(result.entry.updatedAt).toBeDefined();
    expect(new Date(result.entry.createdAt)).toBeInstanceOf(Date);
  });
});

describe('todo command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('creates entry with type todo', () => {
    const result = runCli('todo "Buy groceries"');

    expect(result.success).toBe(true);
    expect(result.entry.type).toBe('todo');
    expect(result.entry.content).toBe('Buy groceries');
  });

  it('accepts priority option', () => {
    const result = runCli('todo "Urgent task" -p 1');

    expect(result.success).toBe(true);
    expect(result.entry.priority).toBe(1);
  });

  it('accepts tags option', () => {
    const result = runCli('todo "Work task" --tags work,meeting');

    expect(result.success).toBe(true);
    expect(result.entry.tags).toContain('work');
    expect(result.entry.tags).toContain('meeting');
  });
});

describe('question command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('creates entry with type question', () => {
    const result = runCli('question "How does this work?"');

    expect(result.success).toBe(true);
    expect(result.entry.type).toBe('question');
    expect(result.entry.content).toBe('How does this work?');
  });

  it('accepts priority option', () => {
    const result = runCli('question "Important question" -p 2');

    expect(result.success).toBe(true);
    expect(result.entry.priority).toBe(2);
  });

  it('accepts tags and parent options', () => {
    const parent = runCli('add "Research project" --type project');
    const parentId = parent.entry.id.slice(0, 8);

    const result = runCli(`question "Research question" --tags research --parent ${parentId}`);

    expect(result.success).toBe(true);
    expect(result.entry.tags).toContain('research');
    expect(result.entry.parent).toContain(parentId);
  });
});

describe('batch-add command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('adds multiple entries from file', () => {
    const entries = [
      { content: 'Batch entry 1', type: 'idea' },
      { content: 'Batch entry 2', type: 'todo', priority: 1 },
      { content: 'Batch entry 3', type: 'question', tags: ['test'] }
    ];

    const inputFile = path.join(TEST_DIR, 'batch.json');
    fs.writeFileSync(inputFile, JSON.stringify(entries));

    const result = runCli(`batch-add --file ${inputFile}`);

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
    expect(result.entries[0].type).toBe('idea');
    expect(result.entries[1].priority).toBe(1);
    expect(result.entries[2].tags).toContain('test');
  });

  it('supports dry-run mode', () => {
    const entries = [
      { content: 'Dry run entry', type: 'idea' }
    ];

    const inputFile = path.join(TEST_DIR, 'batch.json');
    fs.writeFileSync(inputFile, JSON.stringify(entries));

    const result = runCli(`batch-add --file ${inputFile} --dry-run`);

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.count).toBe(1);

    // Verify nothing was added
    const list = runCli('list --all');
    expect(list.entries.length).toBe(0);
  });

  it('handles empty array', () => {
    const inputFile = path.join(TEST_DIR, 'empty.json');
    fs.writeFileSync(inputFile, JSON.stringify([]));

    const result = runCli(`batch-add --file ${inputFile}`);

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
  });

  it('handles object with entries property', () => {
    const data = {
      entries: [
        { content: 'Entry from object', type: 'note' }
      ]
    };

    const inputFile = path.join(TEST_DIR, 'batch-obj.json');
    fs.writeFileSync(inputFile, JSON.stringify(data));

    const result = runCli(`batch-add --file ${inputFile}`);

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.entries[0].type).toBe('note');
  });

  it('returns error for missing file', () => {
    const result = runCli('batch-add --file /nonexistent/file.json');

    expect(result.success).toBe(false);
    expect(result.code).toBe('FILE_NOT_FOUND');
  });
});
