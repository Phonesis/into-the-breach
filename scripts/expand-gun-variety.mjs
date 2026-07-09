/**
 * Create mild gunfire WAV variants from existing masters.
 * Pitch shifts stay tiny (±1.5–2%) so shots still sound like the real sample,
 * not chipmunks / slow-mo. Body EQ is gentle only.
 *
 * Run: npm run expand-gun-variety
 */
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');

/**
 * Mild variants only:
 *  c — ~1.5% lower pitch, slightly more body
 *  d — ~1.5% higher pitch, slightly brighter mid (not metallic)
 *  e — ~1% lower pitch from the B master (tiny alternate)
 */
function rifleOuts(base) {
  return [
    { file: `${base}-c.wav`, pitch: 0.985, body: 1.2 },
    { file: `${base}-d.wav`, pitch: 1.015, body: 0.6 },
  ];
}

function rifleBOut(base) {
  return [{ file: `${base}-e.wav`, pitch: 0.99, body: 0.9 }];
}

function mgOuts(base) {
  return [
    { file: `${base}-c.wav`, pitch: 0.988, body: 1.0 },
    { file: `${base}-d.wav`, pitch: 1.012, body: 0.5 },
  ];
}

function mgBOut(base) {
  return [{ file: `${base}-e.wav`, pitch: 0.992, body: 0.8 }];
}

const BASES = [
  { src: 'rifle-germany.wav', outs: rifleOuts('rifle-germany') },
  { src: 'rifle-germany-b.wav', outs: rifleBOut('rifle-germany') },
  { src: 'rifle-usa.wav', outs: rifleOuts('rifle-usa') },
  { src: 'rifle-usa-b.wav', outs: rifleBOut('rifle-usa') },
  { src: 'rifle-uk.wav', outs: rifleOuts('rifle-uk') },
  { src: 'rifle-uk-b.wav', outs: rifleBOut('rifle-uk') },
  { src: 'rifle-russia.wav', outs: rifleOuts('rifle-russia') },
  { src: 'rifle-russia-b.wav', outs: rifleBOut('rifle-russia') },
  { src: 'rifle.wav', outs: rifleOuts('rifle') },

  { src: 'mg-germany.wav', outs: mgOuts('mg-germany') },
  { src: 'mg-germany-b.wav', outs: mgBOut('mg-germany') },
  { src: 'mg-usa.wav', outs: mgOuts('mg-usa') },
  { src: 'mg-usa-b.wav', outs: mgBOut('mg-usa') },
  { src: 'mg-uk.wav', outs: mgOuts('mg-uk') },
  { src: 'mg-uk-b.wav', outs: mgBOut('mg-uk') },
  { src: 'mg-russia.wav', outs: mgOuts('mg-russia') },
  { src: 'mg-russia-b.wav', outs: mgBOut('mg-russia') },
  { src: 'mg.wav', outs: mgOuts('mg') },

  // Big guns — even subtler
  ...[
    'tank.wav',
    'tank-75-germany.wav',
    'tank-75-usa.wav',
    'tank-75-uk.wav',
    'tank-88-germany.wav',
    'tank-90-usa.wav',
    'tank-17pdr-uk.wav',
    'tank-76-russia.wav',
    'tank-122-russia.wav',
    'at-75-germany.wav',
    'at-57-usa.wav',
    'at-57-uk.wav',
    'at-76-russia.wav',
    'mortar-germany.wav',
    'mortar-usa.wav',
    'mortar-uk.wav',
    'mortar-russia.wav',
    'artillery.wav',
    'howitzer-105-germany.wav',
    'howitzer-105-usa.wav',
    'howitzer-25pdr-uk.wav',
    'howitzer-122-russia.wav',
  ].map((src) => ({
    src,
    outs: [
      { file: src.replace(/\.wav$/i, '-c.wav'), pitch: 0.99, body: 1.0 },
      { file: src.replace(/\.wav$/i, '-d.wav'), pitch: 1.01, body: 0.5 },
    ],
  })),
];

/** Very light body touch — no aggressive metallic cuts that change character. */
function mildAf(bodyGain) {
  return [
    `equalizer=f=140:t=q:w=0.9:g=${bodyGain}`,
    'equalizer=f=3500:t=q:w=1.0:g=-1.2',
    'volume=1.02',
    'alimiter=limit=0.97',
  ].join(',');
}

function convert(srcPath, destPath, pitch, body) {
  const tempo = Math.max(0.5, Math.min(2, 1 / pitch));
  const filter = [
    `asetrate=44100*${pitch}`,
    'aresample=44100',
    `atempo=${tempo.toFixed(5)}`,
    mildAf(body),
  ].join(',');

  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', srcPath, '-ac', '1', '-ar', '44100', '-af', filter, destPath],
    { encoding: 'utf8' }
  );
  return r.status === 0;
}

let wrote = 0;
let failed = 0;
let skipped = 0;

for (const { src, outs } of BASES) {
  const srcPath = join(OUT, src);
  if (!existsSync(srcPath)) {
    console.warn('missing', src);
    skipped += outs.length;
    continue;
  }
  for (const { file, pitch, body } of outs) {
    const destPath = join(OUT, file);
    process.stdout.write(`${src} → ${file} (pitch ${pitch}) … `);
    if (convert(srcPath, destPath, pitch, body)) {
      console.log('ok');
      wrote += 1;
    } else {
      console.log('FAIL');
      failed += 1;
    }
  }
}

console.log(`\nDone — wrote ${wrote} mild variants${failed ? `, ${failed} failed` : ''}${skipped ? `, ${skipped} skipped` : ''}.`);
