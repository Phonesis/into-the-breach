/**
 * More original ElevenLabs SFX only (no pitch cloning):
 *  - radio static for vehicle radio chatter
 *  - extra small arms (rifle + SMG) per faction
 *  - extra explosions
 *
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-more-sfx.mjs --force
 */
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-more');
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
  'authentic outdoor field recording, natural acoustic, dry, no music, no voices, no speech, not synthetic, not electronic, not metallic ring, not tinny, not cinematic trailer';

const CATALOG = [
  // —— Radio static (vehicle radio bed under speech) ——
  {
    file: 'radio-static-a.wav',
    duration: 1.2,
    influence: 0.45,
    kind: 'radio',
    text:
      'Continuous WWII military radio static and white noise crackle, soft interference hiss, loopable radio bed, no voice, no music, no beeps',
  },
  {
    file: 'radio-static-b.wav',
    duration: 1.0,
    influence: 0.5,
    kind: 'radio',
    text:
      'Short military radio static burst with crackle and soft white noise, WWII handheld radio interference, no voice, no music',
  },
  {
    file: 'radio-static-c.wav',
    duration: 1.4,
    influence: 0.42,
    kind: 'radio',
    text:
      'Sustained tank radio static hum and light crackle, continuous low radio noise floor, no voice, no music, dry',
  },

  // —— Extra explosions (original gens) ——
  {
    file: 'explosion-f.wav',
    duration: 1.85,
    influence: 0.55,
    kind: 'boom',
    text: `Massive high explosive shell detonation outdoors, deep bass boom, dirt debris, pressure wave, ${REAL}`,
  },
  {
    file: 'explosion-g.wav',
    duration: 1.65,
    influence: 0.55,
    kind: 'boom',
    text: `Medium artillery shell explosion outdoors, sharp crack then deep thump, gravel spray, ${REAL}`,
  },
  {
    file: 'explosion-h.wav',
    duration: 2.0,
    influence: 0.5,
    kind: 'boom',
    text: `Distant heavy battlefield explosion rumble, deep low frequency boom and bass tail, outdoor, ${REAL}`,
  },
  {
    file: 'explosion-i.wav',
    duration: 1.7,
    influence: 0.55,
    kind: 'boom',
    text: `Close high explosive blast outdoors, violent boom and dirt shower, short outdoor detonation, ${REAL}`,
  },
  {
    file: 'impact-d.wav',
    duration: 0.55,
    influence: 0.55,
    kind: 'boom',
    text: `Bullet striking dirt and sand outdoors, short thud gravel spray, ${REAL}`,
  },
  {
    file: 'impact-e.wav',
    duration: 0.5,
    influence: 0.5,
    kind: 'boom',
    text: `Bullet hitting sandbags and earth, short dull impact outdoor, ${REAL}`,
  },

  // —— Extra rifles per faction (h/i originals) ——
  {
    file: 'rifle-germany-h.wav',
    duration: 0.7,
    influence: 0.65,
    kind: 'gun',
    text: `Single Karabiner 98k Mauser rifle gunshot outdoors, deep muzzle blast and ballistic crack, ${REAL}`,
  },
  {
    file: 'rifle-germany-i.wav',
    duration: 0.68,
    influence: 0.6,
    kind: 'gun',
    text: `Single German Mauser Kar98k rifle shot outdoors, powerful powder thump then crack, ${REAL}`,
  },
  {
    file: 'rifle-usa-h.wav',
    duration: 0.7,
    influence: 0.65,
    kind: 'gun',
    text: `Single M1 Garand thirty aught six rifle gunshot outdoors, deep muzzle blast and sharp crack, ${REAL}`,
  },
  {
    file: 'rifle-usa-i.wav',
    duration: 0.68,
    influence: 0.6,
    kind: 'gun',
    text: `Single American M1 Garand rifle shot outdoors, punchy powder blast, ${REAL}`,
  },
  {
    file: 'rifle-uk-h.wav',
    duration: 0.7,
    influence: 0.68,
    kind: 'gun',
    text: `Single Lee Enfield three oh three rifle gunshot outdoors, deep muzzle thump and crack, ${REAL}`,
  },
  {
    file: 'rifle-uk-i.wav',
    duration: 0.68,
    influence: 0.62,
    kind: 'gun',
    text: `Single British Lee Enfield SMLE rifle shot outdoors, solid powder blast, ${REAL}`,
  },
  {
    file: 'rifle-russia-h.wav',
    duration: 0.7,
    influence: 0.65,
    kind: 'gun',
    text: `Single Mosin Nagant rifle gunshot outdoors, hard deep muzzle blast and crack, ${REAL}`,
  },
  {
    file: 'rifle-russia-i.wav',
    duration: 0.68,
    influence: 0.6,
    kind: 'gun',
    text: `Single Soviet Mosin Nagant rifle shot outdoors, deep thumping gunshot, ${REAL}`,
  },
  {
    file: 'rifle-extra-c.wav',
    duration: 0.7,
    influence: 0.62,
    kind: 'gun',
    text: `Single World War Two bolt action rifle gunshot outdoors, deep powder blast, ${REAL}`,
  },
  {
    file: 'rifle-extra-d.wav',
    duration: 0.65,
    influence: 0.58,
    kind: 'gun',
    text: `Single thirty caliber rifle gunshot outdoors, full body report, ${REAL}`,
  },

  // —— Extra SMGs ——
  {
    file: 'smg-germany-d.wav',
    duration: 0.78,
    influence: 0.65,
    kind: 'gun',
    text: `Short MP40 submachine gun burst outdoors, rapid 9mm automatic fire, seven shots, ${REAL}`,
  },
  {
    file: 'smg-germany-e.wav',
    duration: 0.72,
    influence: 0.6,
    kind: 'gun',
    text: `German MP40 SMG short burst outdoors, distinctive cyclic rate, ${REAL}`,
  },
  {
    file: 'smg-usa-d.wav',
    duration: 0.78,
    influence: 0.65,
    kind: 'gun',
    text: `Short Thompson submachine gun burst outdoors, heavy forty five automatic fire, ${REAL}`,
  },
  {
    file: 'smg-usa-e.wav',
    duration: 0.72,
    influence: 0.6,
    kind: 'gun',
    text: `American M3 grease gun short burst outdoors, slower heavy automatic fire, ${REAL}`,
  },
  {
    file: 'smg-uk-d.wav',
    duration: 0.78,
    influence: 0.65,
    kind: 'gun',
    text: `Short Sten gun burst outdoors, rapid 9mm automatic fire, British SMG, ${REAL}`,
  },
  {
    file: 'smg-uk-e.wav',
    duration: 0.72,
    influence: 0.6,
    kind: 'gun',
    text: `British Sten SMG short burst outdoors, mechanical automatic fire, ${REAL}`,
  },
  {
    file: 'smg-russia-d.wav',
    duration: 0.78,
    influence: 0.65,
    kind: 'gun',
    text: `Short PPSh-41 submachine gun burst outdoors, very high cyclic rate, Soviet SMG, ${REAL}`,
  },
  {
    file: 'smg-russia-e.wav',
    duration: 0.72,
    influence: 0.6,
    kind: 'gun',
    text: `Soviet PPSh SMG short burst outdoors, rapid powder cracks, ${REAL}`,
  },
  {
    file: 'smg-d.wav',
    duration: 0.75,
    influence: 0.58,
    kind: 'gun',
    text: `Short World War Two submachine gun burst outdoors, rapid light automatic fire, ${REAL}`,
  },
  {
    file: 'smg-e.wav',
    duration: 0.7,
    influence: 0.55,
    kind: 'gun',
    text: `Short SMG burst outdoors, close range automatic fire, open field, ${REAL}`,
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

/** Light normalize only — no pitch shift. Gentle metallic cut for guns. */
function convert(srcPath, destName, kind) {
  const dest = join(OUT, destName);
  let af;
  if (kind === 'radio') {
    af = [
      'highpass=f=200',
      'lowpass=f=5000',
      'equalizer=f=1200:t=q:w=1.0:g=2',
      'loudnorm=I=-18:TP=-2:LRA=6',
      'alimiter=limit=0.9',
    ].join(',');
  } else if (kind === 'gun') {
    af = [
      'highpass=f=55',
      'lowpass=f=10000',
      'equalizer=f=120:t=q:w=0.85:g=3.5',
      'equalizer=f=280:t=q:w=0.9:g=1.8',
      'equalizer=f=2800:t=q:w=1.1:g=-5',
      'equalizer=f=4500:t=q:w=1.0:g=-6',
      'equalizer=f=7000:t=q:w=1.0:g=-4',
      'silenceremove=start_periods=1:start_silence=0.01:start_threshold=-50dB:detection=peak',
      'apad=pad_dur=0.02',
      'afade=t=in:st=0:d=0.002',
      'areverse,afade=t=in:st=0:d=0.05,areverse',
      'loudnorm=I=-10:TP=-0.5:LRA=5',
      'volume=1.1',
      'alimiter=limit=0.97',
    ].join(',');
  } else {
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
      'volume=1.08',
      'alimiter=limit=0.97',
    ].join(',');
  }

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
  console.log(`ElevenLabs more originals — ${CATALOG.length} samples (no pitch clones)`);
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
      convert(tmp, job.file, job.kind);
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
