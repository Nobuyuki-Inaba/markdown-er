/**
 * Write THIRD_PARTY_NOTICES.md: the license of every package bundled into the extension.
 *
 * Runs before packaging (`vscode:prepublish`), so the .vsix always matches what it ships. Packages come
 * from the import graph, not the lockfiles: a package listed as a dev dependency may still be bundled.
 * The webview's real bundle is built by Vite, whose tree shaking can only ship fewer packages than this finds.
 */
import { build } from 'esbuild';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function bundledPackageDirs(options) {
  const { metafile } = await build({
    absWorkingDir: root, bundle: true, write: false, metafile: true, outdir: 'unused', logLevel: 'error', ...options,
  });
  return Object.keys(metafile.inputs).flatMap((input) => {
    const match = input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
    return match ? [match[1]] : [];
  });
}

function licenseText(dir) {
  const file = readdirSync(dir).find((name) => /^(licen[cs]e|copying)/i.test(name));
  if (!file) { throw new Error(`No license file in ${dir}`); }
  return readFileSync(join(dir, file), 'utf8').trim();
}

const dirs = new Set([
  ...await bundledPackageDirs({ entryPoints: ['src/extension.ts'], platform: 'node', external: ['vscode'] }),
  ...await bundledPackageDirs({ entryPoints: ['webview/src/main.tsx'], tsconfig: 'webview/tsconfig.json', jsx: 'automatic' }),
]);

const packages = new Map();
for (const dir of dirs) {
  const { name, version, license } = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
  packages.set(`${name}@${version}`, { name, version, license, text: licenseText(join(root, dir)) });
}

const sections = [...packages.values()]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((p) => `## ${p.name} ${p.version} (${p.license})\n\n\`\`\`text\n${p.text}\n\`\`\``);

writeFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), [
  '# Third-party notices',
  'This extension includes the following open source packages.',
  ...sections,
].join('\n\n') + '\n');
console.log(`THIRD_PARTY_NOTICES.md: ${packages.size} packages`);
