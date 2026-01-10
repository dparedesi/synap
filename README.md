# xbrain

A CLI for externalizing your working memory - capture ideas, projects, features, todos, and questions.

[![npm version](https://img.shields.io/npm/v/xbrain.svg)](https://www.npmjs.com/package/xbrain)
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
npm install -g xbrain
```

## Quick Start

```bash
# Capture thoughts quickly
xbrain add "Research state management options for the new app"
xbrain todo "Review PR #42 before standup"
xbrain idea "What if we added dark mode?"
xbrain question "How does the auth flow work?"

# See what needs attention
xbrain focus              # P1 todos + active projects
xbrain list --status raw  # Unprocessed entries

# Organize and complete
xbrain set abc123 --status active --priority 1
xbrain done abc123

# Search and explore
xbrain search "auth"
xbrain tree               # Hierarchical view

# First-run setup
xbrain setup
```

## Commands

| Command | Description |
|---------|-------------|
| `xbrain add <text>` | Quick capture (defaults to idea) |
| `xbrain todo <text>` | Add a todo |
| `xbrain question <text>` | Add a question |
| `xbrain idea <text>` | Add an idea |
| `xbrain project <text>` | Add a project |
| `xbrain feature <text>` | Add a feature |
| `xbrain note <text>` | Add a note |
| `xbrain ref <text>` | Add a reference |
| `xbrain list` | List entries (with filters) |
| `xbrain show <id>` | Show entry details |
| `xbrain search <query>` | Full-text search |
| `xbrain edit <id>` | Edit entry content |
| `xbrain set <id>` | Update entry metadata |
| `xbrain link <id1> <id2>` | Link entries together |
| `xbrain done <id>` | Mark entry as done |
| `xbrain archive <id>` | Archive entry |
| `xbrain delete <id>` | Delete entry (logged) |
| `xbrain restore` | Restore deleted entries |
| `xbrain export` | Export entries to file |
| `xbrain import <file>` | Import entries from file |
| `xbrain stats` | Show statistics |
| `xbrain tree [id]` | Hierarchical view |
| `xbrain focus` | P1 todos + active projects |
| `xbrain review [daily\|weekly]` | Guided review session |
| `xbrain triage` | Interactive raw entry processing |
| `xbrain config [key] [value]` | View/update configuration |
| `xbrain tags` | List all tags with counts |
| `xbrain tags rename <old> <new>` | Rename tag across entries |
| `xbrain install-skill` | Install Claude Code skill |
| `xbrain preferences` | View or update user preferences |
| `xbrain setup` | Guided first-run wizard |

Run `xbrain <command> --help` for detailed options.

### Filtering Examples

```bash
# By type and status
xbrain list --type todo --status active
xbrain list --not-type reference

# By tags
xbrain list --tags work,urgent
xbrain list --any-tags work,personal  # OR logic
xbrain list --not-tags archived

# By date
xbrain list --since 7d               # Last 7 days
xbrain list --before 30d             # Older than 30 days
xbrain list --between 2025-01-01,2025-01-31
```

## Configuration

Configuration is stored at `~/.config/xbrain/config.json`.

| Key | Default | Description |
|-----|---------|-------------|
| `defaultType` | `idea` | Default type for `xbrain add` |
| `defaultTags` | `[]` | Tags automatically added to new entries |
| `editor` | `$EDITOR` | Editor for `xbrain edit` |
| `dateFormat` | `relative` | Display format: `relative`, `absolute`, or `locale` |

```bash
# View all config
xbrain config

# Set a value
xbrain config defaultType todo
xbrain config dateFormat absolute
```

## Claude Code Integration

This CLI includes a skill that teaches Claude Code how to use xbrain effectively.

```bash
# Install the skill
xbrain install-skill

# Uninstall
xbrain install-skill --uninstall
```

Once installed, Claude Code can help you:
- Capture ideas from conversations
- Review and triage your entries
- Organize projects hierarchically
- Generate daily/weekly reviews
- Follow your saved preferences from `xbrain preferences`

## User Preferences (Memory)

Preferences are stored at `~/.config/xbrain/user-preferences.md` and are readable by agents.

```bash
# View preferences
xbrain preferences

# Edit in $EDITOR
xbrain preferences --edit

# Append to a section
xbrain preferences --append "## About Me" "I prefer concise summaries."

# Reset to template
xbrain preferences --reset
```

## Data Storage

All data is stored locally at `~/.config/xbrain/`:

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
git clone https://github.com/yourusername/xbrain-cli.git
cd xbrain-cli
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
