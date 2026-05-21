# markdown-er

**VSCode extension — Interactive ER diagram editor backed by plain `.ermd` files.**

![Preview](docs/screenshots/preview.png)

---

## Overview

`markdown-er` lets you design and maintain ER diagrams entirely inside VSCode.  
The diagram is stored in a `.ermd` file (with `er-diagram: true` in the front matter), so it is **human-readable, diffable, and version-control friendly** — no proprietary binary format, no separate toolchain.

---

## Features

| Feature | Details |
|---|---|
| **Interactive canvas** | Drag tables to reposition, resize with handles, pan & zoom |
| **Column-type dictionary** | Define reusable DB types (e.g. `UserID → INT`, `Name → VARCHAR(100)`) and apply them to columns |
| **Logical / Physical names** | Every table and column carries both a logical name (e.g. `ユーザー`) and a physical name (e.g. `users`). Toggle the view with one click. |
| **Relations** | Drag from one table to another to create a relation. Click the relation to set cardinality (1:1 / 1:N / N:N) and optionally add a FK constraint. |
| **Region group boxes** | Group related tables with a labeled background rectangle |
| **Undo / Redo** | Full history via `Ctrl+Z` / `Ctrl+Y` |
| **Persistent layout** | Positions and viewport are saved back to the `.ermd` file automatically |
| **DDL export** | Export full `CREATE TABLE` DDL, or diff-only `ALTER TABLE` statements against a git baseline |
| **Seed data editor** | Enter initial rows for each table in a spreadsheet-like editor. Data is saved in the `.ermd` file and is git-diffable |
| **INSERT export** | Optionally include seed data as `INSERT INTO` statements in the DDL output |
| **Auto Layout** | Arrange all tables automatically — Vertical, Horizontal, or Auto. Undo-able with `Ctrl+Z` |
| **Database dialect** | Choose MySQL, PostgreSQL, SQLite, or SQL Server in Settings |
| **Minimap toggle** | Show or hide the minimap with the Minimap button in the toolbar |

---

## Getting started

> **v0.0.1 note:** This is an initial release. The `.ermd` file schema (YAML block structure, field names) may receive **breaking changes** in future versions before a stable 1.0 release. Back up or version-control your `.ermd` files if you rely on them long-term.

### Install

Search for **"Markdown ER Diagram"** in the VSCode Extensions panel, or run:

```
ext install nobuyuki-inaba.markdown-er
```

#### Build from source

```bash
git clone https://github.com/Nobuyuki-Inaba/markdown-er.git
cd markdown-er
npm install
cd webview && npm install && cd ..
npm run build
```

Press **F5** in VSCode to launch the Extension Development Host.

### Open a diagram

1. Create a `.ermd` file with the following front matter (or open `examples/sample.ermd`):

```yaml
---
er-diagram: true
version: 1
---

# My ER Diagram
```

2. Click the **⊹** icon in the editor title bar, or right-click the file in the Explorer → **Open as ER Diagram**.

---

## Usage

### Add a table

Click **+ Table** in the toolbar. A new table appears at the center of the viewport.  
Double-click the table to open the edit panel.

### Edit a table

Double-click any table to open the **Table Edit Panel** on the right.

- Set the logical name (display) and physical name (database)
- Add columns with the **+ Add Column** button
- For each column: choose a dictionary type, toggle PK, set nullable

### Define column types (Dictionary)

Click **Dictionary** in the toolbar.  
Add reusable types like `UserID → INT`, `Name → VARCHAR(100)`, `Timestamp → DATETIME`.  
Columns pick a dictionary entry instead of specifying type and length directly.

### Create a relation

Drag from the **◉ handle** on one table to another table.  
Click the relation line to set:
- **Cardinality**: 1:1 / 1:N / N:N
- **From / To columns**
- **Foreign key** constraint (optional)

### Delete

Click a table or relation to select it, then press **Delete**.

### Toggle names

Click **Logical names** / **Physical names** in the toolbar to switch all labels.

### Zoom & fit

| Button | Action |
|---|---|
| `−` | Zoom out |
| `Fit` | Fit all tables in view |
| `+` | Zoom in |

### Edit seed data

Double-click a table → select the **Seed Data** tab.

- Click **+ Add Row** to add a new row
- Edit cell values directly in the table
- Click **✕** to delete a row
- Changes are undo-able with `Ctrl+Z`

### Add a region group box

Click **+ Region** in the toolbar. A labeled rectangle appears at the canvas center.

- Drag the border to reposition the box; drag the bottom-right corner to resize it
- Double-click the label to rename the region
- Click to select, then press **Delete** to remove

### Auto Layout

Click **Auto Layout** in the toolbar to arrange all tables automatically.  
Click the **▾** dropdown next to it to choose a specific direction:

| Option | Effect |
|---|---|
| **↕ Vertical** | Arranges tables top-to-bottom |
| **↔ Horizontal** | Arranges tables left-to-right |
| **✦ Auto** | Picks the best direction based on the diagram shape |

Auto Layout is undo-able with `Ctrl+Z`.

### Search tables and columns

Type in the **Search** box in the toolbar to filter tables and columns by name.  
Matching tables are highlighted; non-matching tables are dimmed. Click **✕** to clear.

### Minimap

Click **Minimap** in the toolbar to show or hide the minimap overlay.

### Database dialect and settings

The active DDL dialect is shown as a badge next to **Export DDL** (e.g. `mysql`).  
Click the **⚙** gear button in the toolbar to open VSCode Settings filtered to `markdown-er`.

| Setting | Values | Default |
|---|---|---|
| `markdown-er.ddl.dialect` | `mysql` / `postgresql` / `sqlite` / `sqlserver` | `mysql` |

### Export DDL

Click **Export DDL** in the toolbar (or run `ER Diagram: Export DDL (Full)` from the Command Palette).  
For diff-only output run `ER Diagram: Export DDL (Diff)` and enter a git ref (e.g. `HEAD~1`).

| DDL option | Effect |
|---|---|
| **Include seed data as INSERT statements** | Appends `INSERT INTO` for every table with seed data |
| **Skip auto-increment PK columns** | Omits auto-increment PK columns from the `INSERT` column list |

---

## File format

The diagram is stored in a `.ermd` file using YAML front matter and `ermd-*` fenced blocks:

````
---
er-diagram: true
version: 1
---

# EC Site

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
    user_name: Alice
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
````

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Delete` | Delete selected table or relation |
| Double-click | Open table edit panel |

---

## License

MIT — see [LICENSE](LICENSE)

---

## For contributors

See [CONTRIBUTING.md](CONTRIBUTING.md) for build instructions, repository layout, and development workflow.
