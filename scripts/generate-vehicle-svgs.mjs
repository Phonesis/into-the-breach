/**
 * Emit side-view vehicle SVG silhouettes (public/vehicles/svg/).
 * Proportions match src/units/vehicleDesigns.js; trace shapes from Imagine refs
 * in public/vehicles/refs/ (medium-tank.jpg, medium-tank-usa.jpg, etc.).
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'vehicles', 'svg');
mkdirSync(root, { recursive: true });

const PAL = {
  germany: { hull: '#5a5d52', track: '#2a2a28', gun: '#3d4038', accent: '#6b7058' },
  usa: { hull: '#4a5c4a', track: '#2a2a28', gun: '#3a4538', accent: '#5a6e58' },
  uk: { hull: '#4a5568', track: '#2a2a28', gun: '#384552', accent: '#5a6578' },
};

function wrap(id, nation, body) {
  const p = PAL[nation];
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 64" role="img" aria-label="${id}">
  <rect width="128" height="64" fill="#e8e6e0"/>
  <g fill="${p.track}">${body.tracks}</g>
  <g fill="${p.hull}">${body.hull}</g>
  <g fill="${p.gun}">${body.gun}</g>
  <g fill="${p.accent}" opacity="0.85">${body.detail || ''}</g>
</svg>`;
}

const SVGS = {
  'tank-medium-germany': () =>
    wrap('Panzer IV', 'germany', {
      tracks: `<rect x="14" y="46" width="8" height="10"/><rect x="106" y="46" width="8" height="10"/><rect x="18" y="48" width="92" height="6"/>`,
      hull: `<path d="M28 44 L28 32 L42 26 L88 26 L98 32 L98 44 Z"/><path d="M42 26 L58 18 L78 18 L88 26 Z"/>`,
      gun: `<rect x="88" y="22" width="32" height="4" rx="1"/><rect x="82" y="20" width="10" height="8"/>`,
      detail: `<rect x="52" y="16" width="22" height="10" rx="1"/>`,
    }),
  'tank-medium-usa': () =>
    wrap('M4 Sherman', 'usa', {
      tracks: `<rect x="12" y="46" width="7" height="10"/><rect x="109" y="46" width="7" height="10"/><rect x="16" y="48" width="96" height="6"/>`,
      hull: `<path d="M26 44 L26 30 L40 24 L90 24 L100 30 L100 44 Z"/><path d="M40 24 L54 17 L82 17 L90 24 Z"/>`,
      gun: `<rect x="90" y="21" width="30" height="4" rx="1"/><circle cx="58" cy="20" r="9"/>`,
      detail: `<rect x="118" y="22" width="6" height="5"/>`,
    }),
  'tank-medium-uk': () =>
    wrap('Churchill', 'uk', {
      tracks: `<rect x="10" y="44" width="9" height="12"/><rect x="109" y="44" width="9" height="12"/><rect x="14" y="48" width="100" height="6"/>`,
      hull: `<path d="M22 44 L22 28 L30 24 L108 24 L112 44 Z"/><rect x="30" y="24" width="78" height="8"/>`,
      gun: `<rect x="72" y="18" width="28" height="4"/><rect x="68" y="14" width="14" height="10"/>`,
    }),
  'tank-super-germany': () =>
    wrap('Tiger I', 'germany', {
      tracks: `<rect x="10" y="45" width="9" height="11"/><rect x="109" y="45" width="9" height="11"/><rect x="14" y="48" width="100" height="7"/>`,
      hull: `<path d="M24 44 L24 28 L38 20 L96 20 L106 28 L106 44 Z"/><path d="M38 20 L52 14 L86 14 L96 20 Z"/>`,
      gun: `<rect x="94" y="18" width="28" height="5"/><rect x="86" y="16" width="12" height="9"/>`,
      detail: `<rect x="48" y="12" width="26" height="12"/>`,
    }),
  'tank-super-usa': () =>
    wrap('M26 Pershing', 'usa', {
      tracks: `<rect x="12" y="45" width="8" height="11"/><rect x="108" y="45" width="8" height="11"/><rect x="16" y="48" width="96" height="7"/>`,
      hull: `<path d="M26 44 L26 28 L42 22 L94 22 L104 28 L104 44 Z"/><path d="M42 22 L56 16 L84 16 L94 22 Z"/>`,
      gun: `<rect x="92" y="17" width="30" height="5"/><circle cx="56" cy="16" r="10"/>`,
    }),
  'tank-super-uk': () =>
    wrap('Black Prince', 'uk', {
      tracks: `<rect x="8" y="44" width="10" height="12"/><rect x="110" y="44" width="10" height="12"/><rect x="12" y="48" width="104" height="7"/>`,
      hull: `<path d="M20 44 L20 26 L28 22 L110 22 L114 44 Z"/>`,
      gun: `<rect x="70" y="16" width="32" height="5"/><rect x="64" y="12" width="16" height="12"/>`,
    }),
  'armored-car-germany': () =>
    wrap('Sd.Kfz. 222', 'germany', {
      tracks: `<circle cx="28" cy="50" r="9"/><circle cx="100" cy="50" r="9"/><circle cx="28" cy="50" r="5" fill="#1a1a18"/><circle cx="100" cy="50" r="5" fill="#1a1a18"/>`,
      hull: `<path d="M32 44 L32 30 L108 30 L108 44 Z"/><path d="M108 34 L118 38 L118 44 L108 44 Z"/>`,
      gun: `<rect x="108" y="26" width="14" height="3"/><rect x="72" y="22" width="16" height="10" rx="2"/>`,
    }),
  'armored-car-usa': () =>
    wrap('M8 Greyhound', 'usa', {
      tracks: `<circle cx="24" cy="50" r="8"/><circle cx="52" cy="50" r="8"/><circle cx="80" cy="50" r="8"/><circle cx="108" cy="50" r="8"/>`,
      hull: `<path d="M26 44 L26 32 L104 32 L104 44 Z"/><path d="M104 34 L114 38 L114 44 L104 44 Z"/>`,
      gun: `<rect x="106" y="28" width="10" height="3"/><circle cx="78" cy="24" r="8"/>`,
    }),
  'armored-car-uk': () =>
    wrap('Daimler AC', 'uk', {
      tracks: `<circle cx="30" cy="50" r="9"/><circle cx="98" cy="50" r="9"/>`,
      hull: `<path d="M34 44 L34 30 L102 30 L102 44 Z"/><path d="M102 34 L112 38 L112 44 L102 44 Z"/>`,
      gun: `<rect x="104" y="28" width="12" height="3"/><rect x="70" y="22" width="18" height="11"/>`,
    }),
  'artillery-germany': () =>
    wrap('leFH 18', 'germany', {
      tracks: `<circle cx="36" cy="52" r="8"/><circle cx="92" cy="52" r="8"/><path d="M18 54 L8 40 L14 38 L24 52 Z M110 54 L120 40 L114 38 L104 52 Z"/>`,
      hull: `<rect x="40" y="28" width="14" height="18" rx="1"/>`,
      gun: `<rect x="54" y="14" width="48" height="5" transform="rotate(-8 54 14)"/>`,
    }),
  'artillery-usa': () =>
    wrap('M101', 'usa', {
      tracks: `<circle cx="34" cy="52" r="8"/><circle cx="90" cy="52" r="8"/><path d="M16 54 L6 42 L12 40 L22 52 Z M108 54 L118 42 L112 40 L102 52 Z"/>`,
      hull: `<rect x="38" y="32" width="52" height="12" rx="1"/>`,
      gun: `<rect x="52" y="12" width="52" height="5" transform="rotate(-10 52 12)"/><rect x="100" y="8" width="8" height="8"/>`,
    }),
  'artillery-uk': () =>
    wrap('25-pounder', 'uk', {
      tracks: `<circle cx="35" cy="52" r="8"/><circle cx="93" cy="52" r="8"/><path d="M17 54 L7 41 L13 39 L23 52 Z M111 54 L121 41 L115 39 L105 52 Z"/>`,
      hull: `<rect x="42" y="26" width="16" height="20" rx="1"/>`,
      gun: `<rect x="56" y="13" width="50" height="5" transform="rotate(-9 56 13)"/>`,
    }),
  'at-gun-germany': () =>
    wrap('Pak 40', 'germany', {
      tracks: `<circle cx="38" cy="52" r="7"/><circle cx="90" cy="52" r="7"/><path d="M20 54 L10 42 L16 40 L26 52 Z M108 54 L118 42 L112 40 L102 52 Z"/>`,
      hull: `<rect x="44" y="22" width="10" height="22" rx="1"/>`,
      gun: `<rect x="54" y="18" width="58" height="4"/>`,
    }),
  'at-gun-usa': () =>
    wrap('57mm M1', 'usa', {
      tracks: `<circle cx="36" cy="52" r="7"/><circle cx="88" cy="52" r="7"/><path d="M18 54 L8 42 L14 40 L24 52 Z M106 54 L116 42 L110 40 L100 52 Z"/>`,
      hull: `<rect x="42" y="24" width="9" height="20" rx="1"/>`,
      gun: `<rect x="52" y="19" width="54" height="4"/>`,
    }),
  'at-gun-uk': () =>
    wrap('6-pounder', 'uk', {
      tracks: `<circle cx="37" cy="52" r="7"/><circle cx="89" cy="52" r="7"/><path d="M19 54 L9 42 L15 40 L25 52 Z M107 54 L117 42 L111 40 L101 52 Z"/>`,
      hull: `<rect x="43" y="23" width="10" height="21" rx="1"/>`,
      gun: `<rect x="53" y="18" width="56" height="4"/>`,
    }),
};

for (const [name, fn] of Object.entries(SVGS)) {
  writeFileSync(join(root, `${name}.svg`), fn());
  console.log('wrote', name);
}