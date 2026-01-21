# synap CLI Specification

> A CLI for externalizing your working memory

## Vision & Philosophy

**One-liner**: Capture ideas, projects, features, todos, and questions without the overhead of complex tools like Asana.

**Core principle**: Zero-friction capture, structured retrieval.

**Anti-goals**:
- NOT a project management tool with sprints, milestones, and Gantt charts
- NOT a calendar or scheduling system
- NOT a wiki or documentation platform

**Agent-first design**: The human primarily interacts with an AI agent. The agent uses this CLI. The CLI provides structured JSON output for machine consumption and human-friendly output for direct use.

---

## Data Model

### Entry Schema

```typescript
interface Entry {
  // Identity
  id: string;              // UUID v4 (first 8 chars displayed for brevity)

  // Content
  content: string;         // The thought/idea (plain text, can be multiline)
  title?: string;          // Optional short title (auto-extracted from first line if not provided)

  // Classification
  type: EntryType;         // Categorization of the entry
  status: EntryStatus;     // Lifecycle state
  priority?: 1 | 2 | 3;    // 1=high, 2=medium, 3=low (null = unprioritized)

  // Organization
  tags: string[];          // Flexible tagging (e.g., ["work", "urgent", "Q1"])

  // Relationships
  parent?: string;         // Entry ID - hierarchical relationship
  related?: string[];      // Entry IDs - loose associations

  // Metadata
  createdAt: string;       // ISO 8601 timestamp
  updatedAt: string;       // ISO 8601 timestamp
  source?: string;         // Where it came from: "cli", "agent", "import"
}
```

### Entry Types

| Type | Description | When to Use |
|------|-------------|-------------|
| `idea` | Raw thought, possibility, inspiration | Brainstorming, shower thoughts, "what if..." |
| `project` | Multi-step initiative with clear goal | Something requiring multiple features/todos |
| `feature` | Discrete capability or enhancement | Specific functionality to build (usually has parent project) |
| `todo` | Single actionable task | Something completable in one session |
| `question` | Something needing research/answer | Blockers, decisions to make, things to look up |
| `reference` | Information to remember/look up later | Links, quotes, facts, documentation |
| `note` | General capture that doesn't fit above | Meeting notes, observations, logs |

### Entry Statuses

| Status | Description | Visible by Default? |
|--------|-------------|---------------------|
| `raw` | Just captured, needs processing | Yes |
| `active` | Being actively worked on | Yes |
| `someday` | Parked for future consideration | No |
| `done` | Completed successfully | No |
| `archived` | Hidden, no longer relevant | No |

---

## Storage

### Location

All data is stored in `~/.config/synap/`.

### Files

| File | Purpose |
|------|---------|
| `entries.json` | All active entries (not archived) |
| `archive.json` | Archived entries (moved here for performance) |
| `deletion-log.json` | Audit log for deleted entries (enables restore) |
| `config.json` | User preferences |

### Format

```json
{
  "version": 1,
  "entries": [...]
}
```

Version field enables future migrations.

### Principles

- **Atomic writes**: Write to temp file, then rename (prevents corruption)
- **Human-readable**: JSON, not binary (enables manual inspection/editing)
- **Portable**: Plain files, no database server required

---

## Command Reference

### Overview

| Category | Command | Description |
|----------|---------|-------------|
| **Capture** | `synap add <text>` | Quick capture (default: raw idea) |
| | `synap todo <text>` | Shorthand for `--type todo` |
| | `synap question <text>` | Shorthand for `--type question` |
| **Query** | `synap list` | List entries (filtered) |
| | `synap show <id>` | Show full entry details |
| | `synap search <query>` | Full-text search |
| **Modify** | `synap edit <id>` | Edit entry content |
| | `synap set <id>` | Update metadata (type, status, priority, tags) |
| | `synap link <id1> <id2>` | Create relationships |
| **Bulk** | `synap done <ids...>` | Mark entries as done |
| | `synap archive <ids...>` | Archive entries |
| | `synap delete <ids...>` | Delete entries (with logging) |
| | `synap restore` | Restore deleted entries |
| **Maintenance** | `synap stats` | Overview statistics |
| | `synap export` | Export entries |
| | `synap import` | Import entries |
| | `synap install-skill` | Install Claude Code skill |

### Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON (for agents) |
| `--help` | Show command help |
| `--version` | Show version |

---

### Capture Commands

#### `synap add <content>`

Quick capture of a thought.

```bash
synap add "What if we used SQLite instead of JSON files?"
synap add "Need to review PR #42" --type todo --priority 1
synap add "Meeting with Sarah about Q1 planning" --type note --tags "meetings,Q1"
synap add --type project --title "synap CLI" "Build a CLI for capturing thoughts..."
```

**Options**:

| Option | Description | Default |
|--------|-------------|---------|
| `--type <type>` | Entry type | `idea` |
| `--title <title>` | Short title | First line of content |
| `--priority <1\|2\|3>` | Priority level | None |
| `--tags <tags>` | Comma-separated tags | `[]` |
| `--parent <id>` | Parent entry ID | None |
| `--json` | Output as JSON | false |

**Human output**:
```
Added idea a1b2c3d4: "What if we used SQLite instead of JSON files?"
```

**JSON output**:
```json
{
  "success": true,
  "entry": { "id": "a1b2c3d4-...", "content": "...", "type": "idea", ... }
}
```

#### `synap todo <content>`

Shorthand for adding a todo.

```bash
synap todo "Review PR #42"
# Equivalent to: synap add "Review PR #42" --type todo
```

#### `synap question <content>`

Shorthand for adding a question.

```bash
synap question "Should we use SQLite or JSON files?"
# Equivalent to: synap add "Should we use SQLite or JSON files?" --type question
```

---

### Query Commands

#### `synap list`

List entries with filtering.

```bash
synap list                              # Active + raw entries (default)
synap list --all                        # All entries except archived
synap list --type todo                  # Only todos
synap list --status raw                 # Only raw entries (need triage)
synap list --tags work,urgent           # Entries with ALL specified tags
synap list --priority 1                 # High priority only
synap list --parent a1b2c3d4            # Children of specific entry
synap list --since 7d                   # Created in last 7 days
synap list --limit 20                   # Max 20 results
synap list --json                       # JSON output for agents
```

**Options**:

| Option | Description | Default |
|--------|-------------|---------|
| `--type <type>` | Filter by type | All |
| `--status <status>` | Filter by status | `raw,active` |
| `--tags <tags>` | Filter by tags (AND logic) | None |
| `--priority <1\|2\|3>` | Filter by priority | All |
| `--parent <id>` | Filter by parent | None |
| `--orphans` | Only entries without parent | false |
| `--since <duration>` | Created after (e.g., `7d`, `24h`) | None |
| `--all` | Include all statuses except archived | false |
| `--done` | Include done entries | false |
| `--archived` | Show only archived entries | false |
| `--limit <n>` | Max entries to return | 50 |
| `--sort <field>` | Sort by: `created`, `updated`, `priority` | `created` |
| `--reverse` | Reverse sort order | false |
| `--json` | Output as JSON | false |

**Human output**:
```
Entries (12 total, showing active + raw)

IDEAS (3)
  a1b2c3d4  [P1] synap CLI concept                  #tools #productivity
  b2c3d4e5       What if we used SQLite?             #technical

TODOS (5)
  c3d4e5f6  [P1] Review PR #42                       #work
  d4e5f6g7  [P2] Write SPEC.md for synap        #work #writing
  ...

QUESTIONS (2)
  e5f6g7h8       Should we use SQLite or JSON?       #technical
  ...

Tip: Use --type todo to see only todos
```

**JSON output**:
```json
{
  "success": true,
  "entries": [...],
  "total": 47,
  "returned": 12,
  "query": { "status": ["raw", "active"], "limit": 50 }
}
```

#### `synap show <id>`

Show full entry details.

```bash
synap show a1b2c3d4
synap show a1b2c3d4 --with-children     # Include child entries
synap show a1b2c3d4 --with-related      # Include related entries
synap show a1b2c3d4 --json
```

**Options**:

| Option | Description |
|--------|-------------|
| `--with-children` | Include child entries |
| `--with-related` | Include related entries |
| `--json` | Output as JSON |

**Human output**:
```
Entry a1b2c3d4-e5f6-7890-abcd-ef1234567890

  Type:     idea
  Status:   active
  Priority: P1 (high)
  Tags:     #tools #productivity #agents

  Title: synap CLI concept

  Content:
  Build a CLI tool for capturing thoughts without the overhead of Asana.
  Should work for both humans and AI agents. Key insight: the human mostly
  talks to the agent, the agent uses the CLI.

  Created:  2026-01-05 08:30:00
  Updated:  2026-01-05 08:30:00
  Source:   agent

  Related:  f7e8d9c0 (reference: "Agent-Ready CLI pattern")
```

#### `synap search <query>`

Full-text search across content and titles.

```bash
synap search "SQLite"
synap search "agent" --type idea
synap search "meeting" --since 30d --json
```

**Options**:

| Option | Description |
|--------|-------------|
| `--type <type>` | Filter results by type |
| `--status <status>` | Filter results by status |
| `--since <duration>` | Only search recent entries |
| `--limit <n>` | Max results (default: 20) |
| `--json` | Output as JSON |

---

### Modify Commands

#### `synap edit <id>`

Edit entry content.

```bash
synap edit a1b2c3d4                          # Opens $EDITOR
synap edit a1b2c3d4 --content "New content"  # Non-interactive
synap edit a1b2c3d4 --title "New title"
synap edit a1b2c3d4 --append "Additional thought"
```

**Options**:

| Option | Description |
|--------|-------------|
| `--content <text>` | Replace content (non-interactive) |
| `--title <title>` | Update title |
| `--append <text>` | Append to content |
| `--json` | Output as JSON |

#### `synap set <id>`

Update entry metadata.

```bash
synap set a1b2c3d4 --type project
synap set a1b2c3d4 --status active
synap set a1b2c3d4 --priority 1
synap set a1b2c3d4 --tags "work,urgent,Q1"
synap set a1b2c3d4 --add-tags "important"
synap set a1b2c3d4 --remove-tags "draft"
synap set a1b2c3d4 --clear-priority
synap set a1b2c3d4 --type todo --priority 1 --tags "work"  # Multiple at once
```

**Options**:

| Option | Description |
|--------|-------------|
| `--type <type>` | Change type |
| `--status <status>` | Change status |
| `--priority <1\|2\|3>` | Set priority |
| `--clear-priority` | Remove priority |
| `--tags <tags>` | Replace all tags |
| `--add-tags <tags>` | Add tags |
| `--remove-tags <tags>` | Remove tags |
| `--parent <id>` | Set parent |
| `--clear-parent` | Remove parent |
| `--json` | Output as JSON |

#### `synap link <id1> <id2>`

Create relationship between entries.

```bash
synap link a1b2c3d4 b2c3d4e5                # Add to related
synap link a1b2c3d4 b2c3d4e5 --as-parent    # Set b2c3d4e5 as parent of a1b2c3d4
synap link a1b2c3d4 b2c3d4e5 --as-child     # Set b2c3d4e5 as child of a1b2c3d4
synap link a1b2c3d4 b2c3d4e5 --unlink       # Remove relationship
```

---

### Bulk Commands

#### `synap done <ids...>`

Mark entries as done.

```bash
synap done a1b2c3d4
synap done a1b2c3d4 b2c3d4e5 c3d4e5f6       # Multiple
synap done --type todo --tags "sprint-1"     # By filter
synap done --dry-run --type todo             # Preview
```

**Options**:

| Option | Description |
|--------|-------------|
| `--type <type>` | Filter by type |
| `--tags <tags>` | Filter by tags |
| `--dry-run` | Show what would be marked done |
| `--confirm` | Skip confirmation prompt |
| `--json` | Output as JSON |

#### `synap archive <ids...>`

Archive entries (hides from default view).

```bash
synap archive a1b2c3d4
synap archive --status done --since 30d      # Archive old completed items
synap archive --dry-run --status done
```

Same options as `synap done`.

#### `synap delete <ids...>`

Delete entries (logged for undo).

```bash
synap delete a1b2c3d4
synap delete a1b2c3d4 b2c3d4e5 --confirm
synap delete --status archived --since 90d   # Clean up old archives
synap delete --dry-run --type reference --tags "temp"
```

**Options**:

| Option | Description |
|--------|-------------|
| `--type <type>` | Filter by type |
| `--status <status>` | Filter by status |
| `--tags <tags>` | Filter by tags |
| `--since <duration>` | Filter by age |
| `--dry-run` | Show what would be deleted |
| `--confirm` | Skip confirmation prompt |
| `--force` | Override safety warnings |
| `--json` | Output as JSON |

**Safety features**:
- Always logs deleted entries to `deletion-log.json` BEFORE deletion
- Deleting >10 entries requires `--confirm` or `--force`
- Deleting entries with children requires `--force`
- Shows preview even with `--confirm` for filter-based deletions

#### `synap restore`

Restore deleted entries.

```bash
synap restore --last 1                       # Restore most recent deletion
synap restore --last 5                       # Restore last 5
synap restore --ids a1b2c3d4,b2c3d4e5        # Restore specific IDs
synap restore --list                         # Show deletion log
```

---

### Maintenance Commands

#### `synap stats`

Show entry statistics.

```bash
synap stats
synap stats --json
```

**Human output**:
```
synap Statistics

  Total entries: 47
  Active:        23
  Raw (need triage): 8
  Done:          12
  Archived:      4

  By Type:
    ideas:      15
    todos:      18
    projects:    4
    features:    6
    questions:   3
    references:  1

  High Priority (P1): 5
  Created this week:  12
  Updated today:       3

Tip: Run "synap list --status raw" to triage unprocessed entries
```

#### `synap export`

Export entries for backup or migration.

```bash
synap export                                 # Export all to stdout
synap export --file backup.json              # Export to file
synap export --type todo --status active     # Export filtered
synap export --format csv                    # CSV format
```

#### `synap import`

Import entries from file.

```bash
synap import backup.json
synap import backup.json --dry-run           # Preview what would be imported
synap import backup.json --merge             # Update existing, add new
synap import backup.json --skip-existing     # Only add new entries
```

#### `synap install-skill`

Install Claude Code skill for AI agents.

```bash
synap install-skill
synap install-skill --uninstall
synap install-skill --force                  # Override ownership check
```

---

## Output Formats

### Human Mode (Default)

- Colored output using chalk
- Grouped by type or status
- Truncated content with "..."
- Priority badges: `[P1]`, `[P2]`, `[P3]`
- Tags displayed as `#tag`
- Tips and suggestions for next actions

### Agent Mode (--json)

- Consistent structure across commands
- Always includes `success: boolean`
- Includes `error: string` on failure
- Returns full objects, not truncated
- Includes metadata (counts, filters used)

---

## Safety Patterns

### Log Before Delete

All deletions are logged to `deletion-log.json` BEFORE the delete operation. This enables:
- `synap restore --last N` to undo recent deletions
- `synap restore --ids <ids>` to restore specific entries
- `synap restore --list` to see deletion history

### Two-Step Pattern for Bulk Operations

1. **Preview**: `synap delete --status archived --since 90d --dry-run`
2. **Confirm**: User reviews what will be affected
3. **Execute**: `synap delete --ids "<ids>" --confirm`

**Principle**: Filters are for DISCOVERY, IDs are for EXECUTION.

### Safety Warnings

- Deleting >10 entries: Requires `--confirm` or `--force`
- Deleting entries with children: Requires `--force`
- Short search patterns (<3 chars): Warning displayed
- Large batch operations: Show count and ask for confirmation

---

## Error Handling

### Error Response Format (JSON)

```json
{
  "success": false,
  "error": "Entry not found: a1b2c3d4",
  "code": "ENTRY_NOT_FOUND"
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `ENTRY_NOT_FOUND` | Entry ID doesn't exist |
| `AMBIGUOUS_ID` | Short ID matches multiple entries |
| `INVALID_TYPE` | Unknown entry type |
| `INVALID_STATUS` | Unknown entry status |
| `CIRCULAR_REFERENCE` | Parent chain creates a loop |
| `VALIDATION_ERROR` | Invalid input data |
| `FILE_ERROR` | Storage file access issue |

---

## Configuration

### config.json

```json
{
  "defaultType": "idea",
  "defaultTags": [],
  "editor": "$EDITOR",
  "dateFormat": "relative"
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SYNAP_DIR` | Override both config and data directory (legacy, backward compatible) |
| `SYNAP_CONFIG_DIR` | Override config directory only |
| `SYNAP_DATA_DIR` | Override data directory only |
| `EDITOR` | Editor for interactive edit |

### Storage Locations

**Default (backward compatible):**
```
~/.config/synap/
├── config.json           # Settings (local)
├── deletion-log.json     # Audit log (local)
├── entries.json          # Data (syncable)
├── archive.json          # Data (syncable)
└── user-preferences.md   # Data (syncable)
```

**With custom dataDir:**
```
~/.config/synap/          # Config (local)
├── config.json
└── deletion-log.json

~/synap-data/             # Data (syncable, user-configured)
├── entries.json
├── archive.json
└── user-preferences.md
```

Configure with: `synap config dataDir ~/synap-data`

---

## Performance Targets

| Operation | Target |
|-----------|--------|
| `synap add` | < 100ms |
| `synap list` | < 200ms (up to 1000 entries) |
| `synap search` | < 500ms (full-text scan) |

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `commander` | CLI framework |
| `chalk` | Terminal colors (ESM, dynamic import) |
| `boxen` | Terminal boxes (ESM, dynamic import) |
| `uuid` | ID generation |
| `update-notifier` | Version update notifications |

---

## Future Considerations

### Multi-device Sync ✅ (Implemented v0.8.0)

- Custom data directory via `synap config dataDir <path>`
- Users can point to a git repo, Dropbox, or iCloud folder
- Config stays local, data is syncable
- `synap setup` wizard includes data location step

### Performance at Scale

- If entries exceed 1000, consider SQLite migration
- Archive old entries to separate file for faster list operations

### Integrations

- Export to GitHub Issues
- Sync with Obsidian vault
- Zapier/webhook triggers
