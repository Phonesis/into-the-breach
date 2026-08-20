/**
 * Generate short faction-specific victory / defeat stingers with ElevenLabs Music v2.
 *
 *   npm run generate-end-music -- --validate
 *   ELEVENLABS_API_KEY=... npm run generate-end-music -- --force
 *   ELEVENLABS_API_KEY=... npm run generate-end-music -- --only=usa
 *   ELEVENLABS_API_KEY=... npm run generate-end-music -- --only=germany-defeat
 *
 * Original instrumental cues only. The API key stays in the process environment.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, '../public/music');
const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
const force = process.argv.includes('--force');
const validateOnly = process.argv.includes('--validate');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const onlyFilter = onlyArg ? onlyArg.slice('--only='.length).toLowerCase() : null;
const durationMs = 18_000;
const promptLimit = 4_100;
const fadeInSec = 0.06;
const fadeOutSec = 1.45;

const SHARED = [
  'Complete original instrumental stinger that begins, develops, and resolves inside eighteen seconds.',
  'Studio-grade recording, wide stereo, natural acoustic instruments.',
  'No vocals, lyrics, choir singing words, electric guitar, modern synths, EDM, trailer braams,',
  'hybrid boom percussion, gunfire, explosions, radio noise, or abrupt cut-off.',
  'Do not quote, cover, or interpolate any existing anthem, hymn, march, or popular song.',
].join(' ');

const TRACKS = [
  {
    id: 'germany-victory',
    faction: 'germany',
    outcome: 'victory',
    title: 'Into the Breach - Germany Victory',
    prompt: [
      'Original 18-second World War Two German military-band victory stinger.',
      '1943 Wehrmacht parade-ground brass band, 118 BPM, B-flat major.',
      'Instrumentation: bright trumpets, trombones, tuba, french horns, crisp military snare, bass drum, cymbals.',
      'Start with a snare roll and unison brass pickup, then a proud Prussian-style march fanfare,',
      'disciplined and ceremonial, swelling to a decisive final brass cadence.',
      'Inspired by historic German military march tradition — original melody only.',
      'Outdoor parade-ground, dry-bright brass, close snare, short natural outdoor reverb.',
      SHARED,
    ].join(' '),
  },
  {
    id: 'germany-defeat',
    faction: 'germany',
    outcome: 'defeat',
    title: 'Into the Breach - Germany Defeat',
    prompt: [
      'Original 18-second World War Two German military-band defeat stinger.',
      'Slow funeral march, 64 BPM, E-flat minor.',
      'Instrumentation: muffled felt snare, low trombones and tuba in a descending chorale,',
      'muted trumpets, distant bass drum, sombre french horns.',
      'Start sparse and cold, a grim Prussian military-band lament, dignified and heavy,',
      'ending on a held low brass chord that dies away.',
      'Inspired by historic German military funeral-march tradition — original melody only.',
      'Winter parade-ground, cold hall reverb, no voices.',
      SHARED,
    ].join(' '),
  },
  {
    id: 'usa-victory',
    faction: 'usa',
    outcome: 'victory',
    title: 'Into the Breach - USA Victory',
    prompt: [
      'Original 18-second 1940s American big-band swing victory stinger.',
      '1944 USO dance-band jazz, 164 BPM, F major, hard swing.',
      'Instrumentation: punchy trumpets and trombones, saxophone section riffs, walking upright bass,',
      'ride cymbal and snare, stride piano comps.',
      'Start with a brass stab and snare pickup, then a short triumphant shout-chorus that swings hard,',
      'ending on a bright big-band button.',
      'Wartime radio-broadcast celebration energy, original jazz tune only.',
      'Close-mic studio big band, tape warmth, light plate reverb.',
      SHARED,
    ].join(' '),
  },
  {
    id: 'usa-defeat',
    faction: 'usa',
    outcome: 'defeat',
    title: 'Into the Breach - USA Defeat',
    prompt: [
      'Original 18-second 1940s American jazz defeat cue.',
      'Slow blues ballad, 62 BPM, D minor.',
      'Instrumentation: muted trumpet melody, smoky tenor saxophone, brushed snare, barely-moving walking bass, sparse piano.',
      'Start intimate and heartbroken, after-hours nightclub mood when the war news is bad,',
      'ending on an unresolved muted-trumpet tone that fades.',
      'Original jazz melody only, no swing-upbeat chorus.',
      'Close, tape-warm, small-room recording.',
      SHARED,
    ].join(' '),
  },
  {
    id: 'uk-victory',
    faction: 'uk',
    outcome: 'victory',
    title: 'Into the Breach - UK Victory',
    prompt: [
      'Original 18-second British military brass-band victory stinger.',
      '1940s Royal Marines / Guards band, 112 BPM, E-flat major.',
      'Instrumentation: cornets, trombones, euphonium, tuba, snare, bass drum, cymbals.',
      'Start with a snare roll and brass call, then a dignified ceremonial fanfare in the British military-band tradition,',
      'proud and resolute, ending on a short triumphant cadence.',
      'Original melody only.',
      'Outdoor parade-ground, bright brass, crisp snare, short natural reverb.',
      SHARED,
    ].join(' '),
  },
  {
    id: 'uk-defeat',
    faction: 'uk',
    outcome: 'defeat',
    title: 'Into the Breach - UK Defeat',
    prompt: [
      'Original 18-second British military defeat stinger.',
      'Slow bugle lament, 56 BPM, G minor.',
      'Instrumentation: solo military bugle, muffled drums, low brass chorale.',
      'Start with a distant bugle call over quiet drums, then a somber brass hymn of loss,',
      'dusk parade-ground, airy and dignified, ending on a long fading bugle tone.',
      'Last-Post-inspired mood with a fully original melody — do not quote any known bugle call.',
      SHARED,
    ].join(' '),
  },
  {
    id: 'russia-victory',
    faction: 'russia',
    outcome: 'victory',
    title: 'Into the Breach - Russia Victory',
    prompt: [
      'Original 18-second Soviet wartime military-band victory stinger.',
      '1943 Red Army brass band, 120 BPM, C major with heroic minor color.',
      'Instrumentation: massive brass, snare, bass drum, cymbals, optional accordion color, low strings.',
      'Start with a drum cadence and rising brass, then a powerful anthemic march fanfare',
      'in the Soviet military-song tradition, swelling to a heroic cadence.',
      'Original melody only, no choir singing words.',
      'Outdoor winter square, large band, bold and bright.',
      SHARED,
    ].join(' '),
  },
  {
    id: 'russia-defeat',
    faction: 'russia',
    outcome: 'defeat',
    title: 'Into the Breach - Russia Defeat',
    prompt: [
      'Original 18-second Soviet wartime defeat lament.',
      'Slow tragic dirge, 52 BPM, D minor.',
      'Instrumentation: low strings, accordion, muted brass, muffled bass drum.',
      'Start with a heavy accordion and string figure, snowbound and grim,',
      'then a descending brass chorale ending on a held low chord that fades.',
      'Original Russian funeral-march melody only, no vocals.',
      'Cold, distant, natural hall.',
      SHARED,
    ].join(' '),
  },
  {
    id: 'japan-victory',
    faction: 'japan',
    outcome: 'victory',
    title: 'Into the Breach - Japan Victory',
    prompt: [
      'Original 18-second Imperial Japanese wartime military-band victory stinger.',
      '1940s military brass mixed with traditional color, 116 BPM, pentatonic major.',
      'Instrumentation: military brass and snare, taiko drums, bamboo flute accents.',
      'Start with taiko and a brass call, then a rising ceremonial pentatonic fanfare,',
      'ending on a short triumphant cadence.',
      'Original melody only, not any national anthem.',
      'Outdoor ceremonial ground, dry-bright brass, tight taiko.',
      SHARED,
    ].join(' '),
  },
  {
    id: 'japan-defeat',
    faction: 'japan',
    outcome: 'defeat',
    title: 'Into the Breach - Japan Defeat',
    prompt: [
      'Original 18-second Japanese wartime defeat lament.',
      'Slow pentatonic minor, 54 BPM.',
      'Instrumentation: solo shakuhachi-like bamboo flute, quiet taiko, sparse low strings, distant muted brass.',
      'Start with a lone flute phrase, then a mournful ceremonial lament, ending on a fading flute tone.',
      'Original melody only. Sparse, intimate, natural room.',
      SHARED,
    ].join(' '),
  },
];

function matchesFilter(track) {
  if (!onlyFilter) return true;
  return (
    track.id === onlyFilter ||
    track.faction === onlyFilter ||
    track.outcome === onlyFilter
  );
}

function validate() {
  let ok = true;
  for (const track of TRACKS) {
    const length = [...track.prompt].length;
    const valid = length <= promptLimit && durationMs >= 3_000 && durationMs <= 600_000;
    console.log(
      `${valid ? 'ok' : 'INVALID'} ${track.id}: prompt ${length}/${promptLimit}, ${durationMs / 1_000}s`
    );
    if (!valid) ok = false;
  }
  if (!ok) process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr?.slice(-900) || result.stdout?.slice(-900)}`);
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

function convert(source, destination, title) {
  const sourceInfo = probe(source);
  const sourceDuration = Number(sourceInfo.format?.duration);
  if (!Number.isFinite(sourceDuration) || sourceDuration < 8) {
    throw new Error(`Generated music is unexpectedly short: ${sourceDuration}s`);
  }
  const filter = [
    'aresample=44100',
    'silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.03:detection=peak',
    `afade=t=in:st=0:d=${fadeInSec}`,
    'areverse',
    `afade=t=in:st=0:d=${fadeOutSec}`,
    'areverse',
    'highpass=f=25',
    'lowpass=f=18000',
    'loudnorm=I=-16:TP=-1.5:LRA=11',
  ].join(',');

  run('ffmpeg', [
    '-y',
    '-i',
    source,
    '-af',
    filter,
    '-ac',
    '2',
    '-ar',
    '44100',
    '-c:a',
    'libvorbis',
    '-q:a',
    '6',
    '-metadata',
    `title=${title}`,
    destination,
  ]);
}

function verifyOutput(file, id) {
  const data = probe(file);
  const stream = data.streams?.[0];
  const duration = Number(data.format?.duration);
  if (
    stream?.codec_name !== 'vorbis' ||
    stream?.sample_rate !== '44100' ||
    stream?.channels !== 2 ||
    !Number.isFinite(duration) ||
    duration < 8
  ) {
    throw new Error(`Invalid ${id} output: ${JSON.stringify(data)}`);
  }
  console.log(`verified ${id}: ${duration.toFixed(2)}s stereo Vorbis at 44.1 kHz`);
}

async function generateOne(track) {
  const destination = join(outDir, `${track.outcome}-${track.faction}.ogg`);
  if (existsSync(destination) && !force) {
    console.log(`${track.id} exists — use --force to replace it`);
    return { id: track.id, skipped: true };
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
        prompt: track.prompt,
        music_length_ms: durationMs,
        model_id: 'music_v2',
        force_instrumental: true,
        sign_with_c2pa: false,
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`${track.id}: ElevenLabs ${response.status}: ${await response.text()}`);
  }

  const temporary = join(tmpdir(), `ww2-rts-end-${track.id}.mp3`);
  writeFileSync(temporary, Buffer.from(await response.arrayBuffer()));
  convert(temporary, destination, track.title);
  verifyOutput(destination, track.id);
  console.log(`wrote public/music/${track.outcome}-${track.faction}.ogg`);
  return { id: track.id, skipped: false };
}

async function withRetry(track, attempts = 2) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await generateOne(track);
    } catch (error) {
      lastError = error;
      console.error(`${track.id} attempt ${i + 1} failed: ${error.message}`);
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  throw lastError;
}

async function main() {
  validate();
  if (validateOnly) return;
  if (!apiKey) {
    console.error('Missing ELEVENLABS_API_KEY');
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  const selected = TRACKS.filter(matchesFilter);
  if (!selected.length) {
    console.error(`No tracks match --only=${onlyFilter}`);
    process.exit(1);
  }

  const failures = [];
  // Two at a time so a full bake is not strictly serial, without slamming the API.
  for (let i = 0; i < selected.length; i += 2) {
    const batch = selected.slice(i, i + 2);
    const results = await Promise.allSettled(batch.map((track) => withRetry(track)));
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        failures.push(`${batch[index].id}: ${result.reason?.message ?? result.reason}`);
      }
    });
  }

  if (failures.length) {
    console.error(`Failed:\n${failures.join('\n')}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
