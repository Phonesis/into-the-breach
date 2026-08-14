/**
 * Replace the four-faction rifle variation masters with fresh ElevenLabs takes.
 *
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-faction-rifles.mjs --validate
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-faction-rifles.mjs --force
 */
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-faction-rifles');
const API = 'https://api.elevenlabs.io/v1/sound-generation';

const args = process.argv.slice(2);
const force = args.includes('--force');
const validate = args.includes('--validate');
const onlyIndex = args.indexOf('--only');
const onlyArg = onlyIndex >= 0 ? args[onlyIndex + 1] ?? '' : null;
const API_KEY = process.env.ELEVENLABS_API_KEY?.trim();

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const REALISTIC =
  'authentic dry outdoor WWII recording, one isolated rifle shot, natural powder body and brief ballistic crack, short dry decay, no echo, no reverb, no second shot, no burst, no voices, no music, no hum, drone, whistle, ringing, metallic, synthetic, or cinematic effects';

const CATALOG = [
  // Germany — Karabiner 98k
  {
    file: 'rifle-germany-f.wav',
    duration: 0.78,
    influence: 0.68,
    text: `Single German Karabiner 98k Mauser rifle firing from a prone position across an open field, heavy 7.92mm muzzle report followed by a clean sharp crack, ${REALISTIC}`,
  },
  {
    file: 'rifle-germany-g.wav',
    duration: 0.74,
    influence: 0.65,
    text: `One isolated German Kar98k bolt-action rifle shot at medium distance, compact deep powder thump and hard outdoor ballistic crack, authentic WWII live-fire range, ${REALISTIC}`,
  },
  {
    file: 'rifle-germany-h.wav',
    duration: 0.8,
    influence: 0.66,
    text: `Single German Mauser Karabiner 98k rifle report beside a grassy hedgerow, strong full-bodied muzzle blast, crisp rifle crack and brief natural field decay, ${REALISTIC}`,
  },
  {
    file: 'rifle-germany-i.wav',
    duration: 0.76,
    influence: 0.64,
    text: `One German 7.92mm Kar98k rifle firing outdoors from a field position, dry punchy powder blast with a short sharp report, realistic WWII recording, ${REALISTIC}`,
  },

  // USA — M1 Garand
  {
    file: 'rifle-usa-f.wav',
    duration: 0.8,
    influence: 0.68,
    text: `Single American M1 Garand rifle firing one 30-06 round across an open field, powerful low muzzle blast and clear ballistic crack, authentic WWII range recording, ${REALISTIC}`,
  },
  {
    file: 'rifle-usa-g.wav',
    duration: 0.76,
    influence: 0.65,
    text: `One isolated U.S. M1 Garand semi-automatic rifle shot from a kneeling position, punchy full-bodied powder report and brief sharp outdoor crack, ${REALISTIC}`,
  },
  {
    file: 'rifle-usa-h.wav',
    duration: 0.82,
    influence: 0.66,
    text: `Single American M1 Garand 30-06 rifle report beside a hedgerow, close dry muzzle thump, crisp rifle crack and short natural field decay, no reload sound, ${REALISTIC}`,
  },
  {
    file: 'rifle-usa-i.wav',
    duration: 0.78,
    influence: 0.64,
    text: `One U.S. Army M1 Garand firing outdoors at medium distance, heavy powder body with a clean irregular ballistic snap, realistic WWII live-fire recording, no reload ping, ${REALISTIC}`,
  },

  // UK — Lee-Enfield No.4
  {
    file: 'rifle-uk-f.wav',
    duration: 0.8,
    influence: 0.68,
    text: `Single British Lee-Enfield No.4 rifle firing one .303 round across an open field, deep muzzle report followed by a crisp ballistic crack, authentic WWII range recording, ${REALISTIC}`,
  },
  {
    file: 'rifle-uk-g.wav',
    duration: 0.76,
    influence: 0.65,
    text: `One isolated British Lee-Enfield SMLE rifle shot from a field position, solid powder thump and sharp outdoor rifle crack with natural body, ${REALISTIC}`,
  },
  {
    file: 'rifle-uk-h.wav',
    duration: 0.82,
    influence: 0.66,
    text: `Single .303 Lee-Enfield No.4 rifle report beside a hedgerow, close dry muzzle blast, brief ballistic snap and short realistic field decay, ${REALISTIC}`,
  },
  {
    file: 'rifle-uk-i.wav',
    duration: 0.78,
    influence: 0.64,
    text: `One British Army Lee-Enfield rifle firing outdoors at medium distance, full low powder body and clean irregular crack, authentic WWII live-fire recording, ${REALISTIC}`,
  },

  // Russia — Mosin-Nagant
  {
    file: 'rifle-russia-f.wav',
    duration: 0.8,
    influence: 0.68,
    text: `Single Soviet Mosin-Nagant 1891/30 rifle firing one 7.62mm round across an open steppe, hard deep muzzle blast and sharp ballistic crack, ${REALISTIC}`,
  },
  {
    file: 'rifle-russia-g.wav',
    duration: 0.76,
    influence: 0.65,
    text: `One isolated Red Army Mosin-Nagant bolt-action rifle shot from a prone field position, heavy powder report and compact outdoor rifle crack, ${REALISTIC}`,
  },
  {
    file: 'rifle-russia-h.wav',
    duration: 0.76,
    influence: 0.68,
    text: `Single Soviet Mosin-Nagant 91/30 rifle firing one 7.62mm round at a dry outdoor range, close isolated muzzle report with a deep compact powder blast followed by a short sharp crack, natural bolt-action rifle sound, no ambience, no echo, no second shot, no burst, no voices, no music, no hum, drone, whistle, ringing, metallic, synthetic, or cinematic effects`,
  },
  {
    file: 'rifle-russia-i.wav',
    duration: 0.78,
    influence: 0.64,
    text: `One Soviet 7.62mm Mosin-Nagant rifle firing outdoors at medium distance, dry punchy powder blast and clean irregular rifle crack, authentic WWII range recording, ${REALISTIC}`,
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateSfx({ text, duration_seconds, prompt_influence }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
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
    if (res.ok) return Buffer.from(await res.arrayBuffer());

    const message = await res.text();
    if (res.status === 429 && attempt < 4) {
      const delay = Math.min(30000, 2500 * 2 ** attempt);
      console.log(`busy, retrying in ${Math.round(delay / 1000)}s…`);
      await sleep(delay);
      continue;
    }
    throw new Error(`ElevenLabs ${res.status}: ${message}`);
  }
  throw new Error('ElevenLabs request failed after retries');
}

function convertToGameWav(srcPath, destName) {
  const dest = join(OUT, destName);
  const af = [
    'highpass=f=45',
    'lowpass=f=10500',
    'equalizer=f=110:t=q:w=0.85:g=4.5',
    'equalizer=f=260:t=q:w=0.9:g=2.5',
    'equalizer=f=900:t=q:w=1.0:g=1.5',
    'equalizer=f=2800:t=q:w=1.1:g=-5.0',
    'equalizer=f=4500:t=q:w=1.0:g=-5.5',
    'equalizer=f=7000:t=q:w=1.0:g=-3.5',
    'silenceremove=start_periods=1:start_silence=0.01:start_threshold=-50dB:detection=peak',
    'apad=pad_dur=0.02',
    'afade=t=in:st=0:d=0.002',
    'areverse,afade=t=in:st=0:d=0.05,areverse',
    'loudnorm=I=-10:TP=-0.5:LRA=5',
    'volume=1.12',
    'alimiter=limit=0.97',
  ].join(',');

  const result = spawnSync(
    'ffmpeg',
    ['-y', '-i', srcPath, '-ac', '1', '-ar', '44100', '-af', af, dest],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    console.error(result.stderr?.slice(-500));
    throw new Error(`ffmpeg failed for ${destName}`);
  }
}

async function main() {
  const jobs =
    onlyArg === null
      ? CATALOG
      : CATALOG.filter((job) => job.file === onlyArg || job.file.replace(/\.wav$/i, '') === onlyArg);
  if (!jobs.length) {
    console.error(`No faction-rifle prompt matches --only ${onlyArg}`);
    process.exit(1);
  }

  if (validate) {
    let invalid = 0;
    for (const job of jobs) {
      const promptLength = job.text.length;
      const durationValid =
        Number.isFinite(job.duration) && job.duration >= 0.5 && job.duration <= 30;
      if (promptLength > 450 || !durationValid) {
        console.error(
          `FAIL ${job.file}: prompt ${promptLength}/450, duration ${job.duration}s`
        );
        invalid += 1;
      } else {
        console.log(`ok ${job.file}: prompt ${promptLength}/450, ${job.duration}s`);
      }
    }
    if (invalid) {
      console.error(`Validation failed for ${invalid} prompt(s)`);
      process.exit(1);
    }
    console.log(`Validated ${jobs.length} faction-rifle prompt(s)`);
    return;
  }

  if (!API_KEY) {
    console.error('Missing ELEVENLABS_API_KEY');
    process.exit(1);
  }

  let written = 0;
  let skipped = 0;
  let failed = 0;
  console.log(`ElevenLabs faction-rifle refresh — ${jobs.length} sample(s)`);

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const dest = join(OUT, job.file);
    const label = `[${index + 1}/${jobs.length}] ${job.file}`;
    if (!force && existsSync(dest)) {
      console.log(`${label} — skip (use --force to replace)`);
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
      written += 1;
      await sleep(450);
    } catch (error) {
      console.log('FAIL');
      console.error(`  ${error.message}`);
      failed += 1;
      if (/401|unauthorized/i.test(String(error.message))) process.exit(1);
      if (/429|quota|credit/i.test(String(error.message))) {
        console.error('Quota or rate limit hit — stopping.');
        break;
      }
      await sleep(900);
    }
  }

  console.log(`\nDone — wrote ${written}, skipped ${skipped}, failed ${failed}`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
