#!/usr/bin/env node

/**
 * brain-dump CLI
 * A CLI for externalizing your working memory
 */

const { program } = require('commander');
const pkg = require('../package.json');

// Storage and utility modules
const storage = require('./storage');
const deletionLog = require('./deletion-log');

async function main() {
  // Dynamic imports for ESM-only packages
  const chalk = (await import('chalk')).default;
  const boxen = (await import('boxen')).default;

  // Check for updates (non-blocking)
  const updateNotifier = (await import('update-notifier')).default;
  updateNotifier({ pkg }).notify();

  program
    .name('brain')
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
    .option('--json', 'Output as JSON')
    .action(async (contentParts, options) => {
      const content = contentParts.join(' ');
      const tags = mergeTags(options.tags);

      const entry = await storage.addEntry({
        content,
        title: options.title,
        type: options.type,
        priority: options.priority ? parseInt(options.priority, 10) : undefined,
        tags,
        parent: options.parent,
        source: 'cli'
      });

      if (options.json) {
        console.log(JSON.stringify({ success: true, entry }, null, 2));
      } else {
        const shortId = entry.id.slice(0, 8);
        const priorityBadge = entry.priority ? chalk.yellow(`[P${entry.priority}] `) : '';
        console.log(chalk.green(`Added ${entry.type} ${shortId}: `) + priorityBadge + `"${content.slice(0, 50)}${content.length > 50 ? '...' : ''}"`);
      }
    });

  program
    .command('todo <content...>')
    .description('Add a new todo (shorthand for add --type todo)')
    .option('-p, --priority <priority>', 'Priority level (1=high, 2=medium, 3=low)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--parent <id>', 'Parent entry ID')
    .option('--json', 'Output as JSON')
    .action(async (contentParts, options) => {
      const content = contentParts.join(' ');
      const tags = mergeTags(options.tags);

      const entry = await storage.addEntry({
        content,
        type: 'todo',
        priority: options.priority ? parseInt(options.priority, 10) : undefined,
        tags,
        parent: options.parent,
        source: 'cli'
      });

      if (options.json) {
        console.log(JSON.stringify({ success: true, entry }, null, 2));
      } else {
        const shortId = entry.id.slice(0, 8);
        const priorityBadge = entry.priority ? chalk.yellow(`[P${entry.priority}] `) : '';
        console.log(chalk.green(`Added todo ${shortId}: `) + priorityBadge + `"${content.slice(0, 50)}${content.length > 50 ? '...' : ''}"`);
      }
    });

  program
    .command('question <content...>')
    .description('Add a new question (shorthand for add --type question)')
    .option('-p, --priority <priority>', 'Priority level (1=high, 2=medium, 3=low)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--parent <id>', 'Parent entry ID')
    .option('--json', 'Output as JSON')
    .action(async (contentParts, options) => {
      const content = contentParts.join(' ');
      const tags = mergeTags(options.tags);

      const entry = await storage.addEntry({
        content,
        type: 'question',
        priority: options.priority ? parseInt(options.priority, 10) : undefined,
        tags,
        parent: options.parent,
        source: 'cli'
      });

      if (options.json) {
        console.log(JSON.stringify({ success: true, entry }, null, 2));
      } else {
        const shortId = entry.id.slice(0, 8);
        const priorityBadge = entry.priority ? chalk.yellow(`[P${entry.priority}] `) : '';
        console.log(chalk.green(`Added question ${shortId}: `) + priorityBadge + `"${content.slice(0, 50)}${content.length > 50 ? '...' : ''}"`);
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
    .option('-p, --priority <priority>', 'Filter by priority')
    .option('--parent <id>', 'Filter by parent')
    .option('--orphans', 'Only entries without parent')
    .option('--since <duration>', 'Created after (e.g., 7d, 24h)')
    .option('-a, --all', 'Include all statuses except archived')
    .option('--done', 'Include done entries')
    .option('--archived', 'Show only archived entries')
    .option('-n, --limit <n>', 'Max entries to return', '50')
    .option('--sort <field>', 'Sort by: created, updated, priority', 'created')
    .option('--reverse', 'Reverse sort order')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      // Build query from options
      const query = {
        type: options.type,
        status: options.archived ? 'archived' : (options.status || (options.all ? null : 'raw,active')),
        tags: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
        priority: options.priority ? parseInt(options.priority, 10) : undefined,
        parent: options.parent,
        orphans: options.orphans,
        since: options.since,
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
            console.log(chalk.gray('Tip: Use --all to see all entries, or brain add "your thought" to create one.'));
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
            console.log(`  ${chalk.blue(shortId)}  ${priorityBadge} ${title}${truncated}${tags} ${timeStr}`);
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
    .option('--since <duration>', 'Only search recent entries')
    .option('-n, --limit <n>', 'Max results', '20')
    .option('--json', 'Output as JSON')
    .action(async (queryParts, options) => {
      const query = queryParts.join(' ');
      const result = await storage.searchEntries(query, {
        type: options.type,
        status: options.status,
        since: options.since,
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
        const { execSync } = require('child_process');
        const fs = require('fs');
        const os = require('os');
        const path = require('path');

        const tmpFile = path.join(os.tmpdir(), `brain-${entry.id.slice(0, 8)}.txt`);
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
        console.log(chalk.green(`Deleted ${entries.length} entries (use "brain restore --last ${entries.length}" to undo)`));
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
        console.log(chalk.bold('Brain Dump Statistics\n'));
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
        console.log(`  High Priority (P1): ${stats.highPriority}`);
        console.log(`  Created this week:  ${stats.createdThisWeek}`);
        console.log(`  Updated today:      ${stats.updatedToday}`);

        if (stats.byStatus.raw > 0) {
          console.log(chalk.gray('\nTip: Run "brain list --status raw" to triage unprocessed entries'));
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

  program
    .command('install-skill')
    .description('Install Claude Code skill')
    .option('--uninstall', 'Remove the skill')
    .option('--force', 'Override ownership check')
    .action(async (options) => {
      const skillInstaller = require('./skill-installer');

      if (options.uninstall) {
        await skillInstaller.uninstall();
        console.log(chalk.green('Skill uninstalled'));
      } else {
        const result = await skillInstaller.install({ force: options.force });
        if (result.installed) {
          console.log(chalk.green('Skill installed to ~/.claude/skills/brain-dump-assistant/'));
        } else if (result.skipped) {
          console.log(chalk.yellow('Skill already up to date'));
        } else if (result.needsForce) {
          console.log(chalk.yellow('Skill was modified by user. Use --force to overwrite.'));
        }
      }
    });

  // Parse and execute
  await program.parseAsync(process.argv);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
