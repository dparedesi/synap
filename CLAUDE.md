# xbrain CLI

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

.claude/skills/xbrain-assistant/
  SKILL.md         # AI agent skill for Claude Code
```

## Key Patterns

### Agent-Ready CLI
This CLI follows the "Agent-Ready CLI" pattern:
- Works for both humans (colored output) AND agents (`--json` flag)
- Bundled SKILL.md teaches agents how to use the tool
- Safety patterns: log before delete, dry-run, undo capability

### Storage
- All data in `~/.config/xbrain/`
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
  status: 'raw' | 'active' | 'someday' | 'done' | 'archived';
  priority?: 1 | 2 | 3;
  tags: string[];
  parent?: string;
  related?: string[];
  createdAt: string;
  updatedAt: string;
  source?: 'cli' | 'agent' | 'import';  // Origin of entry
}
```

## Commands

| Command | Description |
|---------|-------------|
| `xbrain add <text>` | Quick capture |
| `xbrain todo <text>` | Add todo |
| `xbrain question <text>` | Add question |
| `xbrain idea <text>` | Add idea |
| `xbrain project <text>` | Add project |
| `xbrain feature <text>` | Add feature |
| `xbrain note <text>` | Add note |
| `xbrain ref <text>` | Add reference |
| `xbrain list` | List entries |
| `xbrain show <id>` | Show details |
| `xbrain search <query>` | Full-text search (includes tags) |
| `xbrain edit <id>` | Edit content |
| `xbrain set <id>` | Update metadata |
| `xbrain done <id>` | Mark done |
| `xbrain archive <id>` | Archive |
| `xbrain delete <id>` | Delete (logged) |
| `xbrain restore` | Restore deleted |
| `xbrain stats` | Statistics |
| `xbrain tree [id]` | Hierarchical view |
| `xbrain focus` | P1 todos + active projects |
| `xbrain review [daily\|weekly]` | Guided review session |
| `xbrain triage` | Interactive raw entry processing |
| `xbrain config [key] [value]` | View/update configuration |
| `xbrain tags` | List all tags with counts |
| `xbrain tags rename <old> <new>` | Rename tag across entries |
| `xbrain install-skill` | Install Claude skill |
| `xbrain preferences` | View or update user preferences |
| `xbrain setup` | Guided first-run wizard |
| `xbrain link <id1> <id2>` | Link entries (--as-parent, --as-child, --unlink) |
| `xbrain export` | Export entries (--file, --format, --type, --status) |
| `xbrain import <file>` | Import entries (--merge, --skip-existing, --dry-run) |

### Enhanced Filters (v0.3.0)

```bash
xbrain list --any-tags work,personal   # OR logic for tags
xbrain list --not-type reference       # Exclude type
xbrain list --not-tags archived        # Exclude entries with tag
xbrain list --before 7d                # Entries older than 7 days
xbrain list --between 2025-01-01,2025-01-31  # Date range
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
