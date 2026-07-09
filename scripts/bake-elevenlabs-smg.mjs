/**
 * Faction SMG / squad automatic fire samples via ElevenLabs.
 * Short-medium bursts (not full MG-team LMG).
 *
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-smg.mjs --force
 */
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-smg');
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
  'authentic outdoor field recording, natural acoustic, full body powder cracks, dry short natural decay, no music, no voices, no speech, not synthetic, not electronic, not metallic ring, not tinny, not cinematic trailer';

/** 3 SMG variants per faction + generic fallbacks. */
const CATALOG = [
  // Generic
  {
    file: 'smg.wav',
    duration: 0.75,
    influence: 0.62,
    text: `Short World War Two submachine gun burst outdoors, rapid light automatic fire, six to eight shots, ${REAL}`,
  },
  {
    file: 'smg-b.wav',
    duration: 0.7,
    influence: 0.58,
    text: `Short submachine gun burst outdoors, close-range automatic fire, open field, ${REAL}`,
  },

  // Germany — MP40
  {
    file: 'smg-germany.wav',
    duration: 0.78,
    influence: 0.68,
    text: `Short MP40 Schmeisser submachine gun burst outdoors, rapid 9mm automatic fire, seven shots, ${REAL}`,
  },
  {
    file: 'smg-germany-b.wav',
    duration: 0.72,
    influence: 0.62,
    text: `German MP40 submachine gun short burst outdoors, distinctive cyclic rate, powder cracks, ${REAL}`,
  },
  {
    file: 'smg-germany-c.wav',
    duration: 0.8,
    influence: 0.6,
    text: `MP40 full auto short burst outdoors, continuous rapid fire about eight shots, open field, ${REAL}`,
  },

  // USA — Thompson / M3 grease gun feel
  {
    file: 'smg-usa.wav',
    duration: 0.78,
    influence: 0.68,
    text: `Short Thompson submachine gun burst outdoors, heavy 45 caliber automatic fire, six to seven shots, ${REAL}`,
  },
  {
    file: 'smg-usa-b.wav',
    duration: 0.72,
    influence: 0.62,
    text: `American M3 grease gun short burst outdoors, slower heavy automatic fire, ${REAL}`,
  },
  {
    file: 'smg-usa-c.wav',
    duration: 0.8,
    influence: 0.6,
    text: `Thompson SMG short full auto burst outdoors, punchy powder reports, open field, ${REAL}`,
  },

  // UK — Sten
  {
    file: 'smg-uk.wav',
    duration: 0.78,
    influence: 0.68,
    text: `Short Sten gun submachine gun burst outdoors, rapid 9mm automatic fire, British SMG, ${REAL}`,
  },
  {
    file: 'smg-uk-b.wav',
    duration: 0.72,
    influence: 0.62,
    text: `British Sten SMG short burst outdoors, distinctive mechanical automatic fire, ${REAL}`,
  },
  {
    file: 'smg-uk-c.wav',
    duration: 0.8,
    influence: 0.6,
    text: `Sten gun full auto short burst outdoors, rapid shots, open field, ${REAL}`,
  },

  // Russia — PPSh-41
  {
    file: 'smg-russia.wav',
    duration: 0.78,
    influence: 0.68,
    text: `Short PPSh-41 submachine gun burst outdoors, very high cyclic rate automatic fire, Soviet SMG, ${REAL}`,
  },
  {
    file: 'smg-russia-b.wav',
    duration: 0.72,
    influence: 0.62,
    text: `Soviet PPSh drum magazine SMG short burst outdoors, rapid powder cracks, ${REAL}`,
  },
  {
    file: 'smg-russia-c.wav',
    duration: 0.8,
    influence: 0.6,
    text: `PPSh-41 full auto short burst outdoors, continuous rapid fire, open field, ${REAL}`,
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
  const af = [
    'highpass=f=60',
    'lowpass=f=10000',
    'equalizer=f=140:t=q:w=0.85:g=3.5',
    'equalizer=f=300:t=q:w=0.9:g=1.8',
    'equalizer=f=2800:t=q:w=1.1:g=-5.5',
    'equalizer=f=4500:t=q:w=1.0:g=-6.5',
    'equalizer=f=7000:t=q:w=1.0:g=-4',
    'silenceremove=start_periods=1:start_silence=0.01:start_threshold=-50dB:detection=peak',
    'apad=pad_dur=0.02',
    'afade=t=in:st=0:d=0.002',
    'areverse,afade=t=in:st=0:d=0.05,areverse',
    'loudnorm=I=-10:TP=-0.5:LRA=5',
    'volume=1.1',
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
  console.log(`ElevenLabs SMG bake — ${CATALOG.length} samples`);
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
      writeFileSync(join(TMP, `${job.file}.mp3`), mp3);
      convert(join(TMP, `${job.file}.mp3`), job.file);
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
