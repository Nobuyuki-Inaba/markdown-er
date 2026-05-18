# CLAUDE.md — markdown-er

This file gives Claude Code the context needed to work effectively in this repository.
**Update this file whenever a PR changes the architecture, build process, or conventions.**

---

## Project overview

`markdown-er` is a VSCode extension that renders interactive ER diagrams backed by ordinary `.md` files.
A file becomes an ER diagram by adding `er-diagram: true` to its YAML front matter.
The diagram state (tables, columns, relations, dictionary, layout) is stored in fenced `ermd-*` YAML blocks inside the Markdown file.

---

## Repository layout

```
markdown-er/
├── shared/                 # Types shared by both the extension host and the WebView
│   ├── DiagramModel.ts     # Canonical data model (Table, Column, Relation, DictionaryEntry, …)
│   └── messages.ts         # Typed postMessage protocol between extension ↔ WebView
│
├── src/                    # Extension host (Node.js / CommonJS)
│   ├── extension.ts        # activate() – registers all VSCode commands
│   ├── ErmdPanel.ts        # WebviewPanel lifecycle, postMessage bridge, debounced save
│   ├── ErmdParser.ts       # .md text → DiagramModel  (uses js-yaml)
│   ├── ErmdSerializer.ts   # DiagramModel → .md text  (uses js-yaml)
│   ├── DdlExporter.ts      # DiagramModel → full CREATE TABLE DDL
│   └── DdlDiffer.ts        # DiagramModel diff against git baseline → ALTER TABLE DDL
│
├── webview/                # React WebView (browser / ESM)
│   ├── src/
│   │   ├── main.tsx        # React root mount
│   │   ├── App.tsx         # Top-level layout + keyboard shortcuts + message routing
│   │   ├── vscodeApi.ts    # acquireVsCodeApi() typed wrapper (stubs for dev server)
│   │   ├── store/
│   │   │   ├── diagramStore.ts   # Zustand + zundo (undo/redo); all diagram mutations
│   │   │   └── uiStore.ts        # UI-only state (selected table/relation, panels open)
│   │   ├── components/
│   │   │   ├── DiagramCanvas.tsx # ReactFlow wrapper; node/edge sync; viewport events
│   │   │   ├── TableNode.tsx     # Custom ReactFlow node (table box + NodeResizer)
│   │   │   ├── RelationEdge.tsx  # Custom ReactFlow edge (cardinality labels)
│   │   │   ├── CardinalityMarkers.tsx  # SVG <defs> arrow markers
│   │   │   ├── Toolbar.tsx       # Top toolbar (Add Table, name toggle, zoom, undo/redo)
│   │   │   ├── TableEditPanel.tsx      # Double-click → edit table name + columns
│   │   │   ├── RelationEditPanel.tsx   # Click edge → cardinality + FK settings
│   │   │   ├── DictionaryPanel.tsx     # CRUD for column-type dictionary entries
│   │   │   └── ColumnRow.tsx           # Single column row inside TableEditPanel
│   │   └── util/
│   │       ├── xyflowAdapters.ts # DiagramModel ↔ ReactFlow Node[]/Edge[] conversion
│   │       ├── idgen.ts          # Lightweight ID generator (no external dep)
│   │       └── ddlPreview.ts     # Client-side DDL generation (mirrors DdlExporter)
│   ├── package.json        # Webview-only deps (React, @xyflow/react, Zustand, zundo, Vite)
│   └── vite.config.ts      # Builds to ../media/webview.js + ../media/webview.css
│
├── media/                  # Built WebView assets — gitignored, produced by `npm run build:webview`
├── out/                    # Compiled extension JS — gitignored, produced by `npm run compile`
├── examples/
│   └── sample.md           # Working 4-table EC-site diagram for manual testing
├── package.json            # Extension manifest (main: ./out/src/extension.js)
└── tsconfig.json           # Extension TS config (includes shared/)
```

---

## Build commands

Run from the **repo root** unless noted.

| Command | What it does |
|---|---|
| `npm install` | Install extension host deps (js-yaml, TypeScript) |
| `cd webview && npm install` | Install WebView deps (React, ReactFlow, Zustand, …) |
| `npm run compile` | Compile extension host TypeScript → `out/` |
| `npm run build:webview` | Build React WebView with Vite → `media/` |
| `npm run build` | Both of the above in sequence |
| `npx tsc --noEmit` | Type-check extension host only |
| `cd webview && npx tsc --noEmit` | Type-check WebView only |

**Always run both type-check commands before opening a PR.**

---

## Development workflow

1. Press **F5** in VSCode to launch the extension host debug session (Extension Development Host).
2. In the new window, open `examples/sample.md`.
3. Click the **⊹** icon in the editor title bar → "Open as ER Diagram".
4. Make changes to the WebView source, run `npm run build:webview`, then reload the window (`Ctrl+Shift+P` → "Developer: Reload Window").

For hot-reload of the WebView in isolation (without the extension host), run `cd webview && npm run dev`.
Note: `acquireVsCodeApi` is stubbed in dev mode so the diagram starts empty.

---

## Key architecture decisions

| Decision | Rationale |
|---|---|
| `.md` + YAML front matter | Human-readable, git-diffable, no custom file extension needed |
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
| Extension → WebView | `load` | Full `DiagramModel` on file open |
| Extension → WebView | `fileChanged` | Full `DiagramModel` on external file edit |
| Extension → WebView | `ddlResult` | Generated DDL string |
| Extension → WebView | `undo` / `redo` | (empty) relay from extension host |
| WebView → Extension | `ready` | Triggers initial `load` |
| WebView → Extension | `save` | Full `DiagramModel` + monotonic `version` number (debounced 300 ms) |
| WebView → Extension | `requestDdl` | `{ mode: 'full' | 'diff', baselineRef? }` |

---

## `.ermd` file format

```markdown
---
er-diagram: true
version: 1
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

- [x] Parse / serialize `.md` ER diagram files
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

### DDL dialect notes

- Setting: `markdown-er.ddl.dialect` (default `mysql`) — appears in VSCode Settings UI under the extension
- Extension host reads the setting in `ErmdPanel._getDialect()` and passes it to `DdlExporter.export()` and `DdlDiffer.diff()`
- On `ready` the panel sends a `dialectChanged` message to the WebView so the badge and preview are in sync from the start
- `onDidChangeConfiguration` re-sends `dialectChanged` whenever the user changes the setting — no reload required
- WebView stores the dialect in `uiStore.dialect`; the toolbar badge displays the active dialect
- `webview/src/util/ddlPreview.ts` mirrors the same dialect logic for the client-side preview (no round-trip needed)
- Identifier quoting: MySQL `` ` ``, PostgreSQL/SQLite `"`, SQL Server `[bracket]`
- SQLite: no separate `ALTER TABLE … ADD FOREIGN KEY` — FK constraints are inline only
- SQL Server: `INT IDENTITY(1,1)` for PK auto-increment; `NVARCHAR`/`NCHAR` for string types

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
- [ ] Manually tested: open `examples/sample.md`, verify the affected feature works
- [ ] CLAUDE.md updated if architecture / build / conventions changed
- [ ] README.md updated if user-visible features or usage changed
