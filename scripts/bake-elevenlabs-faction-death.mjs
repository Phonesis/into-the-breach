/**
 * Faction-specific infantry casualty voices for the USA and UK.
 *
 *   npm run bake-elevenlabs-faction-death -- --validate
 *   npm run bake-elevenlabs-faction-death
 *
 * Set ELEVENLABS_API_KEY securely in the process environment before generation.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, '../public/sounds');
const tempDir = join(tmpdir(), 'ww2-rts-elevenlabs-faction-death');
const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
const force = process.argv.includes('--force');
const validateOnly = process.argv.includes('--validate');
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7) ?? null;
const promptLimit = 450;

const voices = {
  usa: [
    'pNInz6obpgDQGcFmaJgB',
    'VR6AewLTigWG4xSOukaG',
    'ErXwobaYiN019PkySvjV',
  ],
  uk: [
    'JBFqnCBsd6RMkjVDRZzb',
    'onwK4e9ZLuTAKqWW03F9',
    'N2lVS1w4EtoT3dr4eOWO',
  ],
};

const lines = {
  usa: ['Medic!', 'Man down!', "I'm hit!", 'Fall back!', 'Help!', "I'm hit! Get a medic!", 'Get down!', 'No, no!'],
  uk: ['Medic!', 'Man down!', "I'm hit!", 'Fall back!', 'Help!', "I'm hit! Get a medic!", 'Get down!', "Blimey, I'm hit!"],
};

const jobs = Object.entries(lines)
  .flatMap(([faction, factionLines]) =>
    factionLines.map((text, index) => ({
      faction,
      text,
      voice: voices[faction][index % voices[faction].length],
      file: `infantry-death-${faction}-${String(index + 1).padStart(2, '0')}.wav`,
    }))
  )
  .filter((job) => !only || job.faction === only || job.file === only);

function validateJobs() {
  if (!jobs.length) throw new Error(`No casualty jobs match --only=${only}`);
  let invalid = false;
  for (const job of jobs) {
    const length = [...job.text].length;
    const valid = length <= promptLimit;
    console.log(`${valid ? 'ok' : 'INVALID'} ${job.file}: text ${length}/${promptLimit}`);
    invalid ||= !valid;
  }
  if (invalid) process.exit(1);
}

async function generate(job) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${job.voice}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: job.text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.34,
          similarity_boost: 0.72,
          style: 0.56,
          use_speaker_boost: true,
        },
      }),
    }
  );
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}

function convert(source, destination) {
  const filter = [
    'highpass=f=260',
    'lowpass=f=4200',
    'acompressor=threshold=-16dB:ratio=5:attack=4:release=65',
    'equalizer=f=1450:t=q:w=1:g=2.8',
    'loudnorm=I=-18:TP=-1.5:LRA=7',
    'alimiter=limit=0.95',
    'afade=t=in:st=0:d=0.008',
    'areverse,afade=t=in:st=0:d=0.05,areverse',
  ].join(',');
  const result = spawnSync(
    'ffmpeg',
    ['-y', '-i', source, '-ac', '1', '-ar', '44100', '-sample_fmt', 's16', '-af', filter, destination],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr?.slice(-400)}`);
}

function verifyWav(file) {
  const result = spawnSync(
    'ffprobe',
    [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration',
      '-of', 'json',
      file,
    ],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) throw new Error(`ffprobe failed: ${result.stderr?.slice(-400)}`);
  const data = JSON.parse(result.stdout);
  const stream = data.streams?.[0];
  const duration = Number(data.format?.duration);
  if (stream?.codec_name !== 'pcm_s16le' || stream?.sample_rate !== '44100' || stream?.channels !== 1 || !Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Invalid WAV output for ${file}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  validateJobs();
  if (validateOnly) {
    console.log(`Validated ${jobs.length} faction casualty jobs`);
    return;
  }
  if (!apiKey) {
    console.error('Missing ELEVENLABS_API_KEY');
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  mkdirSync(tempDir, { recursive: true });

  let written = 0;
  let skipped = 0;
  let failed = 0;
  for (let index = 0; index < jobs.length; index++) {
    const job = jobs[index];
    const destination = join(outDir, job.file);
    const label = `[${index + 1}/${jobs.length}] ${job.file}`;
    if (!force && existsSync(destination)) {
      console.log(`${label} — skip`);
      skipped += 1;
      continue;
    }
    process.stdout.write(`${label} — generating… `);
    try {
      const encoded = await generate(job);
      const temporary = join(tempDir, `${job.file}.mp3`);
      writeFileSync(temporary, encoded);
      convert(temporary, destination);
      verifyWav(destination);
      console.log('ok');
      written += 1;
      await sleep(350);
    } catch (error) {
      console.log('FAIL');
      console.error(`  ${error.message}`);
      failed += 1;
      if (/401|429|quota|credit/i.test(String(error.message))) break;
      await sleep(850);
    }
  }
  console.log(`Done — wrote ${written}, skipped ${skipped}, failed ${failed}`);
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
