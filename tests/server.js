import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve('.');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.kml': 'application/vnd.google-earth.kml+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const requestedPath = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (requestedPath !== root && !requestedPath.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    let body = await readFile(requestedPath);
    // Test-only: /sw.js?v=x serves the worker as if a new version had been deployed (see offline.spec.js).
    const fakeVersion = new URL(request.url, 'http://localhost').searchParams.get('v');
    if (pathname === '/sw.js' && fakeVersion) body = Buffer.from(body.toString().replace(/const VERSION = '[^']*';/, `const VERSION = '${fakeVersion}';`));
    // Test-only: a context with the cookie `fake-deploy=<version>~<image delay ms>[~broken]` sees "the next deployment" (new version.json,
    // new worker stamp, slow photos) while every other test keeps seeing the files as they are (see update-cycle.spec.js).
    const deploy = /(?:^|;\s*)fake-deploy=([^;]+)/.exec(request.headers.cookie ?? '')?.[1];
    if (deploy) {
      const [deployVersion, delay, flag] = decodeURIComponent(deploy).split('~');
      if (pathname === '/data/version.json') body = Buffer.from(JSON.stringify({ version: deployVersion, updated: '2099-01-01' }));
      if (pathname === '/sw.js' && flag === 'broken') body = Buffer.from('this is not javascript ((('); // a worker that can never install
      else if (pathname === '/sw.js') body = Buffer.from(body.toString().replace(/const VERSION = '[^']*';/, `const VERSION = 'deploy-${deployVersion}';`));
      if (Number(delay) && pathname.startsWith('/assets/images/')) await new Promise((resolve) => setTimeout(resolve, Number(delay)));
    }
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(requestedPath)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(Number(process.env.E2E_PORT ?? 4173), '127.0.0.1');
