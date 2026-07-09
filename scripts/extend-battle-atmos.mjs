/**
 * Extend short battle ambience loops into ≥60s seamless beds.
 * Uses short masters (battle-atmos*-short.wav) + ffmpeg acrossfade.
 *
 *   npm run extend-battle-atmos
 */
import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, copyFileSync, rmSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-battle-atmos');
const TARGET_SEC = 75;
const XFADE = 2.2;
const SR = 44100;

const SOURCES = [
  { file: 'battle-atmos.wav', short: 'battle-atmos-short.wav', label: 'distant' },
  { file: 'battle-atmos-close.wav', short: 'battle-atmos-close-short.wav', label: 'close' },
];

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: opts.quiet ? 'pipe' : 'inherit', shell: true });
}

function probeDuration(path) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) throw new Error(`ffprobe failed: ${path}\n${r.stderr}`);
  const d = parseFloat(r.stdout.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`Bad duration for ${path}: ${r.stdout}`);
  return d;
}

/** Slight rate/pitch/gain variants so tiled loops don't feel identical. */
function segmentFilter(seed) {
  const r = (n) => {
    const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const rate = 0.96 + r(1) * 0.08; // 0.96–1.04
  const tempo = 0.97 + r(2) * 0.06;
  const vol = 0.92 + r(3) * 0.16;
  const lp = 6500 + Math.floor(r(4) * 2500);
  return [
    `asetrate=${SR}*${rate.toFixed(4)}`,
    `aresample=${SR}`,
    `atempo=${tempo.toFixed(4)}`,
    `lowpass=f=${lp}`,
    `volume=${vol.toFixed(3)}`,
  ].join(',');
}

function buildLongBed(srcPath, outPath, targetSec) {
  const srcDur = probeDuration(srcPath);
  if (!(srcDur > 1)) throw new Error(`Bad source duration: ${srcPath}`);

  // total ≈ n * srcDur - (n-1) * XFADE
  const step = Math.max(1, srcDur - XFADE);
  const nSeg = Math.max(3, Math.ceil((targetSec - srcDur) / step) + 2);

  const segPaths = [];
  for (let i = 0; i < nSeg; i++) {
    const seg = join(TMP, `seg-${i}-${Math.random().toString(36).slice(2, 7)}.wav`);
    const af = segmentFilter(i * 17 + Math.floor(srcDur * 100));
    run(`ffmpeg -y -i "${srcPath}" -af "${af}" -ar ${SR} -ac 1 "${seg}"`, { quiet: true });
    segPaths.push(seg);
  }

  const inputs = segPaths.map((p) => `-i "${p}"`).join(' ');
  let filter = '';
  let prev = '[0:a]';
  for (let i = 1; i < segPaths.length; i++) {
    const outLabel = i === segPaths.length - 1 ? '[xf]' : `[a${i}]`;
    filter += `${prev}[${i}:a]acrossfade=d=${XFADE}:c1=tri:c2=tri${outLabel};`;
    prev = outLabel;
  }

  const chained = join(TMP, `chained-${Math.random().toString(36).slice(2, 7)}.wav`);
  run(
    `ffmpeg -y ${inputs} -filter_complex "${filter}" -map "[xf]" -ar ${SR} -ac 1 "${chained}"`,
    { quiet: true }
  );
  const chainedDur = probeDuration(chained);
  if (chainedDur < targetSec * 0.85) {
    throw new Error(`Chained bed too short: ${chainedDur.toFixed(2)}s (wanted ~${targetSec}s)`);
  }

  // Soft edges + gentle level (ambience bed). Skip circular-loop acrossfade —
  // Web Audio loop + soft fades is fine for a ≥1 min bed.
  const fadeOutAt = Math.max(0.5, chainedDur - 0.6);
  run(
    `ffmpeg -y -i "${chained}" -af "` +
      `afade=t=in:st=0:d=0.5,` +
      `afade=t=out:st=${fadeOutAt.toFixed(3)}:d=0.55,` +
      `loudnorm=I=-22:TP=-2.5:LRA=9,` +
      `alimiter=limit=0.88` +
      `" -ar ${SR} -ac 1 "${outPath}"`,
    { quiet: true }
  );

  return probeDuration(outPath);
}

function main() {
  try {
    run('ffmpeg -version', { quiet: true });
  } catch {
    console.error('ffmpeg not found on PATH');
    process.exit(1);
  }

  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  for (const src of SOURCES) {
    const destPath = join(OUT, src.file);
    const shortPath = join(OUT, src.short);

    // Ensure we have a short master; restore from current only if still short
    if (!existsSync(shortPath)) {
      if (!existsSync(destPath)) {
        console.error('Missing source:', destPath);
        process.exit(1);
      }
      const d = probeDuration(destPath);
      if (d < 30) {
        copyFileSync(destPath, shortPath);
        console.log(`Backed up short master → ${src.short} (${d.toFixed(2)}s)`);
      } else {
        console.error(`No short master for ${src.file} and current file is already long (${d.toFixed(2)}s).`);
        process.exit(1);
      }
    }

    const base = shortPath;
    const shortDur = probeDuration(base);
    console.log(`\n=== ${src.file} (${src.label}) ===`);
    console.log(`  source: ${src.short} (${shortDur.toFixed(2)}s)`);

    const tmpOut = join(TMP, `out-${src.file}`);
    const longDur = buildLongBed(base, tmpOut, TARGET_SEC);
    renameSync(tmpOut, destPath);
    console.log(`  wrote ${src.file}: ${longDur.toFixed(2)}s (target ≥60s)`);
    if (longDur < 60) {
      console.warn('  warning: shorter than 60s');
      process.exitCode = 1;
    }
  }

  rmSync(TMP, { recursive: true, force: true });
  console.log('\nDone — battle ambience now ≥1 min before loop.');
}

main();
