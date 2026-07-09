/**
 * Fetch additional realistic combat SFX via ElevenLabs for the general mix:
 * explosion variants, impact variants, extra gunfire, battlefield atmosphere.
 *
 * Requires ELEVENLABS_API_KEY + ffmpeg.
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-extra.mjs
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-extra.mjs --force
 */
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-extra');
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
  'authentic outdoor field recording, natural acoustic, full low-end body, dry short natural decay, no music, no voices, no speech, not synthetic, not electronic, not cinematic trailer, not metallic ring, not tinny';

/**
 * Extra samples layered into the existing game mix.
 * Warm post EQ for one-shots; ambience keeps more low rumble and loops.
 */
const CATALOG = [
  // —— Explosions (random pool with explosion.wav) ——
  {
    file: 'explosion-b.wav',
    duration: 1.9,
    influence: 0.55,
    warm: true,
    text: `Massive World War Two high explosive artillery shell detonation outdoors, deep bass boom, dirt and debris, pressure wave, ${REAL}`,
  },
  {
    file: 'explosion-c.wav',
    duration: 1.6,
    influence: 0.55,
    warm: true,
    text: `Medium World War Two shell cratering explosion, sharp crack then deep thump, gravel and earth flying, open field, ${REAL}`,
  },
  {
    file: 'explosion-d.wav',
    duration: 2.1,
    influence: 0.5,
    warm: true,
    text: `Distant heavy bomb explosion rumble across a battlefield, deep low frequency boom and long bass tail, outdoor, ${REAL}`,
  },
  {
    file: 'explosion-e.wav',
    duration: 1.7,
    influence: 0.55,
    warm: true,
    text: `Tank ammo cook-off secondary explosion outdoors, violent deep blast and brief fire whoosh, ${REAL}`,
  },

  // —— Impacts ——
  {
    file: 'impact-b.wav',
    duration: 0.55,
    influence: 0.55,
    warm: true,
    text: `Bullet striking packed dirt and sand outdoors, short thud with gravel spray, soft body, ${REAL}`,
  },
  {
    file: 'impact-c.wav',
    duration: 0.5,
    influence: 0.5,
    warm: true,
    text: `Bullet hitting wooden sandbags and dirt, short dull impact, outdoor, ${REAL}`,
  },

  // —— Extra gunfire for the general / faction mix ——
  {
    file: 'rifle-extra-a.wav',
    duration: 0.7,
    influence: 0.65,
    warm: true,
    gun: true,
    text: `Single World War Two bolt action rifle gunshot outdoors, deep muzzle blast then ballistic crack, heavy powder thump, live-fire range, ${REAL}`,
  },
  {
    file: 'rifle-extra-b.wav',
    duration: 0.65,
    influence: 0.6,
    warm: true,
    gun: true,
    text: `Single thirty caliber rifle gunshot outdoors, powerful deep report and sharp crack, full body, ${REAL}`,
  },
  {
    file: 'mg-extra-a.wav',
    duration: 0.9,
    influence: 0.6,
    warm: true,
    gun: true,
    text: `Short World War Two machine gun burst outdoors, five heavy thumping gunshots with muzzle blast, not a synthetic buzz, ${REAL}`,
  },
  {
    file: 'mg-extra-b.wav',
    duration: 0.85,
    influence: 0.58,
    warm: true,
    gun: true,
    text: `Short heavy machine gun burst outdoors, four distinct deep gunshots, powder reports, open field, ${REAL}`,
  },

  // Atmosphere: use dedicated long bake (max 30s/seg, stitched to ≥60s)
  //   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-atmos
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function generateSfx({ text, duration_seconds, prompt_influence = 0.45 }) {
  const body = {
    text,
    model_id: 'eleven_text_to_sound_v2',
    prompt_influence,
  };
  if (duration_seconds != null) body.duration_seconds = duration_seconds;

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

function convert(srcPath, destName, job) {
  const dest = join(OUT, destName);
  let af;
  if (job.atmos) {
    af = [
      'highpass=f=35',
      'lowpass=f=8000',
      'equalizer=f=80:t=q:w=0.8:g=2',
      'equalizer=f=3000:t=q:w=1.0:g=-3',
      'loudnorm=I=-22:TP=-2:LRA=8',
      'alimiter=limit=0.9',
    ].join(',');
  } else if (job.gun) {
    af = [
      'highpass=f=50',
      'lowpass=f=10000',
      'equalizer=f=120:t=q:w=0.85:g=4',
      'equalizer=f=280:t=q:w=0.9:g=2',
      'equalizer=f=2800:t=q:w=1.1:g=-5.5',
      'equalizer=f=4500:t=q:w=1.0:g=-6.5',
      'equalizer=f=7000:t=q:w=1.0:g=-4',
      'silenceremove=start_periods=1:start_silence=0.01:start_threshold=-50dB:detection=peak',
      'apad=pad_dur=0.02',
      'afade=t=in:st=0:d=0.002',
      'areverse,afade=t=in:st=0:d=0.05,areverse',
      'loudnorm=I=-10:TP=-0.5:LRA=5',
      'volume=1.12',
      'alimiter=limit=0.97',
    ].join(',');
  } else {
    // explosions / impacts
    af = [
      'highpass=f=30',
      'lowpass=f=11000',
      'equalizer=f=60:t=q:w=0.7:g=3',
      'equalizer=f=2800:t=q:w=1.0:g=-3',
      'silenceremove=start_periods=1:start_silence=0.01:start_threshold=-50dB:detection=peak',
      'apad=pad_dur=0.02',
      'afade=t=in:st=0:d=0.003',
      'areverse,afade=t=in:st=0:d=0.1,areverse',
      'loudnorm=I=-12:TP=-0.8:LRA=7',
      'volume=1.1',
      'alimiter=limit=0.97',
    ].join(',');
  }

  const args = ['-y', '-i', srcPath, '-ac', '1', '-ar', '44100', '-af', af, dest];
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-400));
    throw new Error(`ffmpeg failed for ${destName}`);
  }
}

async function main() {
  console.log(`ElevenLabs extra mix — ${CATALOG.length} samples`);
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < CATALOG.length; i++) {
    const job = CATALOG[i];
    const dest = join(OUT, job.file);
    const label = `[${i + 1}/${CATALOG.length}] ${job.file}`;
    if (!force && existsSync(dest)) {
      console.log(`${label} — skip (exists)`);
      skipped += 1;
      continue;
    }
    process.stdout.write(`${label} — generating… `);
    try {
      const mp3 = await generateSfx({
        text: job.text,
        duration_seconds: job.duration,
        prompt_influence: job.influence ?? 0.5,
      });
      const tmp = join(TMP, `${job.file}.mp3`);
      writeFileSync(tmp, mp3);
      convert(tmp, job.file, job);
      console.log('ok');
      ok += 1;
      await sleep(400);
    } catch (err) {
      console.log('FAIL');
      console.error(`  ${err.message}`);
      failed += 1;
      if (String(err.message).includes('401')) process.exit(1);
      if (/429|quota|credit/i.test(err.message)) {
        console.error('Quota hit — stopping.');
        break;
      }
      await sleep(900);
    }
  }

  console.log(`\nDone — wrote ${ok}, skipped ${skipped}, failed ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
