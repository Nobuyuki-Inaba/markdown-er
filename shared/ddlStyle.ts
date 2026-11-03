/** How DDL is written. Stored in the `markdown-er.ddl.*` settings; the default is a plain CREATE TABLE. */
export interface DdlStyle {
  /** Column / table comments (MySQL COMMENT, PostgreSQL / Oracle COMMENT ON) */
  comments: boolean;
  /** MySQL ENGINE / DEFAULT CHARSET / COLLATE after CREATE TABLE */
  tableOptions: boolean;
  /** Write NULL on nullable columns (otherwise only NOT NULL is written) */
  explicitNull: boolean;
  /** Quote every identifier; when false, only names that need it are quoted */
  quoteIdentifiers: boolean;
}

export const DEFAULT_DDL_STYLE: DdlStyle = {
  comments: false,
  tableOptions: false,
  explicitNull: false,
  quoteIdentifiers: true,
};

export const DDL_STYLE_KEYS = Object.keys(DEFAULT_DDL_STYLE) as (keyof DdlStyle)[];
