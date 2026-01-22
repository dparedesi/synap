#!/usr/bin/env node

/**
 * synap CLI
 * A CLI for externalizing your working memory
 */

const { program } = require('commander');
const fs = require('fs');
const pkg = require('../package.json');

// Storage and utility modules
const storage = require('./storage');
const deletionLog = require('./deletion-log');
const preferences = require('./preferences');

async function main() {
  // Dynamic imports for ESM-only packages
  const chalk = (await import('chalk')).default;
  const boxen = (await import('boxen')).default;

  // Common requires used across commands
  const { execSync, spawnSync } = require('child_process');
  const os = require('os');
  const path = require('path');

  // Check for updates (non-blocking)
  const updateNotifier = (await import('update-notifier')).default;
  updateNotifier({ pkg }).notify();

  program
    .name('synap')
    .description('A CLI for externalizing your working memory')
    .version(pkg.version);

  // Load configuration
  const config = storage.loadConfig();

  // Helper: Merge config tags with CLI tags
  const mergeTags = (cliTagsString) => {
    const cliTags = cliTagsString ? cliTagsString.split(',').map(t => t.trim()) : [];
    return [...new Set([...(config.defaultTags || []), ...cliTags])];
  };

  // Helper: Format time based on config.dateFormat
  const formatTime = (dateStr) => {
    const date = new Date(dateStr);

    if (config.dateFormat === 'relative') {
      const now = new Date();
      const diffMs = now - date;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffSec < 60) return 'just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHour < 24) return `${diffHour}h ago`;
      if (diffDay < 7) return `${diffDay}d ago`;
      return date.toLocaleDateString();
    }

    if (config.dateFormat === 'absolute') {
      return date.toISOString();
    }

    // 'locale' or default
    return date.toLocaleString();
  };

  // Helper: Format due date for display
  const formatDueDate = (dateStr) => {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'invalid date';

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDue = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfDue - startOfToday) / (24 * 60 * 60 * 1000));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'tomorrow';
    if (diffDays === -1) return 'yesterday';
    if (diffDays > 1 && diffDays <= 7) return `in ${diffDays} days`;
    if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
    return date.toLocaleDateString();
  };

  const formatDuration = (ms) => {
    const minutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `(${days}d ${hours % 24}h)`;
    if (hours > 0) return `(${hours}h ${minutes % 60}m)`;
    if (minutes > 0) return `(${minutes}m)`;
    return '(<1m)';
  };

  // Helper: Check if data directory is a git repo
  const isGitRepo = () => {
    const path = require('path');
    const gitDir = path.join(storage.getDataDir(), '.git');
    return fs.existsSync(gitDir);
  };

  // Helper: Check if working tree has uncommitted changes
  const isDirty = () => {
    const dataDir = storage.getDataDir();
    try {
      execSync('git diff --quiet', { cwd: dataDir, stdio: 'pipe' });
      execSync('git diff --cached --quiet', { cwd: dataDir, stdio: 'pipe' });
      return false;
    } catch {
      return true;
    }
  };

  // Helper: Check if there are merge conflicts (UU, AA, DD, etc.)
  const hasConflicts = () => {
    const dataDir = storage.getDataDir();
    try {
      const status = execSync('git status --porcelain', { cwd: dataDir, encoding: 'utf-8' });
      const conflictPatterns = /^(UU|AA|DD|AU|UA|DU|UD) /m;
      return conflictPatterns.test(status);
    } catch {
      return false;
    }
  };

  // Helper: Get list of conflicted files
  const getConflictFiles = () => {
    const dataDir = storage.getDataDir();
    try {
      const status = execSync('git status --porcelain', { cwd: dataDir, encoding: 'utf-8' });
      return status.split('\n')
        .filter(line => /^(UU|AA|DD|AU|UA|DU|UD) /.test(line))
        .map(line => line.slice(3).trim());
    } catch {
      return [];
    }
  };

  // Helper: Check if git remote is configured
  const hasRemote = () => {
    const dataDir = storage.getDataDir();
    try {
      const remotes = execSync('git remote', { cwd: dataDir, encoding: 'utf-8' });
      return remotes.trim().length > 0;
    } catch {
      return false;
    }
  };

  // Helper: Get diff stats for preview without staging/unstaging
  const getDiffStats = () => {
    const dataDir = storage.getDataDir();
    try {
      const status = execSync('git status --porcelain', { cwd: dataDir, encoding: 'utf-8' });
      if (!status.trim()) return '';

      const unstaged = execSync('git diff --stat', { cwd: dataDir, encoding: 'utf-8' });
      const untracked = status.split('\n').filter(l => l.startsWith('??')).length;

      let result = unstaged.trim();
      if (untracked > 0) {
        result += `\n ${untracked} untracked file(s)`;
      }
      return result;
    } catch {
      return '';
    }
  };

  // ============================================
  // CAPTURE COMMANDS
  // ============================================

  program
    .command('add <content...>')
    .description(`Add a new entry (default: ${config.defaultType || 'idea'})`)
    .option('-t, --type <type>', 'Entry type (idea, project, feature, todo, question, reference, note)', config.defaultType || 'idea')
    .option('--title <title>', 'Short title for the entry')
    .option('-p, --priority <priority>', 'Priority level (1=high, 2=medium, 3=low)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--parent <id>', 'Parent entry ID')
    .option('--due <date>', 'Due date (YYYY-MM-DD, 3d/1w, or keywords: today, tomorrow, next monday)')
    .option('-s, --status <status>', 'Status (raw, active, wip, someday)')
    .option('--json', 'Output as JSON')
    .action(async (contentParts, options) => {
      const content = contentParts.join(' ');
      const tags = mergeTags(options.tags);

      try {
        const entry = await storage.addEntry({
          content,
          title: options.title,
          type: options.type,
          priority: options.priority ? parseInt(options.priority, 10) : undefined,
          tags,
          parent: options.parent,
          due: options.due,
          status: options.status,
          source: 'cli'
        });

        if (options.json) {
          console.log(JSON.stringify({ success: true, entry }, null, 2));
        } else {
          const shortId = entry.id.slice(0, 8);
          const priorityBadge = entry.priority ? chalk.yellow(`[P${entry.priority}] `) : '';
          const dueBadge = entry.due ? chalk.magenta(` [due: ${formatDueDate(entry.due)}]`) : '';
          console.log(chalk.green(`Added ${entry.type} ${shortId}: `) + priorityBadge + `"${content.slice(0, 50)}${content.length > 50 ? '...' : ''}"` + dueBadge);
        }
      } catch (err) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: err.message, code: 'INVALID_DUE_DATE' }));
        } else {
          console.error(chalk.red(err.message));
        }
        process.exit(1);
      }
    });

  program
    .command('todo <content...>')
    .description('Add a new todo (shorthand for add --type todo)')
    .option('-p, --priority <priority>', 'Priority level (1=high, 2=medium, 3=low)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--parent <id>', 'Parent entry ID')
    .option('--due <date>', 'Due date (YYYY-MM-DD, 3d/1w, or keywords: today, tomorrow, next monday)')
    .option('-s, --status <status>', 'Status (raw, active, wip, someday)')
    .option('--json', 'Output as JSON')
    .action(async (contentParts, options) => {
      const content = contentParts.join(' ');
      const tags = mergeTags(options.tags);

      try {
        const entry = await storage.addEntry({
          content,
          type: 'todo',
          priority: options.priority ? parseInt(options.priority, 10) : undefined,
          tags,
          parent: options.parent,
          due: options.due,
          status: options.status,
          source: 'cli'
        });

        if (options.json) {
          console.log(JSON.stringify({ success: true, entry }, null, 2));
        } else {
          const shortId = entry.id.slice(0, 8);
          const priorityBadge = entry.priority ? chalk.yellow(`[P${entry.priority}] `) : '';
          const dueBadge = entry.due ? chalk.magenta(` [due: ${formatDueDate(entry.due)}]`) : '';
          console.log(chalk.green(`Added todo ${shortId}: `) + priorityBadge + `"${content.slice(0, 50)}${content.length > 50 ? '...' : ''}"` + dueBadge);
        }
      } catch (err) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: err.message, code: 'INVALID_DUE_DATE' }));
        } else {
          console.error(chalk.red(err.message));
        }
        process.exit(1);
      }
    });

  program
    .command('question <content...>')
    .description('Add a new question (shorthand for add --type question)')
    .option('-p, --priority <priority>', 'Priority level (1=high, 2=medium, 3=low)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--parent <id>', 'Parent entry ID')
    .option('--due <date>', 'Due date (YYYY-MM-DD, 3d/1w, or keywords: today, tomorrow, next monday)')
    .option('-s, --status <status>', 'Status (raw, active, wip, someday)')
    .option('--json', 'Output as JSON')
    .action(async (contentParts, options) => {
      const content = contentParts.join(' ');
      const tags = mergeTags(options.tags);

      try {
        const entry = await storage.addEntry({
          content,
          type: 'question',
          priority: options.priority ? parseInt(options.priority, 10) : undefined,
          tags,
          parent: options.parent,
          due: options.due,
          status: options.status,
          source: 'cli'
        });

        if (options.json) {
          console.log(JSON.stringify({ success: true, entry }, null, 2));
        } else {
          const shortId = entry.id.slice(0, 8);
          const priorityBadge = entry.priority ? chalk.yellow(`[P${entry.priority}] `) : '';
          const dueBadge = entry.due ? chalk.magenta(` [due: ${formatDueDate(entry.due)}]`) : '';
          console.log(chalk.green(`Added question ${shortId}: `) + priorityBadge + `"${content.slice(0, 50)}${content.length > 50 ? '...' : ''}"` + dueBadge);
        }
      } catch (err) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: err.message, code: 'INVALID_DUE_DATE' }));
        } else {
          console.error(chalk.red(err.message));
        }
        process.exit(1);
      }
    });

  // Helper function for type shorthand commands
  const createTypeShorthand = (typeName, displayName = typeName) => {
    return async (contentParts, options) => {
      const content = contentParts.join(' ');
      const tags = mergeTags(options.tags);

      try {
        const entry = await storage.addEntry({
          content,
          type: typeName,
          priority: options.priority ? parseInt(options.priority, 10) : undefined,
          tags,
          parent: options.parent,
          due: options.due,
          status: options.status,
          source: 'cli'
        });

        if (options.json) {
          console.log(JSON.stringify({ success: true, entry }, null, 2));
        } else {
          const shortId = entry.id.slice(0, 8);
          const priorityBadge = entry.priority ? chalk.yellow(`[P${entry.priority}] `) : '';
          const dueBadge = entry.due ? chalk.magenta(` [due: ${formatDueDate(entry.due)}]`) : '';
          console.log(chalk.green(`Added ${displayName} ${shortId}: `) + priorityBadge + `"${content.slice(0, 50)}${content.length > 50 ? '...' : ''}"` + dueBadge);
        }
      } catch (err) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: err.message, code: 'INVALID_DUE_DATE' }));
        } else {
          console.error(chalk.red(err.message));
        }
        process.exit(1);
      }
    };
  };

  program
    .command('idea <content...>')
    .description('Add a new idea (shorthand for add --type idea)')
    .option('-p, --priority <priority>', 'Priority level (1=high, 2=medium, 3=low)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--parent <id>', 'Parent entry ID')
    .option('--due <date>', 'Due date (YYYY-MM-DD, 3d/1w, or keywords: today, tomorrow, next monday)')
    .option('-s, --status <status>', 'Status (raw, active, wip, someday)')
    .option('--json', 'Output as JSON')
    .action(createTypeShorthand('idea'));

  program
    .command('project <content...>')
    .description('Add a new project (shorthand for add --type project)')
    .option('-p, --priority <priority>', 'Priority level (1=high, 2=medium, 3=low)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--parent <id>', 'Parent entry ID')
    .option('--due <date>', 'Due date (YYYY-MM-DD, 3d/1w, or keywords: today, tomorrow, next monday)')
    .option('-s, --status <status>', 'Status (raw, active, wip, someday)')
    .option('--json', 'Output as JSON')
    .action(createTypeShorthand('project'));

  program
    .command('feature <content...>')
    .description('Add a new feature (shorthand for add --type feature)')
    .option('-p, --priority <priority>', 'Priority level (1=high, 2=medium, 3=low)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--parent <id>', 'Parent entry ID')
    .option('--due <date>', 'Due date (YYYY-MM-DD, 3d/1w, or keywords: today, tomorrow, next monday)')
    .option('-s, --status <status>', 'Status (raw, active, wip, someday)')
    .option('--json', 'Output as JSON')
    .action(createTypeShorthand('feature'));

  program
    .command('note <content...>')
    .description('Add a new note (shorthand for add --type note)')
    .option('-p, --priority <priority>', 'Priority level (1=high, 2=medium, 3=low)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--parent <id>', 'Parent entry ID')
    .option('--due <date>', 'Due date (YYYY-MM-DD, 3d/1w, or keywords: today, tomorrow, next monday)')
    .option('-s, --status <status>', 'Status (raw, active, wip, someday)')
    .option('--json', 'Output as JSON')
    .action(createTypeShorthand('note'));

  program
    .command('ref <content...>')
    .description('Add a new reference (shorthand for add --type reference)')
    .option('-p, --priority <priority>', 'Priority level (1=high, 2=medium, 3=low)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--parent <id>', 'Parent entry ID')
    .option('--due <date>', 'Due date (YYYY-MM-DD, 3d/1w, or keywords: today, tomorrow, next monday)')
    .option('-s, --status <status>', 'Status (raw, active, wip, someday)')
    .option('--json', 'Output as JSON')
    .action(createTypeShorthand('reference', 'reference'));

  program
    .command('log <id> <message...>')
    .description('Add a timestamped log entry under a parent')
    .option('--inherit-tags', 'Copy tags from parent entry')
    .option('--json', 'Output as JSON')
    .action(async (id, messageParts, options) => {
      const message = messageParts.join(' ');

      const parent = await storage.getEntry(id);
      if (!parent) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: `Parent entry not found: ${id}`, code: 'ENTRY_NOT_FOUND' }));
        } else {
          console.error(chalk.red(`Parent entry not found: ${id}`));
        }
        process.exit(1);
      }

      const now = new Date();
      const timestamp = now.toISOString().slice(0, 16).replace('T', ' ');
      const content = `[${timestamp}] ${message}`;
      const title = message.length <= 40 ? message : message.slice(0, 37) + '...';

      let tags = [];
      if (options.inheritTags && parent.tags && parent.tags.length > 0) {
        tags = [...parent.tags];
      }

      try {
        const entry = await storage.addEntry({
          content,
          title,
          type: 'note',
          tags,
          parent: parent.id,
          source: 'cli'
        });

        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            entry,
            parent: { id: parent.id, title: parent.title || parent.content.slice(0, 40) }
          }, null, 2));
        } else {
          const shortId = entry.id.slice(0, 8);
          const parentShortId = parent.id.slice(0, 8);
          console.log(chalk.green(`Logged ${shortId} under ${parentShortId}:`));
          console.log(`  Parent: ${chalk.cyan(parent.title || parent.content.slice(0, 30))}`);
          console.log(`  Log: ${message.slice(0, 60)}${message.length > 60 ? '...' : ''}`);
        }
      } catch (err) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: err.message }));
        } else {
          console.error(chalk.red(err.message));
        }
        process.exit(1);
      }
    });

  program
    .command('batch-add')
    .description('Add multiple entries from JSON stdin or file')
    .option('--file <path>', 'Read entries from JSON file')
    .option('--dry-run', 'Preview what would be added')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      let entriesData;

      if (options.file) {
        // Read from file
        if (!fs.existsSync(options.file)) {
          if (options.json) {
            console.log(JSON.stringify({ success: false, error: `File not found: ${options.file}`, code: 'FILE_NOT_FOUND' }));
          } else {
            console.error(chalk.red(`File not found: ${options.file}`));
          }
          process.exit(1);
        }
        const content = fs.readFileSync(options.file, 'utf8');
        entriesData = JSON.parse(content);
      } else {
        // Read from stdin
        const chunks = [];
        process.stdin.setEncoding('utf8');
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        const input = chunks.join('');
        if (!input.trim()) {
          if (options.json) {
            console.log(JSON.stringify({ success: false, error: 'No input provided. Pipe JSON array to stdin or use --file', code: 'NO_INPUT' }));
          } else {
            console.error(chalk.red('No input provided. Pipe JSON array to stdin or use --file'));
          }
          process.exit(1);
        }
        entriesData = JSON.parse(input);
      }

      // Normalize to array
      if (!Array.isArray(entriesData)) {
        entriesData = entriesData.entries || [entriesData];
      }

      if (entriesData.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ success: true, count: 0, entries: [] }));
        } else {
          console.log(chalk.gray('No entries to add'));
        }
        return;
      }

      // Merge config tags with each entry's tags
      entriesData = entriesData.map(e => ({
        ...e,
        tags: [...new Set([...(config.defaultTags || []), ...(e.tags || [])])],
        source: e.source || 'cli'
      }));

      if (options.dryRun) {
        if (options.json) {
          console.log(JSON.stringify({ success: true, dryRun: true, count: entriesData.length, entries: entriesData }));
        } else {
          console.log(chalk.yellow(`Would add ${entriesData.length} entries:`));
          for (const entry of entriesData) {
            console.log(`  [${entry.type || 'idea'}] ${entry.content?.slice(0, 50)}${entry.content?.length > 50 ? '...' : ''}`);
          }
        }
        return;
      }

      try {
        const created = await storage.addEntries(entriesData);

        if (options.json) {
          console.log(JSON.stringify({ success: true, count: created.length, entries: created }, null, 2));
        } else {
          console.log(chalk.green(`Added ${created.length} entries`));
          for (const entry of created) {
            const shortId = entry.id.slice(0, 8);
            console.log(`  ${chalk.blue(shortId)} [${entry.type}] ${entry.title || entry.content.slice(0, 40)}`);
          }
        }
      } catch (err) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: err.message }));
        } else {
          console.error(chalk.red(err.message));
        }
        process.exit(1);
      }
    });

  // ============================================
  // QUERY COMMANDS
  // ============================================

  program
    .command('list')
    .description('List entries')
    .option('-t, --type <type>', 'Filter by type')
    .option('-s, --status <status>', 'Filter by status (default: raw,active)')
    .option('--tags <tags>', 'Filter by tags (comma-separated, AND logic)')
    .option('--any-tags <tags>', 'Filter by tags (comma-separated, OR logic)')
    .option('--not-type <type>', 'Exclude entries of this type')
    .option('--not-tags <tags>', 'Exclude entries with these tags')
    .option('-p, --priority <priority>', 'Filter by priority')
    .option('--parent <id>', 'Filter by parent')
    .option('--orphans', 'Only entries without parent')
    .option('--since <duration>', 'Created after (e.g., 7d, 24h)')
    .option('--before <duration>', 'Created before (e.g., 7d, 24h)')
    .option('--between <range>', 'Date range: start,end (e.g., 2025-01-01,2025-01-31)')
    .option('--due-before <date>', 'Due before date (YYYY-MM-DD or 3d/1w)')
    .option('--due-after <date>', 'Due after date (YYYY-MM-DD or 3d/1w)')
    .option('--overdue', 'Only overdue entries')
    .option('--has-due', 'Only entries with due dates')
    .option('--no-due', 'Only entries without due dates')
    .option('-a, --all', 'Include all statuses except archived')
    .option('--done', 'Include done entries')
    .option('--archived', 'Show only archived entries')
    .option('-n, --limit <n>', 'Max entries to return', '50')
    .option('--sort <field>', 'Sort by: created, updated, priority, due', 'created')
    .option('--reverse', 'Reverse sort order')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      // Build query from options
      const query = {
        type: options.type,
        status: options.archived ? 'archived' : (options.status || (options.all ? null : 'raw,active')),
        tags: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
        anyTags: options.anyTags ? options.anyTags.split(',').map(t => t.trim()) : undefined,
        notType: options.notType,
        notTags: options.notTags ? options.notTags.split(',').map(t => t.trim()) : undefined,
        priority: options.priority ? parseInt(options.priority, 10) : undefined,
        parent: options.parent,
        orphans: options.orphans,
        since: options.since,
        before: options.before,
        between: options.between ? (() => {
          const [start, end] = options.between.split(',');
          return { start: start.trim(), end: end.trim() };
        })() : undefined,
        dueBefore: options.dueBefore,
        dueAfter: options.dueAfter,
        overdue: options.overdue,
        hasDue: options.hasDue ? true : (options.due === false ? false : undefined),
        includeDone: options.done || options.all,
        limit: parseInt(options.limit, 10),
        sort: options.sort,
        reverse: options.reverse
      };

      const result = await storage.listEntries(query);

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          entries: result.entries,
          total: result.total,
          returned: result.entries.length,
          query
        }, null, 2));
      } else {
        if (result.entries.length === 0) {
          console.log(chalk.gray('No entries found.'));
          if (!options.all && !options.archived) {
            console.log(chalk.gray('Tip: Use --all to see all entries, or synap add "your thought" to create one.'));
          }
          return;
        }

        console.log(chalk.bold(`Entries (${result.entries.length} showing, ${result.total} total)\n`));

        // Group by type
        const grouped = {};
        for (const entry of result.entries) {
          if (!grouped[entry.type]) grouped[entry.type] = [];
          grouped[entry.type].push(entry);
        }

        for (const [type, entries] of Object.entries(grouped)) {
          console.log(chalk.bold.cyan(`${type.toUpperCase()}S (${entries.length})`));
          for (const entry of entries) {
            const shortId = entry.id.slice(0, 8);
            const priorityBadge = entry.priority ? chalk.yellow(`[P${entry.priority}]`) : '    ';
            const tags = entry.tags.length > 0 ? chalk.gray(' #' + entry.tags.join(' #')) : '';
            const title = entry.title || entry.content.slice(0, 40);
            const truncated = title.length > 40 ? '...' : '';
            const timeStr = chalk.gray(formatTime(entry.createdAt));
            let dueStr = '';
            if (entry.due) {
              const isOverdue = new Date(entry.due) < new Date() && entry.status !== 'done';
              const dueText = formatDueDate(entry.due);
              dueStr = isOverdue ? chalk.red(` [OVERDUE: ${dueText}]`) : chalk.magenta(` [due: ${dueText}]`);
            }
            console.log(`  ${chalk.blue(shortId)}  ${priorityBadge} ${title}${truncated}${tags}${dueStr} ${timeStr}`);
          }
          console.log('');
        }

        if (result.entries.length < result.total) {
          console.log(chalk.gray(`Use --limit ${result.total} to see all entries`));
        }
      }
    });

  program
    .command('show <id>')
    .description('Show full entry details')
    .option('--with-children', 'Include child entries')
    .option('--with-related', 'Include related entries')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      const entry = await storage.getEntry(id);

      if (!entry) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: `Entry not found: ${id}`, code: 'ENTRY_NOT_FOUND' }));
        } else {
          console.error(chalk.red(`Entry not found: ${id}`));
        }
        process.exit(1);
      }

      let children = [];
      let related = [];

      if (options.withChildren) {
        children = await storage.getChildren(entry.id);
      }
      if (options.withRelated && entry.related) {
        related = await storage.getEntriesByIds(entry.related);
      }

      if (options.json) {
        console.log(JSON.stringify({ success: true, entry, children, related }, null, 2));
      } else {
        console.log(chalk.bold(`Entry ${entry.id}\n`));
        console.log(`  ${chalk.gray('Type:')}     ${entry.type}`);
        console.log(`  ${chalk.gray('Status:')}   ${entry.status}`);
        if (entry.priority) {
          console.log(`  ${chalk.gray('Priority:')} ${chalk.yellow(`P${entry.priority}`)} (${entry.priority === 1 ? 'high' : entry.priority === 2 ? 'medium' : 'low'})`);
        }
        if (entry.tags.length > 0) {
          console.log(`  ${chalk.gray('Tags:')}     ${entry.tags.map(t => chalk.cyan('#' + t)).join(' ')}`);
        }
        console.log('');
        if (entry.title) {
          console.log(`  ${chalk.bold('Title:')} ${entry.title}\n`);
        }
        console.log(`  ${chalk.bold('Content:')}`);
        console.log(`  ${entry.content.split('\n').join('\n  ')}\n`);

        console.log(`  ${chalk.gray('Created:')}  ${formatTime(entry.createdAt)}`);
        console.log(`  ${chalk.gray('Updated:')}  ${formatTime(entry.updatedAt)}`);
        if (entry.due) {
          const isOverdue = new Date(entry.due) < new Date() && entry.status !== 'done';
          const dueColor = isOverdue ? chalk.red : chalk.magenta;
          const overdueLabel = isOverdue ? ' (OVERDUE)' : '';
          console.log(`  ${chalk.gray('Due:')}      ${dueColor(formatDueDate(entry.due))}${overdueLabel}`);
        }
        if (entry.source) {
          console.log(`  ${chalk.gray('Source:')}   ${entry.source}`);
        }
        if (entry.parent) {
          console.log(`  ${chalk.gray('Parent:')}   ${entry.parent.slice(0, 8)}`);
        }

        if (children.length > 0) {
          console.log(`\n  ${chalk.bold('Children:')}`);
          for (const child of children) {
            console.log(`    ${child.id.slice(0, 8)} (${child.type}): ${child.title || child.content.slice(0, 30)}...`);
          }
        }

        if (related.length > 0) {
          console.log(`\n  ${chalk.bold('Related:')}`);
          for (const rel of related) {
            console.log(`    ${rel.id.slice(0, 8)} (${rel.type}): ${rel.title || rel.content.slice(0, 30)}...`);
          }
        }
      }
    });

  program
    .command('search <query...>')
    .description('Full-text search across entries')
    .option('-t, --type <type>', 'Filter by type')
    .option('-s, --status <status>', 'Filter by status')
    .option('--not-type <type>', 'Exclude entries of this type')
    .option('--since <duration>', 'Only search recent entries')
    .option('--include-archived', 'Include archived entries in search')
    .option('-n, --limit <n>', 'Max results', '20')
    .option('--json', 'Output as JSON')
    .action(async (queryParts, options) => {
      const query = queryParts.join(' ');
      const result = await storage.searchEntries(query, {
        type: options.type,
        status: options.status,
        notType: options.notType,
        since: options.since,
        includeArchived: options.includeArchived,
        limit: parseInt(options.limit, 10)
      });

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          query,
          entries: result.entries,
          total: result.total
        }, null, 2));
      } else {
        if (result.entries.length === 0) {
          console.log(chalk.gray(`No entries found matching "${query}"`));
          return;
        }

        console.log(chalk.bold(`Search results for "${query}" (${result.entries.length} found)\n`));

        for (const entry of result.entries) {
          const shortId = entry.id.slice(0, 8);
          const priorityBadge = entry.priority ? chalk.yellow(`[P${entry.priority}]`) : '    ';
          const tags = entry.tags.length > 0 ? chalk.gray(' #' + entry.tags.join(' #')) : '';
          const title = entry.title || entry.content.slice(0, 40);
          console.log(`  ${chalk.blue(shortId)}  ${chalk.cyan(entry.type.padEnd(10))} ${priorityBadge} ${title}${tags}`);
        }
      }
    });

  // ============================================
  // MODIFY COMMANDS
  // ============================================

  program
    .command('edit <id>')
    .description('Edit entry content')
    .option('--content <text>', 'Replace content (non-interactive)')
    .option('--title <title>', 'Update title')
    .option('--append <text>', 'Append to content')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      const entry = await storage.getEntry(id);

      if (!entry) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: `Entry not found: ${id}`, code: 'ENTRY_NOT_FOUND' }));
        } else {
          console.error(chalk.red(`Entry not found: ${id}`));
        }
        process.exit(1);
      }

      const updates = {};
      if (options.content) {
        updates.content = options.content;
      }
      if (options.title) {
        updates.title = options.title;
      }
      if (options.append) {
        updates.content = entry.content + '\n' + options.append;
      }

      if (Object.keys(updates).length === 0) {
        // Interactive edit - open $EDITOR
        const tmpFile = path.join(os.tmpdir(), `synap-${entry.id.slice(0, 8)}.txt`);
        fs.writeFileSync(tmpFile, entry.content);

        const editor = config.editor || process.env.EDITOR || 'vi';
        try {
          execSync(`${editor} "${tmpFile}"`, { stdio: 'inherit' });
          updates.content = fs.readFileSync(tmpFile, 'utf8');
          fs.unlinkSync(tmpFile);
        } catch (err) {
          console.error(chalk.red('Editor failed or was cancelled'));
          process.exit(1);
        }
      }

      const updated = await storage.updateEntry(entry.id, updates);

      if (options.json) {
        console.log(JSON.stringify({ success: true, entry: updated }, null, 2));
      } else {
        console.log(chalk.green(`Updated entry ${entry.id.slice(0, 8)}`));
      }
    });

  program
    .command('set <id>')
    .description('Update entry metadata')
    .option('-t, --type <type>', 'Change type')
    .option('-s, --status <status>', 'Change status')
    .option('-p, --priority <priority>', 'Set priority')
    .option('--clear-priority', 'Remove priority')
    .option('--tags <tags>', 'Replace all tags')
    .option('--add-tags <tags>', 'Add tags')
    .option('--remove-tags <tags>', 'Remove tags')
    .option('--parent <id>', 'Set parent')
    .option('--clear-parent', 'Remove parent')
    .option('--due <date>', 'Set due date')
    .option('--clear-due', 'Remove due date')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      const entry = await storage.getEntry(id);

      if (!entry) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: `Entry not found: ${id}`, code: 'ENTRY_NOT_FOUND' }));
        } else {
          console.error(chalk.red(`Entry not found: ${id}`));
        }
        process.exit(1);
      }

      const updates = {};
      if (options.type) updates.type = options.type;
      if (options.status) updates.status = options.status;
      if (options.priority) updates.priority = parseInt(options.priority, 10);
      if (options.clearPriority) updates.priority = null;
      if (options.tags) updates.tags = options.tags.split(',').map(t => t.trim());
      if (options.addTags) {
        const newTags = options.addTags.split(',').map(t => t.trim());
        updates.tags = [...new Set([...entry.tags, ...newTags])];
      }
      if (options.removeTags) {
        const removeTags = options.removeTags.split(',').map(t => t.trim());
        updates.tags = entry.tags.filter(t => !removeTags.includes(t));
      }
      if (options.parent) updates.parent = options.parent;
      if (options.clearParent) updates.parent = null;
      if (options.due) {
        const dueDate = storage.parseDate(options.due);
        if (!dueDate) {
          if (options.json) {
            console.log(JSON.stringify({ success: false, error: `Invalid due date: ${options.due}`, code: 'INVALID_DUE_DATE' }));
          } else {
            console.error(chalk.red(`Invalid due date: ${options.due}`));
          }
          process.exit(1);
        }
        updates.due = dueDate;
      }
      if (options.clearDue) updates.due = null;

      const updated = await storage.updateEntry(entry.id, updates);

      if (options.json) {
        console.log(JSON.stringify({ success: true, entry: updated }, null, 2));
      } else {
        console.log(chalk.green(`Updated entry ${entry.id.slice(0, 8)}`));
      }
    });

  program
    .command('link <id1> <id2>')
    .description('Create relationship between entries')
    .option('--as-parent', 'Set id2 as parent of id1')
    .option('--as-child', 'Set id2 as child of id1')
    .option('--unlink', 'Remove relationship')
    .option('--json', 'Output as JSON')
    .action(async (id1, id2, options) => {
      const entry1 = await storage.getEntry(id1);
      const entry2 = await storage.getEntry(id2);

      if (!entry1 || !entry2) {
        const missing = !entry1 ? id1 : id2;
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: `Entry not found: ${missing}`, code: 'ENTRY_NOT_FOUND' }));
        } else {
          console.error(chalk.red(`Entry not found: ${missing}`));
        }
        process.exit(1);
      }

      if (options.asParent) {
        await storage.updateEntry(entry1.id, { parent: entry2.id });
      } else if (options.asChild) {
        await storage.updateEntry(entry2.id, { parent: entry1.id });
      } else if (options.unlink) {
        // Remove from related
        const newRelated = (entry1.related || []).filter(r => !r.startsWith(id2));
        await storage.updateEntry(entry1.id, { related: newRelated });
      } else {
        // Add to related
        const newRelated = [...new Set([...(entry1.related || []), entry2.id])];
        await storage.updateEntry(entry1.id, { related: newRelated });
      }

      if (options.json) {
        console.log(JSON.stringify({ success: true }, null, 2));
      } else {
        if (options.asParent) {
          console.log(chalk.green(`Set ${id2.slice(0, 8)} as parent of ${id1.slice(0, 8)}`));
        } else if (options.asChild) {
          console.log(chalk.green(`Set ${id2.slice(0, 8)} as child of ${id1.slice(0, 8)}`));
        } else if (options.unlink) {
          console.log(chalk.green(`Unlinked ${id1.slice(0, 8)} and ${id2.slice(0, 8)}`));
        } else {
          console.log(chalk.green(`Linked ${id1.slice(0, 8)} and ${id2.slice(0, 8)}`));
        }
      }
    });

  // ============================================
  // BULK COMMANDS
  // ============================================

  program
    .command('done [ids...]')
    .description('Mark entries as done')
    .option('-t, --type <type>', 'Filter by type')
    .option('--tags <tags>', 'Filter by tags')
    .option('--dry-run', 'Show what would be marked done')
    .option('--confirm', 'Skip confirmation prompt')
    .option('--json', 'Output as JSON')
    .action(async (ids, options) => {
      let entries;

      if (ids.length > 0) {
        entries = await storage.getEntriesByIds(ids);
      } else if (options.type || options.tags) {
        const result = await storage.listEntries({
          type: options.type,
          tags: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
          status: 'raw,active',
          limit: 1000
        });
        entries = result.entries;
      } else {
        console.error(chalk.red('Please provide entry IDs or filter options (--type, --tags)'));
        process.exit(1);
      }

      if (entries.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ success: true, count: 0, entries: [] }));
        } else {
          console.log(chalk.gray('No entries matched'));
        }
        return;
      }

      if (options.dryRun) {
        if (options.json) {
          console.log(JSON.stringify({ success: true, dryRun: true, count: entries.length, entries }));
        } else {
          console.log(chalk.yellow(`Would mark ${entries.length} entries as done:`));
          for (const entry of entries) {
            console.log(`  ${entry.id.slice(0, 8)} (${entry.type}): ${entry.title || entry.content.slice(0, 40)}...`);
          }
        }
        return;
      }

      // Mark done
      for (const entry of entries) {
        await storage.updateEntry(entry.id, { status: 'done' });
      }

      if (options.json) {
        console.log(JSON.stringify({ success: true, count: entries.length }));
      } else {
        console.log(chalk.green(`Marked ${entries.length} entries as done`));
      }
    });

  program
    .command('start [ids...]')
    .description('Start working on entries (mark as WIP)')
    .option('-t, --type <type>', 'Filter by type')
    .option('--tags <tags>', 'Filter by tags')
    .option('--dry-run', 'Show what would be started')
    .option('--json', 'Output as JSON')
    .action(async (ids, options) => {
      let entries;

      if (ids.length > 0) {
        entries = await storage.getEntriesByIds(ids);
      } else if (options.type || options.tags) {
        const result = await storage.listEntries({
          type: options.type,
          tags: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
          status: 'raw,active',
          limit: 1000
        });
        entries = result.entries;
      } else {
        console.error(chalk.red('Please provide entry IDs or filter options (--type, --tags)'));
        process.exit(1);
      }

      entries = entries.filter(e => e.status !== 'wip');

      if (entries.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ success: true, count: 0, entries: [] }));
        } else {
          console.log(chalk.gray('No entries to start (already WIP or not found)'));
        }
        return;
      }

      if (options.dryRun) {
        if (options.json) {
          console.log(JSON.stringify({ success: true, dryRun: true, count: entries.length, entries }));
        } else {
          console.log(chalk.yellow(`Would start ${entries.length} entries:`));
          for (const entry of entries) {
            console.log(`  ${entry.id.slice(0, 8)} (${entry.type}): ${entry.title || entry.content.slice(0, 40)}...`);
          }
        }
        return;
      }

      const startedAt = new Date().toISOString();
      const updatedEntries = [];
      for (const entry of entries) {
        const updated = await storage.updateEntry(entry.id, { status: 'wip', startedAt });
        updatedEntries.push(updated);
      }

      if (options.json) {
        console.log(JSON.stringify({ success: true, count: updatedEntries.length, entries: updatedEntries }));
      } else {
        console.log(chalk.green(`Started ${updatedEntries.length} entries (marked as WIP)`));
        for (const entry of updatedEntries) {
          console.log(`  ${chalk.blue(entry.id.slice(0, 8))} ${entry.title || entry.content.slice(0, 40)}`);
        }
      }
    });

  program
    .command('stop [ids...]')
    .description('Stop working on entries (remove WIP status)')
    .option('--all', 'Stop all WIP entries')
    .option('--dry-run', 'Show what would be stopped')
    .option('--json', 'Output as JSON')
    .action(async (ids, options) => {
      let entries;

      if (ids.length > 0) {
        entries = await storage.getEntriesByIds(ids);
        entries = entries.filter(e => e.status === 'wip');
      } else if (options.all) {
        const result = await storage.listEntries({ status: 'wip', limit: 1000 });
        entries = result.entries;
      } else {
        console.error(chalk.red('Please provide entry IDs or use --all to stop all WIP entries'));
        process.exit(1);
      }

      if (entries.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ success: true, count: 0, entries: [] }));
        } else {
          console.log(chalk.gray('No WIP entries to stop'));
        }
        return;
      }

      if (options.dryRun) {
        if (options.json) {
          console.log(JSON.stringify({ success: true, dryRun: true, count: entries.length, entries }));
        } else {
          console.log(chalk.yellow(`Would stop ${entries.length} WIP entries:`));
          for (const entry of entries) {
            const duration = entry.startedAt ? formatDuration(Date.now() - new Date(entry.startedAt).getTime()) : '';
            console.log(`  ${entry.id.slice(0, 8)}: ${entry.title || entry.content.slice(0, 40)}... ${duration}`);
          }
        }
        return;
      }

      const updatedEntries = [];
      for (const entry of entries) {
        const updated = await storage.updateEntry(entry.id, { status: 'active', startedAt: null });
        updatedEntries.push(updated);
      }

      if (options.json) {
        console.log(JSON.stringify({ success: true, count: updatedEntries.length, entries: updatedEntries }));
      } else {
        console.log(chalk.green(`Stopped ${updatedEntries.length} entries (marked as active)`));
      }
    });

  program
    .command('archive [ids...]')
    .description('Archive entries')
    .option('-t, --type <type>', 'Filter by type')
    .option('--tags <tags>', 'Filter by tags')
    .option('-s, --status <status>', 'Filter by status')
    .option('--since <duration>', 'Filter by age')
    .option('--dry-run', 'Show what would be archived')
    .option('--confirm', 'Skip confirmation prompt')
    .option('--json', 'Output as JSON')
    .action(async (ids, options) => {
      let entries;

      if (ids.length > 0) {
        entries = await storage.getEntriesByIds(ids);
      } else if (options.type || options.tags || options.status || options.since) {
        const result = await storage.listEntries({
          type: options.type,
          tags: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
          status: options.status,
          since: options.since,
          limit: 1000
        });
        entries = result.entries;
      } else {
        console.error(chalk.red('Please provide entry IDs or filter options'));
        process.exit(1);
      }

      if (entries.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ success: true, count: 0, entries: [] }));
        } else {
          console.log(chalk.gray('No entries matched'));
        }
        return;
      }

      if (options.dryRun) {
        if (options.json) {
          console.log(JSON.stringify({ success: true, dryRun: true, count: entries.length, entries }));
        } else {
          console.log(chalk.yellow(`Would archive ${entries.length} entries:`));
          for (const entry of entries) {
            console.log(`  ${entry.id.slice(0, 8)} (${entry.type}): ${entry.title || entry.content.slice(0, 40)}...`);
          }
        }
        return;
      }

      // Archive entries
      await storage.archiveEntries(entries.map(e => e.id));

      if (options.json) {
        console.log(JSON.stringify({ success: true, count: entries.length }));
      } else {
        console.log(chalk.green(`Archived ${entries.length} entries`));
      }
    });

  program
    .command('delete [ids...]')
    .description('Delete entries (logged for undo)')
    .option('-t, --type <type>', 'Filter by type')
    .option('--tags <tags>', 'Filter by tags')
    .option('-s, --status <status>', 'Filter by status')
    .option('--since <duration>', 'Filter by age')
    .option('--dry-run', 'Show what would be deleted')
    .option('--confirm', 'Skip confirmation prompt')
    .option('--force', 'Override safety warnings')
    .option('--json', 'Output as JSON')
    .action(async (ids, options) => {
      let entries;

      if (ids.length > 0) {
        entries = await storage.getEntriesByIds(ids);
      } else if (options.type || options.tags || options.status || options.since) {
        const result = await storage.listEntries({
          type: options.type,
          tags: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
          status: options.status,
          since: options.since,
          limit: 1000
        });
        entries = result.entries;
      } else {
        console.error(chalk.red('Please provide entry IDs or filter options'));
        process.exit(1);
      }

      if (entries.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ success: true, count: 0, entries: [] }));
        } else {
          console.log(chalk.gray('No entries matched'));
        }
        return;
      }

      // Safety check
      if (entries.length > 10 && !options.confirm && !options.force) {
        console.error(chalk.red(`Refusing to delete ${entries.length} entries without --confirm or --force`));
        process.exit(1);
      }

      // Check for entries with children
      const entriesWithChildren = [];
      for (const entry of entries) {
        const children = await storage.getChildren(entry.id);
        if (children.length > 0) {
          entriesWithChildren.push({ entry, childCount: children.length });
        }
      }

      if (entriesWithChildren.length > 0 && !options.force) {
        console.error(chalk.red(`Cannot delete entries with children without --force:`));
        for (const { entry, childCount } of entriesWithChildren) {
          console.error(`  ${entry.id.slice(0, 8)} has ${childCount} children`);
        }
        process.exit(1);
      }

      if (options.dryRun) {
        if (options.json) {
          console.log(JSON.stringify({ success: true, dryRun: true, count: entries.length, entries }));
        } else {
          console.log(chalk.yellow(`Would delete ${entries.length} entries:`));
          for (const entry of entries) {
            console.log(`  ${entry.id.slice(0, 8)} (${entry.type}): ${entry.title || entry.content.slice(0, 40)}...`);
          }
        }
        return;
      }

      // Log before delete
      await deletionLog.logDeletions(entries);

      // Delete entries
      await storage.deleteEntries(entries.map(e => e.id));

      if (options.json) {
        console.log(JSON.stringify({ success: true, count: entries.length }));
      } else {
        console.log(chalk.green(`Deleted ${entries.length} entries (use "synap restore --last ${entries.length}" to undo)`));
      }
    });

  program
    .command('restore')
    .description('Restore deleted entries')
    .option('--last <n>', 'Restore last N deletions')
    .option('--ids <ids>', 'Restore specific entry IDs')
    .option('--list', 'Show deletion log')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      if (options.list) {
        const log = await deletionLog.getLog();
        if (options.json) {
          console.log(JSON.stringify({ success: true, deletions: log }));
        } else {
          if (log.length === 0) {
            console.log(chalk.gray('Deletion log is empty'));
            return;
          }
          console.log(chalk.bold('Deletion Log:\n'));
          for (const entry of log.slice(0, 20)) {
            const date = new Date(entry.deletedAt).toLocaleString();
            console.log(`  ${chalk.gray(date)} ${entry.id.slice(0, 8)} (${entry.type}): ${entry.title || entry.content.slice(0, 30)}...`);
          }
          if (log.length > 20) {
            console.log(chalk.gray(`\n  ... and ${log.length - 20} more`));
          }
        }
        return;
      }

      let toRestore = [];

      if (options.last) {
        const n = parseInt(options.last, 10);
        const log = await deletionLog.getLog();
        toRestore = log.slice(0, n);
      } else if (options.ids) {
        const ids = options.ids.split(',').map(id => id.trim());
        const log = await deletionLog.getLog();
        toRestore = log.filter(e => ids.some(id => e.id.startsWith(id)));
      } else {
        console.error(chalk.red('Please provide --last <n> or --ids <ids>'));
        process.exit(1);
      }

      if (toRestore.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ success: true, count: 0 }));
        } else {
          console.log(chalk.gray('No entries to restore'));
        }
        return;
      }

      // Restore entries
      await storage.restoreEntries(toRestore);
      await deletionLog.removeFromLog(toRestore.map(e => e.id));

      if (options.json) {
        console.log(JSON.stringify({ success: true, count: toRestore.length, entries: toRestore }));
      } else {
        console.log(chalk.green(`Restored ${toRestore.length} entries`));
      }
    });

  // ============================================
  // MAINTENANCE COMMANDS
  // ============================================

  program
    .command('stats')
    .description('Show entry statistics')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const stats = await storage.getStats();

      if (options.json) {
        console.log(JSON.stringify({ success: true, ...stats }, null, 2));
      } else {
        console.log(chalk.bold('synap Statistics\n'));
        console.log(`  Total entries: ${stats.total}`);
        console.log(`  Active:        ${stats.byStatus.active || 0}`);
        console.log(`  Raw (need triage): ${stats.byStatus.raw || 0}`);
        console.log(`  Done:          ${stats.byStatus.done || 0}`);
        console.log(`  Archived:      ${stats.byStatus.archived || 0}`);
        console.log('');
        console.log('  By Type:');
        for (const [type, count] of Object.entries(stats.byType)) {
          console.log(`    ${type.padEnd(12)} ${count}`);
        }
        console.log('');
        const p1Display = stats.highPriority === stats.highPriorityActive
          ? `${stats.highPriority}`
          : `${stats.highPriority} (${stats.highPriorityActive} active)`;
        console.log(`  High Priority (P1): ${p1Display}`);
        console.log(`  Created this week:  ${stats.createdThisWeek}`);
        console.log(`  Updated today:      ${stats.updatedToday}`);

        if (stats.byStatus.raw > 0) {
          console.log(chalk.gray('\nTip: Run "synap list --status raw" to triage unprocessed entries'));
        }
      }
    });

  program
    .command('export')
    .description('Export entries')
    .option('--file <path>', 'Export to file')
    .option('-t, --type <type>', 'Filter by type')
    .option('-s, --status <status>', 'Filter by status')
    .option('--format <format>', 'Format: json or csv', 'json')
    .action(async (options) => {
      const data = await storage.exportEntries({
        type: options.type,
        status: options.status
      });

      let output;
      if (options.format === 'csv') {
        // Simple CSV export
        const headers = ['id', 'type', 'status', 'priority', 'title', 'content', 'tags', 'createdAt', 'updatedAt'];
        const rows = data.entries.map(e => headers.map(h => {
          const val = h === 'tags' ? e[h].join(';') : e[h];
          return `"${String(val || '').replace(/"/g, '""')}"`;
        }).join(','));
        output = [headers.join(','), ...rows].join('\n');
      } else {
        output = JSON.stringify(data, null, 2);
      }

      if (options.file) {
        const fs = require('fs');
        fs.writeFileSync(options.file, output);
        console.log(chalk.green(`Exported ${data.entries.length} entries to ${options.file}`));
      } else {
        console.log(output);
      }
    });

  program
    .command('import <file>')
    .description('Import entries from file')
    .option('--dry-run', 'Preview what would be imported')
    .option('--merge', 'Update existing, add new')
    .option('--skip-existing', 'Only add new entries')
    .option('--json', 'Output as JSON')
    .action(async (file, options) => {
      const fs = require('fs');

      if (!fs.existsSync(file)) {
        console.error(chalk.red(`File not found: ${file}`));
        process.exit(1);
      }

      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const entries = data.entries || data;

      if (options.dryRun) {
        if (options.json) {
          console.log(JSON.stringify({ success: true, dryRun: true, count: entries.length }));
        } else {
          console.log(chalk.yellow(`Would import ${entries.length} entries`));
        }
        return;
      }

      const result = await storage.importEntries(entries, {
        merge: options.merge,
        skipExisting: options.skipExisting
      });

      if (options.json) {
        console.log(JSON.stringify({ success: true, ...result }));
      } else {
        console.log(chalk.green(`Imported ${result.added} new entries, updated ${result.updated} existing`));
      }
    });

  // ============================================
  // WORKFLOW COMMANDS
  // ============================================

  program
    .command('tree [id]')
    .description('Hierarchical view of entries')
    .option('--depth <n>', 'Max depth to display', '10')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      const maxDepth = parseInt(options.depth, 10);
      const rootIds = id ? [id] : null;

      const tree = await storage.buildEntryTree(rootIds, maxDepth);

      if (tree.length === 0 && id) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: `Entry not found: ${id}`, code: 'ENTRY_NOT_FOUND' }));
        } else {
          console.error(chalk.red(`Entry not found: ${id}`));
        }
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify({ success: true, tree }, null, 2));
      } else {
        if (tree.length === 0) {
          console.log(chalk.gray('No entries found.'));
          return;
        }

        // Render ASCII tree
        function renderNode(node, prefix = '', isLast = true) {
          const connector = isLast ? '└── ' : '├── ';
          const shortId = node.id.slice(0, 8);
          const typeBadge = chalk.cyan(`[${node.type}]`);
          const title = node.title || node.content.slice(0, 40);
          const priorityBadge = node.priority ? chalk.yellow(` [P${node.priority}]`) : '';
          console.log(`${prefix}${connector}${chalk.blue(shortId)} ${typeBadge}${priorityBadge} ${title}`);

          const childPrefix = prefix + (isLast ? '    ' : '│   ');
          node.children.forEach((child, i) => {
            renderNode(child, childPrefix, i === node.children.length - 1);
          });
        }

        tree.forEach((root, i) => renderNode(root, '', i === tree.length - 1));
      }
    });

  program
    .command('focus')
    .description('Show what to work on now: P1 todos + overdue + active projects')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      // Get P1 todos
      const p1Todos = await storage.listEntries({
        type: 'todo',
        priority: 1,
        status: 'raw,active',
        limit: 100
      });

      // Get overdue entries
      const overdueEntries = await storage.listEntries({
        overdue: true,
        status: 'raw,active',
        limit: 100
      });

      // Deduplicate (some P1 todos may also be overdue)
      const p1TodoIds = new Set(p1Todos.entries.map(e => e.id));
      const overdueNotP1 = overdueEntries.entries.filter(e => !p1TodoIds.has(e.id));

      // Get active projects with progress
      const projects = await storage.listEntries({
        type: 'project',
        status: 'active',
        limit: 50
      });

      const projectsWithProgress = await Promise.all(
        projects.entries.map(async (project) => {
          const children = await storage.getChildren(project.id);
          const total = children.length;
          const done = children.filter(c => c.status === 'done').length;
          const percent = total > 0 ? Math.round(done / total * 100) : 0;
          return { ...project, progress: { total, done, percent } };
        })
      );

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          p1Todos: p1Todos.entries,
          overdueItems: overdueNotP1,
          activeProjects: projectsWithProgress
        }, null, 2));
      } else {
        console.log(chalk.bold('Focus: What to work on now\n'));

        // Overdue section (show first - most urgent)
        if (overdueNotP1.length > 0) {
          console.log(chalk.red.bold('Overdue:'));
          for (const item of overdueNotP1) {
            const shortId = item.id.slice(0, 8);
            const title = item.title || item.content.slice(0, 50);
            const dueStr = formatDueDate(item.due);
            console.log(`  ${chalk.blue(shortId)} ${title} ${chalk.red(`[${dueStr}]`)}`);
          }
          console.log();
        }

        // P1 Todos
        if (p1Todos.entries.length > 0) {
          console.log(chalk.yellow.bold('P1 Todos:'));
          for (const todo of p1Todos.entries) {
            const shortId = todo.id.slice(0, 8);
            const title = todo.title || todo.content.slice(0, 50);
            const dueStr = todo.due ? chalk.magenta(` [due: ${formatDueDate(todo.due)}]`) : '';
            console.log(`  ${chalk.blue(shortId)} ${title}${dueStr}`);
          }
          console.log();
        } else {
          console.log(chalk.gray('No P1 todos.\n'));
        }

        // Active Projects
        if (projectsWithProgress.length > 0) {
          console.log(chalk.green.bold('Active Projects:'));
          for (const project of projectsWithProgress) {
            const shortId = project.id.slice(0, 8);
            const title = project.title || project.content.slice(0, 40);
            const progressBar = project.progress.total > 0
              ? ` [${project.progress.done}/${project.progress.total}] ${project.progress.percent}%`
              : '';
            console.log(`  ${chalk.blue(shortId)} ${title}${chalk.gray(progressBar)}`);
          }
        } else {
          console.log(chalk.gray('No active projects.'));
        }
      }
    });

  program
    .command('review [scope]')
    .description('Guided review session (daily or weekly)')
    .option('--json', 'Output as JSON')
    .action(async (scope = 'daily', options) => {
      const stats = await storage.getStats();

      if (scope === 'daily') {
        // Daily review: stats + raw entries + P1 items + stale
        const rawEntries = await storage.listEntries({ status: 'raw', limit: 100 });
        const p1Items = await storage.listEntries({ priority: 1, status: 'raw,active', limit: 100 });

        // Stale items: not updated in 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const allActive = await storage.listEntries({ status: 'active', limit: 500 });
        const staleItems = allActive.entries.filter(e => new Date(e.updatedAt) < sevenDaysAgo);

        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            scope: 'daily',
            stats,
            rawCount: rawEntries.entries.length,
            p1Items: p1Items.entries,
            staleItems
          }, null, 2));
        } else {
          console.log(chalk.bold('Daily Review\n'));
          console.log(`Total entries: ${stats.total}`);
          console.log(`  Raw: ${stats.byStatus.raw || 0}`);
          console.log(`  Active: ${stats.byStatus.active || 0}`);
          console.log(`  Done: ${stats.byStatus.done || 0}`);
          console.log();

          if (rawEntries.entries.length > 0) {
            console.log(chalk.yellow(`${rawEntries.entries.length} entries need triage (synap triage)`));
          }

          if (p1Items.entries.length > 0) {
            console.log(chalk.red.bold(`\n${p1Items.entries.length} P1 items:`));
            for (const item of p1Items.entries.slice(0, 5)) {
              console.log(`  ${chalk.blue(item.id.slice(0, 8))} ${item.title || item.content.slice(0, 50)}`);
            }
          }

          if (staleItems.length > 0) {
            console.log(chalk.gray(`\n${staleItems.length} stale items (not updated in 7 days)`));
          }
        }
      } else if (scope === 'weekly') {
        // Weekly review: completed this week + project progress
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const allDone = await storage.listEntries({ status: 'done', includeDone: true, limit: 500 });
        const completedThisWeek = allDone.entries.filter(e => new Date(e.updatedAt) >= sevenDaysAgo);

        const projects = await storage.listEntries({ type: 'project', status: 'active', limit: 50 });
        const projectsWithProgress = await Promise.all(
          projects.entries.map(async (project) => {
            const children = await storage.getChildren(project.id);
            const total = children.length;
            const done = children.filter(c => c.status === 'done').length;
            return { ...project, progress: { total, done, percent: total > 0 ? Math.round(done / total * 100) : 0 } };
          })
        );

        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            scope: 'weekly',
            completedThisWeek,
            projectProgress: projectsWithProgress
          }, null, 2));
        } else {
          console.log(chalk.bold('Weekly Review\n'));

          console.log(chalk.green.bold(`Completed this week: ${completedThisWeek.length} items`));
          for (const item of completedThisWeek.slice(0, 10)) {
            console.log(`  ✓ ${item.title || item.content.slice(0, 50)}`);
          }

          if (projectsWithProgress.length > 0) {
            console.log(chalk.blue.bold('\nProject Progress:'));
            for (const project of projectsWithProgress) {
              const title = project.title || project.content.slice(0, 40);
              const bar = project.progress.total > 0
                ? ` [${project.progress.done}/${project.progress.total}] ${project.progress.percent}%`
                : ' (no children)';
              console.log(`  ${title}${chalk.gray(bar)}`);
            }
          }
        }
      } else {
        console.error(chalk.red(`Unknown scope: ${scope}. Use 'daily' or 'weekly'.`));
        process.exit(1);
      }
    });

  program
    .command('triage')
    .description('Interactive processing of raw entries')
    .option('--auto', 'Non-interactive mode (just list raw entries)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const rawEntries = await storage.listEntries({ status: 'raw', limit: 100 });

      if (rawEntries.entries.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ success: true, count: 0, message: 'No raw entries to triage' }));
        } else {
          console.log(chalk.green('No raw entries to triage!'));
        }
        return;
      }

      // Non-interactive modes
      if (options.auto || options.json) {
        if (options.json) {
          console.log(JSON.stringify({ success: true, rawEntries: rawEntries.entries }, null, 2));
        } else {
          console.log(chalk.bold(`${rawEntries.entries.length} raw entries to triage:\n`));
          for (const entry of rawEntries.entries) {
            const shortId = entry.id.slice(0, 8);
            console.log(`  ${chalk.blue(shortId)} [${entry.type}] ${entry.content.slice(0, 60)}`);
          }
        }
        return;
      }

      // Interactive mode
      const { select, input } = await import('@inquirer/prompts');

      console.log(chalk.bold(`\nTriaging ${rawEntries.entries.length} raw entries...\n`));

      let processed = 0;
      for (const entry of rawEntries.entries) {
        console.log(boxen(entry.content, { padding: 1, title: `${entry.id.slice(0, 8)} [${entry.type}]`, borderColor: 'cyan' }));

        const action = await select({
          message: 'Action?',
          choices: [
            { value: 'classify', name: 'Classify (set type, priority, tags)' },
            { value: 'skip', name: 'Skip for now' },
            { value: 'done', name: 'Mark as done' },
            { value: 'quit', name: 'Quit triage' }
          ]
        });

        if (action === 'quit') {
          console.log(chalk.yellow(`\nProcessed ${processed} entries. ${rawEntries.entries.length - processed} remaining.`));
          break;
        }

        if (action === 'skip') {
          continue;
        }

        if (action === 'done') {
          await storage.updateEntry(entry.id, { status: 'done' });
          console.log(chalk.green(`Marked as done.`));
          processed++;
          continue;
        }

        // Classify
        const type = await select({
          message: 'Type?',
          choices: storage.VALID_TYPES.map(t => ({ value: t, name: t })),
          default: entry.type
        });

        const priorityChoice = await select({
          message: 'Priority?',
          choices: [
            { value: 'none', name: 'None' },
            { value: '1', name: 'P1 (High)' },
            { value: '2', name: 'P2 (Medium)' },
            { value: '3', name: 'P3 (Low)' }
          ]
        });
        const priority = priorityChoice === 'none' ? undefined : parseInt(priorityChoice, 10);

        const tagsInput = await input({
          message: 'Tags (comma-separated)?',
          default: entry.tags.join(', ')
        });
        const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];

        await storage.updateEntry(entry.id, {
          type,
          priority,
          tags,
          status: 'active'
        });

        console.log(chalk.green(`Updated ${entry.id.slice(0, 8)} → ${type}, P${priority || '-'}, tags: ${tags.join(', ') || 'none'}\n`));
        processed++;
      }

      console.log(chalk.green.bold(`\nTriage complete! Processed ${processed} entries.`));
    });

  // ============================================
  // PREFERENCES COMMANDS
  // ============================================

  const respondPreferencesError = (options, message, code = 'INVALID_ARGS') => {
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: message, code }));
    } else {
      console.error(chalk.red(message));
    }
    process.exit(1);
  };

  const preferencesCommand = program
    .command('preferences')
    .description('View or update user preferences')
    .option('--edit', 'Open preferences in $EDITOR')
    .option('--reset', 'Reset preferences to the default template')
    .option('--confirm', 'Skip confirmation prompt when resetting')
    .option('--append <values...>', 'Append text to a section')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const hasAppend = Array.isArray(options.append);
      const activeFlags = [options.edit, options.reset, hasAppend].filter(Boolean).length;

      if (activeFlags > 1) {
        respondPreferencesError(options, 'Use only one of --edit, --reset, or --append');
      }
      try {
        if (options.edit) {
          if (options.json) {
            respondPreferencesError(options, 'Cannot use --json with --edit', 'INVALID_MODE');
          }

          preferences.loadPreferences();

          const editor = config.editor || process.env.EDITOR || 'vi';
          const preferencesPath = preferences.getPreferencesPath();
          try {
            execSync(`${editor} "${preferencesPath}"`, { stdio: 'inherit' });
          } catch {
            console.error(chalk.red('Editor failed or was cancelled'));
            process.exit(1);
          }

          const updated = fs.readFileSync(preferencesPath, 'utf8');
          const validation = preferences.validatePreferences(updated);
          if (!validation.valid) {
            console.error(chalk.red(`Invalid preferences: ${validation.error}`));
            process.exit(1);
          }

          console.log(chalk.green('Preferences updated'));
          return;
        }

        if (options.reset) {
          if (!options.confirm && !options.json) {
            const { confirm } = await import('@inquirer/prompts');
            const confirmed = await confirm({
              message: 'Reset preferences to the default template?',
              default: false
            });
            if (!confirmed) {
              console.log(chalk.gray('Cancelled'));
              return;
            }
          }

          const content = preferences.resetPreferences();
          if (options.json) {
            console.log(JSON.stringify({
              success: true,
              path: preferences.getPreferencesPath(),
              content
            }, null, 2));
          } else {
            console.log(chalk.green('Preferences reset to template'));
          }
          return;
        }

        if (hasAppend) {
          const values = options.append || [];
          if (values.length < 2) {
            respondPreferencesError(options, 'Usage: synap preferences --append "## Section" "Text to append"');
          }

          const [section, ...textParts] = values;
          const text = textParts.join(' ');
          const content = preferences.appendToSection(section, text);

          if (options.json) {
            console.log(JSON.stringify({
              success: true,
              path: preferences.getPreferencesPath(),
              section,
              text,
              content
            }, null, 2));
          } else {
            console.log(chalk.green(`Appended to ${section}`));
          }
          return;
        }

        const content = preferences.loadPreferences();
        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            path: preferences.getPreferencesPath(),
            lineCount: content.split(/\r?\n/).length,
            content
          }, null, 2));
        } else {
          console.log(content);
        }
      } catch (err) {
        respondPreferencesError(options, err.message || 'Failed to update preferences', 'PREFERENCES_ERROR');
      }
    });

  preferencesCommand
    .command('set')
    .description('Add a preference entry to a section')
    .option('--section <section>', 'Section name or alias')
    .option('--entry <entry>', 'Entry text')
    .option('--json', 'Output as JSON')
    .action((options) => {
      if (!options.section || !options.entry) {
        respondPreferencesError(
          options,
          'Usage: synap preferences set --section "tags" --entry "text to add"'
        );
      }

      try {
        const result = preferences.setEntry(options.section, options.entry);
        const payload = { ...result, path: preferences.getPreferencesPath() };

        if (options.json) {
          console.log(JSON.stringify(payload, null, 2));
        } else if (result.added) {
          console.log(chalk.green(`Added entry to ${result.section}`));
        } else {
          console.log(chalk.yellow(`Entry already exists in ${result.section}`));
        }
      } catch (err) {
        respondPreferencesError(options, err.message || 'Failed to set preferences', 'PREFERENCES_ERROR');
      }
    });

  preferencesCommand
    .command('remove')
    .description('Remove preference entries from a section')
    .option('--section <section>', 'Section name or alias')
    .option('--match <pattern>', 'Match text (case-insensitive substring)')
    .option('--entry <entry>', 'Exact entry text')
    .option('--json', 'Output as JSON')
    .action((options) => {
      if (!options.section) {
        respondPreferencesError(
          options,
          'Usage: synap preferences remove --section "tags" --match "urgent"'
        );
      }
      if (options.match && options.entry) {
        respondPreferencesError(options, 'Use only one of --match or --entry');
      }
      if (!options.match && !options.entry) {
        respondPreferencesError(
          options,
          'Usage: synap preferences remove --section "tags" --match "urgent"'
        );
      }

      try {
        const result = preferences.removeFromSection(options.section, {
          match: options.match,
          entry: options.entry
        });
        const payload = { ...result, path: preferences.getPreferencesPath() };

        if (options.json) {
          console.log(JSON.stringify(payload, null, 2));
        } else if (result.removed) {
          console.log(chalk.green(`Removed ${result.count} entr${result.count === 1 ? 'y' : 'ies'} from ${result.section}`));
        } else {
          console.log(chalk.yellow(`No entries matched in ${result.section}`));
        }
      } catch (err) {
        respondPreferencesError(options, err.message || 'Failed to remove preferences', 'PREFERENCES_ERROR');
      }
    });

  preferencesCommand
    .command('list')
    .description('List preference entries')
    .option('--section <section>', 'Section name or alias')
    .option('--json', 'Output as JSON')
    .action((options) => {
      try {
        if (options.section) {
          const section = preferences.resolveSection(options.section);
          const entries = preferences.getEntriesInSection(section);
          const payload = { section, entries, count: entries.length };

          if (options.json) {
            console.log(JSON.stringify(payload, null, 2));
          } else if (entries.length === 0) {
            console.log(chalk.gray(`No entries found in ${section}`));
          } else {
            console.log(chalk.bold(section));
            entries.forEach((entry) => {
              console.log(`- ${entry}`);
            });
          }
          return;
        }

        const content = preferences.loadPreferences();
        const lines = content.split(/\r?\n/);
        const sections = [];
        let current = null;

        for (const line of lines) {
          const headingMatch = line.match(/^(#{1,6})\s*(.+?)\s*$/);
          if (headingMatch) {
            const level = headingMatch[1].length;
            const name = headingMatch[2].trim();

            if (level === 2) {
              current = { section: name, entries: [] };
              sections.push(current);
            } else if (level === 1) {
              current = null;
            }
            continue;
          }

          if (!current) {
            continue;
          }

          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('<!--') || /^(#{1,6})\s+/.test(trimmed)) {
            continue;
          }

          current.entries.push(trimmed);
        }

        const populatedSections = sections.filter(section => section.entries.length > 0);
        const totalEntries = populatedSections.reduce((sum, section) => sum + section.entries.length, 0);

        if (options.json) {
          console.log(JSON.stringify({ sections: populatedSections, count: totalEntries }, null, 2));
        } else if (populatedSections.length === 0) {
          console.log(chalk.gray('No preference entries found'));
        } else {
          populatedSections.forEach((section, index) => {
            if (index > 0) {
              console.log('');
            }
            console.log(chalk.bold(section.section));
            section.entries.forEach((entry) => {
              console.log(`- ${entry}`);
            });
          });
        }
      } catch (err) {
        respondPreferencesError(options, err.message || 'Failed to list preferences', 'PREFERENCES_ERROR');
      }
    });

  // ============================================
  // SETUP COMMANDS
  // ============================================

  program
    .command('setup')
    .description('Run the first-run setup wizard')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const fs = require('fs');
      const os = require('os');
      const path = require('path');

      let skillResult = { prompted: false };
      let dataLocationResult = { configured: false };
      
      if (!options.json) {
        console.log('');
        console.log(chalk.bold('Welcome to synap!\n'));
        console.log('synap helps you externalize your working memory.');
        console.log('Capture ideas, todos, projects, and questions.\n');

        console.log('Let\'s get you set up:\n');

        // Step 1: Data location (only ask if not already configured)
        const currentConfig = storage.loadConfig();
        console.log('[1/4] Data location...');
        
        if (currentConfig.dataDir) {
          console.log(`      ${chalk.gray('Already configured:')} ${storage.DATA_DIR}`);
          dataLocationResult.configured = true;
          dataLocationResult.path = storage.DATA_DIR;
        } else {
          const { select, input } = await import('@inquirer/prompts');
          const dataChoice = await select({
            message: 'Where should synap store your data?',
            choices: [
              { 
                name: `Default (${storage.DATA_DIR})`, 
                value: 'default',
                description: 'Recommended for most users'
              },
              { 
                name: 'Custom path (for git sync, Dropbox, iCloud)', 
                value: 'custom',
                description: 'Choose a custom folder for syncing across devices'
              }
            ]
          });

          if (dataChoice === 'custom') {
            const customPath = await input({
              message: 'Enter path for synap data:',
              validate: (val) => {
                if (!val.trim()) return 'Path is required';
                const expanded = val.replace(/^~/, os.homedir());
                const parentDir = path.dirname(expanded);
                if (!fs.existsSync(parentDir)) {
                  return `Parent directory does not exist: ${parentDir}`;
                }
                return true;
              }
            });

            const expanded = customPath.replace(/^~/, os.homedir());
            
            // Create directory if needed
            if (!fs.existsSync(expanded)) {
              fs.mkdirSync(expanded, { recursive: true });
            }

            // Save to config
            currentConfig.dataDir = customPath;
            storage.saveConfig(currentConfig);
            storage.refreshDataDir();
            
            console.log(`      ${chalk.green('✓')} Data directory set to: ${expanded}`);
            dataLocationResult.configured = true;
            dataLocationResult.path = expanded;
            dataLocationResult.custom = true;
          } else {
            console.log(`      ${chalk.green('✓')} Using default location: ${storage.DATA_DIR}`);
            dataLocationResult.configured = true;
            dataLocationResult.path = storage.DATA_DIR;
          }
        }

        // Step 2: Quick capture example
        console.log('\n[2/4] Quick capture...');
        console.log(`      Try: ${chalk.cyan('synap add "My first thought"')}`);
        console.log(`      ${chalk.green('✓')} Ready to capture`)

        // Step 3: Configuration
        console.log('\n[3/4] Configuration...');
        console.log(`      Default type: ${chalk.cyan(config.defaultType || 'idea')}`);
        console.log(`      Change with: ${chalk.cyan('synap config defaultType todo')}`);

        // Step 4: Claude Code Integration
        console.log('\n[4/4] Claude Code Integration');
        const { confirm } = await import('@inquirer/prompts');
        const shouldInstall = await confirm({
          message: 'Install Claude skill for AI assistance?',
          default: true
        });

        skillResult.prompted = true;
        if (shouldInstall) {
          const skillInstaller = require('./skill-installer');
          try {
            skillResult = { ...skillResult, ...(await skillInstaller.install()) };
            if (skillResult.installed) {
              console.log(`      ${chalk.green('✓')} Skill installed at ~/.claude/skills/synap-assistant/`);
              if (skillResult.backupFile) {
                console.log(`      ${chalk.yellow('•')} Your modifications backed up to ${skillResult.backupFile}`);
              }
            } else if (skillResult.skipped) {
              console.log(`      ${chalk.yellow('•')} Skill already up to date`);
            }
          } catch (err) {
            console.log(`      ${chalk.red('✗')} Skill install failed: ${err.message}`);
            skillResult = { ...skillResult, error: err.message };
          }
        } else {
          console.log(`      ${chalk.gray('Skipped skill install')}`);
        }

        console.log('\nYou\'re ready! Try these commands:');
        console.log(`  ${chalk.cyan('synap todo "Something to do"')}`);
        console.log(`  ${chalk.cyan('synap focus')}`);
        console.log(`  ${chalk.cyan('synap review daily')}`);
        
        if (dataLocationResult.custom) {
          console.log(chalk.bold('\n📁 Sync tip:'));
          console.log(`  Your data is stored in: ${chalk.cyan(dataLocationResult.path)}`);
          console.log(`  To sync with git: ${chalk.gray('cd ' + dataLocationResult.path + ' && git init')}`);
        }
        console.log('');
        return;
      }

      // JSON mode - minimal interaction
      console.log(JSON.stringify({
        success: true,
        config: { defaultType: config.defaultType || 'idea' },
        skill: {
          prompted: false,
          installed: false,
          message: 'Run synap install-skill to enable Claude Code integration'
        }
      }, null, 2));
    });

  // ============================================
  // CONFIGURATION COMMANDS
  // ============================================

  program
    .command('config [key] [value]')
    .description('View or update configuration')
    .option('--reset', 'Reset to defaults')
    .option('--json', 'Output as JSON')
    .action(async (key, value, options) => {
      const currentConfig = storage.loadConfig();
      const defaults = storage.getDefaultConfig();

      // Reset to defaults
      if (options.reset) {
        storage.saveConfig(defaults);
        if (options.json) {
          console.log(JSON.stringify({ success: true, config: defaults, message: 'Config reset to defaults' }));
        } else {
          console.log(chalk.green('Config reset to defaults'));
        }
        return;
      }

      // No key: show all config
      if (!key) {
        if (options.json) {
          console.log(JSON.stringify({ 
            success: true, 
            config: currentConfig, 
            defaults,
            paths: {
              configDir: storage.CONFIG_DIR,
              dataDir: storage.DATA_DIR
            }
          }, null, 2));
        } else {
          console.log(chalk.bold('Configuration:\n'));
          for (const [k, v] of Object.entries(currentConfig)) {
            const isDefault = JSON.stringify(v) === JSON.stringify(defaults[k]);
            const defaultNote = isDefault ? chalk.gray(' (default)') : '';
            const displayValue = Array.isArray(v) ? v.join(', ') || '(none)' : (v === null ? '(null)' : v);
            console.log(`  ${chalk.cyan(k)}: ${displayValue}${defaultNote}`);
          }
          console.log(chalk.bold('\nPaths:'));
          console.log(`  ${chalk.cyan('configDir')}: ${storage.CONFIG_DIR}`);
          console.log(`  ${chalk.cyan('dataDir')}: ${storage.DATA_DIR}`);
          console.log(chalk.gray('\nUse: synap config <key> <value> to set a value'));
        }
        return;
      }

      // Key only: get specific value
      if (value === undefined) {
        if (!(key in defaults)) {
          if (options.json) {
            console.log(JSON.stringify({ success: false, error: `Unknown config key: ${key}`, code: 'INVALID_KEY' }));
          } else {
            console.error(chalk.red(`Unknown config key: ${key}`));
            console.error(chalk.gray(`Valid keys: ${Object.keys(defaults).join(', ')}`));
          }
          process.exit(1);
        }
        if (options.json) {
          console.log(JSON.stringify({ success: true, key, value: currentConfig[key] }));
        } else {
          const v = currentConfig[key];
          const displayValue = Array.isArray(v) ? v.join(', ') || '(none)' : (v === null ? '(null)' : v);
          console.log(displayValue);
        }
        return;
      }

      // Key + value: set value
      const validation = storage.validateConfigValue(key, value);
      if (!validation.valid) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: validation.error, code: 'VALIDATION_ERROR' }));
        } else {
          console.error(chalk.red(validation.error));
        }
        process.exit(1);
      }

      // Parse value appropriately
      let parsedValue = value;
      if (key === 'defaultTags') {
        parsedValue = value.split(',').map(t => t.trim()).filter(Boolean);
      } else if (key === 'editor' && (value === 'null' || value === '')) {
        parsedValue = null;
      } else if (key === 'dataDir') {
        // Handle dataDir specially
        if (value === 'null' || value === '') {
          parsedValue = null;
        } else {
          // Expand ~ but keep the ~ in storage for portability
          const expanded = value.replace(/^~/, require('os').homedir());
          // Create directory if it doesn't exist
          if (!fs.existsSync(expanded)) {
            fs.mkdirSync(expanded, { recursive: true });
            if (!options.json) {
              console.log(chalk.gray(`Created directory: ${expanded}`));
            }
          }
          // Store the original value (with ~ if used)
          parsedValue = value;
        }
      }

      currentConfig[key] = parsedValue;
      storage.saveConfig(currentConfig);

      // If dataDir changed, refresh the storage paths
      if (key === 'dataDir') {
        storage.refreshDataDir();
      }

      if (options.json) {
        console.log(JSON.stringify({ success: true, key, value: parsedValue }));
      } else {
        const displayValue = Array.isArray(parsedValue) ? parsedValue.join(', ') : parsedValue;
        console.log(chalk.green(`Set ${key} = ${displayValue}`));
        if (key === 'dataDir') {
          console.log(chalk.gray(`Data will be stored in: ${storage.DATA_DIR}`));
          console.log(chalk.yellow('\nNote: Restart synap for changes to take full effect.'));
        }
      }
    });

  program
    .command('tags [action] [args...]')
    .description('Tag management (list, rename)')
    .option('--unused', 'Show tags only in deletion log (orphaned)')
    .option('--json', 'Output as JSON')
    .action(async (action, args, options) => {
      // Handle rename action
      if (action === 'rename') {
        if (args.length < 2) {
          if (options.json) {
            console.log(JSON.stringify({ success: false, error: 'Usage: synap tags rename <old> <new>', code: 'INVALID_ARGS' }));
          } else {
            console.error(chalk.red('Usage: synap tags rename <old> <new>'));
          }
          process.exit(1);
        }
        const [oldTag, newTag] = args;
        const result = await storage.renameTag(oldTag, newTag);

        if (options.json) {
          console.log(JSON.stringify({ success: true, ...result }));
        } else {
          console.log(chalk.green(`Renamed "${oldTag}" to "${newTag}" in ${result.entriesUpdated} entries`));
        }
        return;
      }

      // Handle --unused flag
      if (options.unused) {
        const currentTags = await storage.getAllTags();
        const currentTagSet = new Set(currentTags.map(t => t.tag));
        const log = await deletionLog.getLog();

        const deletedTags = new Set();
        for (const entry of log) {
          for (const tag of entry.tags || []) {
            deletedTags.add(tag);
          }
        }

        const unusedTags = [...deletedTags].filter(t => !currentTagSet.has(t));

        if (options.json) {
          console.log(JSON.stringify({ success: true, unusedTags }));
        } else {
          if (unusedTags.length === 0) {
            console.log(chalk.gray('No unused tags found.'));
          } else {
            console.log(chalk.bold('Unused tags (from deleted entries):\n'));
            for (const tag of unusedTags) {
              console.log(`  ${chalk.gray('#')}${tag}`);
            }
          }
        }
        return;
      }

      // Default: list all tags
      const tags = await storage.getAllTags();

      if (options.json) {
        console.log(JSON.stringify({ success: true, tags }, null, 2));
      } else {
        if (tags.length === 0) {
          console.log(chalk.gray('No tags found.'));
          return;
        }
        console.log(chalk.bold('Tags:\n'));
        for (const { tag, count } of tags) {
          const countStr = count === 1 ? '1 entry' : `${count} entries`;
          console.log(`  ${chalk.cyan('#' + tag.padEnd(20))} ${countStr}`);
        }
      }
    });

  program
    .command('install-skill')
    .description('Install Claude Code skill')
    .option('--uninstall', 'Remove the skill')
    .action(async (options) => {
      const skillInstaller = require('./skill-installer');

      if (options.uninstall) {
        await skillInstaller.uninstall();
        console.log(chalk.green('Skill uninstalled'));
      } else {
        const result = await skillInstaller.install();
        if (result.installed) {
          console.log(chalk.green('Skill installed to ~/.claude/skills/synap-assistant/'));
          if (result.backupFile) {
            console.log(chalk.yellow(`Your modifications were backed up to ${result.backupFile}`));
          }
        } else if (result.skipped) {
          console.log(chalk.yellow('Skill already up to date'));
        }
      }
    });

  // ============================================
  // SYNC COMMANDS
  // ============================================

  program
    .command('save [message...]')
    .description('Commit and push synap data to git remote')
    .option('-m, --message <message>', 'Commit message')
    .option('--dry-run', 'Show what would be committed without committing')
    .option('--no-push', 'Commit but do not push to remote')
    .option('--json', 'Output as JSON')
    .action(async (messageParts, options) => {
      const dataDir = storage.getDataDir();

      if (!isGitRepo()) {
        if (options.json) {
          console.log(JSON.stringify({
            success: false,
            error: 'Data directory is not a git repository',
            code: 'NOT_GIT_REPO',
            setup: [
              `cd ${dataDir}`,
              'git init',
              'git remote add origin git@github.com:user/synap-data.git',
              'synap save "Initial commit"'
            ]
          }, null, 2));
        } else {
          console.error(chalk.red('Data directory is not a git repository'));
          console.log(chalk.gray('\nSetup git sync:'));
          console.log(chalk.cyan(`  cd ${dataDir}`));
          console.log(chalk.cyan('  git init'));
          console.log(chalk.cyan('  git remote add origin git@github.com:user/synap-data.git'));
          console.log(chalk.cyan('  synap save "Initial commit"'));
        }
        process.exit(1);
      }

      // Build commit message
      let commitMessage = options.message;
      if (!commitMessage && messageParts && messageParts.length > 0) {
        commitMessage = messageParts.join(' ');
      }
      if (!commitMessage) {
        const now = new Date();
        const timestamp = now.toISOString().replace('T', ' ').slice(0, 16);
        commitMessage = `synap sync ${timestamp}`;
      }

      // Dry-run mode: show preview only
      if (options.dryRun) {
        const stats = getDiffStats();
        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            dryRun: true,
            message: commitMessage,
            changes: stats || 'No changes to commit'
          }, null, 2));
        } else {
          console.log(chalk.cyan('Dry run - would commit with message:'));
          console.log(chalk.yellow(`  "${commitMessage}"`));
          if (stats) {
            console.log(chalk.cyan('\nChanges:'));
            console.log(stats);
          } else {
            console.log(chalk.yellow('No changes to commit'));
          }
        }
        return;
      }

      try {
        // Stage all changes
        execSync('git add .', { cwd: dataDir, stdio: 'pipe' });

        // Check if there are changes to commit
        let hasChanges = true;
        try {
          execSync('git diff --cached --quiet', { cwd: dataDir, stdio: 'pipe' });
          hasChanges = false;
        } catch {
          // Non-zero exit means there are staged changes
          hasChanges = true;
        }

        if (!hasChanges) {
          if (options.json) {
            console.log(JSON.stringify({ success: true, message: 'Nothing to commit', pushed: false }));
          } else {
            console.log(chalk.yellow('Nothing to commit'));
          }
          return;
        }

        // Commit using stdin to prevent shell injection
        const commitResult = spawnSync('git', ['commit', '-F', '-'], {
          cwd: dataDir,
          input: commitMessage,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe']
        });

        if (commitResult.status !== 0) {
          throw new Error(commitResult.stderr || 'Commit failed');
        }

        // Push (unless --no-push flag)
        let pushed = false;
        let pushError = null;
        let pushErrorCode = null;

        if (options.push !== false) {
          // Check if remote exists
          if (!hasRemote()) {
            pushError = 'No git remote configured';
            pushErrorCode = 'NO_REMOTE';
          } else {
            try {
              execSync('git push', { cwd: dataDir, stdio: 'pipe' });
              pushed = true;
            } catch (err) {
              pushError = 'Push failed (check network or remote permissions)';
              pushErrorCode = 'PUSH_FAILED';
            }
          }
        } else {
          pushError = 'Push skipped (--no-push flag)';
        }

        if (options.json) {
          const result = {
            success: true,
            message: commitMessage,
            pushed
          };
          if (pushError) result.pushError = pushError;
          if (pushErrorCode) result.pushErrorCode = pushErrorCode;
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(chalk.green(`Committed: "${commitMessage}"`));
          if (pushed) {
            console.log(chalk.green('Pushed to remote'));
          } else {
            console.log(chalk.yellow(pushError));
          }
        }
      } catch (err) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: err.message, code: 'GIT_ERROR' }));
        } else {
          console.error(chalk.red(`Git error: ${err.message}`));
        }
        process.exit(1);
      }
    });

  program
    .command('pull')
    .description('Pull latest synap data from git remote')
    .option('--force', 'Pull even if there are uncommitted local changes')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const dataDir = storage.getDataDir();

      if (!isGitRepo()) {
        if (options.json) {
          console.log(JSON.stringify({
            success: false,
            error: 'Data directory is not a git repository',
            code: 'NOT_GIT_REPO'
          }, null, 2));
        } else {
          console.error(chalk.red('Data directory is not a git repository'));
          console.log(chalk.gray('Run: synap save --help for setup instructions'));
        }
        process.exit(1);
      }

      // Check for uncommitted changes
      if (isDirty() && !options.force) {
        if (options.json) {
          console.log(JSON.stringify({
            success: false,
            error: 'Working tree has uncommitted changes',
            code: 'DIRTY_WORKING_TREE',
            hint: 'Run `synap save` first or use `--force`'
          }, null, 2));
        } else {
          console.error(chalk.red('Working tree has uncommitted changes'));
          console.log(chalk.gray('Run `synap save` first or use `synap pull --force`'));
        }
        process.exit(1);
      }

      try {
        const output = execSync('git pull', { cwd: dataDir, encoding: 'utf-8' });

        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            message: output.trim() || 'Already up to date',
            updated: !output.includes('Already up to date')
          }, null, 2));
        } else {
          console.log(chalk.green(output.trim() || 'Already up to date'));
        }
      } catch (err) {
        // Check for merge conflicts after failed pull
        if (hasConflicts()) {
          const conflictFiles = getConflictFiles();
          if (options.json) {
            console.log(JSON.stringify({
              success: false,
              error: 'Merge conflicts detected',
              code: 'MERGE_CONFLICT',
              conflictFiles,
              hint: `Resolve conflicts: cd ${dataDir} && git status`
            }, null, 2));
          } else {
            console.error(chalk.red('Merge conflicts detected'));
            console.log(chalk.yellow('Conflicted files:'));
            for (const file of conflictFiles) {
              console.log(chalk.yellow(`  - ${file}`));
            }
            console.log(chalk.gray(`\nResolve conflicts: cd ${dataDir} && git status`));
          }
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify({ success: false, error: err.message, code: 'GIT_ERROR' }));
        } else {
          console.error(chalk.red(`Git error: ${err.message}`));
        }
        process.exit(1);
      }
    });

  program
    .command('sync [message...]')
    .description('Pull latest, then commit and push (full round-trip)')
    .option('-m, --message <message>', 'Commit message')
    .option('--dry-run', 'Show what would be committed without committing')
    .option('--no-push', 'Commit but do not push to remote')
    .option('--json', 'Output as JSON')
    .action(async (messageParts, options) => {
      const dataDir = storage.getDataDir();

      if (!isGitRepo()) {
        if (options.json) {
          console.log(JSON.stringify({
            success: false,
            error: 'Data directory is not a git repository',
            code: 'NOT_GIT_REPO'
          }, null, 2));
        } else {
          console.error(chalk.red('Data directory is not a git repository'));
          console.log(chalk.gray('Run: synap save --help for setup instructions'));
        }
        process.exit(1);
      }

      // Build commit message
      let commitMessage = options.message;
      if (!commitMessage && messageParts && messageParts.length > 0) {
        commitMessage = messageParts.join(' ');
      }
      if (!commitMessage) {
        const now = new Date();
        const timestamp = now.toISOString().replace('T', ' ').slice(0, 16);
        commitMessage = `synap sync ${timestamp}`;
      }

      // Dry-run mode: show preview only
      if (options.dryRun) {
        const stats = getDiffStats();
        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            dryRun: true,
            message: commitMessage,
            changes: stats || 'No changes to commit'
          }, null, 2));
        } else {
          console.log(chalk.cyan('Dry run - would sync with message:'));
          console.log(chalk.yellow(`  "${commitMessage}"`));
          if (stats) {
            console.log(chalk.cyan('\nLocal changes:'));
            console.log(stats);
          } else {
            console.log(chalk.yellow('No local changes to commit'));
          }
        }
        return;
      }

      const results = { pulled: false, committed: false, pushed: false, errors: [] };

      // Pull first
      try {
        const pullOutput = execSync('git pull', { cwd: dataDir, encoding: 'utf-8' });
        results.pulled = true;
        results.pullMessage = pullOutput.trim() || 'Already up to date';
      } catch (err) {
        // Check for merge conflicts
        if (hasConflicts()) {
          const conflictFiles = getConflictFiles();
          results.errors.push({
            step: 'pull',
            error: 'Merge conflicts detected',
            code: 'MERGE_CONFLICT',
            conflictFiles,
            hint: `Resolve conflicts: cd ${dataDir} && git status`
          });
        } else {
          results.errors.push({ step: 'pull', error: err.message, code: 'GIT_ERROR' });
        }
      }

      // Stage and commit (only if pull succeeded)
      if (results.pulled) {
        try {
          execSync('git add .', { cwd: dataDir, stdio: 'pipe' });

          let hasChanges = true;
          try {
            execSync('git diff --cached --quiet', { cwd: dataDir, stdio: 'pipe' });
            hasChanges = false;
          } catch {
            hasChanges = true;
          }

          if (hasChanges) {
            // Commit using stdin to prevent shell injection
            const commitResult = spawnSync('git', ['commit', '-F', '-'], {
              cwd: dataDir,
              input: commitMessage,
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe']
            });

            if (commitResult.status !== 0) {
              throw new Error(commitResult.stderr || 'Commit failed');
            }

            results.committed = true;
            results.commitMessage = commitMessage;
          } else {
            results.commitMessage = 'Nothing to commit';
          }
        } catch (err) {
          results.errors.push({ step: 'commit', error: err.message, code: 'GIT_ERROR' });
        }
      }

      // Push (unless --no-push flag or nothing committed)
      if (results.committed && options.push !== false) {
        if (!hasRemote()) {
          results.errors.push({ step: 'push', error: 'No git remote configured', code: 'NO_REMOTE' });
        } else {
          try {
            execSync('git push', { cwd: dataDir, stdio: 'pipe' });
            results.pushed = true;
          } catch (err) {
            results.errors.push({ step: 'push', error: 'Push failed (check network or remote permissions)', code: 'PUSH_FAILED' });
          }
        }
      } else if (results.committed && options.push === false) {
        results.pushSkipped = true;
      }

      if (options.json) {
        console.log(JSON.stringify({
          success: results.errors.length === 0,
          ...results
        }, null, 2));
      } else {
        if (results.pulled) {
          console.log(chalk.green(`Pulled: ${results.pullMessage}`));
        }
        if (results.committed) {
          console.log(chalk.green(`Committed: "${results.commitMessage}"`));
        } else if (results.pullMessage !== 'Already up to date' || !results.pulled) {
          console.log(chalk.yellow(results.commitMessage || 'Nothing to commit'));
        }
        if (results.pushed) {
          console.log(chalk.green('Pushed to remote'));
        } else if (results.pushSkipped) {
          console.log(chalk.yellow('Push skipped (--no-push flag)'));
        } else if (results.committed) {
          const pushErr = results.errors.find(e => e.step === 'push');
          console.log(chalk.yellow(pushErr ? pushErr.error : 'Push failed'));
        }
        for (const err of results.errors) {
          if (err.step !== 'push' || !results.committed) {
            console.error(chalk.red(`${err.step}: ${err.error}`));
          }
          if (err.conflictFiles) {
            console.log(chalk.yellow('Conflicted files:'));
            for (const file of err.conflictFiles) {
              console.log(chalk.yellow(`  - ${file}`));
            }
            console.log(chalk.gray(`\n${err.hint}`));
          }
        }
      }

      if (results.errors.length > 0) {
        process.exit(1);
      }
    });

  // Parse and execute
  await program.parseAsync(process.argv);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
