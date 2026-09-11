import { access, readdir, readFile } from 'node:fs/promises';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = join(root, 'public');
const html = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name.endsWith('.html')) html.push(path);
  }
}

await walk(sourceRoot);
if (html.length !== 15) throw new Error(`Expected 15 HTML pages, found ${html.length}`);
await access(join(sourceRoot, 'assets', 'styles.css'));
await access(join(sourceRoot, 'assets', 'site.js'));
for (const file of html) {
  const source = await readFile(file, 'utf8');
  if (!source.includes('<html lang="ru">') || !/<main\s[^>]*id="content"/.test(source)) throw new Error(`Invalid layout: ${file}`);
  if (source.includes('DUMMY_PLACEHOLDER')) throw new Error(`Placeholder found: ${file}`);
  if (!source.includes('<h1>') || !source.includes('<nav ')) throw new Error(`Missing static content: ${file}`);
  if (source.includes('${') || /<script(?![^>]*\bsrc=)[^>]*>\s*\S/.test(source)) throw new Error(`Unexpected HTML template or inline script: ${file}`);
  for (const [, value] of source.matchAll(/(?:href|src|poster)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:|#)/.test(value)) continue;
    const target = resolve(dirname(file), value.split('#')[0]);
    if (relative(sourceRoot, target).startsWith('..')) throw new Error(`Link outside public/: ${file}: ${value}`);
    await access(target);
  }
}
const browserScript = await readFile(join(sourceRoot, 'assets', 'site.js'), 'utf8');
if (/innerHTML|outerHTML|document\.write|createElement|insertAdjacentHTML/.test(browserScript)) throw new Error('Browser script must not generate HTML');
console.log(`Checked ${html.length} standalone HTML pages and local links: OK. No JavaScript HTML rendering.`);
