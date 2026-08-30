/**
 * Generate WW2-styled achievement stings with ElevenLabs Sound Effects.
 *
 *   npm run bake-elevenlabs-achievements -- --validate
 *   ELEVENLABS_API_KEY=... npm run bake-elevenlabs-achievements -- --force
 *
 * The API key is read only from the process environment and is never written.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const outputDir = join(root, '../public/sounds');
const temporaryDir = join(tmpdir(), 'ww2-rts-elevenlabs-achievements');
const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
const validateOnly = process.argv.includes('--validate');
const force = process.argv.includes('--force');
const promptLimit = 450;

const catalog = [
  {
    file: 'achievement-medal.wav',
    duration: 3.2,
    influence: 0.68,
    prompt: 'Short dignified World War Two military medal presentation sting: one crisp parade snare flourish, restrained brass fanfare with muted trumpet and French horn, then a firm ceremonial final chord. Authentic 1940s acoustic instruments, inspiring and prestigious, no speech, no gunfire, no modern synth, no long reverb, no national anthem.',
  },
  {
    file: 'achievement-ribbon.wav',
    duration: 2.35,
    influence: 0.7,
    prompt: 'Short positive World War Two service ribbon award cue: two light military snare taps, warm muted trumpet rising phrase, subtle brass resolution. Authentic restrained 1940s field headquarters ceremony, proud but not grand, no speech, no battle sounds, no modern synth, no national anthem.',
  },
  {
    file: 'achievement-commendation.wav',
    duration: 1.75,
    influence: 0.72,
    prompt: 'Brief World War Two headquarters commendation sound: mechanical field typewriter finishing a line, paper bell ding, then one soft approving muted brass chord. Clear, satisfying and period authentic, no speech, no gunfire, no modern electronic sounds, no music bed.',
  },
];

function validate() {
  let valid = true;
  for (const job of catalog) {
    const length = [...job.prompt].length;
    const ok = length <= promptLimit && job.duration >= 0.5 && job.duration <= 30;
    console.log(`${ok ? 'ok' : 'INVALID'} ${job.file}: prompt ${length}/${promptLimit}, ${job.duration}s`);
    valid &&= ok;
  }
  if (!valid) process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr?.slice(-600)}`);
  return result.stdout;
}

function convert(source, destination, duration) {
  const fadeStart = Math.max(0.2, duration - 0.18);
  run('ffmpeg', [
    '-y', '-i', source, '-ac', '1', '-ar', '44100',
    '-af', `highpass=f=45,lowpass=f=14500,afade=t=in:st=0:d=0.015,afade=t=out:st=${fadeStart}:d=0.18,loudnorm=I=-16:TP=-1.2:LRA=8,alimiter=limit=0.96`,
    '-c:a', 'pcm_s16le', destination,
  ]);
}

function verify(file) {
  const result = JSON.parse(run('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration',
    '-of', 'json', file,
  ]));
  const stream = result.streams?.[0];
  const duration = Number(result.format?.duration);
  if (
    stream?.codec_name !== 'pcm_s16le' ||
    stream?.sample_rate !== '44100' ||
    stream?.channels !== 1 ||
    !Number.isFinite(duration) || duration < 0.5 || duration > 30
  ) {
    throw new Error(`Invalid output ${file}: ${JSON.stringify(result)}`);
  }
  console.log(`verified ${file}: ${duration.toFixed(2)}s pcm_s16le 44100 Hz mono`);
}

async function generate(job) {
  const response = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      text: job.prompt,
      model_id: 'eleven_text_to_sound_v2',
      prompt_influence: job.influence,
      duration_seconds: job.duration,
    }),
  });
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  validate();
  if (validateOnly) return;
  if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY');
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(temporaryDir, { recursive: true });

  for (const job of catalog) {
    const destination = join(outputDir, job.file);
    if (existsSync(destination) && !force) {
      console.log(`skip ${job.file}; use --force to replace`);
      continue;
    }
    console.log(`generating ${job.file}`);
    const temporary = join(temporaryDir, `${job.file}.mp3`);
    writeFileSync(temporary, await generate(job));
    convert(temporary, destination, job.duration);
    verify(destination);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
