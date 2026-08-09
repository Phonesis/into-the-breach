/**
 * Generate the original orchestral main-menu theme with ElevenLabs Music v2.
 *
 *   npm run generate-menu-music -- --validate
 *   ELEVENLABS_API_KEY=... npm run generate-menu-music -- --force
 *
 * The API key must stay in the process environment. The downloaded MP3 is kept
 * in the system temporary directory; only the loop-ready OGG is written to the
 * repository.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, '../public/music/menu-theme.ogg');
const temporary = join(tmpdir(), 'ww2-rts-elevenlabs-menu-theme.mp3');
const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
const force = process.argv.includes('--force');
const validateOnly = process.argv.includes('--validate');
const durationMs = 90_000;
const loopCrossfadeSec = 4;
const promptLimit = 4_100;

// Stylistic era: late-90s / early-2000s war games (Medal of Honor, Hidden & Dangerous)
// mood — original writing only; never quote those scores.
const prompt = [
  'Original instrumental main-menu theme for a serious World War Two tactical strategy game.',
  'Late-1990s classic PC war-game orchestral atmosphere: dramatic, sombre, and haunted,',
  'in the spirit of Medal of Honor and Hidden & Dangerous film-score drama — without quoting',
  'or imitating any existing theme. Roughly 72 BPM in C minor / E-flat minor colors.',
  'Instrumentation: low strings and cellos in dark ostinato, mournful French horns and muted',
  'trombones, lonely solo trumpet, woodwinds, soft choir-like string pads without voices,',
  'distant military snare, timpani, and restrained concert bass drum. Begin sparsely with cold',
  'low strings and a fragile horn motif suggesting loss and dread; build with uneasy counterpoint,',
  'marching snare, and tragic brass; swell to a dramatic, grim full-orchestra climax that feels',
  'heroic yet devastated — undertones of tragedy, horror, and the cost of war; then recede into',
  'the same sparse, mournful texture as the opening so the track loops cleanly. Memorable',
  'melody, dignified, human, and bleak. Instrumental only. Authentic acoustic symphony orchestra,',
  'wide cinematic stereo, dry natural hall reverb. No vocals, lyrics, modern synths, electric',
  'guitar, rock kit, EDM, trailer braams, oversized hybrid percussion, sound effects, gunfire,',
  'explosions, radio noise, abrupt ending, or cheerful triumphant fanfare.',
].join(' ');

function validate() {
  const length = [...prompt].length;
  const valid =
    length <= promptLimit &&
    durationMs >= 3_000 &&
    durationMs <= 600_000 &&
    loopCrossfadeSec > 0 &&
    loopCrossfadeSec * 1_000 < durationMs;
  console.log(
    `${valid ? 'ok' : 'INVALID'} menu-theme.ogg: prompt ${length}/${promptLimit}, ` +
      `${durationMs / 1_000}s source, ${loopCrossfadeSec}s loop crossfade`
  );
  if (!valid) process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr?.slice(-700)}`);
  }
  return result.stdout;
}

function probe(file) {
  const raw = run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=codec_name,sample_rate,channels:format=duration',
    '-of',
    'json',
    file,
  ]);
  return JSON.parse(raw);
}

function convertToLoop(source, destination) {
  const sourceInfo = probe(source);
  const sourceDuration = Number(sourceInfo.format?.duration);
  if (!Number.isFinite(sourceDuration) || sourceDuration <= loopCrossfadeSec + 5) {
    throw new Error(`Generated music is unexpectedly short: ${sourceDuration}s`);
  }

  const filter = [
    `[0:a]aresample=44100,atrim=start=${loopCrossfadeSec},asetpts=PTS-STARTPTS[body]`,
    `[1:a]aresample=44100,atrim=start=0:end=${loopCrossfadeSec},asetpts=PTS-STARTPTS[head]`,
    `[body][head]acrossfade=d=${loopCrossfadeSec}:c1=qsin:c2=qsin,` +
      'highpass=f=25,lowpass=f=18000,loudnorm=I=-17:TP=-1.5:LRA=12[out]',
  ].join(';');

  run('ffmpeg', [
    '-y',
    '-i',
    source,
    '-i',
    source,
    '-filter_complex',
    filter,
    '-map',
    '[out]',
    '-ac',
    '2',
    '-ar',
    '44100',
    '-c:a',
    'libvorbis',
    '-q:a',
    '6',
    '-metadata',
    'title=Into the Breach - Main Theme',
    destination,
  ]);
}

function verifyOutput(file) {
  const data = probe(file);
  const stream = data.streams?.[0];
  const duration = Number(data.format?.duration);
  if (
    stream?.codec_name !== 'vorbis' ||
    stream?.sample_rate !== '44100' ||
    stream?.channels !== 2 ||
    !Number.isFinite(duration) ||
    duration < 60
  ) {
    throw new Error(`Invalid menu-theme output: ${JSON.stringify(data)}`);
  }
  console.log(`verified menu-theme.ogg: ${duration.toFixed(2)}s stereo Vorbis at 44.1 kHz`);
}

async function main() {
  validate();
  if (validateOnly) return;
  if (!apiKey) {
    console.error('Missing ELEVENLABS_API_KEY');
    process.exit(1);
  }
  if (existsSync(output) && !force) {
    console.log('menu-theme.ogg exists — use --force to replace it');
    return;
  }

  const response = await fetch(
    'https://api.elevenlabs.io/v1/music?output_format=mp3_48000_192',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        prompt,
        music_length_ms: durationMs,
        model_id: 'music_v2',
        force_instrumental: true,
        sign_with_c2pa: false,
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
  }

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(temporary, Buffer.from(await response.arrayBuffer()));
  convertToLoop(temporary, output);
  verifyOutput(output);
  console.log('wrote public/music/menu-theme.ogg');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
