import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = path.join(electronRoot, 'game-dist');
const htmlPath = path.join(buildRoot, 'index.html');

await access(htmlPath);
const html = await readFile(htmlPath, 'utf8');

if (!html.includes('src="./assets/')) {
  throw new Error('The desktop build does not use relative JavaScript asset paths.');
}

if (!html.includes('href="./assets/')) {
  throw new Error('The desktop build does not use relative stylesheet asset paths.');
}

await Promise.all([
  access(path.join(buildRoot, 'favicon.svg')),
  access(path.join(buildRoot, 'menu', 'menu-title.jpg')),
  access(path.join(buildRoot, 'music', 'menu-theme.ogg')),
  access(path.join(buildRoot, 'sounds', 'impact.wav')),
]);

console.log('Desktop game build is complete and uses package-safe asset paths.');
