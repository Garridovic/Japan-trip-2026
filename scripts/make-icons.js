// Generates the app icons (home-screen install) from a simple vector drawing: a red sun over a night-blue square.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const svg = (size, { maskable = false } = {}) => {
  const pad = maskable ? size * 0.2 : 0; // maskable icons keep their content inside the safe zone
  const radius = maskable ? 0 : size * 0.22;
  const c = size / 2;
  const sun = (size - pad * 2) * 0.27;
  const line = (size - pad * 2) * 0.035;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#182a35"/>
  <circle cx="${c}" cy="${c - size * 0.04}" r="${sun}" fill="#b84b3d"/>
  <rect x="${c - sun * 1.55}" y="${c + sun * 0.9}" width="${sun * 3.1}" height="${line}" rx="${line / 2}" fill="#f2e5c9"/>
  <rect x="${c - sun * 1.15}" y="${c + sun * 0.9 + line * 2.2}" width="${sun * 2.3}" height="${line}" rx="${line / 2}" fill="#bd8b39"/>
</svg>`;
};

await mkdir('assets/icons', { recursive: true });
for (const [file, size, options] of [
  ['icon-192.png', 192, {}], ['icon-512.png', 512, {}], ['icon-maskable-512.png', 512, { maskable: true }], ['apple-touch-icon.png', 180, { maskable: true }]
]) {
  await sharp(Buffer.from(svg(size, options))).png().toFile(`assets/icons/${file}`);
}
console.log('Icons written to assets/icons');
