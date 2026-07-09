/**
 * Bakes faction-specific "under fire" panic shouts (edge-tts).
 * Requires: edge-tts, ffmpeg on PATH.
 * Run: npm run bake-unit-under-fire
 */
import { execSync, spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-unit-under-fire');
const SR = 44100;

/** Alarmed / panicked combat shouts — faster rate + higher stress. */
const FACTION_UNDER_FIRE = {
  usa: {
    prefix: 'unit-underfire-usa',
    lines: [
      { voice: 'en-US-GuyNeural', text: 'Taking fire!', rate: '+35%', pitch: '+4Hz' },
      { voice: 'en-US-ChristopherNeural', text: "We're under fire!", rate: '+32%', pitch: '+2Hz' },
      { voice: 'en-US-RogerNeural', text: 'Get down!', rate: '+40%', pitch: '+6Hz' },
      { voice: 'en-US-GuyNeural', text: 'Contact! Taking fire!', rate: '+30%', pitch: '+3Hz' },
      { voice: 'en-US-ChristopherNeural', text: "They're shooting at us!", rate: '+28%', pitch: '+4Hz' },
      { voice: 'en-US-RogerNeural', text: 'Need cover now!', rate: '+36%', pitch: '+5Hz' },
      { voice: 'en-US-GuyNeural', text: 'Incoming fire!', rate: '+34%', pitch: '+3Hz' },
      { voice: 'en-US-ChristopherNeural', text: 'Man, taking hits!', rate: '+30%', pitch: '+2Hz' },
    ],
  },
  uk: {
    prefix: 'unit-underfire-uk',
    lines: [
      { voice: 'en-GB-RyanNeural', text: 'Taking fire!', rate: '+32%', pitch: '+3Hz' },
      { voice: 'en-GB-ThomasNeural', text: "We're under fire!", rate: '+30%', pitch: '+2Hz' },
      { voice: 'en-GB-RyanNeural', text: 'Get down!', rate: '+38%', pitch: '+5Hz' },
      { voice: 'en-GB-ThomasNeural', text: 'Contact front!', rate: '+28%', pitch: '+3Hz' },
      { voice: 'en-GB-RyanNeural', text: "They're on us!", rate: '+34%', pitch: '+4Hz' },
      { voice: 'en-GB-ThomasNeural', text: 'Incoming!', rate: '+40%', pitch: '+5Hz' },
      { voice: 'en-GB-RyanNeural', text: 'Under fire, sir!', rate: '+30%', pitch: '+2Hz' },
      { voice: 'en-GB-ThomasNeural', text: 'Take cover!', rate: '+36%', pitch: '+4Hz' },
    ],
  },
  germany: {
    prefix: 'unit-underfire-germany',
    lines: [
      // Avoid anglicisms like "Kontakt" that can sound English in a firefight
      { voice: 'de-DE-ConradNeural', text: 'Feindfeuer!', rate: '+35%', pitch: '+4Hz' },
      { voice: 'de-DE-KillianNeural', text: 'Unter Beschuss!', rate: '+32%', pitch: '+3Hz' },
      { voice: 'de-DE-ConradNeural', text: 'Deckung!', rate: '+40%', pitch: '+5Hz' },
      { voice: 'de-DE-KillianNeural', text: 'Alle in Deckung!', rate: '+30%', pitch: '+3Hz' },
      { voice: 'de-DE-ConradNeural', text: 'Sie schießen auf uns!', rate: '+32%', pitch: '+4Hz' },
      { voice: 'de-DE-KillianNeural', text: 'Sofort in Deckung!', rate: '+34%', pitch: '+5Hz' },
      { voice: 'de-DE-ConradNeural', text: 'Feindfeuer von vorne!', rate: '+28%', pitch: '+2Hz' },
      { voice: 'de-DE-KillianNeural', text: 'Runter, Runter!', rate: '+40%', pitch: '+6Hz' },
    ],
  },
  russia: {
    prefix: 'unit-underfire-russia',
    lines: [
      { voice: 'ru-RU-DmitryNeural', text: 'Под огнём!', rate: '+34%', pitch: '+4Hz' },
      { voice: 'ru-RU-DmitryNeural', text: 'Стреляют!', rate: '+38%', pitch: '+5Hz' },
      { voice: 'ru-RU-DmitryNeural', text: 'В укрытие!', rate: '+32%', pitch: '+3Hz' },
      { voice: 'ru-RU-DmitryNeural', text: 'Контакт!', rate: '+36%', pitch: '+4Hz' },
      { voice: 'ru-RU-DmitryNeural', text: 'Нас обстреливают!', rate: '+28%', pitch: '+2Hz' },
      { voice: 'ru-RU-DmitryNeural', text: 'Ложись!', rate: '+40%', pitch: '+6Hz' },
      { voice: 'ru-RU-DmitryNeural', text: 'Огонь по нам!', rate: '+30%', pitch: '+3Hz' },
      { voice: 'ru-RU-DmitryNeural', text: 'Срочно в укрытие!', rate: '+26%', pitch: '+2Hz' },
    ],
  },
};

/** Radio + stressed field radio — brighter, compressed, urgent. */
const PANIC_AF =
  'highpass=f=320,lowpass=f=3800,' +
  'acompressor=threshold=-16dB:ratio=6:attack=3:release=50,' +
  'equalizer=f=1600:t=q:w=1.0:g=3.5,' +
  'equalizer=f=900:t=q:w=1.0:g=2,' +
  'alimiter=limit=0.92,volume=1.35';

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

function processPanic(inPath, outPath) {
  run(`ffmpeg -y -i "${inPath}" -af "${PANIC_AF}" -ar ${SR} -ac 1 "${outPath}"`, { quiet: true });
}

function bakeTts(edge, line, outWav) {
  const mp3 = join(TMP, `${Math.random().toString(36).slice(2)}.mp3`);
  const pitch = line.pitch.replace(/"/g, '');
  const text = line.text.replace(/"/g, '\\"');
  const cmd = edge.includes(' ')
    ? `${edge} --voice "${line.voice}" --rate "${line.rate}" --pitch=${pitch} --volume "+22%" --text "${text}" --write-media "${mp3}"`
    : `"${edge}" --voice "${line.voice}" --rate "${line.rate}" --pitch=${pitch} --volume "+22%" --text "${text}" --write-media "${mp3}"`;
  run(cmd, { quiet: true });
  processPanic(mp3, outWav);
}

function writeLicense() {
  writeFileSync(
    join(OUT, 'UNDERFIRE_VOICES_LICENSE.txt'),
    `Unit under-fire panic shouts
=============================

Spoken via Microsoft Edge neural TTS (edge-tts), urgent rate/pitch:
  usa — en-US Guy / Christopher / Roger
  uk — en-GB Ryan / Thomas
  germany — de-DE Conrad / Killian
  russia — ru-RU Dmitry

Files: unit-underfire-{faction}-01.wav … 08.wav
Regenerate: npm run bake-unit-under-fire
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

  for (const [faction, { prefix, lines }] of Object.entries(FACTION_UNDER_FIRE)) {
    console.log(`\n=== ${faction} (under fire) ===`);
    for (let i = 0; i < lines.length; i++) {
      const num = String(i + 1).padStart(2, '0');
      const out = join(OUT, `${prefix}-${num}.wav`);
      console.log(`  ${num}: ${lines[i].text}`);
      bakeTts(edge, lines[i], out);
    }
  }

  writeLicense();
  rmSync(TMP, { recursive: true, force: true });
  console.log('\nDone — under-fire WAVs in public/sounds/');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
