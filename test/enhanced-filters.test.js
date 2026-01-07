/**
 * Tests for enhanced query filters
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Create a unique test directory for each test run
const TEST_CONFIG_DIR = path.join(os.tmpdir(), `brain-dump-test-filters-${Date.now()}`);

// Set the environment variable before requiring storage
process.env.BRAIN_DUMP_DIR = TEST_CONFIG_DIR;

let storage;

describe('enhanced query filters', () => {
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
    await storage.addEntry({ content: 'Work task 1', type: 'todo', tags: ['work', 'urgent'] });
    await storage.addEntry({ content: 'Work task 2', type: 'todo', tags: ['work'] });
    await storage.addEntry({ content: 'Personal task', type: 'todo', tags: ['personal'] });
    await storage.addEntry({ content: 'Work idea', type: 'idea', tags: ['work', 'brainstorm'] });
    await storage.addEntry({ content: 'Reference doc', type: 'reference', tags: ['docs'] });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
    }
  });

  describe('--any-tags (OR logic)', () => {
    it('matches entries with ANY of the specified tags', async () => {
      const result = await storage.listEntries({
        anyTags: ['personal', 'docs'],
        status: 'raw,active'
      });

      expect(result.entries.length).toBe(2);
      const contents = result.entries.map(e => e.content);
      expect(contents).toContain('Personal task');
      expect(contents).toContain('Reference doc');
    });

    it('returns empty when no tags match', async () => {
      const result = await storage.listEntries({
        anyTags: ['nonexistent'],
        status: 'raw,active'
      });

      expect(result.entries.length).toBe(0);
    });
  });

  describe('--not-type', () => {
    it('excludes entries of specified type', async () => {
      const result = await storage.listEntries({
        notType: 'reference',
        status: 'raw,active'
      });

      expect(result.entries.length).toBe(4);
      expect(result.entries.every(e => e.type !== 'reference')).toBe(true);
    });

    it('can be combined with type filter', async () => {
      // This is unusual but should work - type + notType
      const result = await storage.listEntries({
        type: 'todo',
        status: 'raw,active'
      });

      expect(result.entries.length).toBe(3);
      expect(result.entries.every(e => e.type === 'todo')).toBe(true);
    });
  });

  describe('--not-tags', () => {
    it('excludes entries with specified tags', async () => {
      const result = await storage.listEntries({
        notTags: ['work'],
        status: 'raw,active'
      });

      expect(result.entries.length).toBe(2);
      const contents = result.entries.map(e => e.content);
      expect(contents).toContain('Personal task');
      expect(contents).toContain('Reference doc');
    });

    it('excludes entries with any of the specified tags', async () => {
      const result = await storage.listEntries({
        notTags: ['work', 'docs'],
        status: 'raw,active'
      });

      expect(result.entries.length).toBe(1);
      expect(result.entries[0].content).toBe('Personal task');
    });
  });

  describe('--before', () => {
    it('returns entries created before the duration', async () => {
      // Create an old entry by manually setting createdAt
      const entriesFile = path.join(TEST_CONFIG_DIR, 'entries.json');
      const data = JSON.parse(fs.readFileSync(entriesFile, 'utf8'));

      // Make one entry 10 days old
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      data.entries[0].createdAt = oldDate;
      fs.writeFileSync(entriesFile, JSON.stringify(data, null, 2));

      // Reload storage module
      vi.resetModules();
      storage = await import('../src/storage.js');

      const result = await storage.listEntries({
        before: '7d',
        status: 'raw,active'
      });

      expect(result.entries.length).toBe(1);
      expect(result.entries[0].content).toBe('Work task 1');
    });
  });

  describe('--between', () => {
    it('returns entries within date range', async () => {
      const entriesFile = path.join(TEST_CONFIG_DIR, 'entries.json');
      const data = JSON.parse(fs.readFileSync(entriesFile, 'utf8'));

      // Set specific dates
      const jan15 = new Date('2025-01-15T12:00:00Z').toISOString();
      const jan20 = new Date('2025-01-20T12:00:00Z').toISOString();
      const jan25 = new Date('2025-01-25T12:00:00Z').toISOString();

      data.entries[0].createdAt = jan15;
      data.entries[1].createdAt = jan20;
      data.entries[2].createdAt = jan25;
      data.entries[3].createdAt = new Date('2025-02-01T12:00:00Z').toISOString();
      data.entries[4].createdAt = new Date('2025-02-10T12:00:00Z').toISOString();
      fs.writeFileSync(entriesFile, JSON.stringify(data, null, 2));

      vi.resetModules();
      storage = await import('../src/storage.js');

      const result = await storage.listEntries({
        between: { start: '2025-01-14', end: '2025-01-26' },
        status: 'raw,active'
      });

      expect(result.entries.length).toBe(3);
    });
  });

  describe('filter combinations', () => {
    it('combines multiple filters correctly', async () => {
      const result = await storage.listEntries({
        type: 'todo',
        notTags: ['urgent'],
        status: 'raw,active'
      });

      expect(result.entries.length).toBe(2);
      const contents = result.entries.map(e => e.content);
      expect(contents).toContain('Work task 2');
      expect(contents).toContain('Personal task');
    });

    it('combines anyTags with notType', async () => {
      const result = await storage.listEntries({
        anyTags: ['work'],
        notType: 'idea',
        status: 'raw,active'
      });

      expect(result.entries.length).toBe(2);
      expect(result.entries.every(e => e.type !== 'idea')).toBe(true);
    });
  });

  describe('searchEntries with notType', () => {
    it('excludes type in search results', async () => {
      const result = await storage.searchEntries('work', {
        notType: 'idea'
      });

      expect(result.entries.length).toBe(2);
      expect(result.entries.every(e => e.type !== 'idea')).toBe(true);
    });
  });
});
