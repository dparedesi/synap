# synap CLI

A CLI for externalizing your working memory - capture ideas, projects, features, todos, and questions.

## Project Structure

```
src/
  cli.js           # Entry point, all command definitions (Commander.js)
  storage.js       # Entry CRUD, JSON file handling, atomic writes
  deletion-log.js  # Audit log for deleted entries, enables restore
  preferences.js   # User preferences read/write/validation
  skill-installer.js # Installs SKILL.md to ~/.claude/skills/
  templates/
    user-preferences-template.md # Default preferences template

test/
  *.test.js        # Test suite (16 files, vitest)

scripts/
  postinstall.js   # npm postinstall - shows hints

.claude/skills/synap-assistant/
  SKILL.md         # AI agent skill for Claude Code (source of truth)
```

**Important**: The global skill at `~/.claude/skills/synap-assistant/SKILL.md` is auto-installed from this repo via `synap install-skill` or npm postinstall. **Never edit the global skill directly** — always edit the local `.claude/skills/synap-assistant/SKILL.md` in this repo, then reinstall.

## Key Patterns

### Agent-Ready CLI
This CLI follows the "Agent-Ready CLI" pattern:
- Works for both humans (colored output) AND agents (`--json` flag)
- Bundled SKILL.md teaches agents how to use the tool
- Safety patterns: log before delete, dry-run, undo capability

### Storage
- All data in `~/.config/synap/`
- `entries.json`: Active entries
- `archive.json`: Archived entries
- `deletion-log.json`: Audit log for restore capability
- `config.json`: User configuration (defaultType, defaultTags, editor, dateFormat)
- `user-preferences.md`: Agent-readable preferences
- Atomic writes (write to .tmp, then rename)

### Entry Model
```typescript
interface Entry {
  id: string;           // UUID v4
  content: string;      // The thought
  title?: string;       // Auto-extracted from first line
  type: 'idea' | 'project' | 'feature' | 'todo' | 'question' | 'reference' | 'note';
  status: 'raw' | 'active' | 'wip' | 'someday' | 'done' | 'archived';
  priority?: 1 | 2 | 3;
  tags: string[];
  parent?: string;
  related?: string[];
  due?: string;         // ISO date for due date
  startedAt?: string;   // ISO date when work started (wip status)
  createdAt: string;
  updatedAt: string;
  source?: 'cli' | 'agent' | 'import';  // Origin of entry
}
```

## Commands

| Command | Description |
|---------|-------------|
| `synap add <text>` | Quick capture |
| `synap todo <text>` | Add todo |
| `synap question <text>` | Add question |
| `synap idea <text>` | Add idea |
| `synap project <text>` | Add project |
| `synap feature <text>` | Add feature |
| `synap note <text>` | Add note |
| `synap ref <text>` | Add reference |
| `synap list` | List entries |
| `synap show <id>` | Show details |
| `synap search <query>` | Full-text search (includes tags) |
| `synap edit <id>` | Edit content |
| `synap set <id>` | Update metadata |
| `synap done <id>` | Mark done |
| `synap start <id>` | Start working (mark as WIP) |
| `synap stop <id>` | Stop working (remove WIP) |
| `synap log <id> <msg>` | Add timestamped log entry under parent |
| `synap archive <id>` | Archive |
| `synap delete <id>` | Delete (logged) |
| `synap restore` | Restore deleted |
| `synap stats` | Statistics |
| `synap tree [id]` | Hierarchical view |
| `synap focus` | P1 todos + active projects |
| `synap review [daily\|weekly]` | Guided review session |
| `synap triage` | Interactive raw entry processing |
| `synap config [key] [value]` | View/update configuration |
| `synap tags` | List all tags with counts |
| `synap tags rename <old> <new>` | Rename tag across entries |
| `synap install-skill` | Install Claude skill |
| `synap preferences` | View or update user preferences |
| `synap setup` | Guided first-run wizard |
| `synap link <id1> <id2>` | Link entries (--as-parent, --as-child, --unlink) |
| `synap export` | Export entries (--file, --format, --type, --status) |
| `synap import <file>` | Import entries (--merge, --skip-existing, --dry-run) |

Capture commands accept `--due` (YYYY-MM-DD, 3d/1w, weekday names: monday/friday, or keywords: today, tomorrow, next monday).

### Enhanced Filters (v0.3.0)

```bash
synap list --any-tags work,personal   # OR logic for tags
synap list --not-type reference       # Exclude type
synap list --not-tags archived        # Exclude entries with tag
synap list --before 7d                # Entries older than 7 days
synap list --between 2025-01-01,2025-01-31  # Date range
synap list --due-before 2025-01-15    # Due before date
synap list --due-after 7d             # Due after relative date
synap list --overdue                  # Overdue entries
synap list --has-due                  # Only entries with due dates
synap list --no-due                   # Only entries without due dates
```

## Testing

```bash
npm test           # Run tests with vitest
npm run test:run   # Run tests once
```

## Development

```bash
node src/cli.js <command>  # Run CLI locally
npm link                   # Link for global use
```
