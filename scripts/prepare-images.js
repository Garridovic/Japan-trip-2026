import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const apiUrl = 'https://commons.wikimedia.org/w/api.php';
const catalog = JSON.parse(await readFile(path.join(root, 'data/image-catalog.json'), 'utf8'));
const places = JSON.parse(await readFile(path.join(root, 'data/places.json'), 'utf8'));
const details = JSON.parse(await readFile(path.join(root, 'data/details.json'), 'utf8'));
const placeById = new Map(places.map((place) => [place.id, place]));
const detailsById = new Map(details.map((detail) => [detail.id, detail]));
const credits = [];
const issues = [];
const usedPageIds = new Set();

const cleanHtml = (value = '') => value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const metadataValue = (metadata, key) => cleanHtml(metadata?.[key]?.value || '');
const isReusableLicense = (license) => {
  const value = license.toLowerCase();
  return value.includes('public domain') ||
    value.includes('cc0') ||
    (/cc by(?:-sa)?\s*(1\.0|2\.0|2\.5|3\.0|4\.0)/i.test(license) &&
      !value.includes('noncommercial') && !value.includes('no derivatives'));
};
const requestJson = async (url) => {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'KyotoGuide/10.0 (personal travel guide; image attribution included)' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
};
const searchImages = async (query) => {
  const url = new URL(apiUrl);
  Object.entries({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: '6',
    gsrlimit: '50',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(catalog.imageWidth),
    iiextmetadatalanguage: 'en'
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  const result = await requestJson(url);
  return Object.values(result.query?.pages || {});
};
const searchCategoryImages = async (category) => {
  if (!category) return [];
  const url = new URL(apiUrl);
  Object.entries({
    action: 'query',
    format: 'json',
    generator: 'categorymembers',
    gcmtitle: category,
    gcmtype: 'file',
    gcmlimit: '50',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(catalog.imageWidth),
    iiextmetadatalanguage: 'en'
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  const result = await requestJson(url);
  return Object.values(result.query?.pages || {});
};
const download = async (url) => {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'KyotoGuide/10.0 (personal travel guide; image attribution included)' }
  });
  if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};
const imageDirectory = path.join(root, 'assets', 'images');
await mkdir(imageDirectory, { recursive: true });
for (const filename of await readdir(imageDirectory).catch(() => [])) {
  if (filename.endsWith('.webp')) await unlink(path.join(imageDirectory, filename));
}

for (const entry of catalog.places) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const place = placeById.get(entry.id);
  const detail = detailsById.get(entry.id);
  if (!place || !detail) {
    issues.push({ placeId: entry.id, placeName: place?.name || entry.id, status: 'error', reason: 'Place or detail record is missing.' });
    console.error(`[IMAGE WARNING] ${entry.id}: place or detail record is missing.`);
    continue;
  }

  const photos = [];
  try {
    const primaryCandidates = await searchImages(entry.query);
    const categoryCandidates = await searchCategoryImages(entry.category);
    const candidates = [...new Map(
      [...primaryCandidates, ...categoryCandidates].map((page) => [page.pageid, page])
    ).values()];
    const selected = candidates.filter((page) => {
      const info = page.imageinfo?.[0];
      const metadata = info?.extmetadata || {};
      const license = metadataValue(metadata, 'LicenseShortName');
      return info && info.width >= 1400 && info.mime?.startsWith('image/') &&
        !info.mime.includes('svg') && isReusableLicense(license) &&
        !usedPageIds.has(page.pageid) && info.thumburl;
    }).slice(0, entry.count);

    if (selected.length < entry.count) {
      issues.push({
        placeId: entry.id,
        placeName: place.name,
        status: 'incomplete',
        expected: entry.count,
        found: selected.length,
        reason: `Only ${selected.length}/${entry.count} reusable images found after text and category search.`
      });
      console.warn(`[IMAGE WARNING] ${entry.id}: ${selected.length}/${entry.count} reusable images found.`);
    }

    for (const [index, page] of selected.entries()) {
      try {
        const info = page.imageinfo[0];
        const metadata = info.extmetadata || {};
        const imageId = `${entry.id}-${index + 1}`;
        const source = await download(info.thumburl);
        const image = sharp(source, { failOn: 'error' }).rotate();
        const metadataInfo = await image.metadata();
        if (!metadataInfo.width || !metadataInfo.height) throw new Error(`Invalid image dimensions: ${page.title}`);

        const variants = [];
        for (const width of catalog.variants) {
          const filename = `${imageId}-${width}.webp`;
          const outputPath = path.join(imageDirectory, filename);
          await sharp(source).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 84, effort: 5 }).toFile(outputPath);
          variants.push({ width, path: `assets/images/${filename}` });
        }

        const license = metadataValue(metadata, 'LicenseShortName');
        const author = metadataValue(metadata, 'Artist') || metadataValue(metadata, 'Credit') || info.user || 'Autor no identificado';
        const description = metadataValue(metadata, 'ImageDescription') || page.title.replace(/^File:/, '');
        const photo = {
          src: variants[variants.length - 1].path,
          srcSet: variants.map(({ path: filePath, width }) => `${filePath} ${width}w`).join(', '),
          alt: `${place.name} — ${description}`
        };
        photos.push(photo);
        credits.push({
          placeId: entry.id,
          placeName: place.name,
          fileTitle: page.title,
          description,
          author,
          license,
          licenseUrl: metadataValue(metadata, 'LicenseUrl'),
          sourcePage: info.descriptionurl,
          originalUrl: info.descriptionurl,
          width: info.width,
          height: info.height
        });
        usedPageIds.add(page.pageid);
      } catch (error) {
        issues.push({ placeId: entry.id, placeName: place.name, status: 'image-error', reason: error.message, source: page.title });
        console.warn(`[IMAGE WARNING] ${entry.id}: failed to process ${page.title}: ${error.message}`);
      }
    }
  } catch (error) {
    issues.push({ placeId: entry.id, placeName: place.name, status: 'search-error', reason: error.message });
    console.warn(`[IMAGE WARNING] ${entry.id}: image search failed: ${error.message}`);
  }

  detail.photos = photos;
  console.log(`${entry.id}: ${photos.length}/${entry.count} image(s) prepared`);
}

for (const detail of details) {
  if (!catalog.places.some(({ id }) => id === detail.id)) detail.photos = [];
}

await writeFile(path.join(root, 'data', 'details.json'), `${JSON.stringify(details, null, 2)}\n`);
await writeFile(path.join(root, 'data', 'image-credits.json'), `${JSON.stringify(credits, null, 2)}\n`);
const report = {
  generatedAt: new Date().toISOString(),
  provider: catalog.provider,
  placesChecked: catalog.places.length,
  placesWithImages: catalog.places.filter(({ id }) => detailsById.get(id)?.photos?.length).length,
  totalImages: credits.length,
  placesWithIssues: issues.length,
  issues
};
await writeFile(path.join(root, 'image-preparation-report.json'), `${JSON.stringify(report, null, 2)}\n`);
const markdown = [
  '# Image preparation report',
  '',
  `- Generated: ${report.generatedAt}`,
  `- Places checked: ${report.placesChecked}`,
  `- Places with at least one image: ${report.placesWithImages}`,
  `- Images prepared: ${report.totalImages}`,
  `- Places with warnings: ${report.placesWithIssues}`,
  '',
  ...(issues.length ? issues.map((issue) => `- **${issue.placeName} (${issue.placeId})** — ${issue.status}: ${issue.reason}`) : ['All configured places have their requested images.'])
].join('\n');
await writeFile(path.join(root, 'image-preparation-report.md'), `${markdown}\n`);
console.log(`Prepared ${credits.length} local images. ${issues.length} place(s) have image warnings.`);
if (issues.length) console.warn('See image-preparation-report.md and image-preparation-report.json for details.');

