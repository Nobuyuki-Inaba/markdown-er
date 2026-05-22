# Changelog

All notable changes to **Markdown ER Diagram** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note:** This project is in early development (v0.x). The `.ermd` file schema may receive breaking changes before the stable 1.0 release.

---

## [Unreleased]

---

## [0.0.4] - 2026-05-22

### Added

- **CSV import — Tables** — Click **Import CSV** in the toolbar, select the **Table** tab, and upload a CSV file to import multiple tables and columns at once. Rows sharing the same `tablePhysicalName` are grouped into one table. Tables whose `tablePhysicalName` already exists in the diagram are skipped.
- **CSV import — Dictionary** — Select the **Dictionary** tab to bulk-import column-type dictionary entries from a CSV file. Entries with duplicate names are skipped.
- **Built-in type presets** — 14 named presets (ID, BigID, Name, Title, Email, Code, Text, Flag, Quantity, Amount, Timestamp, Date, JSON, NullableID) are available as `dictionaryName` values in the table CSV. Preset entries are auto-created in the dictionary on import.
- **`dictionaryName` column in table CSV** — Specify a dictionary entry or built-in preset by name instead of raw `dbType`/`length`/`notNull`. Resolution order: existing dictionary entry → built-in preset → raw type fields.
- **Free-form type input with autocomplete** — The type field in the column editor is now a text input with `<datalist>` suggestions from the dictionary. Typing an existing entry name selects it automatically.
- **Inline custom type registration** — When a typed type name is not in the dictionary, the input border turns amber and the **+** button turns orange. Clicking **+** opens an inline form (name pre-filled) to define dbType / length / notNull and register the new entry — all in a single undo-able action.

---

## [0.0.3] - 2026-05-22

### Added

- **Schema versioning** — Click **Save Version** in the toolbar to snapshot the current ER schema (tables, columns, relations, dictionary, layout) directly inside the `.ermd` file as an `ermd-versions` block. No git commit required.
- **Versions panel** — Click **Versions** in the toolbar to open a panel listing all saved versions (name, date, table count, relation count). Versions can be deleted with a two-step confirmation.
- **Version Diff DDL** — In the DDL modal, switch to **Version Diff** mode and select a From / To version (or "current state") to generate `ALTER TABLE` statements between any two snapshots. Powered by `DdlDiffer.diffModels()` which performs an in-memory structural diff with no git dependency.

---

## [0.0.2] - 2026-05-21

### Fixed

- Extension failed to activate ("command not found") because `js-yaml` was excluded from the `.vsix` by `.vscodeignore`. Switched to esbuild bundling so all runtime dependencies are inlined into `out/extension.js`.

---

## [0.0.1] - 2026-05-21

### Added

- Interactive ER diagram canvas backed by `.ermd` files (YAML front matter + `ermd-*` fenced blocks)
- Table CRUD — add, rename, delete tables with drag-to-reposition and resize handles
- Column CRUD inside the Table Edit Panel — logical/physical names, dictionary type, PK, nullable, default value
- Column-type dictionary — define reusable DB types (name / dbType / length / notNull) and apply them to columns
- Relation creation by dragging between tables; cardinality (1:1 / 1:N / N:N) and optional FK constraint
- Logical ↔ Physical name toggle — switch all labels with one click
- Persistent layout — table positions, viewport, and name mode saved back to the `.ermd` file automatically
- Full undo / redo via `Ctrl+Z` / `Ctrl+Y` (powered by zundo)
- Full DDL export (`CREATE TABLE` + `ALTER TABLE … ADD FOREIGN KEY`) via toolbar or Command Palette
- Diff DDL export (`ALTER TABLE` statements against a git baseline ref)
- Database dialect setting — MySQL, PostgreSQL, SQLite, SQL Server (`markdown-er.ddl.dialect`)
- Seed data editor — spreadsheet-like row editor per table (Definition / Seed Data tabs); saved in `ermd-table` block
- `INSERT INTO` export — optional seed data as SQL INSERT statements; option to skip auto-increment PK columns
- Auto Layout — arrange tables automatically (Vertical / Horizontal / Auto) via dagre; undo-able
- Region group boxes — labeled background rectangles; double-click to rename; undo-able; saved in `ermd-layout`
- Search box — filter tables and columns by name in real time
- Minimap toggle — show/hide the minimap overlay
- Fit View / Zoom In / Zoom Out buttons in toolbar
- Settings shortcut — ⚙ gear button opens VSCode Settings filtered to `markdown-er`
- Indexes and constraints — define indexes (UNIQUE / INDEX) and check/unique constraints per table; exported in DDL
- CSV import for seed data — import rows from a CSV file; download a column-header template CSV

[Unreleased]: https://github.com/Nobuyuki-Inaba/markdown-er/compare/v0.0.4...HEAD
[0.0.4]: https://github.com/Nobuyuki-Inaba/markdown-er/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/Nobuyuki-Inaba/markdown-er/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/Nobuyuki-Inaba/markdown-er/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/Nobuyuki-Inaba/markdown-er/releases/tag/v0.0.1
