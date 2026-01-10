# synap

A CLI for externalizing your working memory - capture ideas, projects, features, todos, and questions.

[![npm version](https://img.shields.io/npm/v/synap.svg)](https://www.npmjs.com/package/synap)
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
npm install -g synap
```

## Quick Start

```bash
# Capture thoughts quickly
synap add "Research state management options for the new app"
synap todo "Review PR #42 before standup"
synap idea "What if we added dark mode?"
synap question "How does the auth flow work?"

# See what needs attention
synap focus              # P1 todos + active projects
synap list --status raw  # Unprocessed entries

# Organize and complete
synap set abc123 --status active --priority 1
synap done abc123

# Search and explore
synap search "auth"
synap tree               # Hierarchical view

# First-run setup
synap setup
```

## Commands

| Command | Description |
|---------|-------------|
| `synap add <text>` | Quick capture (defaults to idea) |
| `synap todo <text>` | Add a todo |
| `synap question <text>` | Add a question |
| `synap idea <text>` | Add an idea |
| `synap project <text>` | Add a project |
| `synap feature <text>` | Add a feature |
| `synap note <text>` | Add a note |
| `synap ref <text>` | Add a reference |
| `synap list` | List entries (with filters) |
| `synap show <id>` | Show entry details |
| `synap search <query>` | Full-text search |
| `synap edit <id>` | Edit entry content |
| `synap set <id>` | Update entry metadata |
| `synap link <id1> <id2>` | Link entries together |
| `synap done <id>` | Mark entry as done |
| `synap archive <id>` | Archive entry |
| `synap delete <id>` | Delete entry (logged) |
| `synap restore` | Restore deleted entries |
| `synap export` | Export entries to file |
| `synap import <file>` | Import entries from file |
| `synap stats` | Show statistics |
| `synap tree [id]` | Hierarchical view |
| `synap focus` | P1 todos + active projects |
| `synap review [daily\|weekly]` | Guided review session |
| `synap triage` | Interactive raw entry processing |
| `synap config [key] [value]` | View/update configuration |
| `synap tags` | List all tags with counts |
| `synap tags rename <old> <new>` | Rename tag across entries |
| `synap install-skill` | Install Claude Code skill |
| `synap preferences` | View or update user preferences |
| `synap setup` | Guided first-run wizard |

Run `synap <command> --help` for detailed options.

### Filtering Examples

```bash
# By type and status
synap list --type todo --status active
synap list --not-type reference

# By tags
synap list --tags work,urgent
synap list --any-tags work,personal  # OR logic
synap list --not-tags archived

# By date
synap list --since 7d               # Last 7 days
synap list --before 30d             # Older than 30 days
synap list --between 2025-01-01,2025-01-31
```

## Configuration

Configuration is stored at `~/.config/synap/config.json`.

| Key | Default | Description |
|-----|---------|-------------|
| `defaultType` | `idea` | Default type for `synap add` |
| `defaultTags` | `[]` | Tags automatically added to new entries |
| `editor` | `$EDITOR` | Editor for `synap edit` |
| `dateFormat` | `relative` | Display format: `relative`, `absolute`, or `locale` |

```bash
# View all config
synap config

# Set a value
synap config defaultType todo
synap config dateFormat absolute
```

## Claude Code Integration

This CLI includes a skill that teaches Claude Code how to use synap effectively.

```bash
# Install the skill
synap install-skill

# Uninstall
synap install-skill --uninstall
```

Once installed, Claude Code can help you:
- Capture ideas from conversations
- Review and triage your entries
- Organize projects hierarchically
- Generate daily/weekly reviews
- Follow your saved preferences from `synap preferences`

## User Preferences (Memory)

Preferences are stored at `~/.config/synap/user-preferences.md` and are readable by agents.

```bash
# View preferences
synap preferences

# Edit in $EDITOR
synap preferences --edit

# Append to a section
synap preferences --append "## About Me" "I prefer concise summaries."

# Reset to template
synap preferences --reset
```

## Data Storage

All data is stored locally at `~/.config/synap/`:

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
git clone https://github.com/yourusername/synap-cli.git
cd synap-cli
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
