/**
 * Generate a sad, reflective War Stats memorial theme with ElevenLabs Music v2.
 *
 *   npm run generate-war-stats-music -- --validate
 *   ELEVENLABS_API_KEY=... npm run generate-war-stats-music -- --force
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
const output = join(root, '../public/music/war-stats-theme.ogg');
const temporary = join(tmpdir(), 'ww2-rts-elevenlabs-war-stats-theme.mp3');
const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
const force = process.argv.includes('--force');
const validateOnly = process.argv.includes('--validate');
const durationMs = 90_000;
const loopCrossfadeSec = 5;
const promptLimit = 4_100;

const prompt = [
  'Original instrumental memorial piece for a World War Two strategy game war-losses screen.',
  'Sad, reflective, and dignified 1940s wartime concert-hall music: a quiet cemetery lament,',
  'not a battle march. Roughly 56 BPM in D minor / F minor colors. Sparse and human.',
  'Instrumentation: muted solo trumpet playing a slow original falling motif, low strings and',
  'solo cello, a lonely French horn, soft woodwinds, and barely-there timpani rolls. No choir.',
  'Begin with a long held string chord and a fragile trumpet phrase suggesting empty fields and',
  'names never spoken; the middle brings a gentle, grieving string hymn that never rises to',
  'triumph; then recede into the same sparse opening so the piece loops cleanly. Intimate,',
  'reverent, and still. Authentic acoustic chamber orchestra, close-miked with a distant hall.',
  'Instrumental only. No vocals, lyrics, Taps, Last Post, Reveille, national anthems, bagpipes,',
  'modern synths, electric guitar, rock kit, EDM, trailer braams, gunfire, explosions, radio',
  'noise, abrupt ending, or cheerful fanfare.',
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
    `${valid ? 'ok' : 'INVALID'} war-stats-theme.ogg: prompt ${length}/${promptLimit}, ` +
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
      'highpass=f=25,lowpass=f=16000,loudnorm=I=-19:TP=-1.8:LRA=11[out]',
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
    'title=Into the Breach - War Stats Memorial',
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
    throw new Error(`Invalid war-stats-theme output: ${JSON.stringify(data)}`);
  }
  console.log(`verified war-stats-theme.ogg: ${duration.toFixed(2)}s stereo Vorbis at 44.1 kHz`);
}

async function main() {
  validate();
  if (validateOnly) return;
  if (!apiKey) {
    console.error('Missing ELEVENLABS_API_KEY');
    process.exit(1);
  }
  if (existsSync(output) && !force) {
    console.log('war-stats-theme.ogg exists — use --force to replace it');
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
  console.log('wrote public/music/war-stats-theme.ogg');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
