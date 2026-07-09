/**
 * Longer full-auto MG burst samples via ElevenLabs (~2–2.4 s).
 * Overwrites primary MG masters (and B / shared extras) so firefights
 * sound like sustained automatic fire rather than tiny 0.8 s clips.
 *
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-mg-long.mjs
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-mg-long.mjs --force
 */
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-mg-long');
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
  'authentic outdoor field recording, continuous full automatic fire, deep powder muzzle blasts, natural acoustic, dry, no music, no voices, no speech, not synthetic, not electronic, not metallic ring, not tinny, not a short single shot';

const CATALOG = [
  {
    file: 'mg.wav',
    duration: 2.2,
    influence: 0.62,
    text: `Long sustained World War Two machine gun full automatic burst outdoors lasting about two seconds, continuous rapid gunfire, ${REAL}`,
  },
  {
    file: 'mg-extra-a.wav',
    duration: 2.3,
    influence: 0.6,
    text: `Long heavy machine gun full auto burst outdoors, continuous thumping shots for over two seconds, ${REAL}`,
  },
  {
    file: 'mg-extra-b.wav',
    duration: 2.1,
    influence: 0.58,
    text: `Sustained medium machine gun automatic fire outdoors, long continuous burst, open field, ${REAL}`,
  },

  // Germany — MG42 high cyclic rate
  {
    file: 'mg-germany.wav',
    duration: 2.25,
    influence: 0.68,
    text: `Long MG42 machine gun full automatic burst outdoors, very high cyclic rate continuous ripping gunfire for about two seconds, each shot a real muzzle blast not a synthetic buzz, ${REAL}`,
  },
  {
    file: 'mg-germany-b.wav',
    duration: 2.15,
    influence: 0.62,
    text: `Sustained German MG42 full auto burst outdoors, continuous rapid fire two seconds, open field, ${REAL}`,
  },
  {
    file: 'mg-germany-f.wav',
    duration: 2.3,
    influence: 0.65,
    text: `Long MG42 full automatic sustained fire outdoors, continuous high rate of fire burst, powder reports, ${REAL}`,
  },
  {
    file: 'mg-germany-g.wav',
    duration: 2.1,
    influence: 0.6,
    text: `Sustained MG42 automatic burst outdoors over two seconds, continuous gunfire, ${REAL}`,
  },

  // USA — Browning slower heavy
  {
    file: 'mg-usa.wav',
    duration: 2.25,
    influence: 0.68,
    text: `Long Browning M1919 machine gun full automatic burst outdoors, continuous heavy thumping gunshots for about two seconds, measured cyclic rate, ${REAL}`,
  },
  {
    file: 'mg-usa-b.wav',
    duration: 2.15,
    influence: 0.62,
    text: `Sustained American thirty caliber machine gun full auto outdoors, long continuous burst, ${REAL}`,
  },
  {
    file: 'mg-usa-f.wav',
    duration: 2.3,
    influence: 0.65,
    text: `Long M1919 Browning full automatic fire outdoors, continuous heavy bursts for two seconds, ${REAL}`,
  },
  {
    file: 'mg-usa-g.wav',
    duration: 2.1,
    influence: 0.6,
    text: `Sustained Browning machine gun automatic fire outdoors over two seconds, ${REAL}`,
  },

  // UK — Bren
  {
    file: 'mg-uk.wav',
    duration: 2.25,
    influence: 0.68,
    text: `Long Bren light machine gun full automatic burst outdoors, continuous measured gunfire for about two seconds, solid powder reports, ${REAL}`,
  },
  {
    file: 'mg-uk-b.wav',
    duration: 2.15,
    influence: 0.62,
    text: `Sustained British Bren gun full auto outdoors, long continuous burst, open field, ${REAL}`,
  },
  {
    file: 'mg-uk-f.wav',
    duration: 2.3,
    influence: 0.65,
    text: `Long Bren LMG automatic fire outdoors, continuous two second burst, ${REAL}`,
  },
  {
    file: 'mg-uk-g.wav',
    duration: 2.1,
    influence: 0.6,
    text: `Sustained Bren gun full automatic burst outdoors over two seconds, ${REAL}`,
  },

  // Russia — DP-28
  {
    file: 'mg-russia.wav',
    duration: 2.25,
    influence: 0.68,
    text: `Long Soviet DP-28 light machine gun full automatic burst outdoors, continuous solid gunfire for about two seconds, ${REAL}`,
  },
  {
    file: 'mg-russia-b.wav',
    duration: 2.15,
    influence: 0.62,
    text: `Sustained DP-28 machine gun full auto outdoors, long continuous burst, open field, ${REAL}`,
  },
  {
    file: 'mg-russia-f.wav',
    duration: 2.3,
    influence: 0.65,
    text: `Long DP-28 full automatic fire outdoors, continuous two second burst, ${REAL}`,
  },
  {
    file: 'mg-russia-g.wav',
    duration: 2.1,
    influence: 0.6,
    text: `Sustained Soviet DP-28 automatic burst outdoors over two seconds, ${REAL}`,
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

function convert(srcPath, destName) {
  const dest = join(OUT, destName);
  // Keep the full burst length — only light trim of leading silence, short end fade
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
  console.log(`ElevenLabs long MG bursts — ${CATALOG.length} samples`);
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < CATALOG.length; i++) {
    const job = CATALOG[i];
    const dest = join(OUT, job.file);
    const label = `[${i + 1}/${CATALOG.length}] ${job.file}`;
    if (!force && existsSync(dest)) {
      // Always force recommended for this script purpose, but honor skip
      console.log(`${label} — skip (exists, use --force)`);
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
  console.log('Re-run: npm run expand-gun-variety  (refreshes mild c/d/e from new masters)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
