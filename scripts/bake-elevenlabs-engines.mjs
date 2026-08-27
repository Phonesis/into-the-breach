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
const force = process.argv.includes('--force');
const validateOnly = process.argv.includes('--validate');
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length) ?? null;
const promptLimit = 450;
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const BASE_CATALOG = [
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
  {
    file: 'engine-tank-pivot-tracks.wav',
    duration: 4.5,
    influence: 0.62,
    loop: true,
    kind: 'pivot',
    text:
      'Seamless loop of a stationary World War Two tracked tank pivoting on the spot, heavy steel tracks grinding and clanking over gritty cobbles and packed earth, sprocket and suspension strain, short metallic track slaps, realistic close outdoor field recording, no cannon, no voices, no music, no cinematic effects',
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
    file: 'engine-truck.wav',
    duration: 4.2,
    influence: 0.44,
    loop: true,
    kind: 'main',
    text:
      'Seamless loop of a World War Two military cargo truck gasoline engine at cruise, medium truck rumble, gearbox and tire noise on packed earth, outdoor field recording, no music, no voices, no horns, not synthetic',
  },
  {
    file: 'engine-truck-exhaust.wav',
    duration: 4.0,
    influence: 0.42,
    loop: true,
    kind: 'exhaust',
    text:
      'Seamless loop of World War Two cargo truck exhaust burble only, low mid muffler pulses from a 3-ton lorry, continuous outdoor vehicle recording, no music, no voices, not synthetic',
  },
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

const FACTION_ENGINE_SPECS = {
  germany: {
    tank: 'German Panzer IV and Tiger tracked tanks',
    armoredCar: 'German Sd.Kfz. 222 armoured car',
    truck: 'German Opel Blitz 3-ton cargo truck',
  },
  usa: {
    tank: 'American M4 Sherman and M26 Pershing tracked tanks',
    armoredCar: 'American M8 Greyhound armoured car',
    truck: 'American GMC CCKW two-and-a-half-ton cargo truck',
  },
  uk: {
    tank: 'British Churchill and Black Prince tracked tanks',
    armoredCar: 'British Daimler armoured car',
    truck: 'British Bedford QLD 3-ton cargo lorry',
  },
  russia: {
    tank: 'Soviet T-34-85 and IS-2 tracked tanks',
    armoredCar: 'Soviet BA-64 armoured car',
    truck: 'Soviet ZIS-5 3-ton cargo lorry',
  },
  japan: {
    tank: 'Japanese Shinhoto Chi-Ha and Type 3 Chi-Nu tracked tanks',
    armoredCar: 'Japanese Type 92 Chiyoda armoured car',
    truck: 'Japanese Type 94 Isuzu cargo truck',
  },
};

const FACTION_ENGINE_CATALOG = Object.entries(FACTION_ENGINE_SPECS).flatMap(
  ([faction, spec]) => [
    {
      file: `engine-tank-${faction}.wav`,
      duration: 4.5,
      influence: 0.44,
      loop: true,
      kind: 'main',
      text:
        `Seamless loop of ${spec.tank} moving under load, faction-specific World War Two engine ` +
        `rumble, steel track clatter and drivetrain vibration, outdoor field recording, no music, ` +
        `no voices, no horns, not synthetic, not cinematic trailer`,
    },
    {
      file: `engine-tank-${faction}-exhaust.wav`,
      duration: 4.2,
      influence: 0.4,
      loop: true,
      kind: 'exhaust',
      text:
        `Seamless loop of ${spec.tank} exhaust rumble only, low frequency muffler pulses and ` +
        `dark continuous engine exhaust bed, outdoor vehicle recording, no music, no voices, not synthetic`,
    },
    {
      file: `engine-tank-${faction}-pivot-tracks.wav`,
      duration: 4.5,
      influence: 0.62,
      loop: true,
      kind: 'pivot',
      text:
        `Seamless loop of ${spec.tank} pivoting in place, heavy faction-specific steel tracks ` +
        `grinding and clanking over packed earth, sprocket strain and short metallic track slaps, ` +
        `realistic outdoor field recording, no cannon, no voices, no music`,
    },
    {
      file: `engine-armored-car-${faction}.wav`,
      duration: 4.0,
      influence: 0.45,
      loop: true,
      kind: 'main',
      text:
        `Seamless loop of ${spec.armoredCar} moving under load, faction-specific gasoline engine ` +
        `rumble, transmission hum, tire noise and light suspension rattle, outdoor recording, no music, ` +
        `no voices, not synthetic`,
    },
    {
      file: `engine-armored-car-${faction}-exhaust.wav`,
      duration: 3.8,
      influence: 0.42,
      loop: true,
      kind: 'exhaust',
      text:
        `Seamless loop of ${spec.armoredCar} exhaust burble, continuous faction-specific low-mid ` +
        `engine pulses, outdoor vehicle recording, no music, no voices, not synthetic`,
    },
    {
      file: `engine-truck-${faction}.wav`,
      duration: 4.2,
      influence: 0.44,
      loop: true,
      kind: 'main',
      text:
        `Seamless loop of ${spec.truck} moving under load, faction-specific gasoline cargo-truck ` +
        `engine rumble, gearbox and tire noise on packed earth, outdoor recording, no music, ` +
        `no voices, not synthetic`,
    },
    {
      file: `engine-truck-${faction}-exhaust.wav`,
      duration: 4.0,
      influence: 0.42,
      loop: true,
      kind: 'exhaust',
      text:
        `Seamless loop of ${spec.truck} exhaust burble, continuous faction-specific low-mid ` +
        `muffler pulses, outdoor vehicle recording, no music, no voices, not synthetic`,
    },
  ]
);

const CATALOG = [...BASE_CATALOG, ...FACTION_ENGINE_CATALOG];

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
    kind === 'pivot'
      ? [
          'highpass=f=90',
          'lowpass=f=6200',
          'equalizer=f=180:t=q:w=0.8:g=2.5',
          'equalizer=f=850:t=q:w=0.9:g=3',
          'equalizer=f=2100:t=q:w=1.0:g=2',
          'equalizer=f=4800:t=q:w=1.0:g=-2',
        ]
      : kind === 'exhaust'
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

  // ElevenLabs loop:true supplies matched pivot-loop boundaries; keep those
  // intact so an on-the-spot turn has no periodic dip in its track grind.
  const edgeFades =
    kind === 'pivot'
      ? []
      : [
          'afade=t=in:st=0:d=0.08',
          'areverse,afade=t=in:st=0:d=0.08,areverse',
        ];
  const af = [
    ...eq,
    ...edgeFades,
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
  const jobs = only ? CATALOG.filter((job) => job.file === only) : CATALOG;
  if (!jobs.length) throw new Error(`No engine job matches --only=${only}`);
  let invalid = false;
  for (const job of jobs) {
    const promptLength = [...job.text].length;
    const valid = promptLength <= promptLimit && job.duration >= 0.5 && job.duration <= 30;
    console.log(
      `${valid ? 'ok' : 'INVALID'} ${job.file}: prompt ${promptLength}/${promptLimit}, ${job.duration}s`
    );
    invalid ||= !valid;
  }
  if (invalid) process.exit(1);
  if (validateOnly) return;
  if (!API_KEY) {
    console.error('Missing ELEVENLABS_API_KEY');
    process.exit(1);
  }

  console.log(`ElevenLabs vehicle engines — ${jobs.length} loops`);
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const dest = join(OUT, job.file);
    const label = `[${i + 1}/${jobs.length}] ${job.file}`;
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
