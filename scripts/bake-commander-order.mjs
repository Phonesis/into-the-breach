/**
 * Bakes faction-specific commander radio order lines (edge-tts).
 * Used when arming fire support or issuing general orders.
 * Requires: edge-tts, ffmpeg on PATH.
 * Run: npm run bake-commander-order
 */
import { execSync, spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-commander-order');
const SR = 44100;

/** Order kinds match fire-support ids and general-order ids. */
const ORDER_KINDS = [
  'strafe',
  'barrage',
  'creepingBarrage',
  'airborneDrop',
  'fullRetreat',
  'holdGround',
];

/**
 * Senior officer / HQ net style — slightly slower, lower pitch than unit acks.
 * One line per order kind per faction.
 */
const FACTION_COMMANDER = {
  usa: {
    voice: 'en-US-RogerNeural',
    rate: '-2%',
    pitch: '-10Hz',
    lines: {
      strafe: 'Air support authorized. Strafe that sector!',
      barrage: 'Artillery, fire for effect!',
      creepingBarrage: 'Creeping barrage — advance behind the fire!',
      airborneDrop: 'Airborne drop authorized. Mark the DZ!',
      fullRetreat: 'All units, fall back to rally! Full retreat!',
      holdGround: 'Hold the line! Stand your ground!',
    },
  },
  uk: {
    voice: 'en-GB-RyanNeural',
    rate: '-3%',
    pitch: '-8Hz',
    lines: {
      strafe: 'Aircraft on station. Strafe the target!',
      barrage: 'Artillery, fire for effect!',
      creepingBarrage: 'Creeping barrage — keep close to the curtain!',
      airborneDrop: 'Airborne drop authorised. Mark the DZ!',
      fullRetreat: 'All units, withdraw to rally! Full retreat!',
      holdGround: 'Hold the line! Stand firm, chaps!',
    },
  },
  germany: {
    voice: 'de-DE-ConradNeural',
    rate: '-2%',
    pitch: '-10Hz',
    lines: {
      strafe: 'Luftunterstützung! Tiefangriff auf das Ziel!',
      barrage: 'Artillerie, Feuer frei!',
      creepingBarrage: 'Feuerwalze — vorrücken hinter dem Feuer!',
      airborneDrop: 'Luftlandung genehmigt! Absprungzone markieren!',
      fullRetreat: 'Alle Einheiten, zurück zum Sammelpunkt! Rückzug!',
      holdGround: 'Haltet die Stellung! Stehen bleiben!',
    },
  },
  russia: {
    voice: 'ru-RU-DmitryNeural',
    rate: '-2%',
    pitch: '-10Hz',
    lines: {
      strafe: 'Авиация! Атакуйте цель!',
      barrage: 'Артиллерия, огонь по цели!',
      creepingBarrage: 'Огневой вал — двигаться за огнём!',
      airborneDrop: 'Десант разрешён! Зона выброски!',
      fullRetreat: 'Всем отходить на сборный пункт! Отступление!',
      holdGround: 'Держать позицию! Ни шагу назад!',
    },
  },
};

const RADIO_AF =
  'highpass=f=280,lowpass=f=3000,acompressor=threshold=-16dB:ratio=5:attack=5:release=90,' +
  'equalizer=f=1300:t=q:w=1.0:g=3,alimiter=limit=0.88,volume=1.25';

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

function bakeTts(edge, voice, rate, pitch, text, outWav) {
  const mp3 = join(TMP, `${Math.random().toString(36).slice(2)}.mp3`);
  const pitchArg = pitch.replace(/"/g, '');
  // edge-tts treats leading "-" as a new flag unless rate/pitch use --flag=value form
  const rateArg = rate.replace(/"/g, '');
  const args = [
    '--voice', voice,
    `--rate=${rateArg}`,
    `--pitch=${pitchArg}`,
    '--volume', '+18%',
    '--text', text,
    '--write-media', mp3,
  ];
  const bin = edge.includes(' ') ? null : edge;
  if (bin) {
    const r = spawnSync(bin, args, { encoding: 'utf8' });
    if (r.status !== 0) {
      throw new Error(r.stderr || r.stdout || `edge-tts failed for ${text}`);
    }
  } else {
    // python3 -m edge_tts
    const r = spawnSync('python3', ['-m', 'edge_tts', ...args], { encoding: 'utf8' });
    if (r.status !== 0) {
      throw new Error(r.stderr || r.stdout || `edge-tts failed for ${text}`);
    }
  }
  processRadio(mp3, outWav);
}

function writeLicense() {
  writeFileSync(
    join(OUT, 'COMMANDER_VOICES_LICENSE.txt'),
    `Commander order voice lines (fire support + general orders)
============================================================

Spoken via Microsoft Edge neural TTS (edge-tts):
  usa — en-US RogerNeural
  uk — en-GB RyanNeural
  germany — de-DE ConradNeural
  russia — ru-RU DmitryNeural

Files: commander-{faction}-{kind}.wav
  kinds: ${ORDER_KINDS.join(', ')}
Regenerate: npm run bake-commander-order
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

  for (const [faction, cfg] of Object.entries(FACTION_COMMANDER)) {
    console.log(`\n=== ${faction} ===`);
    for (const kind of ORDER_KINDS) {
      const text = cfg.lines[kind];
      if (!text) continue;
      const out = join(OUT, `commander-${faction}-${kind}.wav`);
      console.log(`  ${kind}: ${text}`);
      bakeTts(edge, cfg.voice, cfg.rate, cfg.pitch, text, out);
    }
  }

  writeLicense();
  rmSync(TMP, { recursive: true, force: true });
  console.log('\nDone — commander order WAVs in public/sounds/');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
