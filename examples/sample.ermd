---
er-diagram: true
version: 1
---

# EC Site ER Diagram

## Dictionary

```ermd-dictionary
- id: dict_id
  name: ID
  dbType: INT
  length: null
  notNull: true
  comment: Surrogate key
- id: dict_name100
  name: Name
  dbType: VARCHAR
  length: 100
  notNull: false
  comment: General name field
- id: dict_email
  name: Email
  dbType: VARCHAR
  length: 255
  notNull: false
  comment: Email address
- id: dict_ts
  name: Timestamp
  dbType: DATETIME
  length: null
  notNull: true
  comment: Created/updated timestamp
- id: dict_flag
  name: Flag
  dbType: TINYINT
  length: 1
  notNull: true
  comment: Boolean flag (0/1)
- id: dict_text
  name: Text
  dbType: TEXT
  length: null
  notNull: false
  comment: Long text
- id: dict_amount
  name: Amount
  dbType: DECIMAL
  length: 10
  notNull: true
  comment: Monetary amount (10,2)
```

## Tables

```ermd-table
id: tbl_user
logicalName: ユーザー
physicalName: users
comment: Application users
columns:
  - id: col_u1
    logicalName: ユーザーID
    physicalName: user_id
    dictionaryId: dict_id
    isPrimaryKey: true
    isNullable: false
    defaultValue: null
    comment: ''
  - id: col_u2
    logicalName: ユーザー名
    physicalName: user_name
    dictionaryId: dict_name100
    isPrimaryKey: false
    isNullable: false
    defaultValue: null
    comment: ''
  - id: col_u3
    logicalName: メールアドレス
    physicalName: email
    dictionaryId: dict_email
    isPrimaryKey: false
    isNullable: false
    defaultValue: null
    comment: ''
  - id: col_u4
    logicalName: 作成日時
    physicalName: created_at
    dictionaryId: dict_ts
    isPrimaryKey: false
    isNullable: false
    defaultValue: CURRENT_TIMESTAMP
    comment: ''
```

```ermd-table
id: tbl_product
logicalName: 商品
physicalName: products
comment: Product catalog
columns:
  - id: col_p1
    logicalName: 商品ID
    physicalName: product_id
    dictionaryId: dict_id
    isPrimaryKey: true
    isNullable: false
    defaultValue: null
    comment: ''
  - id: col_p2
    logicalName: 商品名
    physicalName: product_name
    dictionaryId: dict_name100
    isPrimaryKey: false
    isNullable: false
    defaultValue: null
    comment: ''
  - id: col_p3
    logicalName: 価格
    physicalName: price
    dictionaryId: dict_amount
    isPrimaryKey: false
    isNullable: false
    defaultValue: null
    comment: ''
  - id: col_p4
    logicalName: 説明
    physicalName: description
    dictionaryId: dict_text
    isPrimaryKey: false
    isNullable: true
    defaultValue: null
    comment: ''
```

```ermd-table
id: tbl_order
logicalName: 注文
physicalName: orders
comment: Customer orders
columns:
  - id: col_o1
    logicalName: 注文ID
    physicalName: order_id
    dictionaryId: dict_id
    isPrimaryKey: true
    isNullable: false
    defaultValue: null
    comment: ''
  - id: col_o2
    logicalName: ユーザーID
    physicalName: user_id
    dictionaryId: dict_id
    isPrimaryKey: false
    isNullable: false
    defaultValue: null
    comment: ''
  - id: col_o3
    logicalName: 注文日時
    physicalName: ordered_at
    dictionaryId: dict_ts
    isPrimaryKey: false
    isNullable: false
    defaultValue: CURRENT_TIMESTAMP
    comment: ''
```

```ermd-table
id: tbl_order_item
logicalName: 注文明細
physicalName: order_items
comment: Items within an order
columns:
  - id: col_oi1
    logicalName: 明細ID
    physicalName: item_id
    dictionaryId: dict_id
    isPrimaryKey: true
    isNullable: false
    defaultValue: null
    comment: ''
  - id: col_oi2
    logicalName: 注文ID
    physicalName: order_id
    dictionaryId: dict_id
    isPrimaryKey: false
    isNullable: false
    defaultValue: null
    comment: ''
  - id: col_oi3
    logicalName: 商品ID
    physicalName: product_id
    dictionaryId: dict_id
    isPrimaryKey: false
    isNullable: false
    defaultValue: null
    comment: ''
  - id: col_oi4
    logicalName: 数量
    physicalName: quantity
    dictionaryId: dict_id
    isPrimaryKey: false
    isNullable: false
    defaultValue: null
    comment: ''
  - id: col_oi5
    logicalName: 単価
    physicalName: unit_price
    dictionaryId: dict_amount
    isPrimaryKey: false
    isNullable: false
    defaultValue: null
    comment: ''
```

## Relations

```ermd-relations
- id: rel_user_order
  fromTableId: tbl_user
  fromColumnId: col_u1
  toTableId: tbl_order
  toColumnId: col_o2
  cardinality: ONE_TO_MANY
  hasForeignKey: true
  constraintName: fk_orders_user_id
  comment: A user can have many orders
- id: rel_order_item
  fromTableId: tbl_order
  fromColumnId: col_o1
  toTableId: tbl_order_item
  toColumnId: col_oi2
  cardinality: ONE_TO_MANY
  hasForeignKey: true
  constraintName: fk_order_items_order_id
  comment: ''
- id: rel_product_item
  fromTableId: tbl_product
  fromColumnId: col_p1
  toTableId: tbl_order_item
  toColumnId: col_oi3
  cardinality: ONE_TO_MANY
  hasForeignKey: true
  constraintName: fk_order_items_product_id
  comment: ''
```

## Layout

```ermd-layout
nameMode: logical
tables:
  - tableId: tbl_user
    x: 60
    y: 60
    width: 260
  - tableId: tbl_product
    x: 60
    y: 320
    width: 260
  - tableId: tbl_order
    x: 420
    y: 60
    width: 260
  - tableId: tbl_order_item
    x: 420
    y: 320
    width: 260
viewport:
  x: 0
  y: 0
  zoom: 1
```
