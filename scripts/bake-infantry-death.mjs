/**
 * Bakes infantry casualty voice lines (neural shouts + real pain/scream clips).
 * Requires: edge-tts (pip install edge-tts), ffmpeg on PATH.
 * Run: npm run bake-infantry-death
 */
import { execSync, spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-infantry-voice');
const SR = 44100;

/** Freesound HQ previews — see public/sounds/VOICES_LICENSE.txt */
const SCREAM_SOURCES = [
  {
    url: 'https://cdn.freesound.org/previews/416/416838_8247784-hq.mp3',
    slices: [
      { start: 0.12, dur: 1.1 },
      { start: 1.15, dur: 0.9 },
      { start: 2.0, dur: 0.8 },
    ],
  },
  {
    url: 'https://cdn.freesound.org/previews/530/530471_84709-hq.mp3',
    slices: [
      { start: 0.08, dur: 1.0 },
      { start: 1.05, dur: 0.85 },
    ],
  },
];

const GRUNT_SLOTS = [3, 5, 7];

/** Spoken slots — faction-specific neural TTS lines. */
const FACTION_SHOUTS = {
  default: {
    prefix: 'infantry-death',
    lines: [
      { slot: 1, voice: 'en-US-GuyNeural', text: 'Medic!', rate: '+28%', pitch: '-18Hz' },
      { slot: 2, voice: 'en-US-RogerNeural', text: 'Man down!', rate: '+22%', pitch: '-12Hz' },
      { slot: 4, voice: 'en-US-ChristopherNeural', text: 'Fall back!', rate: '+26%', pitch: '-10Hz' },
      { slot: 6, voice: 'en-GB-RyanNeural', text: "I'm hit!", rate: '+24%', pitch: '-14Hz' },
      { slot: 8, voice: 'en-US-GuyNeural', text: 'Help!', rate: '+30%', pitch: '-16Hz' },
    ],
  },
  germany: {
    prefix: 'infantry-death-germany',
    lines: [
      { slot: 1, voice: 'de-DE-ConradNeural', text: 'Sanitäter!', rate: '+28%', pitch: '-18Hz' },
      { slot: 2, voice: 'de-DE-KillianNeural', text: 'Mann am Boden!', rate: '+22%', pitch: '-12Hz' },
      { slot: 4, voice: 'de-DE-ConradNeural', text: 'Rückzug!', rate: '+26%', pitch: '-10Hz' },
      { slot: 6, voice: 'de-DE-KillianNeural', text: 'Ich bin getroffen!', rate: '+24%', pitch: '-14Hz' },
      { slot: 8, voice: 'de-DE-ConradNeural', text: 'Hilfe!', rate: '+30%', pitch: '-16Hz' },
    ],
  },
  russia: {
    prefix: 'infantry-death-russia',
    lines: [
      { slot: 1, voice: 'ru-RU-DmitryNeural', text: 'Санитар!', rate: '+28%', pitch: '-18Hz' },
      { slot: 2, voice: 'ru-RU-DmitryNeural', text: 'Раненый!', rate: '+22%', pitch: '-12Hz' },
      { slot: 4, voice: 'ru-RU-DmitryNeural', text: 'Отходите!', rate: '+26%', pitch: '-10Hz' },
      { slot: 6, voice: 'ru-RU-SvetlanaNeural', text: 'Я ранен!', rate: '+24%', pitch: '-14Hz' },
      { slot: 8, voice: 'ru-RU-DmitryNeural', text: 'Помогите!', rate: '+30%', pitch: '-16Hz' },
    ],
  },
};

const COMBAT_AF =
  'highpass=f=200,lowpass=f=4200,afftdn=nr=10:nf=-28,acompressor=threshold=-20dB:ratio=5.5:attack=4:release=70,alimiter=limit=0.92,volume=1.2';

const GRUNT_AF =
  'highpass=f=150,lowpass=f=6000,acompressor=threshold=-16dB:ratio=7:attack=2:release=50,alimiter=limit=0.95,volume=1.35';

mkdirSync(OUT, { recursive: true });
if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: opts.quiet ? 'pipe' : 'inherit', shell: true });
}

function findEdgeTts() {
  const paths = [
    'edge-tts',
    join(process.env.HOME || '', 'Library/Python/3.9/bin/edge-tts'),
    join(process.env.HOME || '', 'Library/Python/3.10/bin/edge-tts'),
    join(process.env.HOME || '', 'Library/Python/3.11/bin/edge-tts'),
    join(process.env.HOME || '', 'Library/Python/3.12/bin/edge-tts'),
  ];
  for (const p of paths) {
    const r = spawnSync(p, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return p;
  }
  if (spawnSync('python3', ['-m', 'edge_tts', '--version'], { encoding: 'utf8' }).status === 0) {
    return 'python3 -m edge_tts';
  }
  return null;
}

function processCombat(inPath, outPath, af = COMBAT_AF) {
  run(`ffmpeg -y -i "${inPath}" -af "${af}" -ar ${SR} -ac 1 "${outPath}"`, { quiet: true });
}

function bakeTts(edge, line, outWav) {
  const mp3 = outWav.replace(/\.wav$/, '.mp3');
  const pitch = line.pitch.replace(/"/g, '');
  const cmd = edge.includes(' ')
    ? `${edge} --voice "${line.voice}" --rate "${line.rate}" --pitch=${pitch} --volume "+18%" --text "${line.text}" --write-media "${mp3}"`
    : `"${edge}" --voice "${line.voice}" --rate "${line.rate}" --pitch=${pitch} --volume "+18%" --text "${line.text}" --write-media "${mp3}"`;
  run(cmd, { quiet: true });
  processCombat(mp3, outWav);
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${url}: ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function bakeScreamClips() {
  const clips = [];
  let idx = 0;
  for (const src of SCREAM_SOURCES) {
    const base = join(TMP, `src-${idx++}.mp3`);
    console.log('Downloading', src.url);
    await download(src.url, base);
    for (const { start, dur } of src.slices) {
      const raw = join(TMP, `grunt-${clips.length}.wav`);
      run(
        `ffmpeg -y -ss ${start} -t ${dur} -i "${base}" -af "${GRUNT_AF}" -ar ${SR} -ac 1 "${raw}"`,
        { quiet: true }
      );
      clips.push(raw);
    }
  }
  return clips;
}

function writeLicense() {
  writeFileSync(
    join(OUT, 'VOICES_LICENSE.txt'),
    `Infantry death sounds
====================

Slots 1,2,4,6,8 — spoken lines via Microsoft Edge neural TTS (edge-tts).
  default (USA/UK) — English voices
  germany — de-DE-ConradNeural / de-DE-KillianNeural
  russia — ru-RU-DmitryNeural / ru-RU-SvetlanaNeural

Slots 3,5,7 — short clips from Freesound.org preview audio (shared, language-neutral):
  tonsil5 — https://freesound.org/people/tonsil5/sounds/416838/
  martian — https://freesound.org/people/martian/sounds/530471/

Verify licenses on Freesound before commercial release.
Regenerate: npm run bake-infantry-death
`
  );
}

async function bakeFactionSet(factionKey, gruntClips, edge) {
  const { prefix, lines } = FACTION_SHOUTS[factionKey];
  console.log(`\n=== ${factionKey} ===`);

  for (const line of lines) {
    const num = String(line.slot).padStart(2, '0');
    const out = join(OUT, `${prefix}-${num}.wav`);
    console.log(`TTS ${num}: ${line.text}`);
    bakeTts(edge, line, out);
  }

  for (let i = 0; i < GRUNT_SLOTS.length; i++) {
    const slot = GRUNT_SLOTS[i];
    const clip = gruntClips[i % gruntClips.length];
    const num = String(slot).padStart(2, '0');
    const out = join(OUT, `${prefix}-${num}.wav`);
    console.log(`Grunt ${num} from recording`);
    processCombat(clip, out, GRUNT_AF);
  }
}

async function main() {
  const edge = findEdgeTts();
  if (!edge) {
    console.error('edge-tts not found. Install: pip3 install edge-tts');
    process.exit(1);
  }
  try {
    run('ffmpeg -version', { quiet: true });
  } catch {
    console.error('ffmpeg not found on PATH');
    process.exit(1);
  }

  console.log('Using', edge);
  const gruntClips = await bakeScreamClips();

  for (const factionKey of Object.keys(FACTION_SHOUTS)) {
    await bakeFactionSet(factionKey, gruntClips, edge);
  }

  writeLicense();
  rmSync(TMP, { recursive: true, force: true });
  console.log('\nDone — infantry death WAVs in public/sounds/ (default, germany, russia)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});