# brain-dump CLI

A CLI for externalizing your working memory - capture ideas, projects, features, todos, and questions.

## Project Structure

```
src/
  cli.js           # Entry point, all command definitions (Commander.js)
  storage.js       # Entry CRUD, JSON file handling, atomic writes
  deletion-log.js  # Audit log for deleted entries, enables restore
  skill-installer.js # Installs SKILL.md to ~/.claude/skills/

scripts/
  postinstall.js   # npm postinstall - shows hints

.claude/skills/brain-dump-assistant/
  SKILL.md         # AI agent skill for Claude Code
```

## Key Patterns

### Agent-Ready CLI
This CLI follows the "Agent-Ready CLI" pattern:
- Works for both humans (colored output) AND agents (`--json` flag)
- Bundled SKILL.md teaches agents how to use the tool
- Safety patterns: log before delete, dry-run, undo capability

### Storage
- All data in `~/.config/brain-dump/`
- `entries.json`: Active entries
- `archive.json`: Archived entries
- `deletion-log.json`: Audit log for restore capability
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
}
```

## Commands

| Command | Description |
|---------|-------------|
| `brain add <text>` | Quick capture |
| `brain todo <text>` | Add todo |
| `brain question <text>` | Add question |
| `brain list` | List entries |
| `brain show <id>` | Show details |
| `brain search <query>` | Full-text search |
| `brain edit <id>` | Edit content |
| `brain set <id>` | Update metadata |
| `brain done <id>` | Mark done |
| `brain archive <id>` | Archive |
| `brain delete <id>` | Delete (logged) |
| `brain restore` | Restore deleted |
| `brain stats` | Statistics |
| `brain install-skill` | Install Claude skill |

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
