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
| **Schema versioning** | Save named snapshots of the schema inside the `.ermd` file; generate `ALTER TABLE` DDL between any two versions — no git commit required |
| **CSV import** | Import tables and columns (or dictionary entries) from a CSV file via the **Import CSV** button in the toolbar |
| **Inline type registration** | Type any type name directly in the column editor; autocomplete suggests existing dictionary entries; unrecognised names can be registered to the dictionary inline |

---

## Getting started

> **v0.0.1 note:** This is an initial release. The `.ermd` file schema (YAML block structure, field names) may receive **breaking changes** in future versions before a stable 1.0 release. Back up or version-control your `.ermd` files if you rely on them long-term.

### Install

Search for **"Markdown ER Diagram"** in the VSCode Extensions panel and click **Install**.

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

### Column type — select, type, or register inline

The type field in the column editor supports three workflows:

| Workflow | How |
|---|---|
| **Select from dictionary** | Click the input and pick a suggestion from the dropdown list |
| **Type directly** | Start typing a name (e.g. `VARCHAR2`). If it matches a dictionary entry the field commits automatically |
| **Register a new type** | If the typed name is not in the dictionary the input border turns amber and the **+** button turns orange. Click **+** to open an inline form (name pre-filled). Fill in dbType / length / notNull and click **Register & use** to add the entry to the dictionary and assign it to the column in one step |

### Import tables from CSV

Click **Import CSV** in the toolbar → select the **Table** tab.

Expected headers (in order):

```
tableLogicalName,tablePhysicalName,tableComment,columnLogicalName,columnPhysicalName,dictionaryName,dbType,length,notNull,isPrimaryKey,isNullable,defaultValue,comment
```

- Each row represents one column. Rows sharing the same `tablePhysicalName` are grouped into one table.
- Use the `dictionaryName` column to reference an existing dictionary entry or one of the 14 built-in presets (ID, Name, Email, Flag, Timestamp, …). When matched, `dbType` / `length` / `notNull` are ignored.
- Tables whose `tablePhysicalName` already exists in the diagram are skipped.
- A sample file is available at `examples/import-tables.csv`.

**Built-in presets:**

| Name | dbType | length | notNull |
|---|---|---|---|
| ID | INT | — | true |
| BigID | BIGINT | — | true |
| Name | VARCHAR | 100 | true |
| Title | VARCHAR | 255 | true |
| Email | VARCHAR | 255 | true |
| Code | VARCHAR | 20 | true |
| Text | TEXT | — | false |
| Flag | TINYINT | 1 | true |
| Quantity | INT | — | true |
| Amount | DECIMAL | 10 | true |
| Timestamp | DATETIME | — | true |
| Date | DATE | — | true |
| JSON | JSON | — | false |
| NullableID | INT | — | false |

### Import dictionary entries from CSV

Click **Import CSV** → select the **Dictionary** tab.

Expected headers:

```
name,dbType,length,notNull,comment
```

Entries whose `name` already exists in the dictionary are skipped.

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

### Schema versioning

#### Save a version

Click **Save Version** in the toolbar. A VSCode input box opens — type a name (e.g. `v1.0`, `before-refactor`) and press **Enter**.  
The snapshot is saved in the `ermd-versions` block at the bottom of the `.ermd` file. No git commit required.

#### Manage versions

Click **Versions** in the toolbar to open the Versions panel.  
Each row shows the version name, save date, table count, and relation count.  
Click **削除** (Delete) and confirm to remove a version from the file.

#### Generate Version Diff DDL

Click **Export DDL** → select the **Version Diff** radio button.  
Choose a **From** version and a **To** version (defaults to "current state").  
The `ALTER TABLE` statements needed to migrate from the From snapshot to the To state are generated automatically.

---

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
