/**
 * Historically differentiated ElevenLabs tank and tank-destroyer cannon reports.
 * Writes mono 16-bit/44.1 kHz WAV masters into public/sounds.
 *
 *   npm run bake-elevenlabs-tank-cannons -- --validate
 *   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-tank-cannons
 *   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-tank-cannons -- --force
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, '../public/sounds');
const tempDir = join(root, '../.tmp-elevenlabs-tank-cannons');
const api = 'https://api.elevenlabs.io/v1/sound-generation';
const promptLimit = 450;
const force = process.argv.includes('--force');
const validateOnly = process.argv.includes('--validate');
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length) ?? null;

const real =
  'authentic World War Two outdoor live-fire field recording, immediate single cannon report, natural open-air decay, powerful but realistic, no music, no voices, no cinematic trailer effects, no synthetic sound';

const guns = [
  {
    stem: 'tank-75-germany-el',
    duration: 1.8,
    prompts: [
      `Panzer IV 7.5 cm KwK 40 L/48 tank cannon firing one round, hard high-velocity muzzle crack, weighty powder blast and deep pressure thump, slight mechanical resonance from the armored turret, ${real}`,
      `German Panzer IV long 75 mm main gun firing once in an open field, violent sharp shock crack followed by a broad low cannon boom and short battlefield echo, ${real}`,
    ],
  },
  {
    stem: 'tank-75-usa-el',
    duration: 1.75,
    prompts: [
      `American M4 Sherman 75 mm M3 tank cannon firing one round, full-bodied powder blast, strong concussive boom and crisp muzzle crack, brief armored turret resonance, ${real}`,
      `Sherman tank main gun firing a single 75 mm round outdoors, immediate heavy pressure report with a punchy low thump and natural open-field tail, ${real}`,
    ],
  },
  {
    stem: 'tank-75-uk-el',
    duration: 1.75,
    prompts: [
      `British Churchill tank 75 mm main gun firing one round outdoors, forceful muzzle crack and dense powder-charge boom, solid low pressure wave with restrained decay, ${real}`,
      `Churchill infantry tank firing its 75 mm cannon once in open terrain, abrupt heavy gun report, deep blast body and brief turret resonance, ${real}`,
    ],
  },
  {
    stem: 'tank-85-russia-el',
    duration: 1.85,
    prompts: [
      `Soviet T-34-85 ZiS-S-53 85 mm tank cannon firing one round, fierce high-velocity crack, large powder blast and deep rolling pressure boom, ${real}`,
      `T-34-85 main gun firing once across open steppe, immediate brutal cannon report with a sharp front edge, powerful low thump and short distant echo, ${real}`,
    ],
  },
  {
    stem: 'tank-88-germany-el',
    duration: 2,
    prompts: [
      `German Tiger I 8.8 cm KwK 36 tank gun firing one round, enormous concussive muzzle crack, deep chest-hitting boom and heavy pressure wave, brief armored resonance, ${real}`,
      `Tiger tank 88 mm main cannon firing once outdoors, savage shock front followed by a massive low-frequency gun blast and natural battlefield rumble, ${real}`,
    ],
  },
  {
    stem: 'tank-90-usa-el',
    duration: 2,
    prompts: [
      `American M26 Pershing 90 mm M3 tank cannon firing one round, extremely powerful muzzle crack, broad deep blast and heavy pressure thump, ${real}`,
      `Pershing heavy tank firing its 90 mm main gun once in an open field, violent immediate report with strong low-end body and short natural echo, ${real}`,
    ],
  },
  {
    stem: 'tank-17pdr-uk-el',
    duration: 1.9,
    prompts: [
      `British 17-pounder tank cannon firing one high-velocity round, exceptionally sharp supersonic crack over a powerful deep powder blast, open field, ${real}`,
      `17-pounder main gun firing once from an armored fighting vehicle, fierce hard-edged muzzle report, dense concussive boom and brief outdoor decay, ${real}`,
    ],
  },
  {
    stem: 'tank-122-russia-el',
    duration: 2.25,
    prompts: [
      `Soviet IS-2 122 mm D-25T tank cannon firing one round, colossal muzzle blast, crushing deep pressure boom and violent initial crack, long natural low rumble, ${real}`,
      `IS-2 heavy tank firing its massive 122 mm main gun once outdoors, thunderous immediate detonation-like report, huge bass body and rolling battlefield decay, ${real}`,
    ],
  },
  {
    stem: 'td-88-germany-el',
    duration: 2.05,
    prompts: [
      `German Jagdpanther long 8.8 cm Pak 43 cannon firing one round, ferocious high-velocity shock crack, enormous deep blast and forceful pressure wave, ${real}`,
      `Jagdpanther tank destroyer firing its long 88 mm gun once outdoors, hard supersonic report followed by a massive low cannon boom and short echo, ${real}`,
    ],
  },
  {
    stem: 'td-76-usa-el',
    duration: 1.85,
    prompts: [
      `American M10 Wolverine 3-inch M7 tank-destroyer cannon firing one round, hard high-velocity crack, muscular powder blast and deep open-air report, ${real}`,
      `M10 tank destroyer firing its 76 mm main gun once in open terrain, immediate sharp shock front with a weighty low boom and natural decay, ${real}`,
    ],
  },
  {
    stem: 'td-100-russia-el',
    duration: 2.1,
    prompts: [
      `Soviet SU-100 100 mm D-10S tank-destroyer cannon firing one round, huge hard muzzle report, deep pressure blast and powerful low-frequency thump, ${real}`,
      `SU-100 firing its long 100 mm main gun once across open steppe, brutal immediate crack with an enormous full-bodied boom and brief rolling echo, ${real}`,
    ],
  },
];

const jobs = guns.flatMap((gun) =>
  gun.prompts.map((text, index) => ({
    file: `${gun.stem}-${String(index + 1).padStart(2, '0')}.wav`,
    duration: gun.duration,
    text,
  }))
);

function validateJobs(selectedJobs) {
  let failed = false;
  for (const job of selectedJobs) {
    const length = [...job.text].length;
    const valid = length <= promptLimit && job.duration >= 0.5 && job.duration <= 30;
    console.log(
      `${valid ? 'ok' : 'INVALID'} ${job.file}: prompt ${length}/${promptLimit}, ${job.duration}s`
    );
    failed ||= !valid;
  }
  if (failed) process.exit(1);
}

async function generate(job, apiKey) {
  const response = await fetch(`${api}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: job.text,
      model_id: 'eleven_text_to_sound_v2',
      duration_seconds: job.duration,
      prompt_influence: 0.66,
    }),
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function convert(source, destination) {
  const filter = [
    'highpass=f=25',
    'lowpass=f=12000',
    'equalizer=f=58:t=q:w=0.75:g=3.8',
    'equalizer=f=115:t=q:w=0.85:g=2.2',
    'equalizer=f=2800:t=q:w=1.0:g=-1.5',
    'silenceremove=start_periods=1:start_silence=0.01:start_threshold=-48dB:detection=peak',
    'loudnorm=I=-12:TP=-0.8:LRA=9',
    'alimiter=limit=0.96',
    'areverse',
    'silenceremove=start_periods=1:start_silence=0.1:start_threshold=-46dB:detection=peak',
    'areverse',
    'apad=pad_dur=0.04',
    'afade=t=in:st=0:d=0.002',
    'areverse,afade=t=in:st=0:d=0.1,areverse',
  ].join(',');
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      source,
      '-ac',
      '1',
      '-ar',
      '44100',
      '-sample_fmt',
      's16',
      '-af',
      filter,
      destination,
    ],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    console.error(result.stderr?.slice(-500));
    throw new Error(`ffmpeg failed for ${destination}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const selectedJobs = only ? jobs.filter((job) => job.file === only) : jobs;
  if (!selectedJobs.length) throw new Error(`No sound job matches --only=${only}`);
  validateJobs(selectedJobs);
  if (validateOnly) return;

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    console.error('Missing ELEVENLABS_API_KEY');
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  mkdirSync(tempDir, { recursive: true });

  let written = 0;
  let skipped = 0;
  let failed = 0;
  for (let index = 0; index < selectedJobs.length; index++) {
    const job = selectedJobs[index];
    const destination = join(outDir, job.file);
    const label = `[${index + 1}/${selectedJobs.length}] ${job.file}`;
    if (!force && existsSync(destination)) {
      console.log(`${label} — skip`);
      skipped += 1;
      continue;
    }

    process.stdout.write(`${label} — generating… `);
    try {
      const encoded = await generate(job, apiKey);
      const temp = join(tempDir, `${job.file}.mp3`);
      writeFileSync(temp, encoded);
      convert(temp, destination);
      console.log('ok');
      written += 1;
      await sleep(400);
    } catch (error) {
      console.log('FAIL');
      console.error(`  ${error.message}`);
      failed += 1;
      if (/401|429|quota|credit/i.test(String(error.message))) break;
      await sleep(900);
    }
  }

  console.log(`Done — wrote ${written}, skipped ${skipped}, failed ${failed}`);
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
