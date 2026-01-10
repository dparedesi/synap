/**
 * Tests for type shorthand commands (idea, project, feature, note, ref)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

// Create a unique test directory for each test run
const TEST_CONFIG_DIR = path.join(os.tmpdir(), `synap-test-shorthands-${Date.now()}`);

// Path to the CLI
const CLI_PATH = path.join(process.cwd(), 'src/cli.js');

describe('type shorthand commands', () => {
  beforeEach(() => {
    // Ensure clean test directory
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
    }
  });

  const runCli = (args) => {
    const result = execSync(`node ${CLI_PATH} ${args} --json`, {
      env: { ...process.env, SYNAP_DIR: TEST_CONFIG_DIR },
      encoding: 'utf8'
    });
    return JSON.parse(result);
  };

  it('synap idea creates entry with type idea', () => {
    const result = runCli('idea "Test idea content"');

    expect(result.success).toBe(true);
    expect(result.entry.type).toBe('idea');
    expect(result.entry.content).toBe('Test idea content');
  });

  it('synap project creates entry with type project', () => {
    const result = runCli('project "New project"');

    expect(result.success).toBe(true);
    expect(result.entry.type).toBe('project');
    expect(result.entry.content).toBe('New project');
  });

  it('synap feature creates entry with type feature', () => {
    const result = runCli('feature "Add dark mode"');

    expect(result.success).toBe(true);
    expect(result.entry.type).toBe('feature');
    expect(result.entry.content).toBe('Add dark mode');
  });

  it('synap note creates entry with type note', () => {
    const result = runCli('note "Meeting notes from today"');

    expect(result.success).toBe(true);
    expect(result.entry.type).toBe('note');
    expect(result.entry.content).toBe('Meeting notes from today');
  });

  it('synap ref creates entry with type reference', () => {
    const result = runCli('ref "https://example.com/docs"');

    expect(result.success).toBe(true);
    expect(result.entry.type).toBe('reference');
    expect(result.entry.content).toBe('https://example.com/docs');
  });

  it('shorthand commands support --priority', () => {
    const result = runCli('idea "High priority idea" --priority 1');

    expect(result.success).toBe(true);
    expect(result.entry.priority).toBe(1);
  });

  it('shorthand commands support --tags', () => {
    const result = runCli('project "Tagged project" --tags work,urgent');

    expect(result.success).toBe(true);
    expect(result.entry.tags).toContain('work');
    expect(result.entry.tags).toContain('urgent');
  });

  it('shorthand commands support --parent', () => {
    // First create a parent
    const parent = runCli('project "Parent project"');
    const parentId = parent.entry.id.slice(0, 8);

    // Then create a child
    const child = runCli(`feature "Child feature" --parent ${parentId}`);

    expect(child.success).toBe(true);
    // Parent is stored after lookup, which resolves partial ID to full ID
    expect(child.entry.parent).toContain(parentId);
  });

  it('shorthand commands use config.defaultTags', () => {
    // Create config with default tags
    const configPath = path.join(TEST_CONFIG_DIR, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ defaultTags: ['auto-tagged'] }));

    const result = runCli('idea "Auto tagged idea"');

    expect(result.success).toBe(true);
    expect(result.entry.tags).toContain('auto-tagged');
  });

  it('shorthand commands merge CLI tags with config.defaultTags', () => {
    // Create config with default tags
    const configPath = path.join(TEST_CONFIG_DIR, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ defaultTags: ['default'] }));

    const result = runCli('idea "Tagged idea" --tags custom');

    expect(result.success).toBe(true);
    expect(result.entry.tags).toContain('default');
    expect(result.entry.tags).toContain('custom');
  });

  it('all shorthand entries have status raw', () => {
    const idea = runCli('idea "test"');
    const project = runCli('project "test"');
    const feature = runCli('feature "test"');
    const note = runCli('note "test"');
    const ref = runCli('ref "test"');

    expect(idea.entry.status).toBe('raw');
    expect(project.entry.status).toBe('raw');
    expect(feature.entry.status).toBe('raw');
    expect(note.entry.status).toBe('raw');
    expect(ref.entry.status).toBe('raw');
  });
});
