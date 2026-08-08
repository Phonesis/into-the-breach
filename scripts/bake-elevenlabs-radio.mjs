/**
 * Bake WWII radio channel beds + pre-speak key/squelch/crackle one-shots via ElevenLabs.
 *
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-radio.mjs
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-radio.mjs --force
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-radio.mjs --validate
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-radio');
const API = 'https://api.elevenlabs.io/v1/sound-generation';
const PROMPT_LIMIT = 450;

const API_KEY = process.env.ELEVENLABS_API_KEY?.trim();
const force = process.argv.includes('--force');
const validateOnly = process.argv.includes('--validate');

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

/**
 * @type {{ file: string, duration: number, influence: number, kind: 'bed'|'open', text: string }[]}
 */
const CATALOG = [
  // —— Loopable channel beds (under speech) ——
  {
    file: 'radio-static-a.wav',
    duration: 1.35,
    influence: 0.55,
    kind: 'bed',
    text:
      'Seamless loop of World War Two military radio receiver static, soft white noise hiss and light crackle, continuous channel noise floor, no voice no music no beeps',
  },
  {
    file: 'radio-static-b.wav',
    duration: 1.2,
    influence: 0.55,
    kind: 'bed',
    text:
      'Seamless loop of vintage WWII field radio interference, grainy static and mid crackle, continuous dry radio bed, no speech no music',
  },
  {
    file: 'radio-static-c.wav',
    duration: 1.4,
    influence: 0.52,
    kind: 'bed',
    text:
      'Seamless loop of tank intercom radio static hum with light crackle, continuous low radio noise floor, dry mono, no voice no music',
  },
  {
    file: 'radio-static-d.wav',
    duration: 1.3,
    influence: 0.55,
    kind: 'bed',
    text:
      'Seamless loop of WWII SCR-style radio atmospheric static, thin hiss and soft sparking crackle, continuous, no voice no music no Morse',
  },
  {
    file: 'radio-static-e.wav',
    duration: 1.25,
    influence: 0.55,
    kind: 'bed',
    text:
      'Seamless loop of wartime walkie-talkie radio noise bed, scratchy static and gentle crackle, continuous outdoor radio receiver, no speech',
  },
  {
    file: 'radio-crackle-bed-a.wav',
    duration: 1.2,
    influence: 0.58,
    kind: 'bed',
    text:
      'Seamless loop of heavy WWII radio crackle and pop interference, continuous electrical crackling static, dry mono field radio, no voice no music',
  },
  {
    file: 'radio-crackle-bed-b.wav',
    duration: 1.15,
    influence: 0.55,
    kind: 'bed',
    text:
      'Seamless loop of intermittent radio crackle and buzz on a wartime military set, continuous channel noise with crackle pops, no speech no beeps',
  },
  {
    file: 'radio-hum-a.wav',
    duration: 1.4,
    influence: 0.5,
    kind: 'bed',
    text:
      'Seamless loop of WWII radio carrier hum with soft static hiss, low tube radio tone and light noise floor, continuous, no voice no music',
  },

  // —— Pre-speak openers (EL min duration 0.5s; convert trims to a short key-up) ——
  {
    file: 'radio-open-01.wav',
    duration: 0.55,
    influence: 0.62,
    kind: 'open',
    text:
      'World War Two military radio PTT key-down click and squelch open at the start, short handset press then quiet, dry mono, no voice no music',
  },
  {
    file: 'radio-open-02.wav',
    duration: 0.6,
    influence: 0.62,
    kind: 'open',
    text:
      'WWII radio key click then brief static burst as channel opens, handie-talkie press-to-talk then fade, dry, no speech no music',
  },
  {
    file: 'radio-open-03.wav',
    duration: 0.55,
    influence: 0.6,
    kind: 'open',
    text:
      'Vintage military radio squelch tail opening with soft thump and hiss at the start then quiet, dry mono, no voice',
  },
  {
    file: 'radio-open-04.wav',
    duration: 0.65,
    influence: 0.62,
    kind: 'open',
    text:
      'WWII field radio crackle burst as transmission starts, sharp static crackle then open channel then quiet, dry, no speech',
  },
  {
    file: 'radio-open-05.wav',
    duration: 0.55,
    influence: 0.6,
    kind: 'open',
    text:
      'Military radio relay click and brief interference pop at the start, WWII radio net key-up then quiet, dry mono, no voice no music',
  },
  {
    file: 'radio-open-06.wav',
    duration: 0.65,
    influence: 0.62,
    kind: 'open',
    text:
      'Wartime radio static whoosh and crackle as carrier comes up, single transmission open then quiet, dry, no speech no beeps',
  },
  {
    file: 'radio-open-07.wav',
    duration: 0.55,
    influence: 0.65,
    kind: 'open',
    text:
      'Sharp WWII radio PTT click with tiny electrical spark at the start then silence, dry key-down, no voice no music',
  },
  {
    file: 'radio-open-08.wav',
    duration: 0.7,
    influence: 0.58,
    kind: 'open',
    text:
      'WWII radio channel open: soft hum, crackle, and squelch release then quiet, dry mono field radio, no speech no music',
  },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function generateSfx(job) {
  const body = {
    text: job.text,
    model_id: 'eleven_text_to_sound_v2',
    prompt_influence: job.influence ?? 0.5,
    duration_seconds: job.duration,
  };
  // Beds benefit from loop-matched edges when EL supports it
  if (job.kind === 'bed') body.loop = true;

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
  // Light band-limit toward radio speaker range; louder openers, quieter beds
  let filter;
  if (job.kind === 'open') {
    // Keep the first ~0.32–0.4s of action, hard-fade the rest (EL min gen is 0.5s)
    const keep = Math.min(0.4, Math.max(0.28, job.duration * 0.55));
    filter = [
      'highpass=f=200',
      'lowpass=f=5500',
      'equalizer=f=1800:t=q:w=1.0:g=2',
      'afade=t=in:st=0:d=0.006',
      `afade=t=out:st=${(keep - 0.06).toFixed(3)}:d=0.06`,
      `atrim=0:${keep.toFixed(3)}`,
      'loudnorm=I=-16:TP=-1.5:LRA=6',
      'alimiter=limit=0.94',
    ].join(',');
  } else {
    filter = [
      'highpass=f=250',
      'lowpass=f=4800',
      'equalizer=f=1200:t=q:w=0.9:g=1',
      'afade=t=in:st=0:d=0.02',
      'areverse,afade=t=in:st=0:d=0.02,areverse',
      'loudnorm=I=-22:TP=-2:LRA=8',
      'alimiter=limit=0.92',
    ].join(',');
  }

  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', srcPath, '-ac', '1', '-ar', '44100', '-af', filter, '-c:a', 'pcm_s16le', dest],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-500));
    throw new Error(`ffmpeg failed for ${destName}`);
  }
}

async function main() {
  let invalid = false;
  for (const job of CATALOG) {
    const len = [...job.text].length;
    const ok = len <= PROMPT_LIMIT && job.duration >= 0.2 && job.duration <= 30;
    console.log(`${ok ? 'ok' : 'INVALID'} ${job.file}: prompt ${len}/${PROMPT_LIMIT}, ${job.duration}s`);
    invalid ||= !ok;
  }
  if (invalid) process.exit(1);
  if (validateOnly) return;

  if (!API_KEY) {
    console.error('Missing ELEVENLABS_API_KEY');
    process.exit(1);
  }

  console.log(`\nElevenLabs radio SFX — ${CATALOG.length} clips`);
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
      const mp3 = await generateSfx(job);
      const tmp = join(TMP, `${job.file}.mp3`);
      writeFileSync(tmp, mp3);
      convert(tmp, job.file, job);
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
    }
  }

  console.log(`\nDone — ok ${ok}, skipped ${skipped}, failed ${failed}`);
  console.log(`WAVs in ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
