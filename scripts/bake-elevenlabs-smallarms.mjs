/**
 * Extra faction-specific rifle + MG samples via ElevenLabs.
 * Warm EQ post — avoids metallic/tinny highs.
 *
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-smallarms.mjs
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-smallarms.mjs --force
 */
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-smallarms');
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
  'authentic outdoor field recording, natural acoustic, full low-end body and powder blast, short natural decay, dry, no music, no voices, no speech, no ricochet, not synthetic, not electronic, not cinematic trailer, not metallic ring, not tinny, not buzz saw';

/** Per faction: 2 rifle + 2 MG ElevenLabs masters (f/g suffixes). */
const CATALOG = [
  // —— Germany ——
  {
    file: 'rifle-germany-f.wav',
    duration: 0.7,
    influence: 0.68,
    text: `Single Karabiner 98k Mauser rifle gunshot outdoors, deep 7.92mm muzzle blast and loud ballistic crack, heavy bolt action, ${REAL}`,
  },
  {
    file: 'rifle-germany-g.wav',
    duration: 0.68,
    influence: 0.62,
    text: `Single German Mauser Kar98k rifle shot outdoors, powerful powder thump then sharp crack, open field live fire, ${REAL}`,
  },
  {
    file: 'mg-germany-f.wav',
    duration: 0.85,
    influence: 0.65,
    text: `Short MG42 machine gun burst outdoors, very fast successive real gunshots each with deep muzzle blast, about seven shots, not a synthetic buzz, ${REAL}`,
  },
  {
    file: 'mg-germany-g.wav',
    duration: 0.78,
    influence: 0.6,
    text: `Short German MG42 burst outdoors, rapid individual heavy gunshots with powder reports, open field, ${REAL}`,
  },

  // —— USA ——
  {
    file: 'rifle-usa-f.wav',
    duration: 0.7,
    influence: 0.68,
    text: `Single M1 Garand thirty aught six rifle gunshot outdoors, powerful deep muzzle blast and sharp crack, semi automatic rifle report, ${REAL}`,
  },
  {
    file: 'rifle-usa-g.wav',
    duration: 0.68,
    influence: 0.62,
    text: `Single American M1 Garand rifle shot outdoors, punchy powder blast and ballistic crack, live fire range, ${REAL}`,
  },
  {
    file: 'mg-usa-f.wav',
    duration: 0.9,
    influence: 0.65,
    text: `Short Browning M1919 machine gun burst outdoors, slower heavy thumping gunshots, five distinct shots with deep muzzle blast, ${REAL}`,
  },
  {
    file: 'mg-usa-g.wav',
    duration: 0.85,
    influence: 0.6,
    text: `Short American thirty caliber machine gun burst outdoors, rhythmic heavy powder reports, open field, ${REAL}`,
  },

  // —— UK ——
  {
    file: 'rifle-uk-f.wav',
    duration: 0.7,
    influence: 0.7,
    text: `Single Lee Enfield three oh three bolt action rifle gunshot outdoors, deep muzzle thump and sharp ballistic crack, full body, ${REAL}`,
  },
  {
    file: 'rifle-uk-g.wav',
    duration: 0.68,
    influence: 0.64,
    text: `Single British Lee Enfield SMLE rifle shot outdoors, solid powder blast and crisp crack, outdoor field recording, ${REAL}`,
  },
  {
    file: 'mg-uk-f.wav',
    duration: 0.88,
    influence: 0.65,
    text: `Short Bren light machine gun burst outdoors, measured rate, five solid gunshots with deep reports, ${REAL}`,
  },
  {
    file: 'mg-uk-g.wav',
    duration: 0.82,
    influence: 0.6,
    text: `Short British Bren gun burst outdoors, distinct heavy shots with powder blast, open field, ${REAL}`,
  },

  // —— Russia ——
  {
    file: 'rifle-russia-f.wav',
    duration: 0.7,
    influence: 0.68,
    text: `Single Mosin Nagant rifle gunshot outdoors, hard deep muzzle blast and crack, heavy bolt action, ${REAL}`,
  },
  {
    file: 'rifle-russia-g.wav',
    duration: 0.68,
    influence: 0.62,
    text: `Single Soviet Mosin Nagant 1891 rifle shot outdoors, deep thumping gunshot powder blast, open field, ${REAL}`,
  },
  {
    file: 'mg-russia-f.wav',
    duration: 0.88,
    influence: 0.65,
    text: `Short Soviet DP-28 light machine gun burst outdoors, five solid gunshots with deep muzzle blast, ${REAL}`,
  },
  {
    file: 'mg-russia-g.wav',
    duration: 0.82,
    influence: 0.6,
    text: `Short DP-28 machine gun burst outdoors, rhythmic heavy shots powder reports, open field, ${REAL}`,
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

function convertToGameWav(srcPath, destName) {
  const dest = join(OUT, destName);
  const af = [
    'highpass=f=50',
    'lowpass=f=10000',
    'equalizer=f=120:t=q:w=0.85:g=4.2',
    'equalizer=f=280:t=q:w=0.9:g=2.2',
    'equalizer=f=900:t=q:w=1.0:g=1.2',
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

  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', srcPath, '-ac', '1', '-ar', '44100', '-af', af, dest],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-300));
    throw new Error(`ffmpeg failed for ${destName}`);
  }
}

async function main() {
  console.log(`ElevenLabs small arms — ${CATALOG.length} samples (2 rifle + 2 MG × 4 factions)`);
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
      convertToGameWav(tmp, job.file);
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
