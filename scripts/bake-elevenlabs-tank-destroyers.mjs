/** Dedicated tank-destroyer engines, cannon reports, and defensive MGs via ElevenLabs. */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, '../public/sounds');
const tempDir = join(root, '../.tmp-elevenlabs-tank-destroyers');
const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
const force = process.argv.includes('--force');
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length) ?? null;
if (!apiKey) {
  console.error('Missing ELEVENLABS_API_KEY');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
mkdirSync(tempDir, { recursive: true });

const clean = 'authentic outdoor field recording, dry, no music, no voices, no cinematic effects';
const jobs = [
  {
    file: 'engine-tank-destroyer-germany.wav', duration: 4.5, loop: true, kind: 'engine',
    text: `Seamless loop of a World War Two German Jagdpanther Maybach HL230 V12 gasoline engine moving under load, deep uneven exhaust pulses, heavy Panther tracks and final-drive clatter, ${clean}`,
  },
  {
    file: 'engine-tank-destroyer-usa.wav', duration: 4.5, loop: true, kind: 'engine',
    text: `Seamless loop of a World War Two American M10 Wolverine twin General Motors diesel engine cruising, paired diesel rumble, Sherman-pattern tracks and transmission clatter, ${clean}`,
  },
  {
    file: 'engine-tank-destroyer-uk.wav', duration: 4.5, loop: true, kind: 'engine',
    text: `Seamless loop of a British Achilles tank destroyer twin General Motors diesel engine under load, steady paired diesel growl, M10 tracks and drivetrain clatter, ${clean}`,
  },
  {
    file: 'engine-tank-destroyer-russia.wav', duration: 4.5, loop: true, kind: 'engine',
    text: `Seamless loop of a Soviet SU-100 V-2-34 V12 diesel engine moving under load, deep diesel rumble, five-wheel T-34 track clatter and mechanical vibration, ${clean}`,
  },
  {
    file: 'td-88-germany.wav', duration: 1.25, kind: 'cannon',
    text: `German Jagdpanther long 8.8 cm Pak 43 anti-tank cannon firing one round, violent sharp muzzle crack followed by a huge deep pressure boom and short open-field decay, ${clean}`,
  },
  {
    file: 'td-76-usa.wav', duration: 1.1, kind: 'cannon',
    text: `American M10 Wolverine 3-inch M7 anti-tank cannon firing one round, hard high-velocity crack, heavy powder blast and deep outdoor boom, ${clean}`,
  },
  {
    file: 'td-17pdr-uk.wav', duration: 1.15, kind: 'cannon',
    text: `British Achilles 17-pounder anti-tank cannon firing one round, fierce high-velocity crack and powerful deep muzzle blast in an open field, ${clean}`,
  },
  {
    file: 'td-100-russia.wav', duration: 1.25, kind: 'cannon',
    text: `Soviet SU-100 100 mm D-10S anti-tank cannon firing one round, enormous hard muzzle report, deep bass pressure thump and brief outdoor echo, ${clean}`,
  },
  {
    file: 'td-mg-germany.wav', duration: 0.85, kind: 'mg',
    text: `Short burst from a hull-mounted German MG34 machine gun outdoors, six distinct fast 7.92 mm reports with realistic mechanical cadence, ${clean}`,
  },
  {
    file: 'td-mg-usa.wav', duration: 0.95, kind: 'mg',
    text: `Short burst from a turret-mounted American Browning M2 fifty caliber heavy machine gun outdoors, four slow powerful shots with deep concussive reports, ${clean}`,
  },
  {
    file: 'td-mg-uk.wav', duration: 0.85, kind: 'mg',
    text: `Short burst from the turret-mounted Browning M2 fifty caliber heavy machine gun on a British Achilles tank destroyer, four slow powerful shots outdoors with deep concussive reports, ${clean}`,
  },
];

async function generate(job) {
  const response = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      text: job.text,
      model_id: 'eleven_text_to_sound_v2',
      duration_seconds: job.duration,
      prompt_influence: job.kind === 'engine' ? 0.42 : 0.62,
      loop: job.loop === true,
    }),
  });
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}

function convert(source, job) {
  const filters = job.kind === 'engine'
    ? 'highpass=f=42,lowpass=f=4800,equalizer=f=90:t=q:w=0.8:g=3,equalizer=f=220:t=q:w=0.9:g=2,afade=t=in:st=0:d=0.07,areverse,afade=t=in:st=0:d=0.07,areverse,loudnorm=I=-16:TP=-1.5:LRA=8,alimiter=limit=0.94'
    : job.kind === 'mg'
      ? 'highpass=f=55,lowpass=f=10500,loudnorm=I=-14:TP=-1.2:LRA=7,alimiter=limit=0.95'
      : 'highpass=f=30,lowpass=f=11000,equalizer=f=70:t=q:w=0.8:g=3,loudnorm=I=-13:TP=-1.0:LRA=9,alimiter=limit=0.96';
  const result = spawnSync('ffmpeg', [
    '-y', '-i', source, '-ac', '1', '-ar', '44100', '-af', filters, join(outDir, job.file),
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr?.slice(-300)}`);
}

const selectedJobs = only ? jobs.filter((job) => job.file === only) : jobs;
if (!selectedJobs.length) throw new Error(`No sound job matches --only=${only}`);

for (let index = 0; index < selectedJobs.length; index++) {
  const job = selectedJobs[index];
  const destination = join(outDir, job.file);
  if (!force && existsSync(destination)) {
    console.log(`[${index + 1}/${selectedJobs.length}] ${job.file} — skip`);
    continue;
  }
  process.stdout.write(`[${index + 1}/${selectedJobs.length}] ${job.file} — generating... `);
  try {
    const mp3 = await generate(job);
    const temp = join(tempDir, `${job.file}.mp3`);
    writeFileSync(temp, mp3);
    convert(temp, job);
    console.log('ok');
  } catch (error) {
    console.log('FAIL');
    console.error(error.message);
    if (/401|quota|credit|429/i.test(error.message)) process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 450));
}
