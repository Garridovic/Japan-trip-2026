// Builds offline-manifest.json (what the service worker caches) and stamps its version into sw.js.
// Run after the photos are committed (`npm run prepare:images`, by hand) so the list matches the images that are actually published.
//   required : the app itself (HTML, JS, CSS, data, vendor files, icons). Installing the service worker fails without them.
//   optional : small place and dish photos (480 px). Downloaded during install; a failed photo does not abort it.
//   warm     : larger photos (960 px): "download everything" (automatic on wifi, otherwise a button).
// `sizes` (bytes) lets the interface say how much each step downloads.
// 1600 px photos are not stored in advance (22 MB): they are cached when viewed, and offline the 960 px copy is used instead.
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { buildProgressIndex } from './progress-index.js';
import { writeHints } from './preload-hints.js';

export const SKIPPED = ['image-catalog.json', 'dish-catalog.json'];
const isImage = (file) => file.startsWith('assets/images/');

async function walk(root, directory) {
  const result = [];
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await walk(root, relative));
    else result.push(relative);
  }
  return result;
}
const exists = (file) => stat(file).then(() => true, () => false);

/** Pure classification of a file list, so it can be unit-tested. */
export function classify(files) {
  const required = [];
  const optional = [];
  const warm = [];
  for (const file of files) {
    if (SKIPPED.some((name) => file.endsWith(`/${name}`))) continue;
    if (isImage(file)) {
      if (/-1600\.webp$/.test(file)) continue;
      if (/-960\.webp$/.test(file)) warm.push(file);
      else optional.push(file);
    } else required.push(file);
  }
  return { required: required.sort(), optional: optional.sort(), warm: warm.sort() };
}

export async function buildOffline(root = process.cwd()) {
  await writeHints(root); // modulepreload / data preload hints in index.html (written before the files are hashed)
  await buildProgressIndex(root); // small per-city totals for the header's progress card (written before the files are hashed)
  const files = [];
  for (const top of ['index.html', 'manifest.webmanifest', 'kyoto-points.kml']) if (await exists(path.join(root, top))) files.push(top);
  for (const directory of ['assets', 'js', 'data']) files.push(...await walk(root, directory));
  const lists = classify(files);
  const hash = createHash('sha1');
  for (const file of [...lists.required, ...lists.optional, ...lists.warm]) {
    hash.update(file);
    hash.update(await readFile(path.join(root, file)));
  }
  const version = hash.digest('hex').slice(0, 10);
  const sizeOf = async (list) => (await Promise.all(list.map(async (file) => (await stat(path.join(root, file))).size))).reduce((sum, bytes) => sum + bytes, 0);
  const sizes = { required: await sizeOf(lists.required), optional: await sizeOf(lists.optional), warm: await sizeOf(lists.warm) };
  const manifest = { version, sizes, ...lists };
  await writeFile(path.join(root, 'offline-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const worker = await readFile(path.join(root, 'sw.js'), 'utf8');
  await writeFile(path.join(root, 'sw.js'), worker.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`));
  return manifest;
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const manifest = await buildOffline();
  console.log(`Offline manifest ${manifest.version}: ${manifest.required.length} required, ${manifest.optional.length} optional, ${manifest.warm.length} background files.`);
}
