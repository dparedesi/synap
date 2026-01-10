/**
 * Tests for export and import commands
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const TEST_DIR = path.join(os.tmpdir(), `synap-test-export-${Date.now()}`);
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

// Helper to run CLI without --json flag
function runCliRaw(args) {
  try {
    return execSync(`node ${CLI_PATH} ${args}`, {
      encoding: 'utf8',
      env: { ...process.env, SYNAP_DIR: TEST_DIR }
    });
  } catch (error) {
    return error.stdout || error.message;
  }
}

describe('export command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('exports entries', () => {
    runCli('add "Entry 1" --type idea');
    runCli('add "Entry 2" --type todo');

    // Export to file
    const outputFile = path.join(TEST_DIR, 'export.json');
    runCliRaw(`export --file ${outputFile}`);

    expect(fs.existsSync(outputFile)).toBe(true);

    const exported = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    expect(exported.entries.length).toBe(2);
  });

  it('filters by type', () => {
    runCli('add "Idea" --type idea');
    runCli('add "Todo" --type todo');

    const outputFile = path.join(TEST_DIR, 'export-todo.json');
    runCliRaw(`export --file ${outputFile} --type todo`);

    const exported = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    expect(exported.entries.length).toBe(1);
    expect(exported.entries[0].type).toBe('todo');
  });

  it('filters by status', () => {
    const entry = runCli('add "Entry"');
    runCli('add "Active entry"');
    runCli(`set ${entry.entry.id.slice(0, 8)} --status active`);

    const outputFile = path.join(TEST_DIR, 'export-active.json');
    runCliRaw(`export --file ${outputFile} --status active`);

    const exported = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    expect(exported.entries.length).toBe(1);
    expect(exported.entries[0].status).toBe('active');
  });
});

describe('import command', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('imports entries from file', () => {
    // Create export file
    const entries = {
      version: '1.0',
      entries: [
        {
          id: 'test-id-1',
          content: 'Imported entry 1',
          type: 'idea',
          status: 'raw',
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'test-id-2',
          content: 'Imported entry 2',
          type: 'todo',
          status: 'active',
          tags: ['work'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    };

    const importFile = path.join(TEST_DIR, 'import.json');
    fs.writeFileSync(importFile, JSON.stringify(entries));

    const result = runCli(`import ${importFile}`);

    expect(result.success).toBe(true);
    expect(result.added).toBe(2);

    // Verify entries exist
    const list = runCli('list --all');
    expect(list.entries.length).toBe(2);
  });

  it('supports dry-run mode', () => {
    const entries = {
      version: '1.0',
      entries: [
        {
          id: 'test-id-1',
          content: 'Dry run entry',
          type: 'idea',
          status: 'raw',
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    };

    const importFile = path.join(TEST_DIR, 'import.json');
    fs.writeFileSync(importFile, JSON.stringify(entries));

    const result = runCli(`import ${importFile} --dry-run`);

    expect(result.success).toBe(true);

    // Verify no entries were actually imported
    const list = runCli('list --all');
    expect(list.entries.length).toBe(0);
  });
});
