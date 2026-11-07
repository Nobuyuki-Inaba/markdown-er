import * as yaml from 'js-yaml';
import { DiagramModel, SchemaVersion } from '../../shared/DiagramModel';
import { TestFileData, mergeTestFileData, productionModel, testFileData } from '../../shared/testData';
import { ErmdParser } from '../ErmdParser';
import { ErmdSerializer } from '../ErmdSerializer';
import { CURRENT_FORMAT_VERSION, NewerFormatError, formatStatus } from './formatVersion';
import { MarkdownDocsOptions, generateMarkdownDocs } from './MarkdownDocs';

/**
 * Reads and writes a diagram as its files' texts (no file system access, so it is unit-tested):
 * the .ermd file, from format version 2 on the schema versions file next to it, and a test file
 * holding test-only tables and test rows. The test file is optional and added on top of any format:
 * an older extension ignores it, and the .ermd file reads the same without it.
 */

/** `sample.ermd` → `sample.ermd.versions.yaml` */
export function versionsFileName(fileName: string): string {
  return `${fileName}.versions.yaml`;
}

/** `sample.ermd` → `sample.ermd.test.yaml` */
export function testFileName(fileName: string): string {
  return `${fileName}.test.yaml`;
}

export interface ErmdTexts {
  /** The .ermd file; undefined when it doesn't exist yet */
  main: string | undefined;
  /** The schema versions file; undefined when it doesn't exist */
  versions: string | undefined;
  /** The test file; undefined when it doesn't exist */
  test?: string;
}

export interface EncodedTexts {
  main: string;
  /** null: the versions file should not exist; undefined: leave it as it is (it could not be read) */
  versions: string | null | undefined;
  /** null: the test file should not exist; undefined: leave it as it is (it could not be read) */
  test: string | null | undefined;
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
  const test = parseTestFile(texts.test);
  return test ? mergeTestFileData(model, test) : model;
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
  const production = productionModel(model);
  const main = ErmdSerializer.serialize(production, { path: options.fileName }, {
    original: original.main,
    inlineVersions: !separate,
    generated: options.docs && generateMarkdownDocs(production, options.docs),
  });
  const versions = model.schemaVersions ?? [];
  const testData = testFileData(model);
  return {
    main,
    versions: unreadable
      ? undefined
      : separate && versions.length > 0 ? serializeVersionsFile(versions, options.fileName) : null,
    // Like the versions file, a test file that can't be read is never overwritten or deleted
    test: !isTestFileReadable(original.test)
      ? undefined
      : testData ? serializeTestFile(testData, options.fileName) : null,
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

/** A YAML mapping (an empty or missing file counts as empty) */
export function isTestFileReadable(text: string | undefined): boolean {
  if (text === undefined) { return true; }
  try {
    const data = yaml.load(text);
    return data == null || (typeof data === 'object' && !Array.isArray(data));
  } catch {
    return false;
  }
}

function parseTestFile(text: string | undefined): TestFileData | null {
  if (text === undefined || !isTestFileReadable(text)) { return null; }
  return (yaml.load(text) as TestFileData | null) ?? null;
}

function serializeTestFile(data: TestFileData, fileName: string): string {
  return `# Test-only tables and test data of ${fileName} (markdown-er). Edit them in the ER diagram.\n` +
    yaml.dump(data, { indent: 2, lineWidth: -1 });
}
