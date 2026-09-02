import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) throw new Error('用法：node tools/pack-plugin.mjs plugins-local/theme-midnight');
const source = path.resolve(root, input);
const manifest = JSON.parse(await readFile(path.join(source, 'plugin.json'), 'utf8'));
const outputDir = path.join(source, 'dist');
await mkdir(outputDir, { recursive: true });
const zip = new AdmZip();
async function add(directory, relative = '') {
  for (const name of await readdir(directory)) {
    if (name === 'dist' || name === 'node_modules') continue;
    const full = path.join(directory, name);
    const rel = path.join(relative, name).replaceAll('\\', '/');
    if ((await stat(full)).isDirectory()) await add(full, rel);
    else zip.addFile(rel, await readFile(full));
  }
}
await add(source);
const output = path.join(outputDir, `${manifest.id}-${manifest.version}.zip`);
zip.writeZip(output);
console.log(`Built plugin package: ${output}`);
