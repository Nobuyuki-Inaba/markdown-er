# CLAUDE.md — markdown-er

This file gives Claude Code the context needed to work effectively in this repository.
**Update this file whenever a PR changes the architecture, build process, or conventions.**

---

## Project overview

`markdown-er` is a VSCode extension that renders interactive ER diagrams backed by `.ermd` files.
A file becomes an ER diagram by adding `er-diagram: true` to its YAML front matter.
The diagram state (tables, columns, relations, dictionary, layout) is stored in fenced `ermd-*` YAML blocks inside the file;
text outside the blocks belongs to the user and is kept. Schema versions live in `<file>.ermd.versions.yaml` (format v2).

---

## Repository layout

```
markdown-er/
├── shared/                 # Types shared by both the extension host and the WebView
│   ├── DiagramModel.ts     # Canonical data model (Table, Column, Relation, DictionaryEntry, DatabaseSettings, …)
│   ├── databaseOptions.ts  # Per-dialect CREATE DATABASE option fields (labels, defaults, suggestions)
│   ├── autoIncrement.ts    # Auto-increment column rule + per-dialect integer types (DDL and seed editor)
│   ├── ddlReplacements.ts  # Find / replace rules applied to the generated DDL
│   └── messages.ts         # Typed postMessage protocol between extension ↔ WebView
│
├── src/                    # Extension host (Node.js / CommonJS)
│   ├── extension.ts        # activate() – registers all VSCode commands
│   ├── ErmdPanel.ts        # WebviewPanel lifecycle, postMessage bridge, debounced save
│   ├── ErmdParser.ts       # .ermd text → DiagramModel  (uses js-yaml)
│   ├── ErmdSerializer.ts   # DiagramModel → .ermd text, rewriting only the ermd-* blocks of the current text
│   ├── ErmdFiles.ts        # vscode file access: read / write the .ermd + versions file (thin, over format/ErmdCodec)
│   ├── MigrationService.ts # Old-format prompt, diff view, Migrate commands (vscode-dependent)
│   ├── format/             # Pure, unit-tested
│   │   ├── formatVersion.ts# CURRENT_FORMAT_VERSION, formatStatus(), NewerFormatError
│   │   ├── ErmdCodec.ts    # decode / encode a diagram as file texts (.ermd + versions file)
│   │   ├── migrations.ts   # FormatMigration subclasses, pendingMigrations(), planMigration()
│   │   └── MarkdownDocs.ts # Generated Mermaid erDiagram / column tables
│   ├── GitBaseline.ts      # `git show <ref>:<file>` → DiagramModel (only git / vscode-dependent DDL code)
│   ├── i18n.ts             # Extension-host messages (en / ja) + locale resolution
│   └── ddl/                # Pure DDL generation — no vscode import, unit-tested
│       ├── SqlDialect.ts   # Abstract base: standard SQL + hooks (types, CREATE/ALTER, comments, inserts, CREATE DATABASE)
│       ├── dialects/       # MySqlDialect / PostgresDialect / OracleDialect / SqlServerDialect / SqliteDialect
│       ├── createDialect.ts# Factory: dialect id + DatabaseSettings → SqlDialect instance
│       ├── Schema.ts       # Model lookups: dictionary, auto-increment keys, resolved FKs, dependency order
│       ├── DdlExporter.ts  # Full DDL (CREATE DATABASE?, CREATE TABLE, FKs, indexes, seed INSERTs)
│       └── SchemaDiffer.ts # ALTER script baseline → current (git ref or saved version)
│
├── test/                   # vitest: DDL per dialect (snapshots), diff, parser, format/ (serializer, codec, migrations),
│                           #   extension/ (ErmdFiles, MigrationService over mocks/vscode.ts), webview/ (react-dom/server)
│   └── fixtures/v1, v2     # Files as written by v0.1.0 (v1) and after migration (v2) — compatibility baselines
│
├── webview/                # React WebView (browser / ESM)
│   ├── src/
│   │   ├── main.tsx        # React root mount
│   │   ├── App.tsx         # Top-level layout + keyboard shortcuts + message routing
│   │   ├── vscodeApi.ts    # acquireVsCodeApi() typed wrapper (stubs for dev server)
│   │   ├── i18n/           # en.ts (reference, defines `Messages`), ja.ts, useMessages() / getMessages()
│   │   ├── store/
│   │   │   ├── diagramStore.ts   # Zustand + zundo (undo/redo); all diagram mutations
│   │   │   └── uiStore.ts        # UI-only state (selected table/relation, panels open)
│   │   ├── components/
│   │   │   ├── DiagramCanvas.tsx # ReactFlow wrapper; node/edge sync; viewport events
│   │   │   ├── TableNode.tsx     # Custom ReactFlow node (table box + NodeResizer)
│   │   │   ├── RelationEdge.tsx  # Custom ReactFlow edge (cardinality labels)
│   │   │   ├── CardinalityMarkers.tsx  # SVG <defs> arrow markers
│   │   │   ├── Toolbar.tsx       # Top bar: diagram-wide (name toggle, search, dictionary, CSV, DB, versions, DDL, language)
│   │   │   ├── CanvasToolbar.tsx # Left vertical bar: canvas editing (add table/region, undo/redo, zoom, auto layout, minimap)
│   │   │   ├── TableEditPanel.tsx      # Double-click → edit table name + columns
│   │   │   ├── RelationEditPanel.tsx   # Click edge → cardinality + FK settings
│   │   │   ├── DictionaryPanel.tsx     # CRUD for column-type dictionary entries
│   │   │   ├── ColumnSetPanel.tsx      # Column sets (e.g. audit columns): define, apply to all tables
│   │   │   ├── CsvImportPanel.tsx      # CSV import dialog (Table / Dictionary tabs)
│   │   │   ├── DatabasePanel.tsx       # Database name / schema / user + active dialect's charset & collation
│   │   │   ├── ColumnRow.tsx           # Single column row inside TableEditPanel
│   │   │   └── TypePicker.tsx          # Column type popover (dictionary by category, basic types, direct input, register)
│   │   └── util/
│   │       ├── xyflowAdapters.ts # DiagramModel ↔ ReactFlow Node[]/Edge[] conversion
│   │       ├── idgen.ts          # Lightweight ID generator (no external dep)
│   │       └── csvImport.ts      # CSV parsing for table/dictionary import; BUILTIN_PRESETS
│   ├── package.json        # Webview-only deps (React, @xyflow/react, Zustand, zundo, Vite)
│   └── vite.config.ts      # Builds to ../media/webview.js + ../media/webview.css
│
├── media/                  # Built WebView assets — gitignored, produced by `npm run build:webview`
├── out/                    # Compiled extension JS — gitignored, produced by `npm run compile`
├── images/                 # icon.svg (source) → icon.png via `npm run icon`
├── scripts/make-icon.mjs   # Renders the icon with resvg
├── package.nls*.json       # Manifest strings (en / ja)
├── examples/
│   └── sample.ermd         # Working 4-table EC-site diagram for manual testing
├── package.json            # Extension manifest (main: ./out/extension.js, bundled by esbuild)
└── tsconfig.json           # Extension TS config (includes shared/)
```

---

## Build commands

Run from the **repo root** unless noted.

| Command | What it does |
|---|---|
| `npm ci` | Install extension host deps exactly as locked (js-yaml, TypeScript) |
| `npm ci --prefix webview` | Install WebView deps exactly as locked (React, ReactFlow, Zustand, …) |
| `npm run compile` | Type-check the extension host (`tsc --noEmit`) |
| `npm run build:ext` | Bundle the extension host with esbuild → `out/extension.js` |
| `npm run build:webview` | Build React WebView with Vite → `media/` |
| `npm run build` | `build:ext` + `build:webview` |
| `npm test` | Run vitest (DDL / diff / parser / format / migration / extension / webview) |
| `npm run icon` | Render `images/icon.svg` → `images/icon.png` (commit both) |
| `npx tsc --noEmit` | Type-check extension host only |
| `cd webview && npx tsc --noEmit` | Type-check WebView only |

**Always run both type-check commands and `npm test` before opening a PR.**
DDL output changes show up in `test/ddl/__snapshots__`; review them and update with `npx vitest run -u`.

---

## Dependencies (supply-chain hardening)

- `.npmrc` (root and `webview/`): `ignore-scripts=true` (no install scripts — esbuild, vite and resvg work without them),
  `min-release-age=7` (versions younger than 7 days are not installed), `allow-git=none`, `save-exact=true`.
- `package.json` versions are exact; lockfiles resolve only from registry.npmjs.org with integrity hashes. Use `npm ci`
  to install; add or update with `npm install -D <pkg>@<version>` and review the lockfile diff.
- Keep runtime dependencies few (they ship in the bundle): js-yaml, React, @xyflow/react, zustand, zundo, dagre.
  Prefer a few lines of own code over a new package.
- CI (`.github/workflows/ci.yml`) runs `npm audit signatures` and `npm audit` (high for shipped deps, critical for
  tooling). Actions are pinned to commit SHAs; tokens are read-only except the release job.
- Dependabot (`.github/dependabot.yml`) proposes grouped weekly updates after a 7-day cooldown.

## Development workflow

1. Press **F5** in VSCode to launch the extension host debug session (Extension Development Host).
2. In the new window, open `examples/sample.ermd`.
3. Click the **⊹** icon in the editor title bar → "Open as ER Diagram".
4. Make changes to the WebView source, run `npm run build:webview`, then reload the window (`Ctrl+Shift+P` → "Developer: Reload Window").

For hot-reload of the WebView in isolation (without the extension host), run `cd webview && npm run dev`.
Note: `acquireVsCodeApi` is stubbed in dev mode so the diagram starts empty.

---

## Key architecture decisions

| Decision | Rationale |
|---|---|
| `.ermd` + YAML front matter | Human-readable, git-diffable, dedicated extension for ER diagrams |
| `ermd-*` fenced blocks | Each section (dictionary, table, relation, layout) is a separate block → clean diffs |
| @xyflow/react v12 | Built-in drag/pan/zoom, NodeResizer, custom node/edge components, MIT |
| Zustand + zundo | Full undo/redo with one middleware line; `partialize` excludes UI state from history |
| Extension host parses YAML | js-yaml runs only in Node.js context; WebView receives a typed `DiagramModel` via postMessage |
| Crow's foot notation dropped | Replaced by simple labeled arrows (1 / N) to reduce SVG complexity |
| `deleteKeyCode={null}` in ReactFlow | Prevents ReactFlow's built-in delete; we handle Delete key in `App.tsx` with input-focus guard |

---

## postMessage protocol

Defined in `shared/messages.ts`.

| Direction | Message type | Payload |
|---|---|---|
| Extension → WebView | `load` | Full `DiagramModel` + `fileUri` on file open |
| Extension → WebView | `fileChanged` | Full `DiagramModel` on external file edit |
| Extension → WebView | `ddlResult` | Generated DDL string + `data` (seed INSERTs alone, full mode) |
| Extension → WebView | `undo` / `redo` | (empty) relay from extension host |
| WebView → Extension | `ready` | Triggers initial `load` |
| WebView → Extension | `save` | Full `DiagramModel` + monotonic `version` number + `fileUri` it was edited for (debounced 300 ms) |
| Extension → WebView | `fileStatus` | `{ readOnly, formatVersion, supportedVersion }` on load / file change (read-only banner) |
| Extension → WebView | `localeChanged` | `{ locale: 'en' \| 'ja', setting: 'auto' \| 'en' \| 'ja' }` |
| WebView → Extension | `requestDdl` | `{ mode, baselineRef?, fromVersionId?, toVersionId?, insertSeedData?, skipAutoIncrementPk?, includeCreateDatabase? }` |
| WebView → Extension | `setLanguage` | `{ setting }` — writes `markdown-er.language` |
| WebView → Extension | `saveSqlFile` | `{ kind: 'ddl' \| 'data', text }` — save dialog; default from `markdown-er.ddl.outputFile` / `dataOutputFile` (relative to the diagram, `${fileBasenameNoExtension}` etc.), then the last file chosen per diagram |

### Save / undo invariants

- WebView `saveVersion` only ever increases; `setModel` never resets it. The extension host drops saves with `version <= _saveVersion` and resets its counter only on `ready`.
- Replace the model only via `loadModel()` (`diagramStore.ts`) — it bypasses and clears undo history.
- Undo/redo only via `applyHistory()` — it bumps `saveVersion` so the result is saved, and keeps the current viewport and `schemaVersions`.
- Viewport changes and `schemaVersions` are never recorded in undo history. The extension host owns `schemaVersions` and the
  format `version` and overrides them on every save (a stale WebView model must not undo a migration).
- Extension host keeps one pending save (`_pendingSave`); it is flushed before switching files, saving/deleting a version, generating DDL, migrating, and on dispose.
  The watcher (the .ermd and its versions file) ignores a change whose texts equal `_lastWrittenText` / `_lastWrittenVersions`.
- A file whose format is newer than `CURRENT_FORMAT_VERSION` is read-only: the host writes nothing (and `encode` throws).

---

## `.ermd` file format

```markdown
---
er-diagram: true
version: 2
---

# Diagram title

## Dictionary
```ermd-dictionary
- id: dict_id
  name: ID
  dbType: INT
  length: null
  notNull: true
  comment: ""
```

## Tables
```ermd-table
id: tbl_user
logicalName: ユーザー
physicalName: users
comment: ""
columns:
  - id: col_u1
    logicalName: ユーザーID
    physicalName: user_id
    dictionaryId: dict_id
    isPrimaryKey: true
    isNullable: false
    defaultValue: null
    comment: ""
seedData:
  - user_id: '1'
    name: Alice
    email: alice@example.com
  - user_id: '2'
    name: Bob
    email: bob@example.com
```

## Relations
```ermd-relations
- id: rel_1
  fromTableId: tbl_user
  fromColumnId: col_u1
  toTableId: tbl_order
  toColumnId: col_o2
  cardinality: ONE_TO_MANY
  hasForeignKey: true
  constraintName: fk_orders_user_id
  comment: ""
```

## Layout
```ermd-layout
nameMode: logical
tables:
  - tableId: tbl_user
    x: 60
    y: 60
    width: 260
viewport:
  x: 0
  y: 0
  zoom: 1
```
```

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Delete` | Delete selected table or relation (not fired when an input has focus) |
| Double-click table | Open table edit panel |

---

## Implemented features

- [x] Parse / serialize `.ermd` ER diagram files
- [x] Interactive diagram with ReactFlow (drag, pan, zoom, resize)
- [x] Column-type dictionary (reusable DB types with name / type / length)
- [x] Logical ↔ physical name toggle
- [x] Persistent layout (positions saved to file)
- [x] Table CRUD (add, edit, delete) with undo/redo
- [x] Column CRUD inside table edit panel
- [x] Relation creation by dragging between tables
- [x] Relation edit panel (cardinality 1:1 / 1:N / N:N, optional FK)
- [x] Delete selected table or relation with Delete key
- [x] Full DDL export (`CREATE TABLE` + `ALTER TABLE … ADD FOREIGN KEY`)
- [x] Diff DDL export (`ALTER TABLE` from a git baseline ref)
- [x] Fit View / Zoom In / Zoom Out buttons in toolbar
- [x] Auto Layout (vertical / horizontal / auto) via `dagre` — undo-able
- [x] Database dialect setting (`markdown-er.ddl.dialect`: mysql / postgresql / sqlite / sqlserver)
- [x] Settings shortcut (⚙ gear button in toolbar → opens VSCode Settings filtered to `markdown-er`)
- [x] Region group boxes (background rectangles with labels; double-click to rename; undo/redo; saved in `ermd-layout`)
- [x] Seed data editor — spreadsheet-like row editor per table (Definition / Seed Data tabs in TableEditPanel); saved as `seedData` in `ermd-table` block; undo/redo
- [x] DDL INSERT export — optional `INSERT INTO` statements for seed data; optional skip of auto-increment PK columns; options persisted in `uiStore`; output channel + DDL modal both updated
- [x] Schema versioning — named snapshots saved in `ermd-versions` block; Versions panel (list + delete); Version Diff DDL modal mode; `SchemaDiffer.diff()` for in-memory diff
- [x] CSV import — tables/columns from CSV (`webview/src/util/csvImport.ts`); 14 built-in presets; `dictionaryName` column for preset/dict resolution; `CsvImportPanel.tsx`; `importTables` / `importDictionaryEntries` store actions
- [x] DDL dialect class hierarchy (MySQL / PostgreSQL / Oracle / SQL Server / SQLite) with unit tests
- [x] CREATE DATABASE / USER / SCHEMA with character set and collation (per dialect)
- [x] DECIMAL precision and scale (`DictionaryEntry.scale`)
- [x] English / Japanese UI (`markdown-er.language`, toolbar selector)
- [x] Extension icon
- [x] Type picker (`TypePicker.tsx`) — dictionary / basic types as category-grouped chips, direct `varchar(50)` input, inline registration; columns may use a type without the dictionary
- [x] Column sets — common columns (e.g. audit) defined once, applied per table, kept in sync
- [x] DDL format options (comments, table options, explicit NULL, quoting) and Save DDL / Save data to files
- [x] Supply-chain hardening (.npmrc, exact versions, CI audit + signatures, SHA-pinned actions, Dependabot cooldown)
- [x] Text outside ermd blocks kept on save; optional generated Mermaid / column tables
- [x] File format versions (v2: versions file), read-only for newer formats, migration prompt and Migrate commands

### File format / migration notes

- **Existing users' files must keep working.** v1 files are read and written in v1 until the user agrees to migrate;
  `test/fixtures/v1` are files as written by v0.1.0, and tests check they are written back byte for byte.
- `ErmdSerializer.serialize(model, uri, { original })` tokenizes the current text (same block regex as the parser) and only
  rewrites / adds / removes `ermd-*` blocks; a new file is the same merge into a skeleton, so its output equals the old
  serializer's. Blocks it can't read and unknown `ermd-*` langs are left alone. Section headings (`## Tables`, …) are
  added with a new section and removed with the last block of their section.
- Generated Markdown sits between `<!-- markdown-er:generated:start -->` / `end` right after the title; the parser ignores it.
- `ErmdCodec`: versions go to `<file>.ermd.versions.yaml` from v2 (or once that file exists); `decode` merges both places by
  id (an older extension may append inline). A versions file that can't be read is never overwritten or deleted.
- **To change the format:** raise `CURRENT_FORMAT_VERSION`, add a `FormatMigration` subclass (`from`, `describe()`,
  `transform()`), register it in `MIGRATIONS`, let `ErmdCodec` lay files out by `model.version`, and add fixtures + tests.
  Never branch on the version outside the codec / migrations.
- `MigrationService` never migrates without a click: prompt once per session on open (`markdown-er.migration.prompt`,
  "don't ask" per file in `workspaceState`), Migrate commands, diff via the `markdown-er-migrated` content provider.
  The update is one `WorkspaceEdit` planned again from the current text, then saved; files with unsaved edits are skipped.

### DDL design (src/ddl)

- **Never branch on the dialect** in DdlExporter / SchemaDiffer. Anything database-specific is a method on
  `SqlDialect`, overridden in `dialects/*`. To support a new database, add a subclass and a case in `createDialect`.
- `SqlDialect` holds standard SQL; subclasses override only differences (types via `mapType`, quoting, `alterColumn`,
  `changePrimaryKey`, `createDatabase`, `insertStatement`, `wrapExplicitIdentityInsert`, …).
  Capabilities are flags: `inlineForeignKeys` (SQLite), `autoIncrementTypes`.
- A dialect instance is bound to `model.database`; use `this.table(name)` for table references
  (SQL Server qualifies with the schema), `this.quote()` for everything else.
- `Schema` answers model questions (dictionary entry, auto-increment, resolved FKs with default names, dependency order).
- `SchemaDiffer` decides *what* changed and the statement order; it builds a `ColumnChange` and lets the dialect render it.
  Statements a database can't run become `-- <Label>: …` comments via `note()`.
- Auto-increment: `Column.autoIncrement` when the user set it (integer PK only, first one per table); unset → only a single
  integer PK that is not the child column of a relation. The table editor's AI checkbox shows the result; toggling stores
  `autoIncrement` only when it differs from the rule (else `undefined`), so untouched files keep their bytes.
- Column definition order is `TYPE [DEFAULT] NULL|NOT NULL` (Oracle requires DEFAULT first). Boolean defaults are mapped
  to dialect literals by `defaultValue()`.
- Comments: `commentText()` = logical name (when ≠ physical) + comment. MySQL inline `COMMENT`, PostgreSQL/Oracle `COMMENT ON`.
- PostgreSQL uses identity columns (not SERIAL) and `setval` after seed inserts with explicit ids; Oracle uses
  `START WITH LIMIT VALUE`; SQL Server wraps with `IDENTITY_INSERT`.
- Setting `markdown-er.ddl.dialect` (`mysql` / `postgresql` / `oracle` / `sqlserver` / `sqlite`); the extension sends
  `dialectChanged` on `ready` and on config change; WebView keeps it in `uiStore.dialect`.

### DDL style notes

- `shared/ddlStyle.ts`: `DdlStyle { comments, tableOptions, explicitNull, quoteIdentifiers }`; default is a plain
  CREATE TABLE (only `quoteIdentifiers` on). Stored in `markdown-er.ddl.<key>` settings.
- Passed to the dialect at construction (`createDialect(id, database, style)`); `SqlDialect.quote()` quotes only when
  needed if `quoteIdentifiers` is off (`needsQuoting()`; PostgreSQL also quotes capitals; Oracle ignores the option).
- Extension sends `ddlStyleChanged` on load / config change; the DDL dialog checkboxes send `setDdlStyle`.

### DDL replacement notes

- `DiagramModel.ddlReplacements` (`ermd-ddl-replacements` block): `{ id, dialect?, find, replace, regex?, enabled?, comment? }`,
  only non-defaults stored. An escape hatch for output the generator doesn't produce — prefer a `SqlDialect` change
  when the case is common.
- `applyDdlReplacements()` (shared, pure) runs in `ErmdPanel._generateDdl()` on every mode's DDL and on `data`;
  rules apply in order, literal by default, regex with flags `gm`; invalid patterns are skipped (red in the UI).
- Edited in the DDL dialog (`DdlReplacementsEditor`), undo-able store actions. The dialog re-requests the DDL 400 ms
  after a rule change; `er:requestDdl` sends the pending WebView save first so the host reads the latest model.

### Column type notes

- A column's type is its dictionary entry when `dictionaryId` resolves, else `Column.type` (`TypeSpec`, given directly).
  Always resolve with `columnTypeSpec()` (shared) / `Schema.typeOf()` — never read `dictionaryId` alone.
- `TypePicker.tsx`: search; dictionary and basic types as chips in rows by category (`DB_TYPE_KINDS`: string / number / datetime / other; uncategorised dictionary entries fall into their type kind), sticky section headers, `varchar(50)`-style direct input,
  inline registration (with category). Fixed-position popover so panel scrolling doesn't clip it. The picker chooses only the type;
  the size is the row's own **Size** cell (`ColumnRow` `SizeInput`, `10,2` for DECIMAL): editable for direct types that
  `typeTakesSize()` (shared), read-only for dictionary types (the dictionary owns their size), disabled otherwise.
- Choosing a dictionary type applies its `notNull` to the column (`withDictionaryType` in diagramStore).

### Database / schema / user notes

- `DiagramModel.database = { name, schema?, user?, options: { [dialect]: { charset?, collation?, ctype? } } }`,
  serialized as an `ermd-database` block. Options are per dialect so switching dialects never mixes them.
- `shared/databaseOptions.ts` lists which fields each dialect supports (label, default, suggestions); both the
  `DatabasePanel` form and `SqlDialect.databaseOptions()` read it.
- Passwords are never stored; DDL uses the `change_me` placeholder plus a note.
- Emitted only when the DDL option `includeCreateDatabase` is on (`uiStore.ddlIncludeCreateDatabase` → `requestDdl`).

### i18n notes

- Setting `markdown-er.language` = `auto` | `en` | `ja`; `auto` follows `vscode.env.language`. Resolved in `src/i18n.ts`.
- Extension sends `localeChanged { locale, setting }` on load and on config change; the toolbar selector sends
  `setLanguage`, which updates the setting (single source of truth).
- WebView: `webview/src/i18n/en.ts` is the reference; `Messages = typeof en`, so `ja.ts` must define every key (compile error otherwise).
  Components call `useMessages()`; non-render code (FileReader callbacks) uses `getMessages()`. Parameterized strings are functions.
- Do not translate SQL keywords or CSV column names. Manifest strings live in `package.nls.json` / `package.nls.ja.json`.

### Column set notes

- `DiagramModel.columnSets: ColumnSet[]` (`ermd-column-sets` block); a table lists the sets it uses in `columnSetIds`.
- Set columns are **materialized** in `table.columns` with a `columnSet: { setId, columnId }` marker, so DDL, diff,
  relations, indexes and seed data need no knowledge of sets. `syncColumnSets()` (`webview/src/util/columnSets.ts`, pure,
  unit-tested) keeps them matching the set: update in place (instance ids stay), add, remove, unapplied sets dropped,
  deleted sets' columns kept as ordinary columns.
- Column store actions take an `ownerId` — a table id or a column set id; editing a set column re-syncs every table.
- In the table editor, set columns are read-only (`ColumnRow lockedBy`); set chips above the columns toggle sets.
- `applyToNewTables` sets are added by `addTable`.

### Seed data notes

- Stored as `seedData: Record<string, string>[]` on the `Table` model — keys are column `physicalName`s
- Parsed in `ErmdParser` with all values coerced to strings (YAML numbers → string on first save)
- Serialized automatically by `yaml.dump(table, ...)` in `ErmdSerializer`; omitted when empty (`undefined`)
- WebView: `SeedDataEditor.tsx` — pure React table with `<input>` cells; no external library
- Store action: `updateSeedData(tableId, rows)` — sets `undefined` when rows become empty so YAML stays clean
- Tab UI added to `TableEditPanel.tsx` — "Definition" and "Seed Data" tabs with local `activeTab` state
- The table scrolls inside `SEED_TABLE_MAX_HEIGHT` (sticky header row and row numbers, buttons outside); "Add row" scrolls to and focuses the new row

### DDL INSERT export notes

- `DdlExporter.export()` accepts optional `DdlOptions { insertSeedData?, skipAutoIncrementPk? }`
- INSERT statements are appended after schema DDL under a `-- Seed Data` comment
- Auto-increment detection: `shared/autoIncrement.ts` — `autoIncrementColumn()` (the user's `Column.autoIncrement`, else a single integer PK, not the child of a relation)
  with `AUTO_INCREMENT_TYPES[dialect]` (SQLite: every integer type); used by `Schema` (via `SqlDialect.autoIncrementTypes`)
  and by the seed editor, which marks the column and shows empty cells as `auto`
- Rows that leave the auto-increment key empty: `insertFor()` writes the explicit-id rows first (wrapped by the dialect),
  then the empty-key rows without the column, so the database generates them after the explicit ids
- SQL Server: explicit PK inserts are wrapped with `SET IDENTITY_INSERT table ON/OFF`
- Options flow: WebView `uiStore.ddlInsertSeedData / ddlSkipAutoIncrementPk` → `requestDdl` message → `ErmdPanel._generateDdl()` → `DdlExporter.export()`
- DDL modal checkboxes trigger immediate re-generation via `er:requestDdl` custom DOM event

### Schema versioning notes

- `SchemaVersion` stores: `id`, `name`, `date` (ISO 8601), `tables`, `relations`, `dictionary`, `layout` — full snapshot including layout
- Stored as `ermd-versions` YAML block (array) at the bottom of the `.ermd` file; omitted when empty
- **Save Version flow**: Toolbar button → WebView sends `saveVersion` with current model → extension shows `showInputBox` for name → snapshot created and written to disk → `versionSaved` (full updated model) sent back to WebView
- **Delete Version flow**: VersionsPanel sends `deleteVersion` → extension filters out the version and writes to disk → `versionSaved` sent back
- **Version Diff DDL**: DDL modal `version-diff` mode → `requestDdl` with `fromVersionId` / `toVersionId` → `ErmdPanel._generateDdl()` calls `SchemaDiffer.diff(fromModel, toModel, dialect)`
- `SchemaDiffer.diff()` is pure (no git); the git variant loads the baseline with `loadGitBaseline()` first
- WebView state: `uiStore.ddlMode`, `uiStore.ddlFromVersionId`, `uiStore.ddlToVersionId` (null = current state)
- VersionsPanel is a floating panel (same pattern as DictionaryPanel); delete has 2-step confirmation

### CSV import notes

- Entry point: `webview/src/util/csvImport.ts` — `parseTableCsv()` and `parseDictionaryCsv()`
- `BUILTIN_PRESETS`: 14 named presets (ID=INT, Name=VARCHAR(100), Email=VARCHAR(255), Code=VARCHAR(20), Text=TEXT, Flag=TINYINT(1), Quantity=INT, Amount=DECIMAL(10), Timestamp=DATETIME, Date=DATE, JSON=JSON, NullableID=INT nullable, BigID=BIGINT, Title=VARCHAR(255))
- Table CSV `dictionaryName` resolution order: (1) existing dict entry by name (case-insensitive) → (2) built-in preset (auto-created as dict entry) → (3) raw `dbType`/`length`/`notNull` (find-or-create)
- `ParsedTableImport.autoCreatedDictEntries` carries newly created entries; `importTables` in `diagramStore.ts` appends them atomically with the tables
- `CsvImportPanel.tsx`: fixed-height dialog with scrollable spec pane; two category tabs; upload zone always visible at top
- UI state: `uiStore.isCsvImportOpen` / `openCsvImport` / `closeCsvImport`

### Auto Layout notes

- Entry point: `webview/src/util/autoLayout.ts` — `computeAutoLayout(model, direction)`
- Uses `dagre` (MIT) to compute a ranked graph layout; nodes are treated as directed edges via `fromTableId → toTableId`
- Store action `applyAutoLayout(direction)` calls `computeAutoLayout` and writes new positions in a single `updateModel` call, which lands on the `zundo` undo stack automatically
- Toolbar: **Auto Layout** button (runs `auto` mode immediately) + **▾** dropdown for `Vertical` / `Horizontal` / `Auto`
- After layout, dispatches `er:fitView` so the viewport adjusts

## Planned features (future PRs)

- [ ] MCP server (`src/McpServer.ts` stub) for AI assistant integration
- [ ] Import table definitions from a live database connection
- [ ] IDEF1X notation option (alongside current simple arrows)

---

## PR checklist

Before merging a PR:
- [ ] `npx tsc --noEmit` passes (repo root)
- [ ] `cd webview && npx tsc --noEmit` passes
- [ ] `npm run build` produces `media/webview.js` and `media/webview.css` without errors
- [ ] Manually tested: open `examples/sample.ermd`, verify the affected feature works
- [ ] CLAUDE.md updated if architecture / build / conventions changed
- [ ] README.md updated if user-visible features or usage changed
