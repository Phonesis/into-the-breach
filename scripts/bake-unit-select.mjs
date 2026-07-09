/**
 * Bakes faction-specific unit selection voice lines (edge-tts).
 * Requires: edge-tts, ffmpeg on PATH.
 * Run: npm run bake-unit-select
 */
import { execSync, spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-unit-select');
const SR = 44100;

/** Short radio-ack style selection responses per faction. */
const FACTION_SELECT = {
  usa: {
    prefix: 'unit-select-usa',
    lines: [
      { voice: 'en-US-GuyNeural', text: 'At the ready, sir!', rate: '+8%', pitch: '-6Hz' },
      { voice: 'en-US-ChristopherNeural', text: 'Standing by!', rate: '+6%', pitch: '-4Hz' },
      { voice: 'en-US-RogerNeural', text: 'Yes, sir!', rate: '+10%', pitch: '-8Hz' },
      { voice: 'en-US-GuyNeural', text: 'Awaiting orders!', rate: '+5%', pitch: '-5Hz' },
      { voice: 'en-US-ChristopherNeural', text: 'Ready!', rate: '+12%', pitch: '-4Hz' },
      { voice: 'en-US-RogerNeural', text: 'On your command!', rate: '+6%', pitch: '-6Hz' },
    ],
  },
  uk: {
    prefix: 'unit-select-uk',
    lines: [
      { voice: 'en-GB-RyanNeural', text: 'At the ready, sir!', rate: '+6%', pitch: '-4Hz' },
      { voice: 'en-GB-ThomasNeural', text: 'Standing by, sir!', rate: '+5%', pitch: '-3Hz' },
      { voice: 'en-GB-RyanNeural', text: 'Yes, sir!', rate: '+8%', pitch: '-5Hz' },
      { voice: 'en-GB-ThomasNeural', text: 'Ready and waiting!', rate: '+4%', pitch: '-2Hz' },
      { voice: 'en-GB-RyanNeural', text: 'Orders, sir?', rate: '+5%', pitch: '-4Hz' },
      { voice: 'en-GB-ThomasNeural', text: 'Wilco!', rate: '+10%', pitch: '-3Hz' },
    ],
  },
  germany: {
    prefix: 'unit-select-germany',
    lines: [
      { voice: 'de-DE-ConradNeural', text: 'Bereit, Herr Offizier!', rate: '+6%', pitch: '-6Hz' },
      { voice: 'de-DE-KillianNeural', text: 'Zu Befehl!', rate: '+8%', pitch: '-4Hz' },
      { voice: 'de-DE-ConradNeural', text: 'Ja, Herr!', rate: '+10%', pitch: '-5Hz' },
      { voice: 'de-DE-KillianNeural', text: 'Bereit!', rate: '+12%', pitch: '-3Hz' },
      { voice: 'de-DE-ConradNeural', text: 'Warten auf Befehl!', rate: '+4%', pitch: '-6Hz' },
      { voice: 'de-DE-KillianNeural', text: 'Melde mich!', rate: '+6%', pitch: '-4Hz' },
    ],
  },
  russia: {
    prefix: 'unit-select-russia',
    lines: [
      { voice: 'ru-RU-DmitryNeural', text: 'Готов, товарищ!', rate: '+6%', pitch: '-6Hz' },
      { voice: 'ru-RU-DmitryNeural', text: 'К бою готов!', rate: '+5%', pitch: '-4Hz' },
      { voice: 'ru-RU-DmitryNeural', text: 'Так точно!', rate: '+10%', pitch: '-5Hz' },
      { voice: 'ru-RU-DmitryNeural', text: 'Жду приказа!', rate: '+4%', pitch: '-4Hz' },
      { voice: 'ru-RU-DmitryNeural', text: 'Готовы!', rate: '+12%', pitch: '-3Hz' },
      { voice: 'ru-RU-DmitryNeural', text: 'Слушаю!', rate: '+8%', pitch: '-5Hz' },
    ],
  },
};

const RADIO_AF =
  'highpass=f=300,lowpass=f=3200,acompressor=threshold=-18dB:ratio=4.5:attack=5:release=80,' +
  'equalizer=f=1400:t=q:w=1.1:g=2.5,alimiter=limit=0.9,volume=1.2';

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

function processRadio(inPath, outPath) {
  run(`ffmpeg -y -i "${inPath}" -af "${RADIO_AF}" -ar ${SR} -ac 1 "${outPath}"`, { quiet: true });
}

function bakeTts(edge, line, outWav) {
  const mp3 = join(TMP, `${Math.random().toString(36).slice(2)}.mp3`);
  const pitch = line.pitch.replace(/"/g, '');
  const text = line.text.replace(/"/g, '\\"');
  const cmd = edge.includes(' ')
    ? `${edge} --voice "${line.voice}" --rate "${line.rate}" --pitch=${pitch} --volume "+15%" --text "${text}" --write-media "${mp3}"`
    : `"${edge}" --voice "${line.voice}" --rate "${line.rate}" --pitch=${pitch} --volume "+15%" --text "${text}" --write-media "${mp3}"`;
  run(cmd, { quiet: true });
  processRadio(mp3, outWav);
}

function writeLicense() {
  writeFileSync(
    join(OUT, 'SELECT_VOICES_LICENSE.txt'),
    `Unit selection voice lines
=========================

Spoken via Microsoft Edge neural TTS (edge-tts):
  usa — en-US voices (Guy / Christopher / Roger)
  uk — en-GB voices (Ryan / Thomas)
  germany — de-DE Conrad / Killian
  russia — ru-RU Dmitry

Files: unit-select-{faction}-01.wav … 06.wav
Regenerate: npm run bake-unit-select
`
  );
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

  for (const [faction, { prefix, lines }] of Object.entries(FACTION_SELECT)) {
    console.log(`\n=== ${faction} ===`);
    for (let i = 0; i < lines.length; i++) {
      const num = String(i + 1).padStart(2, '0');
      const out = join(OUT, `${prefix}-${num}.wav`);
      console.log(`  ${num}: ${lines[i].text}`);
      bakeTts(edge, lines[i], out);
    }
  }

  writeLicense();
  rmSync(TMP, { recursive: true, force: true });
  console.log('\nDone — unit select WAVs in public/sounds/');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
