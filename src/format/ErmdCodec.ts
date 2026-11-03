import * as yaml from 'js-yaml';
import { DiagramModel, SchemaVersion } from '../../shared/DiagramModel';
import { ErmdParser } from '../ErmdParser';
import { ErmdSerializer } from '../ErmdSerializer';
import { CURRENT_FORMAT_VERSION, NewerFormatError, formatStatus } from './formatVersion';
import { MarkdownDocsOptions, generateMarkdownDocs } from './MarkdownDocs';

/**
 * Reads and writes a diagram as its files' texts (no file system access, so it is unit-tested):
 * the .ermd file, and from format version 2 on the schema versions file next to it.
 */

/** `sample.ermd` → `sample.ermd.versions.yaml` */
export function versionsFileName(fileName: string): string {
  return `${fileName}.versions.yaml`;
}

export interface ErmdTexts {
  /** The .ermd file; undefined when it doesn't exist yet */
  main: string | undefined;
  /** The schema versions file; undefined when it doesn't exist */
  versions: string | undefined;
}

export interface EncodedTexts {
  main: string;
  /** null: the versions file should not exist; undefined: leave it as it is (it could not be read) */
  versions: string | null | undefined;
}

/**
 * The model. Versions from both places are merged (by id), so versions an older extension
 * added to the .ermd file are not lost. A new file starts at the current format version.
 */
export function decode(texts: ErmdTexts): DiagramModel {
  const model = ErmdParser.parse(texts.main ?? '');
  if (!ErmdParser.isErDiagram(texts.main ?? '')) {
    model.version = CURRENT_FORMAT_VERSION;
  }
  const fromFile = parseVersionsFile(texts.versions);
  if (fromFile.length > 0) {
    const ids = new Set(fromFile.map((v) => v.id));
    const inline = (model.schemaVersions ?? []).filter((v) => !ids.has(v.id));
    model.schemaVersions = [...fromFile, ...inline];
  }
  return model;
}

export interface EncodeOptions {
  fileName: string;
  /** Generated Markdown (Mermaid / table docs); omitted = none */
  docs?: MarkdownDocsOptions;
}

/**
 * The texts to write. `original` is what is on disk now: text outside the blocks is kept.
 * Schema versions go to the versions file from format version 2, or when that file already exists.
 */
export function encode(model: DiagramModel, original: ErmdTexts, options: EncodeOptions): EncodedTexts {
  if (formatStatus(model.version) === 'newer') {
    throw new NewerFormatError(model.version);
  }
  // A versions file that can't be read is never overwritten or deleted; versions then stay in the .ermd file
  const unreadable = original.versions !== undefined && !isVersionsFile(original.versions);
  const separate = !unreadable && (model.version >= 2 || original.versions !== undefined);
  const main = ErmdSerializer.serialize(model, { path: options.fileName }, {
    original: original.main,
    inlineVersions: !separate,
    generated: options.docs && generateMarkdownDocs(model, options.docs),
  });
  const versions = model.schemaVersions ?? [];
  if (unreadable) { return { main, versions: undefined }; }
  return {
    main,
    versions: separate && versions.length > 0 ? serializeVersionsFile(versions, options.fileName) : null,
  };
}

export function parseVersionsFile(text: string | undefined): SchemaVersion[] {
  if (text === undefined || !isVersionsFile(text)) { return []; }
  return (yaml.load(text) as SchemaVersion[] | null) ?? [];
}

/** A YAML list (an empty file counts as an empty list) */
function isVersionsFile(text: string): boolean {
  try {
    const data = yaml.load(text);
    return data == null || Array.isArray(data);
  } catch {
    return false;
  }
}

export function serializeVersionsFile(versions: SchemaVersion[], fileName: string): string {
  return `# Schema versions of ${fileName} (markdown-er). Edit them in the ER diagram.\n` +
    yaml.dump(versions, { indent: 2, lineWidth: -1 });
}
