/**
 * Faction-specific unit retreat lines via ElevenLabs TTS.
 * Writes public/sounds/unit-retreat-{faction}-NN.wav.
 *
 * Low stability and urgent delivery suit troops breaking contact. The API key
 * stays in the environment and is never written to the repository.
 *
 *   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-retreat
 *   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-retreat -- --force
 */
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-retreat');
const API = 'https://api.elevenlabs.io/v1/text-to-speech';

const API_KEY = process.env.ELEVENLABS_API_KEY?.trim();
if (!API_KEY) {
  console.error('Missing ELEVENLABS_API_KEY');
  console.error('  ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-retreat');
  process.exit(1);
}

const force = process.argv.includes('--force');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

// Free/default multilingual voices used by the existing ElevenLabs voice flow.
const VOICES = {
  usa: [
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },
    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },
  ],
  uk: [
    { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' },
    { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel' },
    { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum' },
  ],
  germany: [
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },
    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },
  ],
  russia: [
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },
    { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum' },
  ],
};

const LINES = {
  usa: [
    "We're breaking! Fall back!",
    'Pull back! Move, move!',
    'Fall back to the rally point!',
    "We can't hold! Get out of here!",
    'Withdraw! Cover the retreat!',
    'Back to HQ! Go!',
  ],
  uk: [
    "We can't hold! Fall back!",
    'Withdraw, lads! Quickly!',
    'Back to the rally point!',
    'Fall back in good order!',
    'Pull out! Cover the withdrawal!',
    'Back to headquarters! Move!',
  ],
  germany: [
    'Wir können die Stellung nicht halten! Zurück!',
    'Rückzug! Los, los!',
    'Zurück zum Sammelpunkt!',
    'Absetzen! Deckt den Rückzug!',
    'Die Stellung ist verloren! Zurück!',
    'Zurück zum Hauptquartier! Schnell!',
  ],
  russia: [
    'Не удержать позицию! Отходим!',
    'Отступаем! Быстро!',
    'Назад к сборному пункту!',
    'Отходим! Прикройте отход!',
    'Позиция потеряна! Назад!',
    'К штабу! Быстро!',
  ],
};

const RETREAT_AF =
  'highpass=f=260,lowpass=f=4200,' +
  'acompressor=threshold=-15dB:ratio=6:attack=3:release=55,' +
  'equalizer=f=1450:t=q:w=1.0:g=3.2,' +
  'equalizer=f=850:t=q:w=1.0:g=1.5,' +
  'loudnorm=I=-18:TP=-1.5:LRA=7';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tts(voiceId, text) {
  const response = await fetch(`${API}/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': API_KEY,
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.3,
        similarity_boost: 0.72,
        style: 0.58,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`TTS ${response.status}: ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function convert(srcPath, destPath) {
  const result = spawnSync(
    'ffmpeg',
    ['-y', '-i', srcPath, '-ac', '1', '-ar', '44100', '-af', RETREAT_AF, destPath],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    console.error(result.stderr?.slice(-400));
    throw new Error(`ffmpeg failed ${destPath}`);
  }
}

async function main() {
  const count = LINES.usa.length;
  console.log(`ElevenLabs retreat TTS — ${Object.keys(LINES).length} factions × ${count} lines`);
  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (const [faction, lines] of Object.entries(LINES)) {
    const voices = VOICES[faction];
    console.log(`\n=== ${faction} ===`);
    for (let i = 0; i < lines.length; i++) {
      const num = String(i + 1).padStart(2, '0');
      const outName = `unit-retreat-${faction}-${num}.wav`;
      const dest = join(OUT, outName);
      if (!force && existsSync(dest)) {
        console.log(`  ${num} skip`);
        skipped += 1;
        continue;
      }

      const text = lines[i];
      const voice = voices[i % voices.length];
      process.stdout.write(`  ${num} [${voice.name}] ${text.slice(0, 42)}… `);
      try {
        const mp3 = await tts(voice.id, text);
        const tmp = join(TMP, `${outName}.mp3`);
        writeFileSync(tmp, mp3);
        convert(tmp, dest);
        console.log('ok');
        written += 1;
        await sleep(350);
      } catch (error) {
        console.log('FAIL');
        console.error(`    ${error.message}`);
        failed += 1;
        if (String(error.message).includes('401')) process.exit(1);
        if (/429|quota|credit/i.test(error.message)) {
          console.error('Quota hit — stopping.');
          console.log(`\nPartial — wrote ${written}, skipped ${skipped}, failed ${failed}`);
          process.exit(1);
        }
        await sleep(800);
      }
    }
  }

  console.log(`\nDone — wrote ${written}, skipped ${skipped}, failed ${failed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
