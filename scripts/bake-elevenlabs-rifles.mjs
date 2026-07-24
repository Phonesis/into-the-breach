/**
 * Fresh faction-specific rifle masters via ElevenLabs Sound Effects.
 * Writes six original shots per faction:
 *   public/sounds/rifle-{faction}-el-01.wav … 06.wav
 *
 * Only rifle assets are generated; SMG and machine-gun files are untouched.
 *
 *   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-rifles
 *   ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-rifles -- --force
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-rifles');
const API = 'https://api.elevenlabs.io/v1/sound-generation';

const validateOnly = process.argv.includes('--validate');
const API_KEY = process.env.ELEVENLABS_API_KEY?.trim();
if (!API_KEY && !validateOnly) {
  console.error('Missing ELEVENLABS_API_KEY');
  console.error('  ELEVENLABS_API_KEY=sk_… npm run bake-elevenlabs-rifles');
  process.exit(1);
}

const force = process.argv.includes('--force');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const DRY_FIELD =
  'one discrete shot only, dry outdoor field recording, ' +
  'full powder body then ballistic crack, short decay; ' +
  'no echo, explosion, ricochet, impact, reload, mechanism, clip ping, voices, music, or synthetic effects';

const RIFLES = {
  germany: {
    weapon: 'Karabiner 98k bolt-action rifle firing one 7.92 by 57 millimetre Mauser round',
    character: 'authoritative low powder thump and a hard, tight rifle crack',
  },
  usa: {
    weapon: 'M1 Garand semi-automatic rifle firing one thirty-aught-six round',
    character: 'rounded powerful muzzle report and a clean, sharp rifle crack',
  },
  uk: {
    weapon: 'Lee-Enfield No. 4 bolt-action rifle firing one .303 British round',
    character: 'solid mid-low powder report and a crisp, controlled rifle crack',
  },
  russia: {
    weapon: 'Mosin-Nagant 91/30 bolt-action rifle firing one 7.62 by 54R round',
    character: 'concussive powder report and a forceful, slightly raw rifle crack',
  },
};

const PERSPECTIVES = [
  'recorded side-on from about twelve metres in an open field',
  'recorded from about twenty metres beside an outdoor firing line',
  'recorded side-on from about thirty metres across dry grass',
  'recorded from a shallow front-quarter angle about eighteen metres away',
  'recorded from about forty metres in open countryside with a very short field tail',
  'recorded close and side-on outdoors with strong body but no microphone clipping',
];

const CATALOG = Object.entries(RIFLES).flatMap(([faction, rifle]) =>
  PERSPECTIVES.map((perspective, index) => ({
    file: `rifle-${faction}-el-${String(index + 1).padStart(2, '0')}.wav`,
    duration: index === 4 ? 1.05 : 0.9,
    influence: 0.72 - (index % 3) * 0.04,
    text: `${rifle.weapon}, ${rifle.character}, ${perspective}, ${DRY_FIELD}`,
  }))
);

const GAME_FILTER = [
  'highpass=f=45',
  'lowpass=f=11500',
  'equalizer=f=125:t=q:w=0.9:g=2.2',
  'equalizer=f=320:t=q:w=1.0:g=1.1',
  'equalizer=f=2800:t=q:w=1.0:g=-1.4',
  'equalizer=f=6800:t=q:w=1.1:g=-1.2',
  'silenceremove=start_periods=1:start_silence=0.005:start_threshold=-48dB:detection=peak',
  'apad=pad_dur=0.02',
  'afade=t=in:st=0:d=0.0015',
  'areverse',
  'afade=t=in:st=0:d=0.045',
  'areverse',
  'loudnorm=I=-16:TP=-1.5:LRA=6',
].join(',');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateSfx(job) {
  const response = await fetch(`${API}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': API_KEY,
    },
    body: JSON.stringify({
      text: job.text,
      model_id: 'eleven_text_to_sound_v2',
      prompt_influence: job.influence,
      duration_seconds: job.duration,
    }),
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function convertToGameWav(srcPath, destPath) {
  const result = spawnSync(
    'ffmpeg',
    ['-y', '-i', srcPath, '-ac', '1', '-ar', '44100', '-af', GAME_FILTER, destPath],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    console.error(result.stderr?.slice(-400));
    throw new Error(`ffmpeg failed for ${destPath}`);
  }
}

async function main() {
  const oversizedPrompt = CATALOG.find((job) => job.text.length > 450);
  if (oversizedPrompt) {
    throw new Error(
      `Prompt exceeds ElevenLabs 450-character limit: ${oversizedPrompt.file} (${oversizedPrompt.text.length})`
    );
  }
  if (validateOnly) {
    const longestPrompt = Math.max(...CATALOG.map((job) => job.text.length));
    console.log(`Validated ${CATALOG.length} rifle prompts; longest is ${longestPrompt}/450 characters`);
    return;
  }
  console.log(`ElevenLabs faction rifles — ${CATALOG.length} original single shots`);
  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < CATALOG.length; i++) {
    const job = CATALOG[i];
    const dest = join(OUT, job.file);
    const label = `[${i + 1}/${CATALOG.length}] ${job.file}`;
    if (!force && existsSync(dest)) {
      console.log(`${label} — skip`);
      skipped += 1;
      continue;
    }

    process.stdout.write(`${label} — generating… `);
    try {
      const mp3 = await generateSfx(job);
      const tmp = join(TMP, `${job.file}.mp3`);
      writeFileSync(tmp, mp3);
      convertToGameWav(tmp, dest);
      console.log('ok');
      written += 1;
      await sleep(400);
    } catch (error) {
      console.log('FAIL');
      console.error(`  ${error.message}`);
      failed += 1;
      if (String(error.message).includes('401')) process.exit(1);
      if (/429|quota|credit/i.test(error.message)) {
        console.error('Quota hit — stopping.');
        break;
      }
      await sleep(900);
    }
  }

  console.log(`\nDone — wrote ${written}, skipped ${skipped}, failed ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
