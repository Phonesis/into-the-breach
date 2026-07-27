/**
 * Dedicated ElevenLabs artillery audio for on-map guns, fire-support salvos,
 * and shell impacts.
 * Writes mono 44.1 kHz WAVs into public/sounds.
 *
 *   npm run bake-elevenlabs-artillery -- --validate
 *   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-artillery -- --guns-only --force
 *   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-artillery -- --firing-only --force
 *   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-artillery
 *   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-artillery -- --force
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-artillery');
const API = 'https://api.elevenlabs.io/v1/sound-generation';
const PROMPT_LIMIT = 450;
const force = process.argv.includes('--force');
const validateOnly = process.argv.includes('--validate');
const gunsOnly = process.argv.includes('--guns-only');
const firingOnly = process.argv.includes('--firing-only');

const REAL =
  'authentic World War Two battlefield field recording, outdoor open terrain, powerful natural low end, realistic pressure and distance, no music, no voices, no synthetic sound, no trailer sound design';
const GUN_REAL =
  'authentic World War Two outdoor field recording, natural low end, no music, voices, synthetic sound, or trailer design';

const CATALOG = [
  {
    file: 'howitzer-105-germany.wav',
    duration: 2.7,
    kind: 'gun',
    influence: 0.72,
    text: `Close German 10.5 cm leFH 18 howitzer firing one full-charge round, hard muzzle crack and enormous pressure punch, deep cannon body, carriage recoil and brief breech rattle, powerful open-field thunder decay, no shell impact, ${GUN_REAL}`,
  },
  {
    file: 'howitzer-105-usa.wav',
    duration: 2.7,
    kind: 'gun',
    influence: 0.72,
    text: `Close American 105 mm M2A1 howitzer firing one full-charge round, violent dry muzzle blast and chest-hitting pressure wave, deep cannon boom, recoil and carriage clank, broad outdoor thunder tail, no shell impact, ${GUN_REAL}`,
  },
  {
    file: 'howitzer-25pdr-uk.wav',
    duration: 2.45,
    kind: 'gun',
    influence: 0.74,
    text: `Close British QF 25-pounder firing one service round, extremely sharp muzzle crack and dense concussive boom, heavy powder blast, recoil and breech clatter, open-country echo and low thunder decay, no shell impact, ${GUN_REAL}`,
  },
  {
    file: 'howitzer-122-russia.wav',
    duration: 3,
    kind: 'gun',
    influence: 0.74,
    text: `Close Soviet 122 mm M-30 howitzer firing one full-charge round, massive brutal muzzle crack, body-felt pressure blast and very deep cannon roar, heavy carriage recoil and short clank, long natural battlefield thunder, no shell impact, ${GUN_REAL}`,
  },
  {
    file: 'barrage-salvo-el-01.wav',
    duration: 5.5,
    kind: 'salvo',
    influence: 0.62,
    text: `World War Two field artillery battery firing a rapid six-gun salvo from beyond the front line, distinct heavy cannon reports rolling into sustained thunder, powder blast and distant echoes, ${REAL}`,
  },
  {
    file: 'barrage-salvo-el-02.wav',
    duration: 5.8,
    kind: 'salvo',
    influence: 0.58,
    text: `A massed World War Two howitzer battery opens fire outdoors, staggered deep gun blasts and concussive rolling rumble, urgent violent fire-for-effect salvo, each cannon report remains distinct, ${REAL}`,
  },
  {
    file: 'creeping-barrage-salvo-el-01.wav',
    duration: 6.8,
    kind: 'salvo',
    influence: 0.6,
    text: `Sustained World War Two creeping barrage battery fire, waves of heavy field guns firing in sequence, relentless rolling cannon thunder moving along a front, distinct concussive reports with long distant rumble, ${REAL}`,
  },
  {
    file: 'creeping-barrage-salvo-el-02.wav',
    duration: 7.2,
    kind: 'salvo',
    influence: 0.58,
    text: `Large World War Two artillery battery maintaining a creeping barrage, repeated staggered howitzer blasts building into dramatic rolling thunder, deep powder charges and battlefield echoes, no shell impacts, ${REAL}`,
  },
  {
    file: 'artillery-impact-el-01.wav',
    duration: 2.6,
    kind: 'impact',
    influence: 0.64,
    text: `Immediate close World War Two 105 mm high-explosive artillery shell detonation in packed earth, brutal sharp crack followed by a deep body-felt blast, heavy dirt and rock shower, natural rumbling decay, ${REAL}`,
  },
  {
    file: 'artillery-impact-el-02.wav',
    duration: 2.8,
    kind: 'impact',
    influence: 0.61,
    text: `Immediate heavy field-artillery shell impact in an open muddy battlefield, violent concussive blast, deep bass pressure, thick soil and debris thrown outward, rough low rumble fading naturally, ${REAL}`,
  },
  {
    file: 'artillery-impact-el-03.wav',
    duration: 2.5,
    kind: 'impact',
    influence: 0.66,
    text: `Immediate 25-pounder high-explosive shell burst on dry earth, hard supersonic crack and powerful low thump, stones and dirt raining down, realistic outdoor battlefield decay, ${REAL}`,
  },
  {
    file: 'artillery-impact-el-04.wav',
    duration: 3,
    kind: 'impact',
    influence: 0.59,
    text: `Immediate large World War Two howitzer shell cratering explosion, massive deep boom with a fierce initial crack, dense earth eruption, debris impacts and prolonged natural ground rumble, ${REAL}`,
  },
  {
    file: 'artillery-impact-el-05.wav',
    duration: 2.7,
    kind: 'impact',
    influence: 0.63,
    text: `Immediate high-explosive artillery round striking rocky ground, savage pressure crack, weighty low-frequency blast, gravel and stone fragments scattering, realistic open-air tail, ${REAL}`,
  },
  {
    file: 'artillery-impact-el-06.wav',
    duration: 2.9,
    kind: 'impact',
    influence: 0.6,
    text: `Immediate heavy artillery shell exploding in wet churned soil, enormous muffled bass punch under a sharp detonation, mud clods and debris falling, dark rolling battlefield decay, ${REAL}`,
  },
];

function validateCatalog() {
  let failed = false;
  for (const job of CATALOG) {
    const length = [...job.text].length;
    const valid =
      length <= PROMPT_LIMIT &&
      job.duration >= 0.5 &&
      job.duration <= 30 &&
      ['gun', 'impact', 'salvo'].includes(job.kind);
    console.log(
      `${valid ? 'ok' : 'INVALID'} ${job.file}: prompt ${length}/${PROMPT_LIMIT}, ${job.duration}s`
    );
    failed ||= !valid;
  }
  if (failed) process.exit(1);
}

async function generate(job, apiKey) {
  const response = await fetch(`${API}?output_format=mp3_44100_128`, {
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
      prompt_influence: job.influence,
    }),
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function convert(src, dest, kind) {
  const filter =
    kind === 'gun'
      ? [
          'highpass=f=22',
          'lowpass=f=12500',
          'equalizer=f=52:t=q:w=0.7:g=5',
          'equalizer=f=105:t=q:w=0.85:g=3.5',
          'equalizer=f=220:t=q:w=0.9:g=1.5',
          'equalizer=f=2600:t=q:w=1.0:g=1.2',
          'silenceremove=start_periods=1:start_silence=0.01:start_threshold=-48dB:detection=peak',
          'areverse',
          'silenceremove=start_periods=1:start_silence=0.08:start_threshold=-46dB:detection=peak',
          'areverse',
          'apad=pad_dur=0.05',
          'afade=t=in:st=0:d=0.0015',
          'areverse,afade=t=in:st=0:d=0.1,areverse',
          'acompressor=threshold=0.12:ratio=2.2:attack=5:release=180:makeup=1.35',
          'loudnorm=I=-10:TP=-0.35:LRA=8',
          'alimiter=limit=0.98',
        ].join(',')
      : kind === 'salvo'
      ? [
          'highpass=f=28',
          'lowpass=f=10500',
          'equalizer=f=65:t=q:w=0.75:g=3.5',
          'equalizer=f=150:t=q:w=0.9:g=2',
          'equalizer=f=3000:t=q:w=1.0:g=-2',
          'areverse',
          'silenceremove=start_periods=1:start_silence=0.12:start_threshold=-45dB:detection=peak',
          'areverse',
          'apad=pad_dur=0.12',
          'areverse',
          'afade=t=in:st=0:d=0.1',
          'areverse',
          'loudnorm=I=-15:TP=-1.2:LRA=10',
          'alimiter=limit=0.94',
        ].join(',')
      : [
          'highpass=f=26',
          'lowpass=f=12000',
          'equalizer=f=58:t=q:w=0.7:g=4',
          'equalizer=f=120:t=q:w=0.85:g=2.5',
          'equalizer=f=2700:t=q:w=1.0:g=-2',
          'silenceremove=start_periods=1:start_silence=0.01:start_threshold=-48dB:detection=peak',
          'areverse',
          'silenceremove=start_periods=1:start_silence=0.12:start_threshold=-45dB:detection=peak',
          'areverse',
          'apad=pad_dur=0.03',
          'afade=t=in:st=0:d=0.002',
          'areverse,afade=t=in:st=0:d=0.12,areverse',
          'loudnorm=I=-12:TP=-0.8:LRA=9',
          'alimiter=limit=0.96',
        ].join(',');

  const result = spawnSync(
    'ffmpeg',
    ['-y', '-i', src, '-ac', '1', '-ar', '44100', '-sample_fmt', 's16', '-af', filter, dest],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    console.error(result.stderr?.slice(-500));
    throw new Error(`ffmpeg failed for ${dest}`);
  }
}

function convertGunVariants(masterPath) {
  for (const variant of [
    { suffix: '-c.wav', pitch: 0.99, body: 1.1 },
    { suffix: '-d.wav', pitch: 1.01, body: 0.55 },
  ]) {
    const dest = masterPath.replace(/\.wav$/i, variant.suffix);
    const tempo = Math.max(0.5, Math.min(2, 1 / variant.pitch));
    const filter = [
      `asetrate=44100*${variant.pitch}`,
      'aresample=44100',
      `atempo=${tempo.toFixed(5)}`,
      `equalizer=f=125:t=q:w=0.9:g=${variant.body}`,
      'alimiter=limit=0.98',
    ].join(',');
    const result = spawnSync(
      'ffmpeg',
      ['-y', '-i', masterPath, '-ac', '1', '-ar', '44100', '-sample_fmt', 's16', '-af', filter, dest],
      { encoding: 'utf8' }
    );
    if (result.status !== 0) {
      throw new Error(`ffmpeg variant failed for ${dest}`);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  validateCatalog();
  if (validateOnly) return;

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    console.error('Missing ELEVENLABS_API_KEY');
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });
  mkdirSync(TMP, { recursive: true });
  let written = 0;
  let skipped = 0;
  let failed = 0;

  const jobs = CATALOG.filter((job) => {
    if (gunsOnly) return job.kind === 'gun';
    if (firingOnly) return job.kind === 'gun' || job.kind === 'salvo';
    return true;
  });

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const dest = join(OUT, job.file);
    const label = `[${i + 1}/${jobs.length}] ${job.file}`;
    if (!force && existsSync(dest)) {
      console.log(`${label} — skip`);
      skipped += 1;
      continue;
    }

    process.stdout.write(`${label} — generating… `);
    try {
      const encoded = await generate(job, apiKey);
      const temp = join(TMP, `${job.file}.mp3`);
      writeFileSync(temp, encoded);
      convert(temp, dest, job.kind);
      if (job.kind === 'gun') convertGunVariants(dest);
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
