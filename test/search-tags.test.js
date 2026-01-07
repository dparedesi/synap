/**
 * Tests for search functionality including tags
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Create a unique test directory for each test run
const TEST_CONFIG_DIR = path.join(os.tmpdir(), `brain-dump-test-search-${Date.now()}`);

// Set the environment variable before requiring storage
process.env.BRAIN_DUMP_DIR = TEST_CONFIG_DIR;

let storage;

describe('searchEntries with tags', () => {
  beforeEach(async () => {
    // Fresh import for each test
    vi.resetModules();
    process.env.BRAIN_DUMP_DIR = TEST_CONFIG_DIR;
    storage = await import('../src/storage.js');

    // Ensure clean test directory
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });

    // Create test entries
    await storage.addEntry({ content: 'Learn TypeScript basics', type: 'todo', tags: ['learning', 'programming'] });
    await storage.addEntry({ content: 'Review pull request', type: 'todo', tags: ['work', 'code-review'] });
    await storage.addEntry({ content: 'Buy groceries', type: 'todo', tags: ['personal', 'errands'] });
    await storage.addEntry({ content: 'Research ML frameworks', type: 'idea', tags: ['learning', 'ai'] });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
    }
  });

  it('matches entries by tag', async () => {
    const results = await storage.searchEntries('learning');

    expect(results.entries.length).toBe(2);
    expect(results.entries.map(e => e.content)).toContain('Learn TypeScript basics');
    expect(results.entries.map(e => e.content)).toContain('Research ML frameworks');
  });

  it('tag search is case-insensitive', async () => {
    const results = await storage.searchEntries('LEARNING');

    expect(results.entries.length).toBe(2);
  });

  it('partial tag match works', async () => {
    const results = await storage.searchEntries('code');

    expect(results.entries.length).toBe(1);
    expect(results.entries[0].content).toBe('Review pull request');
  });

  it('still matches content', async () => {
    const results = await storage.searchEntries('TypeScript');

    expect(results.entries.length).toBe(1);
    expect(results.entries[0].content).toBe('Learn TypeScript basics');
  });

  it('still matches title', async () => {
    await storage.addEntry({ content: 'Full content here', title: 'Special Title', type: 'note', tags: [] });

    const results = await storage.searchEntries('Special');

    expect(results.entries.length).toBe(1);
    expect(results.entries[0].title).toBe('Special Title');
  });

  it('matches when tag but not content/title matches', async () => {
    const results = await storage.searchEntries('errands');

    expect(results.entries.length).toBe(1);
    expect(results.entries[0].content).toBe('Buy groceries');
  });

  it('returns empty array when no matches', async () => {
    const results = await storage.searchEntries('nonexistent');

    expect(results.entries.length).toBe(0);
  });

  it('matches across multiple fields', async () => {
    // 'ai' tag should match the ML entry
    const results = await storage.searchEntries('ai');

    expect(results.entries.length).toBe(1);
    expect(results.entries[0].content).toContain('ML frameworks');
  });
});
