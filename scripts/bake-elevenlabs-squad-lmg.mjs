/**
 * Squad LMG samples via ElevenLabs Sound Effects.
 * Distinct from crew-served MG-team bursts: shorter, handheld Bren / BAR /
 * MG34 / DP-27 / Type 96 fire for mixed infantry volleys.
 *
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-squad-lmg.mjs
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-squad-lmg.mjs --force
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-squad-lmg');
const API = 'https://api.elevenlabs.io/v1/sound-generation';

const validateOnly = process.argv.includes('--validate');
const API_KEY = process.env.ELEVENLABS_API_KEY?.trim();
if (!API_KEY && !validateOnly) {
  console.error('Missing ELEVENLABS_API_KEY');
  console.error('  ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-squad-lmg.mjs');
  process.exit(1);
}

const force = process.argv.includes('--force');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const REAL =
  'outdoor field recording, full powder body, dry short decay, no music, ' +
  'no voices, no ricochet, not synthetic, not tinny, not a buzz saw';

const LMGS = {
  germany: {
    weapon: 'handheld MG34 light machine gun',
    character: 'fast distinct 7.92 mm automatic cracks, not an MG42 buzz',
    shots: 'six to seven shots',
  },
  usa: {
    weapon: 'Browning Automatic Rifle BAR',
    character: 'heavy .30-06 thumping automatic fire, measured cyclic rate',
    shots: 'five to six shots',
  },
  uk: {
    weapon: 'British Bren light machine gun',
    character: 'solid .303 British reports at a measured squad automatic rate',
    shots: 'five distinct shots',
  },
  russia: {
    weapon: 'Soviet DP-27 Degtyaryov light machine gun',
    character: 'rhythmic 7.62 mm pan-magazine automatic fire',
    shots: 'five to six shots',
  },
  japan: {
    weapon: 'Japanese Type 96 light machine gun',
    character: 'lighter 6.5 mm automatic cracks at a moderate cyclic rate',
    shots: 'five to six shots',
  },
};

const PERSPECTIVES = [
  'recorded side-on from about twelve metres in an open field',
  'recorded from about twenty metres beside an outdoor firing line',
  'recorded from a shallow front-quarter angle about eighteen metres away',
];

const CATALOG = Object.entries(LMGS).flatMap(([faction, lmg]) =>
  PERSPECTIVES.map((perspective, index) => ({
    file: `lmg-${faction}-el-${String(index + 1).padStart(2, '0')}.wav`,
    duration: index === 0 ? 0.82 : 0.78,
    influence: 0.68 - index * 0.04,
    text:
      `Short ${lmg.weapon} burst outdoors, ${lmg.shots}, ${lmg.character}, ` +
      `${perspective}, ${REAL}`,
  }))
);

const GAME_FILTER = [
  'highpass=f=55',
  'lowpass=f=10500',
  'equalizer=f=140:t=q:w=0.85:g=3.2',
  'equalizer=f=300:t=q:w=0.9:g=1.6',
  'equalizer=f=2800:t=q:w=1.1:g=-4.8',
  'equalizer=f=4500:t=q:w=1.0:g=-5.5',
  'equalizer=f=7000:t=q:w=1.0:g=-3.5',
  'silenceremove=start_periods=1:start_silence=0.01:start_threshold=-50dB:detection=peak',
  'apad=pad_dur=0.02',
  'afade=t=in:st=0:d=0.002',
  'areverse,afade=t=in:st=0:d=0.05,areverse',
  'loudnorm=I=-11:TP=-0.6:LRA=5',
  'volume=1.08',
  'alimiter=limit=0.97',
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
  const oversized = CATALOG.find((job) => job.text.length > 450);
  if (oversized) {
    throw new Error(
      `Prompt exceeds ElevenLabs 450-character limit: ${oversized.file} (${oversized.text.length})`
    );
  }
  if (validateOnly) {
    const longest = Math.max(...CATALOG.map((job) => job.text.length));
    console.log(`Validated ${CATALOG.length} LMG prompts; longest is ${longest}/450 characters`);
    return;
  }

  console.log(`ElevenLabs squad LMG bake — ${CATALOG.length} samples`);
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
    } catch (err) {
      console.log('FAIL');
      console.error(`  ${err.message}`);
      failed += 1;
      if (String(err.message).includes('401')) process.exit(1);
      if (/429|quota|credit/i.test(err.message)) {
        console.error('Quota hit — stopping.');
        break;
      }
      await sleep(900);
    }
  }

  console.log(`\nDone — wrote ${written}, skipped ${skipped}, failed ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
