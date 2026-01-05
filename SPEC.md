# brain-dump CLI Specification

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

All data is stored in `~/.config/brain-dump/`.

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
| **Capture** | `brain add <text>` | Quick capture (default: raw idea) |
| | `brain todo <text>` | Shorthand for `--type todo` |
| | `brain question <text>` | Shorthand for `--type question` |
| **Query** | `brain list` | List entries (filtered) |
| | `brain show <id>` | Show full entry details |
| | `brain search <query>` | Full-text search |
| **Modify** | `brain edit <id>` | Edit entry content |
| | `brain set <id>` | Update metadata (type, status, priority, tags) |
| | `brain link <id1> <id2>` | Create relationships |
| **Bulk** | `brain done <ids...>` | Mark entries as done |
| | `brain archive <ids...>` | Archive entries |
| | `brain delete <ids...>` | Delete entries (with logging) |
| | `brain restore` | Restore deleted entries |
| **Maintenance** | `brain stats` | Overview statistics |
| | `brain export` | Export entries |
| | `brain import` | Import entries |
| | `brain install-skill` | Install Claude Code skill |

### Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON (for agents) |
| `--help` | Show command help |
| `--version` | Show version |

---

### Capture Commands

#### `brain add <content>`

Quick capture of a thought.

```bash
brain add "What if we used SQLite instead of JSON files?"
brain add "Need to review PR #42" --type todo --priority 1
brain add "Meeting with Sarah about Q1 planning" --type note --tags "meetings,Q1"
brain add --type project --title "Brain Dump CLI" "Build a CLI for capturing thoughts..."
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

#### `brain todo <content>`

Shorthand for adding a todo.

```bash
brain todo "Review PR #42"
# Equivalent to: brain add "Review PR #42" --type todo
```

#### `brain question <content>`

Shorthand for adding a question.

```bash
brain question "Should we use SQLite or JSON files?"
# Equivalent to: brain add "Should we use SQLite or JSON files?" --type question
```

---

### Query Commands

#### `brain list`

List entries with filtering.

```bash
brain list                              # Active + raw entries (default)
brain list --all                        # All entries except archived
brain list --type todo                  # Only todos
brain list --status raw                 # Only raw entries (need triage)
brain list --tags work,urgent           # Entries with ALL specified tags
brain list --priority 1                 # High priority only
brain list --parent a1b2c3d4            # Children of specific entry
brain list --since 7d                   # Created in last 7 days
brain list --limit 20                   # Max 20 results
brain list --json                       # JSON output for agents
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
  a1b2c3d4  [P1] Brain dump CLI concept              #tools #productivity
  b2c3d4e5       What if we used SQLite?             #technical

TODOS (5)
  c3d4e5f6  [P1] Review PR #42                       #work
  d4e5f6g7  [P2] Write SPEC.md for brain-dump        #work #writing
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

#### `brain show <id>`

Show full entry details.

```bash
brain show a1b2c3d4
brain show a1b2c3d4 --with-children     # Include child entries
brain show a1b2c3d4 --with-related      # Include related entries
brain show a1b2c3d4 --json
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

  Title: Brain dump CLI concept

  Content:
  Build a CLI tool for capturing thoughts without the overhead of Asana.
  Should work for both humans and AI agents. Key insight: the human mostly
  talks to the agent, the agent uses the CLI.

  Created:  2026-01-05 08:30:00
  Updated:  2026-01-05 08:30:00
  Source:   agent

  Related:  f7e8d9c0 (reference: "Agent-Ready CLI pattern")
```

#### `brain search <query>`

Full-text search across content and titles.

```bash
brain search "SQLite"
brain search "agent" --type idea
brain search "meeting" --since 30d --json
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

#### `brain edit <id>`

Edit entry content.

```bash
brain edit a1b2c3d4                          # Opens $EDITOR
brain edit a1b2c3d4 --content "New content"  # Non-interactive
brain edit a1b2c3d4 --title "New title"
brain edit a1b2c3d4 --append "Additional thought"
```

**Options**:

| Option | Description |
|--------|-------------|
| `--content <text>` | Replace content (non-interactive) |
| `--title <title>` | Update title |
| `--append <text>` | Append to content |
| `--json` | Output as JSON |

#### `brain set <id>`

Update entry metadata.

```bash
brain set a1b2c3d4 --type project
brain set a1b2c3d4 --status active
brain set a1b2c3d4 --priority 1
brain set a1b2c3d4 --tags "work,urgent,Q1"
brain set a1b2c3d4 --add-tags "important"
brain set a1b2c3d4 --remove-tags "draft"
brain set a1b2c3d4 --clear-priority
brain set a1b2c3d4 --type todo --priority 1 --tags "work"  # Multiple at once
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

#### `brain link <id1> <id2>`

Create relationship between entries.

```bash
brain link a1b2c3d4 b2c3d4e5                # Add to related
brain link a1b2c3d4 b2c3d4e5 --as-parent    # Set b2c3d4e5 as parent of a1b2c3d4
brain link a1b2c3d4 b2c3d4e5 --as-child     # Set b2c3d4e5 as child of a1b2c3d4
brain link a1b2c3d4 b2c3d4e5 --unlink       # Remove relationship
```

---

### Bulk Commands

#### `brain done <ids...>`

Mark entries as done.

```bash
brain done a1b2c3d4
brain done a1b2c3d4 b2c3d4e5 c3d4e5f6       # Multiple
brain done --type todo --tags "sprint-1"     # By filter
brain done --dry-run --type todo             # Preview
```

**Options**:

| Option | Description |
|--------|-------------|
| `--type <type>` | Filter by type |
| `--tags <tags>` | Filter by tags |
| `--dry-run` | Show what would be marked done |
| `--confirm` | Skip confirmation prompt |
| `--json` | Output as JSON |

#### `brain archive <ids...>`

Archive entries (hides from default view).

```bash
brain archive a1b2c3d4
brain archive --status done --since 30d      # Archive old completed items
brain archive --dry-run --status done
```

Same options as `brain done`.

#### `brain delete <ids...>`

Delete entries (logged for undo).

```bash
brain delete a1b2c3d4
brain delete a1b2c3d4 b2c3d4e5 --confirm
brain delete --status archived --since 90d   # Clean up old archives
brain delete --dry-run --type reference --tags "temp"
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

#### `brain restore`

Restore deleted entries.

```bash
brain restore --last 1                       # Restore most recent deletion
brain restore --last 5                       # Restore last 5
brain restore --ids a1b2c3d4,b2c3d4e5        # Restore specific IDs
brain restore --list                         # Show deletion log
```

---

### Maintenance Commands

#### `brain stats`

Show entry statistics.

```bash
brain stats
brain stats --json
```

**Human output**:
```
Brain Dump Statistics

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

Tip: Run "brain list --status raw" to triage unprocessed entries
```

#### `brain export`

Export entries for backup or migration.

```bash
brain export                                 # Export all to stdout
brain export --file backup.json              # Export to file
brain export --type todo --status active     # Export filtered
brain export --format csv                    # CSV format
```

#### `brain import`

Import entries from file.

```bash
brain import backup.json
brain import backup.json --dry-run           # Preview what would be imported
brain import backup.json --merge             # Update existing, add new
brain import backup.json --skip-existing     # Only add new entries
```

#### `brain install-skill`

Install Claude Code skill for AI agents.

```bash
brain install-skill
brain install-skill --uninstall
brain install-skill --force                  # Override ownership check
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
- `brain restore --last N` to undo recent deletions
- `brain restore --ids <ids>` to restore specific entries
- `brain restore --list` to see deletion history

### Two-Step Pattern for Bulk Operations

1. **Preview**: `brain delete --status archived --since 90d --dry-run`
2. **Confirm**: User reviews what will be affected
3. **Execute**: `brain delete --ids "<ids>" --confirm`

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
| `BRAIN_DUMP_DIR` | Override config directory (default: `~/.config/brain-dump`) |
| `EDITOR` | Editor for interactive edit |

---

## Performance Targets

| Operation | Target |
|-----------|--------|
| `brain add` | < 100ms |
| `brain list` | < 200ms (up to 1000 entries) |
| `brain search` | < 500ms (full-text scan) |

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

### Multi-device Sync

- Design supports merge-friendly data (UUIDs, updatedAt timestamps)
- Potential approaches: Git-based sync, cloud sync, or manual export/import

### Performance at Scale

- If entries exceed 1000, consider SQLite migration
- Archive old entries to separate file for faster list operations

### Integrations

- Export to GitHub Issues
- Sync with Obsidian vault
- Zapier/webhook triggers
