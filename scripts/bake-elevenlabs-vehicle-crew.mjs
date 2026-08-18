/**
 * Vehicle-crew radio / intercom lines via ElevenLabs.
 * Distinct from infantry: driver/gunner chatter for tanks, TDs, and armored cars.
 *
 * Writes:
 *   public/sounds/vehicle-select-{faction}-NN.wav
 *   public/sounds/vehicle-attack-{faction}-NN.wav
 *   public/sounds/vehicle-move-{faction}-NN.wav
 *   public/sounds/vehicle-retreat-{faction}-NN.wav
 *   public/sounds/vehicle-underfire-{faction}-NN.wav
 *
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-vehicle-crew.mjs
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-vehicle-crew.mjs --force
 *   node scripts/bake-elevenlabs-vehicle-crew.mjs --validate
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, '../public/sounds');
const tempDir = join(root, '../.tmp-elevenlabs-vehicle-crew');
const api = 'https://api.elevenlabs.io/v1/text-to-speech';
const force = process.argv.includes('--force');
const validateOnly = process.argv.includes('--validate');
const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
const promptLimit = 450;

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

/** Intercom-style crew lines — not the same as infantry field radio. */
const lines = {
  usa: {
    select: [
      'Crew ready. Standing by.',
      'Buttoned up. Awaiting orders.',
      'Driver and gunner ready.',
      'Vehicle ready, over.',
    ],
    attack: [
      'Gunner, target spotted. Fire!',
      'Identified. Engaging now.',
      'Load armor piercing. On the way!',
      'Traverse. Firing!',
    ],
    move: [
      'Driver, advance!',
      'Moving out. Keep it tight.',
      'Hull forward. Let’s go.',
      'Driver, take us up.',
    ],
    retreat: [
      'Reverse! Reverse! Get us out!',
      'Driver, fall back! Now!',
      'Breaking contact. Reverse!',
      'Pull the vehicle back!',
    ],
    underfire: [
      'Taking hits on the hull!',
      'Armor’s ringing! Keep moving!',
      'Incoming! Button up!',
      'We’re being engaged! Driver, move!',
      'Track’s holding. Return fire!',
      'They’re shooting us up! Get hull-down!',
    ],
  },
  uk: {
    select: [
      'Crew ready. Standing by.',
      'Hatches down. On the net.',
      'Driver and gunner ready.',
      'Wagon’s ready, sir.',
    ],
    attack: [
      'Gunner, target. Fire!',
      'A.P. loaded. On the way!',
      'Target confirmed. Engaging.',
      'Traverse. Firing now!',
    ],
    move: [
      'Driver, advance!',
      'Moving off. Keep formation.',
      'Hull forward.',
      'Driver, take us on.',
    ],
    retreat: [
      'Reverse! Reverse! Get us out!',
      'Driver, fall back!',
      'Breaking contact. Reverse!',
      'Pull the wagon back!',
    ],
    underfire: [
      'Taking hits on the hull!',
      'Armour’s holding! Keep moving!',
      'Incoming! Hatches down!',
      'We’re under fire! Driver, move!',
      'Tracks are fine. Return fire!',
      'They’re ranging us! Get hull-down!',
    ],
  },
  germany: {
    select: [
      'Besatzung bereit. Warten auf Befehl.',
      'Luke zu. Funkbereit.',
      'Fahrer und Richtschütze bereit.',
      'Panzer klar zum Gefecht.',
    ],
    attack: [
      'Richtschütze, Ziel erfasst. Feuer!',
      'Panzergranate laden. Feuer!',
      'Ziel erkannt. Wir bekämpfen es!',
      'Turm schwenken. Feuer frei!',
    ],
    move: [
      'Fahrer, vorwärts!',
      'Wir fahren auf. Los!',
      'Kette vorwärts!',
      'Fahrer, voran!',
    ],
    retreat: [
      'Rückwärts! Rückwärts! Raus hier!',
      'Fahrer, zurücksetzen!',
      'Wir setzen uns ab. Rückwärts!',
      'Panzer zurück! Deckung suchen!',
    ],
    underfire: [
      'Treffer am Bug!',
      'Die Panzerung hält! Weiterfahren!',
      'Feindfeuer! Luken zu!',
      'Wir werden beschossen! Fahrer, bewegen!',
      'Kette hält. Feuer erwidern!',
      'Sie schießen uns zusammen! In Deckung!',
    ],
  },
  russia: {
    select: [
      'Экипаж готов. Жду приказа.',
      'Люки закрыты. На связи.',
      'Механик и наводчик готовы.',
      'Машина к бою готова.',
    ],
    attack: [
      'Наводчик, цель вижу. Огонь!',
      'Бронебойным. Огонь!',
      'Цель подтверждена. Атакуем!',
      'Башню вправо. Огонь!',
    ],
    move: [
      'Механик, вперёд!',
      'Выдвигаемся. Держать строй.',
      'Машина вперёд!',
      'Механик, веди.',
    ],
    retreat: [
      'Назад! Назад! Уходим!',
      'Механик, отход!',
      'Отрываемся. Задний ход!',
      'Машину назад! Прикрыть!',
    ],
    underfire: [
      'Попадания в корпус!',
      'Броня держит! Не останавливаться!',
      'Обстрел! Люки закрыть!',
      'По нам стреляют! Механик, ход!',
      'Гусеница цела. Ответный огонь!',
      'Нас бьют! В укрытие!',
    ],
  },
  japan: {
    select: [
      '乗員、待機しております。',
      'ハッチ閉鎖、通信よし。',
      '操縦手、砲手、準備完了。',
      '車輌、戦闘準備よし。',
    ],
    attack: [
      '砲手、目標確認、撃て！',
      '徹甲弾、発射！',
      '目標捕捉、攻撃する！',
      '砲塔旋回、射撃開始！',
    ],
    move: [
      '操縦手、前進！',
      '発進する。間隔を保て。',
      '車体前進！',
      '操縦手、進め！',
    ],
    retreat: [
      '後退！後退！離脱せよ！',
      '操縦手、下がれ！',
      '接触を切れ。後退！',
      '車輌を下げろ！援護せよ！',
    ],
    underfire: [
      '車体に命中！',
      '装甲は保っている！進め！',
      '被弾！ハッチを閉めろ！',
      '攻撃を受けている！操縦手、動け！',
      '履帯は無事。応射せよ！',
      '撃たれている！遮蔽へ！',
    ],
  },
};

const kinds = ['select', 'attack', 'move', 'retreat', 'underfire'];

const jobs = Object.entries(lines).flatMap(([faction, byKind]) =>
  kinds.flatMap((kind) =>
    byKind[kind].map((text, index) => ({
      faction,
      kind,
      text,
      voice: voices[faction][index % voices[faction].length],
      file: `vehicle-${kind}-${faction}-${String(index + 1).padStart(2, '0')}.wav`,
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
        stability: job.kind === 'underfire' || job.kind === 'retreat' ? 0.32 : 0.48,
        similarity_boost: 0.74,
        style: job.kind === 'underfire' || job.kind === 'retreat' ? 0.52 : 0.38,
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
  // Helmet intercom: closer, less tinny than infantry field-radio EQ.
  const filter = [
    'highpass=f=220',
    'lowpass=f=4600',
    'acompressor=threshold=-16dB:ratio=4.2:attack=4:release=70',
    'equalizer=f=950:t=q:w=1.0:g=1.6',
    'equalizer=f=1900:t=q:w=1.0:g=2.0',
    'loudnorm=I=-18:TP=-1.5:LRA=7',
    'alimiter=limit=0.95',
    'afade=t=in:st=0:d=0.008',
    'areverse,afade=t=in:st=0:d=0.04,areverse',
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
  console.log(`Vehicle-crew TTS — ${jobs.length} lines`);
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
