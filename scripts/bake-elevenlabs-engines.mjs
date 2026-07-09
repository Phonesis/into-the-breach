/**
 * Realistic vehicle engine loop WAVs via ElevenLabs Sound Effects.
 * Overwrites public/sounds/engine-*.wav used by VehicleEngineAudio.
 *
 * Requires ELEVENLABS_API_KEY + ffmpeg.
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-engines.mjs --force
 *
 * Uses loop:true for seamless loops. No pitch cloning.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-engines');
const API = 'https://api.elevenlabs.io/v1/sound-generation';

const API_KEY = process.env.ELEVENLABS_API_KEY?.trim();
if (!API_KEY) {
  console.error('Missing ELEVENLABS_API_KEY');
  process.exit(1);
}

const force = process.argv.includes('--force');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const CATALOG = [
  // —— Medium tank (Sherman / Panzer / T-34 class) ——
  {
    file: 'engine-tank.wav',
    duration: 4.5,
    influence: 0.42,
    loop: true,
    kind: 'main',
    text:
      'Seamless loop of a World War Two medium tank gasoline engine under load, continuous deep diesel-like rumble and mechanical clatter of tracks and drivetrain, outdoor field recording, steady cruise, no music, no voices, no horns, not synthetic, not cinematic trailer',
  },
  {
    file: 'engine-tank-exhaust.wav',
    duration: 4.2,
    influence: 0.4,
    loop: true,
    kind: 'exhaust',
    text:
      'Seamless loop of World War Two tank exhaust rumble only, low frequency growling pulses from muffler stacks, dark continuous engine exhaust bed, outdoor, no music, no voices, not synthetic',
  },

  // —— Armored car / wheeled recon ——
  {
    file: 'engine-armored-car.wav',
    duration: 4.0,
    influence: 0.45,
    loop: true,
    kind: 'main',
    text:
      'Seamless loop of a World War Two armored car gasoline engine at cruise, lighter higher pitched motor than a tank, continuous wheeled vehicle rumble and light transmission noise, outdoor, no music, no voices, not synthetic',
  },
  {
    file: 'engine-armored-car-exhaust.wav',
    duration: 3.8,
    influence: 0.42,
    loop: true,
    kind: 'exhaust',
    text:
      'Seamless loop of light armored car exhaust burble, continuous soft low mid exhaust pulses, outdoor vehicle, no music, no voices, not synthetic',
  },

  // —— Towed artillery tractor / prime mover ——
  {
    file: 'engine-artillery.wav',
    duration: 4.2,
    influence: 0.42,
    loop: true,
    kind: 'main',
    text:
      'Seamless loop of a heavy World War Two artillery tractor or truck engine pulling a gun, deep slow diesel truck rumble, continuous mechanical load, outdoor, no music, no voices, not synthetic',
  },
  {
    file: 'engine-artillery-exhaust.wav',
    duration: 4.0,
    influence: 0.4,
    loop: true,
    kind: 'exhaust',
    text:
      'Seamless loop of heavy military truck exhaust rumble, dark continuous low frequency exhaust, outdoor, no music, no voices, not synthetic',
  },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function generateSfx(job) {
  const body = {
    text: job.text,
    model_id: 'eleven_text_to_sound_v2',
    prompt_influence: job.influence ?? 0.4,
    duration_seconds: job.duration,
    loop: job.loop !== false,
  };

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

/**
 * Mono 44.1 kHz loop-friendly convert.
 * Main = fuller body; exhaust = darker low band.
 * Crossfade edges for extra seamless looping.
 */
function convert(srcPath, destName, kind) {
  const dest = join(OUT, destName);
  const eq =
    kind === 'exhaust'
      ? [
          'highpass=f=40',
          'lowpass=f=800',
          'equalizer=f=80:t=q:w=0.7:g=4',
          'equalizer=f=160:t=q:w=0.8:g=2.5',
          'equalizer=f=400:t=q:w=1.0:g=-2',
        ]
      : [
          'highpass=f=45',
          'lowpass=f=4500',
          'equalizer=f=90:t=q:w=0.75:g=3.5',
          'equalizer=f=200:t=q:w=0.85:g=2',
          'equalizer=f=600:t=q:w=1.0:g=1',
          'equalizer=f=2500:t=q:w=1.0:g=-3',
          'equalizer=f=4000:t=q:w=1.0:g=-4',
        ];

  // Crossfade loop: reverse fade technique on both ends
  const af = [
    ...eq,
    'afade=t=in:st=0:d=0.08',
    'areverse,afade=t=in:st=0:d=0.08,areverse',
    'loudnorm=I=-16:TP=-1.5:LRA=8',
    'alimiter=limit=0.94',
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
  console.log(`ElevenLabs vehicle engines — ${CATALOG.length} loops`);
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
      convert(tmp, job.file, job.kind);
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
      await sleep(900);
    }
  }

  console.log(`\nDone — wrote ${ok}, skipped ${skipped}, failed ${failed}`);
  console.log('Used by VehicleEngineAudio (tank / superHeavy / armoredCar / artillery).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
