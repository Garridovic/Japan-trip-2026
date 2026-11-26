// Downloads one reviewed, freely licensed photo per dish from Wikimedia Commons.
// Run manually (npm run prepare:dishes); the result is committed so published photos are always the reviewed ones.
// Catalog entries may set `skip: true` (no photo on purpose), force a file with `file` ("File:Name.jpg") or ban candidates with `exclude` (list of titles).
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const apiUrl = 'https://commons.wikimedia.org/w/api.php';
const userAgent = 'JapanTripGuide/11.1 (personal travel guide; image attribution included)';
const catalogPath = path.join(root, 'data/global/dish-catalog.json');
const dishesPath = path.join(root, 'data/global/dishes.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const dishesData = JSON.parse(await readFile(dishesPath, 'utf8'));

const cleanHtml = (value = '') => value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const meta = (metadata, key) => cleanHtml(metadata?.[key]?.value || '');
const isReusableLicense = (license) => {
  const value = license.toLowerCase();
  return value.includes('public domain') || value.includes('cc0') ||
    (/cc by(?:-sa)?\s*(1\.0|2\.0|2\.5|3\.0|4\.0)/i.test(license) && !value.includes('noncommercial') && !value.includes('no derivatives'));
};
// Commons rate-limits aggressive clients (HTTP 429): wait and retry with growing delays.
const fetchWithRetry = async (url) => {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt >= 5) return response;
    const wait = Math.max(Number(response.headers.get('retry-after')) || 0, 5 * (attempt + 1)) * 1000;
    console.warn(`  HTTP ${response.status}, waiting ${wait / 1000}s before retrying…`);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
};
const requestJson = async (url) => {
  const response = await fetchWithRetry(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
};
const queryPages = async (params) => {
  const url = new URL(apiUrl);
  Object.entries({
    action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(catalog.imageWidth), iiextmetadatalanguage: 'en', ...params
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  return Object.values((await requestJson(url)).query?.pages || {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
};
const search = (query) => queryPages({ generator: 'search', gsrsearch: `filetype:bitmap ${query}`, gsrnamespace: '6', gsrlimit: '30' });
const byTitle = (title) => queryPages({ titles: title });
const download = async (url) => {
  const response = await fetchWithRetry(url);
  if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};
const usable = (page, exclude = []) => {
  const info = page.imageinfo?.[0];
  return info?.thumburl && info.mime?.startsWith('image/') && !info.mime.includes('svg') && info.width >= catalog.minWidth &&
    isReusableLicense(meta(info.extmetadata, 'LicenseShortName')) && !exclude.includes(page.title);
};

const outDir = path.join(root, 'assets/images/dishes');
await mkdir(outDir, { recursive: true });

const dishById = new Map(dishesData.dishes.map((dish) => [dish.id, dish]));
// Resumable: dishes that already have a photo and a credit are kept unless --force is passed.
const force = process.argv.includes('--force');
const creditsPath = path.join(root, 'data/global/dish-credits.json');
const credits = force ? [] : JSON.parse(await readFile(creditsPath, 'utf8').catch(() => '[]'));
const review = [];
const used = new Set();
const fileExists = (file) => access(path.join(root, file)).then(() => true, () => false);

for (const entry of catalog.dishes) {
  const dish = dishById.get(entry.id);
  if (entry.skip) { dish.photos = []; credits.splice(0, credits.length, ...credits.filter((credit) => credit.dishId !== entry.id)); console.log(`${entry.id}: skipped on purpose (no good free photo)`); continue; }
  const existing = credits.find((credit) => credit.dishId === entry.id);
  if (!force && existing && dish.photos?.[0] && await fileExists(dish.photos[0].src)) { console.log(`${entry.id}: kept (${existing.fileTitle})`); continue; }
  credits.splice(0, credits.length, ...credits.filter((credit) => credit.dishId !== entry.id));
  dish.photos = [];
  await new Promise((resolve) => setTimeout(resolve, 2000));
  try {
    const candidates = entry.file ? await byTitle(entry.file) : await search(entry.query);
    const good = candidates.filter((page) => usable(page, entry.exclude) && !used.has(page.pageid) && !credits.some((credit) => credit.fileTitle === page.title));
    const page = good[0];
    review.push({ id: entry.id, name: dish.es, chosen: page?.title ?? null, alternates: good.slice(1, 5).map((p) => ({ title: p.title, thumb: p.imageinfo[0].thumburl })) });
    if (!page) { console.warn(`[DISH WARNING] ${entry.id}: no reusable photo found`); continue; }
    const info = page.imageinfo[0];
    const source = await download(info.thumburl);
    const variants = [];
    for (const width of catalog.variants) {
      const filename = `${entry.id}-${width}.webp`;
      await sharp(source).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(path.join(outDir, filename));
      variants.push({ width, path: `assets/images/dishes/${filename}` });
    }
    const description = meta(info.extmetadata, 'ImageDescription') || page.title.replace(/^File:/, '');
    dish.photos = [{
      src: variants.at(-1).path,
      srcSet: variants.map(({ path: p, width }) => `${p} ${width}w`).join(', '),
      alt: `Foto de ${dish.es[0].toLowerCase()}${dish.es.slice(1)}` // short Spanish alt text; licence and author live in dish-credits.json
    }];
    credits.push({
      dishId: entry.id, dishName: dish.es, fileTitle: page.title,
      author: meta(info.extmetadata, 'Artist') || meta(info.extmetadata, 'Credit') || info.user || 'Autor no identificado',
      license: meta(info.extmetadata, 'LicenseShortName'), licenseUrl: meta(info.extmetadata, 'LicenseUrl'),
      sourcePage: info.descriptionurl, width: info.width, height: info.height
    });
    used.add(page.pageid);
    console.log(`${entry.id}: ${page.title}`);
  } catch (error) {
    console.warn(`[DISH WARNING] ${entry.id}: ${error.message}`);
    review.push({ id: entry.id, name: dish.es, chosen: null, error: error.message, alternates: [] });
  }
}

await writeFile(dishesPath, `${JSON.stringify(dishesData, null, 2)}\n`);
await writeFile(path.join(root, 'data/global/dish-credits.json'), `${JSON.stringify(credits, null, 2)}\n`);
await writeFile(path.join(root, 'dish-review.json'), `${JSON.stringify(review, null, 2)}\n`);
console.log(`${credits.length}/${catalog.dishes.length} dishes have a photo. Review data: dish-review.json`);
