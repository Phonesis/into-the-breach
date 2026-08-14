/**
 * Faction-specific commander General Order lines via ElevenLabs TTS.
 * Writes public/sounds/commander-{faction}-{order}-NN.wav.
 *
 *   node scripts/bake-elevenlabs-commander-orders.mjs --validate
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-commander-orders.mjs
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-commander-orders.mjs --force
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, '../public/sounds');
const tempDir = join(root, '../.tmp-elevenlabs-commander-orders');
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
  japan: [
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },
  ],
};

const lines = {
  usa: {
    fullRetreat: [
      'All units, break contact and fall back to headquarters!',
      'Withdraw to the rally point! Full retreat!',
    ],
    holdGround: [
      'Hold your positions! No one gives ground!',
      'Stand fast! Hold the line!',
    ],
    digIn: [
      'All infantry, dig in and face the enemy!',
      'Prepare fighting positions! Dig in now!',
    ],
  },
  uk: {
    fullRetreat: [
      'All units, disengage and withdraw to headquarters!',
      'Fall back to the rally point! Full withdrawal!',
    ],
    holdGround: [
      'Hold your positions! No ground is to be yielded!',
      'Stand firm, lads! Hold the line!',
    ],
    digIn: [
      'All foot troops, dig in facing the enemy!',
      'Prepare defensive positions! Dig in at once!',
    ],
  },
  germany: {
    fullRetreat: [
      'Alle Einheiten, Feindberührung lösen und zum Hauptquartier zurück!',
      'Rückzug zum Sammelpunkt! Sofort!',
    ],
    holdGround: [
      'Stellungen halten! Keinen Schritt zurück!',
      'Standhalten! Die Linie halten!',
    ],
    digIn: [
      'Infanterie, eingraben und zum Feind ausrichten!',
      'Verteidigungsstellungen vorbereiten! Sofort eingraben!',
    ],
  },
  russia: {
    fullRetreat: [
      'Всем подразделениям оторваться от противника и отходить к штабу!',
      'Отходить к сборному пункту! Полное отступление!',
    ],
    holdGround: [
      'Удерживать позиции! Ни шагу назад!',
      'Стоять насмерть! Держать линию!',
    ],
    digIn: [
      'Пехоте окопаться и развернуться к противнику!',
      'Готовить оборонительные позиции! Немедленно окопаться!',
    ],
  },
  japan: {
    fullRetreat: [
      '全隊、敵と離脱し司令部まで撤退せよ！',
      '集合地点まで後退せよ！全軍撤退！',
    ],
    holdGround: [
      '現在地を死守せよ！一歩も退くな！',
      '戦線を維持せよ！持ち場を守れ！',
    ],
    digIn: [
      '全歩兵、敵方向に向けて塹壕を掘れ！',
      '防御陣地を構築せよ！直ちに掘り始めろ！',
    ],
  },
};

const jobs = Object.entries(lines).flatMap(([faction, orders]) =>
  Object.entries(orders).flatMap(([kind, variants]) =>
    variants.map((text, index) => ({
      faction,
      kind,
      text,
      voice: voices[faction][index % voices[faction].length],
      file: `commander-${faction}-${kind}-${String(index + 1).padStart(2, '0')}.wav`,
    }))
  )
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
        stability: 0.5,
        similarity_boost: 0.76,
        style: 0.48,
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
  // Keep voices intelligible and controlled; SoundManager adds the existing
  // radio band-pass, transmission static, and presence layer at playback.
  const filter = [
    'highpass=f=110',
    'lowpass=f=9000',
    'acompressor=threshold=-18dB:ratio=4:attack=4:release=75',
    'equalizer=f=1200:t=q:w=1.0:g=1.4',
    'equalizer=f=2600:t=q:w=1.0:g=1.6',
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
  try {
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
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  console.log(`Done — wrote ${written}, skipped ${skipped}, failed ${failed}`);
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
