/**
 * Extra MG SFX variations via ElevenLabs for all factions.
 * Mix of short/medium bursts + longer sustained full-auto concentrations.
 *
 * Does not overwrite existing primary masters — only new lettered / long files.
 *
 *   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-mg-extra
 *   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-mg-extra -- --force
 */
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-mg-extra');
const API = 'https://api.elevenlabs.io/v1/sound-generation';

const API_KEY = process.env.ELEVENLABS_API_KEY?.trim();
if (!API_KEY) {
  console.error('Missing ELEVENLABS_API_KEY');
  console.error('  ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-mg-extra');
  process.exit(1);
}

const force = process.argv.includes('--force');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const REAL =
  'authentic outdoor field recording, continuous full automatic fire, deep powder muzzle blasts, natural acoustic, dry short natural decay, no music, no voices, no speech, not synthetic, not electronic, not metallic ring, not tinny, not a single shot';

/** Faction gun character for prompts. */
const FACTIONS = {
  germany: {
    gun: 'MG42',
    short: 'German MG42 machine gun',
    rate: 'very high cyclic rate ripping',
  },
  usa: {
    gun: 'Browning M1919',
    short: 'American Browning M1919 thirty caliber machine gun',
    rate: 'measured heavy thumping',
  },
  uk: {
    gun: 'Bren',
    short: 'British Bren light machine gun',
    rate: 'measured solid',
  },
  russia: {
    gun: 'DP-28',
    short: 'Soviet DP-28 light machine gun',
    rate: 'solid thumping',
  },
};

/**
 * Per-faction new files:
 *  -h / -i     short–medium bursts (~1.0–1.5 s)
 *  -long-a/b   sustained concentrations (~2.6–3.0 s)
 * Shared extras for all pools.
 */
function buildCatalog() {
  const jobs = [];

  for (const [id, f] of Object.entries(FACTIONS)) {
    jobs.push(
      {
        file: `mg-${id}-h.wav`,
        duration: 1.15,
        influence: 0.62,
        text: `Short ${f.short} full automatic burst outdoors, about one second of continuous ${f.rate} gunfire, ${REAL}`,
      },
      {
        file: `mg-${id}-i.wav`,
        duration: 1.4,
        influence: 0.6,
        text: `Medium ${f.short} automatic burst outdoors, continuous ${f.rate} fire about one and a half seconds, open field, ${REAL}`,
      },
      {
        file: `mg-${id}-long-a.wav`,
        duration: 2.85,
        influence: 0.64,
        // Keep under ElevenLabs 450-char prompt limit
        text: `Long sustained ${f.gun} full automatic concentration outdoors nearly three seconds, continuous ${f.rate} gunfire without pause, ${REAL}`,
      },
      {
        file: `mg-${id}-long-b.wav`,
        duration: 2.65,
        influence: 0.6,
        text: `Extended ${f.gun} full auto burst outdoors over two and a half seconds, continuous ${f.rate} fire concentration, open field, ${REAL}`,
      }
    );
  }

  // Shared pool extras (used by all faction profiles)
  jobs.push(
    {
      file: 'mg-extra-c.wav',
      duration: 1.25,
      influence: 0.58,
      text: `Medium World War Two machine gun automatic burst outdoors, continuous fire about one second, heavy powder reports, ${REAL}`,
    },
    {
      file: 'mg-extra-d.wav',
      duration: 1.5,
      influence: 0.56,
      text: `World War Two light machine gun medium burst outdoors, continuous automatic fire one and a half seconds, ${REAL}`,
    },
    {
      file: 'mg-extra-long-a.wav',
      duration: 2.9,
      influence: 0.6,
      text: `Long sustained World War Two machine gun full automatic concentration outdoors nearly three seconds continuous gunfire, ${REAL}`,
    },
    {
      file: 'mg-extra-long-b.wav',
      duration: 2.7,
      influence: 0.58,
      text: `Extended heavy machine gun full auto burst outdoors over two and a half seconds, continuous automatic fire, open field, ${REAL}`,
    },
    // Generic fallback pool
    {
      file: 'mg-h.wav',
      duration: 1.2,
      influence: 0.58,
      text: `Short World War Two machine gun full auto burst outdoors, continuous one second of gunfire, ${REAL}`,
    },
    {
      file: 'mg-i.wav',
      duration: 1.45,
      influence: 0.56,
      text: `Medium machine gun automatic burst outdoors, continuous fire one and a half seconds, ${REAL}`,
    },
    {
      file: 'mg-long-a.wav',
      duration: 2.8,
      influence: 0.6,
      text: `Long World War Two machine gun full automatic concentration outdoors nearly three seconds continuous fire, ${REAL}`,
    },
    {
      file: 'mg-long-b.wav',
      duration: 2.6,
      influence: 0.58,
      text: `Extended machine gun full auto outdoors over two and a half seconds continuous burst, ${REAL}`,
    }
  );

  return jobs;
}

const CATALOG = buildCatalog();

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

function convert(srcPath, destName) {
  const dest = join(OUT, destName);
  // Keep full burst length — light silence trim + end fade only
  const af = [
    'highpass=f=50',
    'lowpass=f=10000',
    'equalizer=f=120:t=q:w=0.85:g=3.5',
    'equalizer=f=280:t=q:w=0.9:g=1.8',
    'equalizer=f=2800:t=q:w=1.1:g=-4.5',
    'equalizer=f=4500:t=q:w=1.0:g=-5',
    'equalizer=f=7000:t=q:w=1.0:g=-3',
    'silenceremove=start_periods=1:start_silence=0.02:start_threshold=-48dB:detection=peak',
    'afade=t=in:st=0:d=0.005',
    'areverse,afade=t=in:st=0:d=0.08,areverse',
    'loudnorm=I=-11:TP=-0.6:LRA=6',
    'volume=1.08',
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
  try {
    spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  } catch {
    console.error('ffmpeg not found on PATH');
    process.exit(1);
  }

  console.log(`ElevenLabs MG extras — ${CATALOG.length} samples (short/medium + long bursts)`);
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < CATALOG.length; i++) {
    const job = CATALOG[i];
    const dest = join(OUT, job.file);
    const label = `[${i + 1}/${CATALOG.length}] ${job.file} (${job.duration}s)`;
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
        prompt_influence: job.influence,
      });
      const tmp = join(TMP, `${job.file}.mp3`);
      writeFileSync(tmp, mp3);
      convert(tmp, job.file);
      console.log('ok');
      ok += 1;
      await sleep(450);
    } catch (err) {
      console.log('FAIL');
      console.error(`  ${err.message}`);
      failed += 1;
      if (String(err.message).includes('401')) process.exit(1);
      if (/429|quota|credit/i.test(err.message)) {
        console.error('Quota hit — stopping.');
        break;
      }
      await sleep(1000);
    }
  }

  console.log(`\nDone — wrote ${ok}, skipped ${skipped}, failed ${failed}`);
  console.log('Pools updated in WeaponSounds.js — reload the game to hear new MG variants.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
