import * as yaml from 'js-yaml';
import { DiagramModel } from '../shared/DiagramModel';
import { ErmdParser } from './ErmdParser';

export interface SerializeOptions {
  /**
   * The file's current text. Everything outside the `ermd-*` blocks (headings, prose, tables)
   * is kept; only the blocks are rewritten, added or removed.
   */
  original?: string;
  /** Write `schemaVersions` into the file (false: they live in the separate versions file). Default true. */
  inlineVersions?: boolean;
  /** Generated Markdown (Mermaid / table docs) for the generated region; undefined removes the region */
  generated?: string;
}

/** The `ermd-*` sections in file order */
const SECTIONS = [
  { lang: 'ermd-database', heading: 'Database' },
  { lang: 'ermd-ddl-replacements', heading: 'DDL Replacements' },
  { lang: 'ermd-dictionary', heading: 'Dictionary' },
  { lang: 'ermd-column-sets', heading: 'Column Sets' },
  { lang: 'ermd-table', heading: 'Tables' },
  { lang: 'ermd-relations', heading: 'Relations' },
  { lang: 'ermd-layout', heading: 'Layout' },
  { lang: 'ermd-versions', heading: 'Versions' },
] as const;

type SectionLang = typeof SECTIONS[number]['lang'];

/** Same pattern as ErmdParser, so both split the file at the same places */
const BLOCK_RE = /```(ermd-[\w-]+)\r?\n([\s\S]*?)```/g;
const GENERATED_RE = /<!-- markdown-er:generated:start[^\n]*-->[\s\S]*?<!-- markdown-er:generated:end -->/;
const GENERATED_START = '<!-- markdown-er:generated:start (regenerated on save; do not edit) -->';
const GENERATED_END = '<!-- markdown-er:generated:end -->';

type Piece =
  | { kind: 'text'; text: string }
  /** `key`: table id, or the lang for one-block sections; null = not ours to change (kept as is) */
  | { kind: 'block'; lang: string; key: string | null; text: string }
  | { kind: 'generated'; text: string };

interface Block { key: string; text: string }

export class ErmdSerializer {
  static serialize(model: DiagramModel, fileUri: { path: string }, options: SerializeOptions = {}): string {
    const original = options.original?.replace(/\r\n/g, '\n');
    const base = original !== undefined && ErmdParser.isErDiagram(original) ? original : skeleton(fileUri);
    const { frontMatter, pieces } = tokenize(base);
    mergeBlocks(pieces, desiredBlocks(model, options.inlineVersions ?? true));
    mergeGenerated(pieces, options.generated);
    const body = pieces.map((p) => p.text).join('');
    return `${withVersion(frontMatter, model.version)}${body.replace(/\n*$/, '\n')}`;
  }
}

function dump(value: unknown): string {
  return yaml.dump(value, { indent: 2, lineWidth: -1 }).trimEnd();
}

function fence(lang: string, value: unknown): string {
  return `\`\`\`${lang}\n${dump(value)}\n\`\`\``;
}

/** A new file: front matter and a title from the file name */
function skeleton(fileUri: { path: string }): string {
  const filename = fileUri.path.split('/').pop() ?? 'ER Diagram';
  const title = filename.replace(/\.ermd$/, '');
  return `---\ner-diagram: true\nversion: 1\n---\n\n# ${title}\n`;
}

function withVersion(frontMatter: string, version: number): string {
  if (/^version:.*$/m.test(frontMatter)) {
    return frontMatter.replace(/^version:.*$/m, `version: ${version}`);
  }
  return frontMatter.replace(/\n---$/, `\nversion: ${version}\n---`);
}

function desiredBlocks(model: DiagramModel, inlineVersions: boolean): Map<SectionLang, Block[]> {
  const single = (lang: SectionLang, value: unknown, present: boolean): Block[] =>
    present ? [{ key: lang, text: fence(lang, value) }] : [];
  return new Map<SectionLang, Block[]>([
    ['ermd-database', single('ermd-database', model.database, !!model.database)],
    ['ermd-ddl-replacements', single('ermd-ddl-replacements', model.ddlReplacements, (model.ddlReplacements?.length ?? 0) > 0)],
    ['ermd-dictionary', single('ermd-dictionary', model.dictionary, model.dictionary.length > 0)],
    ['ermd-column-sets', single('ermd-column-sets', model.columnSets, (model.columnSets?.length ?? 0) > 0)],
    ['ermd-table', model.tables.map((t) => ({ key: t.id, text: fence('ermd-table', t) }))],
    ['ermd-relations', single('ermd-relations', model.relations, model.relations.length > 0)],
    ['ermd-layout', single('ermd-layout', model.layout, true)],
    ['ermd-versions', single('ermd-versions', model.schemaVersions,
      inlineVersions && (model.schemaVersions?.length ?? 0) > 0)],
  ]);
}

/** Front matter, then text / block / generated pieces; text pieces sit between every two others */
function tokenize(text: string): { frontMatter: string; pieces: Piece[] } {
  const fm = text.match(/^---\n[\s\S]*?\n---/)!;
  const body = text.slice(fm[0].length);
  const pieces: Piece[] = [];
  const generated = body.match(GENERATED_RE);
  const chunks = generated
    ? [body.slice(0, generated.index), generated[0], body.slice(generated.index! + generated[0].length)]
    : [body];
  chunks.forEach((chunk, i) => {
    if (i === 1) {
      pieces.push({ kind: 'generated', text: chunk });
      return;
    }
    let last = 0;
    for (const m of chunk.matchAll(BLOCK_RE)) {
      pushText(pieces, chunk.slice(last, m.index));
      pieces.push({ kind: 'block', lang: m[1], key: blockKey(m[1], m[2]), text: m[0] });
      last = m.index! + m[0].length;
    }
    pushText(pieces, chunk.slice(last));
  });
  return { frontMatter: fm[0], pieces };
}

function pushText(pieces: Piece[], text: string) {
  const prev = pieces[pieces.length - 1];
  if (prev?.kind === 'text') { prev.text += text; } else { pieces.push({ kind: 'text', text }); }
}

function blockKey(lang: string, content: string): string | null {
  if (!SECTIONS.some((s) => s.lang === lang)) { return null; }
  let data: unknown;
  try {
    data = yaml.load(content);
  } catch {
    // The parser skipped it, so the model doesn't have it: keep the user's text
    return null;
  }
  if (lang !== 'ermd-table') { return lang; }
  const id = (data as Record<string, unknown> | null)?.['id'];
  return id == null ? null : String(id);
}

function sectionIndex(lang: string): number {
  return SECTIONS.findIndex((s) => s.lang === lang);
}

function isOurs(p: Piece): p is Piece & { kind: 'block'; key: string } {
  return p.kind === 'block' && p.key !== null;
}

function mergeBlocks(pieces: Piece[], desired: Map<SectionLang, Block[]>) {
  // Rewrite blocks still in the model; remove the others (from the end, so indexes stay valid)
  const placed = new Set<string>();
  const remove: number[] = [];
  pieces.forEach((p, i) => {
    if (!isOurs(p)) { return; }
    const id = `${p.lang}\n${p.key}`;
    const block = desired.get(p.lang as SectionLang)?.find((b) => b.key === p.key);
    if (block && !placed.has(id)) {
      p.text = block.text;
      placed.add(id);
    } else {
      remove.push(i);
    }
  });
  for (const i of remove.reverse()) { removeBlock(pieces, i); }

  // Add new ones, section by section in file order
  for (const { lang, heading } of SECTIONS) {
    const missing = desired.get(lang)!.filter((b) => !placed.has(`${lang}\n${b.key}`)).map((b) => b.text);
    if (missing.length === 0) { continue; }
    const lastOfSection = findLastIndex(pieces, (p) => isOurs(p) && p.lang === lang);
    if (lastOfSection >= 0) {
      // More tables: after the last table block
      pieces.splice(lastOfSection + 1, 0, ...missing.flatMap((text): Piece[] => [
        { kind: 'text', text: '\n\n' }, { kind: 'block', lang, key: '', text },
      ]));
    } else {
      insertSection(pieces, lang, heading, missing);
    }
  }
}

/** Remove a block, its blank lines, and its section heading when the section is now empty */
function removeBlock(pieces: Piece[], i: number) {
  const block = pieces[i] as Piece & { kind: 'block' };
  const section = SECTIONS[sectionIndex(block.lang)];
  const sectionEmpties = !pieces.some((p, j) => j !== i && isOurs(p) && p.lang === block.lang);
  let before = pieces[i - 1].text;
  if (sectionEmpties) {
    before = before.replace(new RegExp(`(^|\\n)## ${section.heading}[ \\t]*\\n\\s*$`), '$1');
  }
  before = before.replace(/\s+$/, '');
  pieces.splice(i - 1, 3, { kind: 'text', text: before + pieces[i + 1].text });
}

function insertSection(pieces: Piece[], lang: string, heading: string, blocks: string[]) {
  const order = sectionIndex(lang);
  const newPieces = (): Piece[] => blocks.flatMap((text, k): Piece[] => [
    ...(k > 0 ? [{ kind: 'text', text: '\n\n' } as Piece] : []),
    { kind: 'block', lang, key: '', text },
  ]);

  // After the block of the closest earlier section
  const prev = findLastIndex(pieces, (p) => isOurs(p) && sectionIndex(p.lang) < order);
  if (prev >= 0) {
    pieces.splice(prev + 1, 0, { kind: 'text', text: `\n\n## ${heading}\n\n` }, ...newPieces());
    return;
  }

  // Else before the closest later section (and its heading)
  const next = pieces.findIndex((p) => isOurs(p) && sectionIndex(p.lang) > order);
  if (next >= 0) {
    const nextHeading = SECTIONS[sectionIndex((pieces[next] as Piece & { kind: 'block' }).lang)].heading;
    const before = pieces[next - 1].text;
    const m = before.match(new RegExp(`(^|\\n)(## ${nextHeading}[ \\t]*\\n\\s*)$`));
    const head = m ? before.slice(0, m.index! + m[1].length) : `${before.replace(/\s+$/, '')}\n\n`;
    const tail = m ? m[2] : '';
    pieces.splice(next - 1, 1,
      { kind: 'text', text: `${head}## ${heading}\n\n` },
      ...newPieces(),
      { kind: 'text', text: `\n\n${tail}` });
    return;
  }

  // Else at the end
  const last = pieces[pieces.length - 1];
  last.text = `${last.text.replace(/\s+$/, '')}\n\n## ${heading}\n\n`;
  pieces.push(...newPieces(), { kind: 'text', text: '\n' });
}

/** The generated region goes right after the title (first `# ` heading) */
function mergeGenerated(pieces: Piece[], generated: string | undefined) {
  const i = pieces.findIndex((p) => p.kind === 'generated');
  const text = generated === undefined ? undefined : `${GENERATED_START}\n\n${generated.trim()}\n\n${GENERATED_END}`;
  if (i >= 0) {
    if (text !== undefined) {
      pieces[i].text = text;
    } else {
      pieces.splice(i - 1, 3, { kind: 'text', text: pieces[i - 1].text.replace(/\s+$/, '') + pieces[i + 1].text });
    }
    return;
  }
  if (text === undefined) { return; }
  const first = pieces[0];
  const title = first.text.match(/(^|\n)# [^\n]*/);
  const at = title ? title.index! + title[0].length : 0;
  const before = first.text.slice(0, at).replace(/\s+$/, '');
  const after = first.text.slice(at).replace(/^\s+/, '');
  // Blank line before what follows, or just the final newline when nothing does
  const rest = after || pieces.length > 1 ? `\n\n${after}` : '\n';
  pieces.splice(0, 1,
    { kind: 'text', text: `${before}\n\n` },
    { kind: 'generated', text },
    { kind: 'text', text: rest });
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) {
    if (predicate(items[i])) { return i; }
  }
  return -1;
}
