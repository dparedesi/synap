/**
 * Tests for brain tags command
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Create a unique test directory for each test run
const TEST_CONFIG_DIR = path.join(os.tmpdir(), `brain-dump-test-tags-${Date.now()}`);

// Set the environment variable before requiring storage
process.env.BRAIN_DUMP_DIR = TEST_CONFIG_DIR;

let storage;

describe('brain tags', () => {
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

    // Create test entries with various tags
    await storage.addEntry({ content: 'Task 1', type: 'todo', tags: ['work', 'urgent'] });
    await storage.addEntry({ content: 'Task 2', type: 'todo', tags: ['work', 'important'] });
    await storage.addEntry({ content: 'Task 3', type: 'todo', tags: ['personal'] });
    await storage.addEntry({ content: 'Idea 1', type: 'idea', tags: ['work', 'brainstorm'] });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
    }
  });

  describe('getAllTags', () => {
    it('returns all tags with counts', async () => {
      const tags = await storage.getAllTags();

      expect(tags.length).toBe(5);
      const workTag = tags.find(t => t.tag === 'work');
      expect(workTag.count).toBe(3);
    });

    it('sorts tags by count descending', async () => {
      const tags = await storage.getAllTags();

      expect(tags[0].tag).toBe('work');
      expect(tags[0].count).toBe(3);
    });

    it('returns empty array when no entries', async () => {
      // Clear entries
      const entriesFile = path.join(TEST_CONFIG_DIR, 'entries.json');
      fs.writeFileSync(entriesFile, JSON.stringify({ version: 1, entries: [] }));

      vi.resetModules();
      storage = await import('../src/storage.js');

      const tags = await storage.getAllTags();
      expect(tags).toEqual([]);
    });
  });

  describe('renameTag', () => {
    it('renames tag across all entries', async () => {
      const result = await storage.renameTag('work', 'job');

      expect(result.oldTag).toBe('work');
      expect(result.newTag).toBe('job');
      expect(result.entriesUpdated).toBe(3);

      // Verify the change persisted
      vi.resetModules();
      storage = await import('../src/storage.js');
      const tags = await storage.getAllTags();
      expect(tags.find(t => t.tag === 'work')).toBeUndefined();
      expect(tags.find(t => t.tag === 'job').count).toBe(3);
    });

    it('returns 0 when tag not found', async () => {
      const result = await storage.renameTag('nonexistent', 'new');

      expect(result.entriesUpdated).toBe(0);
    });

    it('updates entry timestamps', async () => {
      const beforeTime = new Date().toISOString();
      await new Promise(resolve => setTimeout(resolve, 10));

      await storage.renameTag('work', 'job');

      vi.resetModules();
      storage = await import('../src/storage.js');
      const entries = await storage.listEntries({ status: 'raw,active' });
      const updatedEntry = entries.entries.find(e => e.tags.includes('job'));
      expect(new Date(updatedEntry.updatedAt) > new Date(beforeTime)).toBe(true);
    });
  });
});
