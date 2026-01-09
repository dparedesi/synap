# brain-dump

A CLI for externalizing your working memory - capture ideas, projects, features, todos, and questions.

[![npm version](https://img.shields.io/npm/v/brain-dump.svg)](https://www.npmjs.com/package/brain-dump)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

## Features

- **Quick Capture** - Add ideas, todos, projects, and questions with minimal friction
- **Agent-Ready** - Built-in `--json` flag for AI agent integration
- **Hierarchical Organization** - Link entries as parent/child relationships
- **Full-Text Search** - Search content and tags across all entries
- **Import/Export** - Backup and restore your data in JSON or CSV format
- **Claude Code Integration** - Bundled skill teaches AI agents how to use the tool
- **Safe Deletions** - All deletions are logged and reversible with `restore`
- **User Preferences (Memory)** - Store agent-readable preferences for consistent behavior
- **Setup Wizard** - Guided first-run experience for new installs

## Installation

```bash
npm install -g brain-dump
```

## Quick Start

```bash
# Capture thoughts quickly
brain add "Research state management options for the new app"
brain todo "Review PR #42 before standup"
brain idea "What if we added dark mode?"
brain question "How does the auth flow work?"

# See what needs attention
brain focus              # P1 todos + active projects
brain list --status raw  # Unprocessed entries

# Organize and complete
brain set abc123 --status active --priority 1
brain done abc123

# Search and explore
brain search "auth"
brain tree               # Hierarchical view

# First-run setup
brain setup
```

## Commands

| Command | Description |
|---------|-------------|
| `brain add <text>` | Quick capture (defaults to idea) |
| `brain todo <text>` | Add a todo |
| `brain question <text>` | Add a question |
| `brain idea <text>` | Add an idea |
| `brain project <text>` | Add a project |
| `brain feature <text>` | Add a feature |
| `brain note <text>` | Add a note |
| `brain ref <text>` | Add a reference |
| `brain list` | List entries (with filters) |
| `brain show <id>` | Show entry details |
| `brain search <query>` | Full-text search |
| `brain edit <id>` | Edit entry content |
| `brain set <id>` | Update entry metadata |
| `brain link <id1> <id2>` | Link entries together |
| `brain done <id>` | Mark entry as done |
| `brain archive <id>` | Archive entry |
| `brain delete <id>` | Delete entry (logged) |
| `brain restore` | Restore deleted entries |
| `brain export` | Export entries to file |
| `brain import <file>` | Import entries from file |
| `brain stats` | Show statistics |
| `brain tree [id]` | Hierarchical view |
| `brain focus` | P1 todos + active projects |
| `brain review [daily\|weekly]` | Guided review session |
| `brain triage` | Interactive raw entry processing |
| `brain config [key] [value]` | View/update configuration |
| `brain tags` | List all tags with counts |
| `brain tags rename <old> <new>` | Rename tag across entries |
| `brain install-skill` | Install Claude Code skill |
| `brain preferences` | View or update user preferences |
| `brain setup` | Guided first-run wizard |

Run `brain <command> --help` for detailed options.

### Filtering Examples

```bash
# By type and status
brain list --type todo --status active
brain list --not-type reference

# By tags
brain list --tags work,urgent
brain list --any-tags work,personal  # OR logic
brain list --not-tags archived

# By date
brain list --since 7d               # Last 7 days
brain list --before 30d             # Older than 30 days
brain list --between 2025-01-01,2025-01-31
```

## Configuration

Configuration is stored at `~/.config/brain-dump/config.json`.

| Key | Default | Description |
|-----|---------|-------------|
| `defaultType` | `idea` | Default type for `brain add` |
| `defaultTags` | `[]` | Tags automatically added to new entries |
| `editor` | `$EDITOR` | Editor for `brain edit` |
| `dateFormat` | `relative` | Display format: `relative`, `absolute`, or `locale` |

```bash
# View all config
brain config

# Set a value
brain config defaultType todo
brain config dateFormat absolute
```

## Claude Code Integration

This CLI includes a skill that teaches Claude Code how to use brain-dump effectively.

```bash
# Install the skill
brain install-skill

# Uninstall
brain install-skill --uninstall
```

Once installed, Claude Code can help you:
- Capture ideas from conversations
- Review and triage your entries
- Organize projects hierarchically
- Generate daily/weekly reviews
- Follow your saved preferences from `brain preferences`

## User Preferences (Memory)

Preferences are stored at `~/.config/brain-dump/user-preferences.md` and are readable by agents.

```bash
# View preferences
brain preferences

# Edit in $EDITOR
brain preferences --edit

# Append to a section
brain preferences --append "## About Me" "I prefer concise summaries."

# Reset to template
brain preferences --reset
```

## Data Storage

All data is stored locally at `~/.config/brain-dump/`:

| File | Description |
|------|-------------|
| `entries.json` | Active entries |
| `archive.json` | Archived entries |
| `deletion-log.json` | Audit log for restore capability |
| `config.json` | User configuration |
| `user-preferences.md` | Agent-readable preferences |

## Development

```bash
# Clone and install
git clone https://github.com/yourusername/brain-dump-cli.git
cd brain-dump-cli
npm install

# Run locally
node src/cli.js <command>

# Run tests
npm test           # Watch mode
npm run test:run   # Single run

# Link for global use during development
npm link
```

**Requirements:** Node.js >= 18.0.0

## License

MIT
