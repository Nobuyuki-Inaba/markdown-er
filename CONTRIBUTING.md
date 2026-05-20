# Contributing to markdown-er

## Prerequisites

- VSCode 1.85+
- Node.js 20+

## Build from source

```bash
git clone https://github.com/Nobuyuki-Inaba/markdown-er.git
cd markdown-er

# Install dependencies
npm install
cd webview && npm install && cd ..

# Build
npm run build          # builds WebView (→ media/) and extension host (→ out/)
```

Press **F5** in VSCode to launch the Extension Development Host.

## Development workflow

1. Press **F5** in VSCode to launch the Extension Development Host.
2. In the new window, open `examples/sample.ermd`.
3. Click the **⊹** icon in the editor title bar → "Open as ER Diagram".
4. Make changes to the WebView source, run `npm run build:webview`, then reload the window (`Ctrl+Shift+P` → "Developer: Reload Window").

For hot-reload of the WebView in isolation (without the extension host), run `cd webview && npm run dev`.  
Note: `acquireVsCodeApi` is stubbed in dev mode so the diagram starts empty.

## Build commands

| Command | What it does |
|---|---|
| `npm install` | Install extension host deps |
| `cd webview && npm install` | Install WebView deps |
| `npm run compile` | Compile extension host TypeScript → `out/` |
| `npm run build:webview` | Build React WebView with Vite → `media/` |
| `npm run build` | Both of the above in sequence |
| `npx tsc --noEmit` | Type-check extension host only |
| `cd webview && npx tsc --noEmit` | Type-check WebView only |

## Repository layout

```
markdown-er/
├── shared/                 # Types shared by both the extension host and the WebView
│   ├── DiagramModel.ts     # Canonical data model (Table, Column, Relation, …)
│   └── messages.ts         # Typed postMessage protocol between extension ↔ WebView
│
├── src/                    # Extension host (Node.js / CommonJS)
│   ├── extension.ts        # activate() – registers all VSCode commands
│   ├── ErmdPanel.ts        # WebviewPanel lifecycle, postMessage bridge, debounced save
│   ├── ErmdParser.ts       # .ermd text → DiagramModel  (uses js-yaml)
│   ├── ErmdSerializer.ts   # DiagramModel → .ermd text  (uses js-yaml)
│   ├── DdlExporter.ts      # DiagramModel → full CREATE TABLE DDL
│   └── DdlDiffer.ts        # DiagramModel diff against git baseline → ALTER TABLE DDL
│
├── webview/                # React WebView (browser / ESM)
│   ├── src/
│   │   ├── main.tsx        # React root mount
│   │   ├── App.tsx         # Top-level layout + keyboard shortcuts + message routing
│   │   ├── store/
│   │   │   ├── diagramStore.ts   # Zustand + zundo (undo/redo); all diagram mutations
│   │   │   └── uiStore.ts        # UI-only state (selected table/relation, panels open)
│   │   ├── components/
│   │   │   ├── DiagramCanvas.tsx
│   │   │   ├── TableNode.tsx
│   │   │   ├── RelationEdge.tsx
│   │   │   ├── Toolbar.tsx
│   │   │   ├── TableEditPanel.tsx
│   │   │   ├── RelationEditPanel.tsx
│   │   │   ├── DictionaryPanel.tsx
│   │   │   └── SeedDataEditor.tsx
│   │   └── util/
│   │       ├── xyflowAdapters.ts
│   │       ├── autoLayout.ts
│   │       ├── idgen.ts
│   │       └── ddlPreview.ts
│   └── vite.config.ts
│
├── examples/
│   └── sample.ermd         # Working 4-table EC-site diagram for manual testing
└── CLAUDE.md               # AI assistant context (architecture, conventions)
```

## Tech stack

| Layer | Technology |
|---|---|
| Extension host | TypeScript, VSCode Extension API, js-yaml |
| WebView UI | React 18, @xyflow/react v12, Zustand + zundo, dagre |
| Build | Vite (WebView), tsc (extension host) |

## PR checklist

- [ ] `npx tsc --noEmit` passes (repo root)
- [ ] `cd webview && npx tsc --noEmit` passes
- [ ] `npm run build` produces `media/webview.js` and `media/webview.css` without errors
- [ ] Manually tested: open `examples/sample.ermd`, verify the affected feature works
- [ ] `CLAUDE.md` updated if architecture / build / conventions changed
- [ ] `README.md` updated if user-visible features or usage changed
