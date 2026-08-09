/**
 * Generate the short M1 Garand en-bloc clip-eject ping via ElevenLabs Sound Effects.
 *
 *   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-garand-ping
 *   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-garand-ping -- --force
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-garand-ping');
const API = 'https://api.elevenlabs.io/v1/sound-generation';
const FILE = 'm1-garand-ping-el-01.wav';
const PROMPT =
  'Single isolated M1 Garand empty en-bloc clip eject ping after the eighth .30-06 round, recorded close to the steel receiver: a hard bright high-pitched metallic ping with a crisp 4 to 6 kilohertz attack and a short natural steel decay, the unmistakable Garand clip sound. No gunshot, rifle report, loading, bolt, clatter, dull clang, bell, musical chime, echo, repeated hits, or voices';
const DURATION_SECONDS = 0.7;
const PROMPT_INFLUENCE = 0.9;
const validateOnly = process.argv.includes('--validate');
const force = process.argv.includes('--force');
const API_KEY = process.env.ELEVENLABS_API_KEY?.trim();

if (!API_KEY && !validateOnly) {
  console.error('Missing ELEVENLABS_API_KEY');
  console.error('  ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-garand-ping');
  process.exit(1);
}

if (PROMPT.length > 450) {
  throw new Error(`Prompt exceeds ElevenLabs 450-character limit: ${PROMPT.length}`);
}

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const GAME_FILTER = [
      'highpass=f=450',
      'lowpass=f=14000',
      'equalizer=f=4200:t=q:w=0.9:g=3.5',
      'equalizer=f=7000:t=q:w=1.0:g=2.0',
  'silenceremove=start_periods=1:start_silence=0.01:start_threshold=-50dB:detection=peak',
  'areverse',
  'silenceremove=start_periods=1:start_silence=0.02:start_threshold=-50dB:detection=peak',
  'areverse',
  'atrim=duration=0.36',
  'asetpts=N/SR/TB',
  'apad=pad_dur=0.02',
  'afade=t=in:st=0:d=0.0015',
  'areverse',
  'afade=t=in:st=0:d=0.055',
  'areverse',
  'loudnorm=I=-16:TP=-1.5:LRA=7',
  'alimiter=limit=0.95',
].join(',');

function convertToGameWav(srcPath, destPath) {
  const result = spawnSync(
    'ffmpeg',
    ['-y', '-i', srcPath, '-ac', '1', '-ar', '44100', '-af', GAME_FILTER, destPath],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    console.error(result.stderr?.slice(-800));
    throw new Error(`ffmpeg failed for ${FILE}`);
  }
}

async function generateSfx() {
  const response = await fetch(`${API}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': API_KEY,
    },
    body: JSON.stringify({
      text: PROMPT,
      model_id: 'eleven_text_to_sound_v2',
      prompt_influence: PROMPT_INFLUENCE,
      duration_seconds: DURATION_SECONDS,
    }),
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  if (validateOnly) {
    console.log(`Validated M1 Garand ping prompt; length is ${PROMPT.length}/450 characters`);
    return;
  }

  const dest = join(OUT, FILE);
  if (existsSync(dest) && !force) {
    console.log(`${FILE} already exists; use --force to regenerate`);
    return;
  }

  process.stdout.write(`Generating ${FILE}… `);
  const mp3 = await generateSfx();
  const tmp = join(TMP, `${FILE}.mp3`);
  writeFileSync(tmp, mp3);
  convertToGameWav(tmp, dest);
  console.log('ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
