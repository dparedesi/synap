/**
 * Tests for synap git sync commands (save, pull, sync)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawnSync } from 'child_process';

// Create a unique test directory for each test run
const TEST_CONFIG_DIR = path.join(os.tmpdir(), `synap-test-git-sync-${Date.now()}`);
const TEST_DATA_DIR = path.join(TEST_CONFIG_DIR, 'data');
const TEST_REMOTE_DIR = path.join(TEST_CONFIG_DIR, 'remote.git');

// Path to the CLI
const CLI_PATH = path.join(process.cwd(), 'src/cli.js');

describe('synap git sync commands', () => {
  beforeEach(() => {
    // Ensure clean test directory
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

    // Create a bare remote repo
    fs.mkdirSync(TEST_REMOTE_DIR, { recursive: true });
    execSync('git init --bare', { cwd: TEST_REMOTE_DIR, stdio: 'pipe' });

    // Initialize git repo in data dir
    execSync('git init', { cwd: TEST_DATA_DIR, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: TEST_DATA_DIR, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: TEST_DATA_DIR, stdio: 'pipe' });

    // Add remote
    execSync(`git remote add origin "${TEST_REMOTE_DIR}"`, { cwd: TEST_DATA_DIR, stdio: 'pipe' });

    // Create initial entries.json
    fs.writeFileSync(path.join(TEST_DATA_DIR, 'entries.json'), '[]');
    execSync('git add .', { cwd: TEST_DATA_DIR, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: TEST_DATA_DIR, stdio: 'pipe' });

    // Get the current branch name (could be main or master depending on git version)
    const branchName = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: TEST_DATA_DIR,
      encoding: 'utf8'
    }).trim();

    // Push to remote and set upstream
    execSync(`git push -u origin ${branchName}`, { cwd: TEST_DATA_DIR, stdio: 'pipe' });

    // Set up config to use our test data dir
    const configDir = TEST_CONFIG_DIR;
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ dataDir: TEST_DATA_DIR })
    );
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
    }
  });

  const runCli = (args, expectError = false) => {
    try {
      const result = execSync(`node ${CLI_PATH} ${args}`, {
        env: { ...process.env, SYNAP_DIR: TEST_CONFIG_DIR },
        encoding: 'utf8'
      });
      return { success: true, output: result };
    } catch (err) {
      if (expectError) {
        return { success: false, output: err.stdout || err.stderr || err.message };
      }
      throw err;
    }
  };

  const runCliJson = (args, expectError = false) => {
    const result = runCli(`${args} --json`, expectError);
    try {
      return JSON.parse(result.output);
    } catch {
      return { parseError: true, raw: result.output };
    }
  };

  describe('pull command', () => {
    it('fails with DIRTY_WORKING_TREE when there are uncommitted changes', () => {
      // Create uncommitted change
      fs.writeFileSync(path.join(TEST_DATA_DIR, 'entries.json'), '[{"test": true}]');

      const result = runCliJson('pull', true);

      expect(result.success).toBe(false);
      expect(result.code).toBe('DIRTY_WORKING_TREE');
      expect(result.hint).toContain('synap save');
    });

    it('succeeds with --force even with uncommitted changes', () => {
      // Create uncommitted change
      fs.writeFileSync(path.join(TEST_DATA_DIR, 'entries.json'), '[{"test": true}]');

      const result = runCliJson('pull --force');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Already up to date');
    });

    it('succeeds when working tree is clean', () => {
      const result = runCliJson('pull');

      expect(result.success).toBe(true);
      expect(result.updated).toBe(false);
    });
  });

  describe('save command', () => {
    it('shows preview with --dry-run', () => {
      // Create change
      fs.writeFileSync(path.join(TEST_DATA_DIR, 'entries.json'), '[{"id": "test"}]');

      const result = runCliJson('save --dry-run');

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.message).toContain('synap sync');
      expect(result.changes).toBeDefined();
    });

    it('commits but does not push with --no-push', () => {
      // Create change
      fs.writeFileSync(path.join(TEST_DATA_DIR, 'entries.json'), '[{"id": "test123"}]');

      const result = runCliJson('save --no-push "Test commit"');

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(false);
      expect(result.pushError).toContain('--no-push');
    });

    it('does not execute shell injection in commit message', () => {
      // Create change
      fs.writeFileSync(path.join(TEST_DATA_DIR, 'entries.json'), '[{"id": "injection-test"}]');

      // Test with a message containing shell-like characters that could be dangerous
      // We use a literal string that doesn't get interpreted by the test shell
      // by using single quotes which prevent shell expansion in the test runner
      const result = runCliJson("save --no-push 'test $(date) message'");

      expect(result.success).toBe(true);
      // The message should contain the literal $(date), not the executed result
      expect(result.message).toBe('test $(date) message');

      // Verify the commit message was literal, not executed
      const log = execSync('git log -1 --pretty=%B', {
        cwd: TEST_DATA_DIR,
        encoding: 'utf8'
      });
      expect(log.trim()).toBe('test $(date) message');
    });

    it('handles backtick injection safely', () => {
      // Create change
      fs.writeFileSync(path.join(TEST_DATA_DIR, 'entries.json'), '[{"id": "backtick-test"}]');

      // Use single quotes to prevent shell expansion in the test
      const result = runCliJson("save --no-push 'test `date` message'");

      expect(result.success).toBe(true);
      expect(result.message).toBe('test `date` message');
    });

    it('pushes successfully when remote is configured', () => {
      // Create change
      fs.writeFileSync(path.join(TEST_DATA_DIR, 'entries.json'), '[{"id": "push-test"}]');

      const result = runCliJson('save "Test push"');

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(true);
    });

    it('reports nothing to commit when no changes', () => {
      const result = runCliJson('save "Test"');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Nothing to commit');
    });
  });

  describe('sync command', () => {
    it('shows preview with --dry-run', () => {
      // Create change
      fs.writeFileSync(path.join(TEST_DATA_DIR, 'entries.json'), '[{"id": "sync-dry"}]');

      const result = runCliJson('sync --dry-run');

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
    });

    it('commits but does not push with --no-push', () => {
      // Create change
      fs.writeFileSync(path.join(TEST_DATA_DIR, 'entries.json'), '[{"id": "sync-no-push"}]');

      const result = runCliJson('sync --no-push "Sync test"');

      expect(result.success).toBe(true);
      expect(result.committed).toBe(true);
      expect(result.pushed).toBe(false);
      expect(result.pushSkipped).toBe(true);
    });

    it('pulls then commits in sequence', () => {
      // Create change
      fs.writeFileSync(path.join(TEST_DATA_DIR, 'entries.json'), '[{"id": "sync-full"}]');

      const result = runCliJson('sync --no-push "Full sync"');

      expect(result.pulled).toBe(true);
      expect(result.committed).toBe(true);
      expect(result.commitMessage).toBe('Full sync');
    });

    it('does not execute shell injection in commit message', () => {
      // Create change
      fs.writeFileSync(path.join(TEST_DATA_DIR, 'entries.json'), '[{"id": "sync-inject"}]');

      // Use single quotes to prevent shell expansion in the test
      const result = runCliJson("sync --no-push 'test $(date) sync'");

      expect(result.success).toBe(true);
      expect(result.commitMessage).toBe('test $(date) sync');

      // Verify literal commit message
      const log = execSync('git log -1 --pretty=%B', {
        cwd: TEST_DATA_DIR,
        encoding: 'utf8'
      });
      expect(log.trim()).toBe('test $(date) sync');
    });
  });

  describe('error codes', () => {
    it('returns NOT_GIT_REPO when data dir is not a git repo', () => {
      // Remove .git directory
      fs.rmSync(path.join(TEST_DATA_DIR, '.git'), { recursive: true });

      const saveResult = runCliJson('save "Test"', true);
      expect(saveResult.code).toBe('NOT_GIT_REPO');

      const pullResult = runCliJson('pull', true);
      expect(pullResult.code).toBe('NOT_GIT_REPO');

      const syncResult = runCliJson('sync', true);
      expect(syncResult.code).toBe('NOT_GIT_REPO');
    });

    it('returns NO_REMOTE when no remote is configured', () => {
      // Remove the remote
      execSync('git remote remove origin', { cwd: TEST_DATA_DIR, stdio: 'pipe' });

      // Create change
      fs.writeFileSync(path.join(TEST_DATA_DIR, 'entries.json'), '[{"id": "no-remote-test"}]');

      const result = runCliJson('save "Test"');

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(false);
      expect(result.pushErrorCode).toBe('NO_REMOTE');
    });
  });
});
