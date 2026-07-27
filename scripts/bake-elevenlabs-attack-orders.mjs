/**
 * Faction-specific radio acknowledgements for accepted attack orders.
 * Writes public/sounds/unit-attack-{faction}-NN.wav.
 *
 *   node scripts/bake-elevenlabs-attack-orders.mjs --validate
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-attack-orders.mjs
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-attack-orders.mjs --force
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, '../public/sounds');
const tempDir = join(root, '../.tmp-elevenlabs-attack-orders');
const api = 'https://api.elevenlabs.io/v1/text-to-speech';
const promptLimit = 450;
const force = process.argv.includes('--force');
const validateOnly = process.argv.includes('--validate');
const apiKey = process.env.ELEVENLABS_API_KEY?.trim();

const voices = {
  usa: [
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },
  ],
  uk: [
    { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' },
    { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel' },
  ],
  germany: [
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },
  ],
  russia: [
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
    { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum' },
  ],
};

const lines = {
  usa: [
    'Target acquired. Engaging.',
    'Roger that. Firing on the target.',
    "Target identified. We'll take it out.",
    'Order confirmed. Weapons on target.',
  ],
  uk: [
    'Target acquired. Engaging now.',
    'Right you are. Firing on the target.',
    "Target identified. We'll deal with it.",
    'Order confirmed. Weapons on target.',
  ],
  germany: [
    'Ziel erfasst. Feuer frei!',
    'Befehl bestätigt. Ziel bekämpfen!',
    'Ziel erkannt. Wir greifen an!',
    'Verstanden. Waffen auf das Ziel!',
  ],
  russia: [
    'Цель обнаружена. Открываем огонь!',
    'Приказ принят. Атакуем цель!',
    'Цель подтверждена. Уничтожить!',
    'Понял. Огонь по цели!',
  ],
};

const jobs = Object.entries(lines).flatMap(([faction, factionLines]) =>
  factionLines.map((text, index) => ({
    faction,
    text,
    voice: voices[faction][index % voices[faction].length],
    file: `unit-attack-${faction}-${String(index + 1).padStart(2, '0')}.wav`,
  }))
);

function validateJobs() {
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
  const response = await fetch(`${api}/${job.voice.id}?output_format=mp3_44100_128`, {
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
        stability: 0.46,
        similarity_boost: 0.74,
        style: 0.42,
        use_speaker_boost: true,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function convert(source, destination) {
  const filter = [
    'highpass=f=180',
    'lowpass=f=5200',
    'acompressor=threshold=-17dB:ratio=4.5:attack=4:release=70',
    'equalizer=f=1100:t=q:w=1.0:g=1.8',
    'equalizer=f=2300:t=q:w=1.0:g=2.2',
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
  if (result.status !== 0) {
    console.error(result.stderr?.slice(-500));
    throw new Error(`ffmpeg failed for ${destination}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  validateJobs();
  if (validateOnly) return;
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
    const label = `[${index + 1}/${jobs.length}] ${job.file} [${job.voice.name}]`;
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
