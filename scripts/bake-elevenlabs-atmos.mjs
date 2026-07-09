/**
 * Generate long battlefield ambience from ElevenLabs (max 30s per gen).
 *
 * Strategy: request a 30s *seamless loop* (loop:true), then tile that same clip
 * 3× with long qsin crossfades to reach ≥80s. Stitching *different* gens caused
 * mid-file level dips / “corruption”; same-loop tiling stays clean.
 *
 * Requires ELEVENLABS_API_KEY + ffmpeg.
 *   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-atmos
 *   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-atmos -- --force
 *   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-atmos -- --only=close
 */
import { spawnSync, execSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync, renameSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-atmos');
const API = 'https://api.elevenlabs.io/v1/sound-generation';
const SR = 44100;
/** ElevenLabs hard cap for duration_seconds. */
const SEG_SEC = 30;
/** How many times to tile the seamless 30s loop into the long bed. */
const TILES = 3;
/** Crossfade between identical tiles (qsin ≈ constant power). */
const XFADE = 3.5;

const API_KEY = process.env.ELEVENLABS_API_KEY?.trim();
if (!API_KEY) {
  console.error('Missing ELEVENLABS_API_KEY');
  console.error('  ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-atmos');
  process.exit(1);
}

const force = process.argv.includes('--force');
/** Optional: --only=close | --only=distant */
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const onlyFilter = onlyArg ? onlyArg.split('=')[1] : null;

mkdirSync(OUT, { recursive: true });
if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const REAL =
  'authentic outdoor field recording, natural acoustic, continuous ambient bed, no music, no voices, no speech, not synthetic, not electronic, not cinematic trailer, not metallic ring, not tinny';

/** One seamless 30s EL gen per bed, then tiled for length. */
const BEDS = [
  {
    file: 'battle-atmos.wav',
    short: 'battle-atmos-short.wav',
    label: 'distant',
    prompt: `Seamless continuous distant World War Two battlefield atmosphere loop, far-off muffled artillery rumbles, faint wind over open fields, very soft distant gunfire pops, sparse low thunder of guns on the horizon, continuous outdoor bed, ${REAL}`,
  },
  {
    file: 'battle-atmos-close.wav',
    short: 'battle-atmos-close-short.wav',
    label: 'mid-close',
    prompt: `Seamless mid-distance World War Two battlefield ambience loop, occasional soft thumps of guns, wind through scrub, sparse far rifle cracks, low continuous outdoor bed, no close explosions, ${REAL}`,
  },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: opts.quiet ? 'pipe' : 'inherit', shell: true });
}

function probeDuration(path) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) throw new Error(`ffprobe failed: ${path}`);
  return parseFloat(r.stdout.trim());
}

async function generateSfx({ text, duration_seconds, prompt_influence = 0.4, loop = true }) {
  const body = {
    text,
    model_id: 'eleven_text_to_sound_v2',
    prompt_influence,
    duration_seconds,
    loop,
  };

  const res = await fetch(`${API}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Decode + gentle EQ + single loudnorm per segment (same target for all).
 * Avoids a second global loudnorm after stitch (that caused mid-bed pumping).
 */
function convertMp3ToWav(srcMp3, destWav) {
  const af = [
    'highpass=f=40',
    'lowpass=f=7500',
    'equalizer=f=90:t=q:w=0.8:g=1.5',
    'equalizer=f=2800:t=q:w=1.0:g=-2.5',
    // Match segment loudness before stitch so joins don't jump
    'loudnorm=I=-23:TP=-2.5:LRA=11',
    'alimiter=limit=0.92',
  ].join(',');
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', srcMp3, '-ac', '1', '-ar', String(SR), '-af', af, destWav],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-500));
    throw new Error(`ffmpeg convert failed: ${destWav}`);
  }
}

/** Tile one seamless loop N times with constant-power crossfades. */
function tileSeamlessLoop(srcWav, outPath, tiles = TILES) {
  if (tiles <= 1) {
    copyFileSync(srcWav, outPath);
    return probeDuration(outPath);
  }

  const inputs = Array.from({ length: tiles }, () => `-i "${srcWav}"`).join(' ');
  let filter = '';
  let prev = '[0:a]';
  for (let i = 1; i < tiles; i++) {
    const outLabel = i === tiles - 1 ? '[xf]' : `[a${i}]`;
    filter += `${prev}[${i}:a]acrossfade=d=${XFADE}:c1=qsin:c2=qsin${outLabel};`;
    prev = outLabel;
  }

  const chained = join(TMP, `tile-${Math.random().toString(36).slice(2)}.wav`);
  run(
    `ffmpeg -y ${inputs} -filter_complex "${filter}" -map "[xf]" -ar ${SR} -ac 1 "${chained}"`,
    { quiet: true }
  );

  const dur = probeDuration(chained);
  const fadeOutAt = Math.max(0.5, dur - 0.6);
  run(
    `ffmpeg -y -i "${chained}" -af "` +
      `afade=t=in:st=0:d=0.4,` +
      `afade=t=out:st=${fadeOutAt.toFixed(3)}:d=0.55,` +
      `alimiter=limit=0.92` +
      `" -ar ${SR} -ac 1 "${outPath}"`,
    { quiet: true }
  );
  return probeDuration(outPath);
}

async function bakeBed(bed) {
  const dest = join(OUT, bed.file);

  console.log(`\n=== ${bed.file} (${bed.label}) — ${SEG_SEC}s seamless EL + ${TILES}× tile ===`);

  process.stdout.write(`  generating ${SEG_SEC}s seamless loop… `);
  const mp3 = await generateSfx({
    text: bed.prompt,
    duration_seconds: SEG_SEC,
    prompt_influence: 0.4,
    loop: true,
  });
  const mp3Path = join(TMP, `${bed.file}.master.mp3`);
  const wavPath = join(TMP, `${bed.file}.master.wav`);
  writeFileSync(mp3Path, mp3);
  convertMp3ToWav(mp3Path, wavPath);
  console.log(`${probeDuration(wavPath).toFixed(2)}s`);

  // Keep short master for re-tile without re-hitting API
  const shortPath = join(OUT, bed.short);
  copyFileSync(wavPath, shortPath);

  const tmpOut = join(TMP, `out-${bed.file}`);
  const longDur = tileSeamlessLoop(wavPath, tmpOut, TILES);
  renameSync(tmpOut, dest);
  console.log(`  → ${bed.file}: ${longDur.toFixed(2)}s (target ≥60s)`);
  if (longDur < 55) {
    throw new Error(`${bed.file} came out short (${longDur.toFixed(2)}s)`);
  }
  return longDur;
}

async function main() {
  try {
    run('ffmpeg -version', { quiet: true });
  } catch {
    console.error('ffmpeg not found on PATH');
    process.exit(1);
  }

  console.log(
    `ElevenLabs battle atmos — ${SEG_SEC}s seamless loop × ${TILES} tiles (clean long bed)`
  );
  if (!force) {
    console.log('(always regenerates; pass --force is optional / same behavior)');
  }

  const beds = onlyFilter
    ? BEDS.filter(
        (b) =>
          b.label === onlyFilter ||
          b.file.includes(onlyFilter) ||
          (onlyFilter === 'close' && b.file.includes('close')) ||
          (onlyFilter === 'distant' && !b.file.includes('close'))
      )
    : BEDS;
  if (!beds.length) {
    console.error(`No beds match --only=${onlyFilter}`);
    process.exit(1);
  }

  for (const bed of beds) {
    await bakeBed(bed);
    await sleep(800);
  }

  // License note
  writeFileSync(
    join(OUT, 'ATMOS_LICENSE.txt'),
    `Battle ambience
===============

Generated via ElevenLabs text-to-sound-effects API (eleven_text_to_sound_v2):
  Each bed: one ${SEG_SEC}s seamless loop (loop:true), tiled ${TILES}× with soft crossfades.

Regenerate: ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-atmos
  --only=close   re-bake close bed only

Subject to ElevenLabs Terms of Service and your plan.
`
  );

  rmSync(TMP, { recursive: true, force: true });
  console.log('\nDone — battle ambience is pure ElevenLabs long beds.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
