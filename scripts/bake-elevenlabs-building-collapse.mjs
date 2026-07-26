/**
 * Building collapse SFX via ElevenLabs Sound Effects.
 * Small / medium / large masonry collapses for scenery and base structures.
 *
 * Requires ELEVENLABS_API_KEY + ffmpeg.
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-building-collapse.mjs
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-building-collapse.mjs --force
 *
 * Do not commit API keys.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-building-collapse');
const API = 'https://api.elevenlabs.io/v1/sound-generation';

const API_KEY = process.env.ELEVENLABS_API_KEY?.trim();
if (!API_KEY) {
  console.error('Missing ELEVENLABS_API_KEY');
  process.exit(1);
}

const force = process.argv.includes('--force');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const REAL =
  'authentic outdoor field recording, natural acoustic, dry, no music, no voices, no speech, not synthetic, not electronic, not cinematic trailer, no sirens';

const CATALOG = [
  // —— Small (sheds, courtyard walls, outbuildings) ——
  {
    file: 'building-collapse-small-01.wav',
    duration: 1.35,
    influence: 0.55,
    size: 'small',
    text: `Small wooden shed and masonry wall collapsing outdoors, short timber crack then light rubble and brick scatter, brief debris rain, WWII ruined courtyard, ${REAL}`,
  },
  {
    file: 'building-collapse-small-02.wav',
    duration: 1.45,
    influence: 0.52,
    size: 'small',
    text: `Small brick outbuilding partial collapse outdoors, sharp masonry crack, light plaster dust and loose bricks falling, short rubble impact, ${REAL}`,
  },

  // —— Medium (farmhouses, barns, urban houses) ——
  {
    file: 'building-collapse-medium-01.wav',
    duration: 2.05,
    influence: 0.52,
    size: 'medium',
    text: `Two-story brick house collapsing outdoors, heavy masonry groan and wall crack, roof timber crash, cascading bricks and rubble, dust and debris shower, WWII urban combat, ${REAL}`,
  },
  {
    file: 'building-collapse-medium-02.wav',
    duration: 2.15,
    influence: 0.5,
    size: 'medium',
    text: `Medium farmhouse barn structure collapsing outdoors, deep timber and brick failure, floor joists breaking, heavy rubble pile settling with dust, outdoor field, ${REAL}`,
  },

  // —— Large (apartment blocks, factories, churches) ——
  {
    file: 'building-collapse-large-01.wav',
    duration: 2.85,
    influence: 0.48,
    size: 'large',
    text: `Large multi-story apartment building collapsing outdoors, massive masonry structure failure, deep low-frequency rumble, cascading floors and walls, heavy brick avalanche and long debris rain, Berlin urban ruin, ${REAL}`,
  },
  {
    file: 'building-collapse-large-02.wav',
    duration: 3.0,
    influence: 0.46,
    size: 'large',
    text: `Huge factory or church masonry structure collapsing outdoors, enormous heavy stone and brick failure, prolonged deep rumble, steel and timber crash, thick rubble cascade and settling dust cloud, distant echo, ${REAL}`,
  },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function generateSfx({ text, duration_seconds, prompt_influence }) {
  const res = await fetch(`${API}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': API_KEY,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_text_to_sound_v2',
      prompt_influence,
      duration_seconds,
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Warm low-end for collapse body; tame harsh AI mid-ring. */
function convert(srcPath, destName, size) {
  const dest = join(OUT, destName);
  const bass =
    size === 'large'
      ? 'equalizer=f=55:t=q:w=0.7:g=5,equalizer=f=120:t=q:w=0.85:g=3'
      : size === 'medium'
        ? 'equalizer=f=65:t=q:w=0.75:g=4,equalizer=f=140:t=q:w=0.9:g=2.5'
        : 'equalizer=f=80:t=q:w=0.8:g=3,equalizer=f=180:t=q:w=0.9:g=2';
  const fadeOut = size === 'large' ? 0.18 : size === 'medium' ? 0.12 : 0.08;
  const loud = size === 'large' ? -11 : size === 'medium' ? -12 : -13;
  const af = [
    'highpass=f=28',
    'lowpass=f=10000',
    bass,
    'equalizer=f=2800:t=q:w=1.0:g=-4',
    'equalizer=f=5000:t=q:w=1.0:g=-3.5',
    'silenceremove=start_periods=1:start_silence=0.01:start_threshold=-50dB:detection=peak',
    'apad=pad_dur=0.03',
    'afade=t=in:st=0:d=0.004',
    `areverse,afade=t=in:st=0:d=${fadeOut},areverse`,
    `loudnorm=I=${loud}:TP=-0.8:LRA=8`,
    'volume=1.06',
    'alimiter=limit=0.97',
  ].join(',');

  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', srcPath, '-ac', '1', '-ar', '44100', '-af', af, dest],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-400));
    throw new Error(`ffmpeg failed for ${destName}`);
  }
}

async function main() {
  console.log(`ElevenLabs building collapse — ${CATALOG.length} samples`);
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < CATALOG.length; i++) {
    const job = CATALOG[i];
    const dest = join(OUT, job.file);
    const label = `[${i + 1}/${CATALOG.length}] ${job.file}`;
    if (!force && existsSync(dest)) {
      console.log(`${label} — skip`);
      skipped += 1;
      continue;
    }
    process.stdout.write(`${label} — generating… `);
    try {
      const mp3 = await generateSfx({
        text: job.text,
        duration_seconds: job.duration,
        prompt_influence: job.influence,
      });
      const tmp = join(TMP, `${job.file}.mp3`);
      writeFileSync(tmp, mp3);
      convert(tmp, job.file, job.size);
      console.log('ok');
      ok += 1;
      await sleep(450);
    } catch (err) {
      console.log('FAIL');
      console.error(`  ${err.message}`);
      failed += 1;
      if (String(err.message).includes('401')) process.exit(1);
      if (/429|quota|credit/i.test(err.message)) {
        console.error('Quota/rate limit — stopping.');
        process.exit(1);
      }
      await sleep(800);
    }
  }

  console.log(`Done. ok=${ok} skipped=${skipped} failed=${failed}`);
  if (failed && !ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
