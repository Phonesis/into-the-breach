/**
 * Truck-driver radio lines via ElevenLabs.
 * Distinct from AFV helmet intercom: open-cab motor-pool chatter for transports.
 *
 * Writes:
 *   public/sounds/truck-select-{faction}-NN.wav
 *   public/sounds/truck-attack-{faction}-NN.wav
 *   public/sounds/truck-move-{faction}-NN.wav
 *   public/sounds/truck-retreat-{faction}-NN.wav
 *   public/sounds/truck-underfire-{faction}-NN.wav
 *
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-truck-crew.mjs
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-truck-crew.mjs --force
 *   node scripts/bake-elevenlabs-truck-crew.mjs --validate
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, '../public/sounds');
const tempDir = join(root, '../.tmp-elevenlabs-truck-crew');
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

/** Open-cab driver radio — not tank intercom, not infantry field sets. */
const lines = {
  usa: {
    select: [
      'Truck ready, over.',
      'Motor pool standing by.',
      'Driver here. Awaiting orders.',
      'Six-by is ready to roll.',
    ],
    attack: [
      'No gun on this truck. Staying clear.',
      'We’re unarmed. Keeping our distance.',
      'Can’t engage. Transport only.',
    ],
    move: [
      'Rolling out.',
      'Copy, moving up the road.',
      'On the way. Keep it in gear.',
      'Taking the route now.',
    ],
    retreat: [
      'Falling back! Getting this truck out!',
      'Reverse, reverse! We’re pulling out!',
      'Breaking off. Heading back!',
      'Driver bugging out, over!',
    ],
    underfire: [
      'Taking fire on the cab!',
      'They’re shooting the truck! Floor it!',
      'Incoming! We’re hit, moving!',
      'Rounds on the bed! Get us out!',
    ],
  },
  uk: {
    select: [
      'Lorry ready, sir.',
      'Driver here. Standing by.',
      'Bedford’s on the net.',
      'Motor pool, awaiting orders.',
    ],
    attack: [
      'No armament on this lorry. Staying clear.',
      'We’re unarmed. Keeping our distance.',
      'Can’t engage. Transport only.',
    ],
    move: [
      'Rolling, sir.',
      'Moving up the road.',
      'On our way.',
      'Taking the route now.',
    ],
    retreat: [
      'Falling back! Get this lorry out!',
      'Reverse! We’re pulling out!',
      'Breaking off. Heading back!',
      'Driver withdrawing, over!',
    ],
    underfire: [
      'Taking fire on the cab!',
      'They’re shooting the lorry! Go!',
      'Incoming! We’re hit, moving!',
      'Rounds on the canvas! Get us out!',
    ],
  },
  germany: {
    select: [
      'Lastwagen bereit. Warte auf Befehl.',
      'Fahrer hier. Funkbereit.',
      'Wagen steht. Auf Befehl.',
      'Kraftfahrer bereit.',
    ],
    attack: [
      'Kein Geschütz auf dem Wagen. Distanz halten.',
      'Wir sind unbewaffnet. Abstand halten.',
      'Können nicht kämpfen. Nur Transport.',
    ],
    move: [
      'Wir fahren los.',
      'Verstanden, fahren vor.',
      'Auf der Straße, vorwärts.',
      'Route genommen, wir rollen.',
    ],
    retreat: [
      'Zurück! Wagen raus hier!',
      'Rückwärts! Wir ziehen uns zurück!',
      'Kontakt abbrechen! Zurück zur Linie!',
      'Fahrer setzt ab, Ende!',
    ],
    underfire: [
      'Beschuss auf das Führerhaus!',
      'Sie schießen auf den Wagen! Gas geben!',
      'Treffer! Wir fahren weiter!',
      'Einschläge auf der Ladefläche! Raus hier!',
    ],
  },
  russia: {
    select: [
      'Грузовик готов. Жду приказа.',
      'Водитель на связи.',
      'Машина стоит. Ждём.',
      'Шофёр готов.',
    ],
    attack: [
      'Пушки нет. Держим дистанцию.',
      'Мы без оружия. Не сближаться.',
      'Стрелять нечем. Только перевозка.',
    ],
    move: [
      'Выезжаем.',
      'Понял, идём вперёд.',
      'По дороге, вперёд.',
      'Маршрут принят, катим.',
    ],
    retreat: [
      'Отходим! Уводим грузовик!',
      'Назад! Назад! Уходим!',
      'Отрываемся, на базу!',
      'Водитель отходит!',
    ],
    underfire: [
      'Обстрел кабины!',
      'Бьют по грузовику! Газу!',
      'Попадания! Не останавливаться!',
      'По кузову бьют! Уходим!',
    ],
  },
  japan: {
    select: [
      'トラック、待機しております。',
      '操縦手、通信よし。',
      '車両待機、指示を待つ。',
      '運転手、準備完了。',
    ],
    attack: [
      '武装なし。距離を取る。',
      '非武装だ。接近するな。',
      '交戦できない。輸送のみ。',
    ],
    move: [
      '発進する。',
      '了解、前進する。',
      '道路を進む。',
      '経路受領、走行開始。',
    ],
    retreat: [
      '後退！トラックを下げろ！',
      '後退せよ！離脱する！',
      '接触を切れ！戻れ！',
      '運転手、後退する！',
    ],
    underfire: [
      '運転席が被弾！',
      'トラックが撃たれている！加速せよ！',
      '命中！止まるな！',
      '荷台に弾が当たっている！離脱せよ！',
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
      file: `truck-${kind}-${faction}-${String(index + 1).padStart(2, '0')}.wav`,
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
        stability: job.kind === 'underfire' || job.kind === 'retreat' ? 0.3 : 0.5,
        similarity_boost: 0.72,
        style: job.kind === 'underfire' || job.kind === 'retreat' ? 0.5 : 0.34,
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
  // Open-cab radio: less nasal than helmet intercom, still cut for a handset.
  const filter = [
    'highpass=f=160',
    'lowpass=f=5400',
    'acompressor=threshold=-17dB:ratio=3.8:attack=5:release=80',
    'equalizer=f=850:t=q:w=1.0:g=1.2',
    'equalizer=f=2100:t=q:w=1.0:g=1.4',
    'loudnorm=I=-18:TP=-1.5:LRA=8',
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
  console.log(`Truck-driver TTS — ${jobs.length} lines`);
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
