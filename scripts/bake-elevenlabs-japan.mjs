/**
 * Complete Japanese faction audio pack via ElevenLabs.
 *
 * Generates dedicated weapon reports, the Ho-Ni engine loop, and Japanese
 * selection/attack/under-fire/retreat/death/commander voices.
 *
 *   npm run bake-elevenlabs-japan -- --validate
 *   npm run bake-elevenlabs-japan
 *   npm run bake-elevenlabs-japan -- --only=weapons --force
 *   npm run bake-elevenlabs-japan -- --only=rifle,hmg --force
 *
 * Set ELEVENLABS_API_KEY securely in the process environment before generation.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, '../public/sounds');
const tempDir = join(tmpdir(), 'ww2-rts-elevenlabs-japan');
const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
const force = process.argv.includes('--force');
const validateOnly = process.argv.includes('--validate');
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7) ?? null;
const only = onlyArg
  ?.split(',')
  .map((selector) => selector.trim())
  .filter(Boolean) ?? null;
const promptLimit = 450;

const dry =
  'authentic World War Two outdoor field recording, dry and close, short natural decay, ' +
  'no voices, music, impacts, ricochets, reload sounds, or cinematic effects';
const trimInaudibleTail =
  'areverse,silenceremove=start_periods=1:start_duration=0.10:start_threshold=-60dB,areverse';
const unifiedRifleTakes = new Set([0, 1, 3, 4, 5]);

const sfx = [
  ...Array.from({ length: 6 }, (_, index) => ({
    group: 'weapons',
    file: `rifle-japan-el-${String(index + 1).padStart(2, '0')}.wav`,
    kind: 'rifle',
    duration: unifiedRifleTakes.has(index) ? 0.7 : 0.74 + (index % 3) * 0.04,
    influence: unifiedRifleTakes.has(index) ? 0.95 : 0.9,
    text: unifiedRifleTakes.has(index)
      ? `Exactly one clean gunshot from a World War Two Japanese Type 99 Arisaka bolt-action rifle ` +
        `firing one 7.7 by 58 millimetre cartridge. One unified explosive muzzle transient with a ` +
        `strong dry full-power body, followed only by a brief outdoor decay. No separated second ` +
        `crack or thump, double report, burst, echo, reverb, ricochet, impact, metallic ping, bolt, ` +
        `casing, voices, music, cannon, firework, or synthetic sound.`
      : `Exactly one authentic gunshot from a World War Two Japanese Type 99 Arisaka bolt-action ` +
        `service rifle firing one 7.7 by 58 millimetre cartridge. The shot starts immediately: a ` +
        `sharp supersonic rifle crack over a heavy full-power powder blast, then a brief dry outdoor ` +
        `decay. One shot only; no second report, burst, echo, reverb, ricochet, impact, metallic ping, ` +
        `bolt action, casing, voices, music, cannon, firework, or synthetic sound. Take ${index + 1}.`,
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    group: 'weapons',
    file: `smg-japan-el-${String(index + 1).padStart(2, '0')}.wav`,
    kind: 'automatic',
    duration: 0.82 + index * 0.08,
    text:
      `Short controlled burst from a Japanese Type 100 submachine gun, six distinct 8 millimetre ` +
      `Nambu reports at about 450 rounds per minute, mechanical cadence, take ${index + 1}, ${dry}`,
  })),
  ...Array.from({ length: 4 }, (_, index) => {
    const duration = 1.8 + index * 0.1;
    const reports = 14 + index;
    return {
      group: 'weapons',
      file: `mg-japan-el-${String(index + 1).padStart(2, '0')}.wav`,
      kind: 'hmg',
      duration,
      text:
        `Tripod-mounted Japanese Type 92 heavy machine gun firing continuously from the first moment ` +
        `through the final moment of a ${duration.toFixed(1)} second recording. ${reports} evenly spaced, clearly ` +
        `separated 7.7 millimetre reports at 450 rounds per minute, heavy mechanical clatter and dense ` +
        `low-mid muzzle body. No early stop, fade, pause, metallic ring, ricochet, impacts, voices, music, ` +
        `or cinematic reverb. WWII outdoor field recording, dry and close, take ${index + 1}.`,
    };
  }),
  ...[
    {
      stem: 'tank-47-japan',
      profile: 'tank47',
      duration: 1.3,
      influence: 0.96,
      prompts: [
        `Exactly one Shinhoto Chi-Ha Type 1 47 mm tank gun firing an armor-piercing round outdoors. ` +
          `One unified compact cannon report starting immediately: hard dry muzzle front, lean ` +
          `high-velocity punch and firm medium pressure body, then a very short natural field decay. ` +
          `No second blast, impact, explosion, ricochet, metallic ring, reload, voices, music, or ` +
          `cinematic effects.`,
        `Exactly one clean Shinhoto Chi-Ha Type 1 47 mm tank-gun shot outdoors. One unified compact ` +
          `explosive cannon transient starting immediately: hard dry muzzle front, lean high-velocity ` +
          `punch and firm medium pressure body, then a short irregular natural field decay. It must ` +
          `sound like a real cannon, never a smooth sustained tone. No second blast, hum, drone, ` +
          `whistle, impact, ricochet, metallic ring, reload, voices, music, or cinematic effects.`,
      ],
    },
    {
      stem: 'tank-75-japan',
      profile: 'tank75',
      duration: 1.55,
      influence: 0.92,
      prompts: [
        `Exactly one Type 3 Chi-Nu Type 3 75 mm tank gun firing an armor-piercing round outdoors. ` +
          `One unified full-bodied cannon report starting immediately: dense muzzle concussion, ` +
          `strong powder blast and broad low pressure body with subtle enclosed-turret resonance, ` +
          `followed by a short natural field decay. No separate second boom, impact, explosion, ` +
          `ricochet, metallic ring, reload, voices, music, or cinematic effects.`,
        `Exactly one Japanese Type 3 75 mm tank cannon firing from a Chi-Nu in an open field. ` +
          `Immediate single integrated report, forceful hard muzzle front over a weighty medium-gun ` +
          `boom and deep pressure thump, with restrained armored-turret body and a brief dry outdoor ` +
          `tail. No double report, shell impact, echo, ringing, reload, voices, music, or synthetic ` +
          `sound.`,
      ],
    },
    {
      stem: 'td-75-japan',
      profile: 'td75',
      duration: 1.6,
      influence: 0.93,
      prompts: [
        `Exactly one Type 1 Ho-Ni I tank destroyer firing its Type 90 75 mm gun outdoors. One unified ` +
          `high-velocity cannon report starting immediately: fierce hard muzzle front, dense powder ` +
          `concussion and powerful low pressure body, with a short open-casemate mechanical resonance ` +
          `and natural field decay. No separate second boom, impact, explosion, ricochet, metallic ` +
          `ring, reload, voices, music, or cinematic effects.`,
        `Exactly one Japanese Ho-Ni I self-propelled anti-tank gun firing a Type 90 75 mm ` +
          `armor-piercing round in an open field. Immediate single integrated report with a harder, ` +
          `sharper front than the Chi-Nu gun, followed by a heavy powder body and brief open-fighting-` +
          `compartment resonance. No double report, shell impact, echo, ringing, reload, voices, ` +
          `music, or synthetic sound.`,
      ],
    },
    {
      stem: 'at-47-japan',
      profile: null,
      duration: 1.0,
      influence: 0.66,
      prompts: [
        `One Type 1 47 mm anti-tank gun firing, sharp high-velocity muzzle crack, compact deep pressure ` +
          `boom, take 1, ${dry}`,
        `One Type 1 47 mm anti-tank gun firing, sharp high-velocity muzzle crack, compact deep pressure ` +
          `boom, take 2, ${dry}`,
      ],
    },
  ].flatMap(({ stem, profile, duration, influence, prompts }) =>
    prompts.map((text, index) => ({
      group: 'weapons',
      file: `${stem}-el-${String(index + 1).padStart(2, '0')}.wav`,
      kind: 'cannon',
      profile,
      duration,
      influence,
      text,
    }))
  ),
  ...Array.from({ length: 3 }, (_, index) => ({
    group: 'weapons',
    file: `mortar-japan-el-${String(index + 1).padStart(2, '0')}.wav`,
    kind: 'cannon',
    duration: 1.0,
    text:
      `Japanese Type 97 81 mm mortar firing one round, hollow launch thump and brief tube resonance, ` +
      `outdoor jungle clearing, take ${index + 1}, ${dry}`,
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    group: 'weapons',
    file: `howitzer-105-japan-el-${String(index + 1).padStart(2, '0')}.wav`,
    kind: 'cannon',
    duration: 1.3,
    text:
      `Japanese Type 91 105 mm field howitzer firing one round, violent pressure wave, deep powder boom ` +
      `and short open-air tail, take ${index + 1}, ${dry}`,
  })),
  {
    group: 'weapons',
    file: 'engine-tank-destroyer-japan.wav',
    kind: 'engine',
    duration: 4.5,
    loop: true,
    text:
      `Seamless loop of a Type 1 Ho-Ni self-propelled gun moving under load, Mitsubishi Type 97 V12 ` +
      `air-cooled diesel rumble, Chi-Ha track clatter and drivetrain vibration, ${dry}`,
  },
];

const voiceId = ['pNInz6obpgDQGcFmaJgB', 'VR6AewLTigWG4xSOukaG', 'ErXwobaYiN019PkySvjV'];
const voiceGroups = {
  select: {
    prefix: 'unit-select-japan',
    lines: ['はい、隊長殿！', '命令をどうぞ！', '配置についております！', '準備完了です！', 'いつでも行けます！', 'お任せください！'],
  },
  attack: {
    prefix: 'unit-attack-japan',
    lines: ['目標確認、攻撃します！', '了解、目標に射撃します！', '敵を確認、排除します！', '命令了解、撃て！'],
  },
  underfire: {
    prefix: 'unit-underfire-japan',
    lines: [
      '敵の射撃だ！伏せろ！',
      '攻撃を受けている！',
      '前方から敵火！',
      '遮蔽物へ急げ！',
      '砲弾が来るぞ！伏せろ！',
      '負傷者だ！衛生兵！',
      '釘付けにされた！援護を！',
      '撃たれている！動け！',
      '敵が近い！警戒しろ！',
      'ここには居られない！',
      '頭を下げろ！',
      '後退して遮蔽物へ！',
    ],
  },
  retreat: {
    prefix: 'unit-retreat-japan',
    lines: ['陣地を維持できない！後退！', '撤退だ！急げ！', '集合地点まで下がれ！', '後退する！援護せよ！', '陣地を放棄する！', '本部まで戻れ！急げ！'],
  },
  death: {
    prefix: 'infantry-death-japan',
    lines: ['ぐあっ！', '衛生兵！', '撃たれた！', 'うわっ！', 'くっ、だめだ！', '畜生！', '痛い！', '母さん！'],
  },
};

const commanderLines = {
  strafe: '航空支援を要請する。目標を掃射せよ！',
  barrage: '砲兵隊、指定地点に集中砲火！',
  creepingBarrage: '移動弾幕を開始、歩兵の前進を援護せよ！',
  airborneDrop: '挺進部隊、降下を開始せよ！',
  fullRetreat: '全軍撤退、直ちに本部へ戻れ！',
  holdGround: '陣地を死守せよ。一歩も退くな！',
  lostCommander: '指揮官戦死。次席将校が指揮を継承せよ！',
};

const voices = [
  ...Object.entries(voiceGroups).flatMap(([group, def]) =>
    def.lines.map((text, index) => ({
      group: 'voices',
      voiceGroup: group,
      file: `${def.prefix}-${String(index + 1).padStart(2, '0')}.wav`,
      text,
      voice: voiceId[index % voiceId.length],
    }))
  ),
  ...Object.entries(commanderLines).map(([kind, text], index) => ({
    group: 'voices',
    voiceGroup: 'commander',
    file: `commander-japan-${kind}.wav`,
    text,
    voice: voiceId[index % voiceId.length],
  })),
];

const jobs = [...sfx, ...voices].filter((job) => {
  if (!only) return true;
  return only.some(
    (selector) => job.group === selector || job.kind === selector || job.file === selector
  );
});

function validateJobs() {
  if (!jobs.length) throw new Error(`No Japanese audio jobs match --only=${onlyArg}`);
  let invalid = false;
  for (const job of jobs) {
    const length = [...job.text].length;
    const valid = length <= promptLimit && (job.group === 'voices' || (job.duration >= 0.5 && job.duration <= 30));
    console.log(`${valid ? 'ok' : 'INVALID'} ${job.file}: prompt ${length}/${promptLimit}`);
    invalid ||= !valid;
  }
  if (invalid) process.exit(1);
}

async function generateSfx(job) {
  const response = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      text: job.text,
      model_id: 'eleven_text_to_sound_v2',
      duration_seconds: job.duration,
      prompt_influence: job.influence ?? (job.kind === 'engine' ? 0.44 : 0.66),
      loop: job.loop === true,
    }),
  });
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}

async function generateVoice(job) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${job.voice}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey, Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: job.text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: job.voiceGroup === 'underfire' || job.voiceGroup === 'retreat' ? 0.3 : 0.46,
          similarity_boost: 0.72,
          style: job.voiceGroup === 'underfire' || job.voiceGroup === 'death' ? 0.58 : 0.42,
          use_speaker_boost: true,
        },
      }),
    }
  );
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}

function filtersFor(job) {
  if (job.group === 'voices') {
    return [
      'highpass=f=260',
      'lowpass=f=4200',
      'acompressor=threshold=-16dB:ratio=5:attack=4:release=65',
      'equalizer=f=1450:t=q:w=1:g=2.8',
      'loudnorm=I=-18:TP=-1.5:LRA=7',
      'alimiter=limit=0.95',
    ].join(',');
  }
  if (job.kind === 'engine') {
    return [
      'highpass=f=42',
      'lowpass=f=4800',
      'equalizer=f=90:t=q:w=0.8:g=3',
      'equalizer=f=220:t=q:w=0.9:g=2',
      'loudnorm=I=-16:TP=-1.5:LRA=8',
      'alimiter=limit=0.94',
    ].join(',');
  }
  if (job.kind === 'rifle') {
    return [
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
  }
  if (job.kind === 'hmg') {
    return [
      'highpass=f=45',
      'lowpass=f=9500',
      'equalizer=f=280:t=q:w=0.9:g=1.8',
      'equalizer=f=3600:t=q:w=1.1:g=-1.4',
      'loudnorm=I=-15:TP=-1.3:LRA=7',
      'alimiter=limit=0.95',
      trimInaudibleTail,
    ].join(',');
  }
  if (job.kind === 'automatic') {
    return 'highpass=f=50,lowpass=f=11000,loudnorm=I=-15:TP=-1.3:LRA=7,alimiter=limit=0.95';
  }
  if (job.profile === 'tank47') {
    return [
      'highpass=f=38',
      'lowpass=f=11500',
      'equalizer=f=92:t=q:w=0.8:g=2.0',
      'equalizer=f=210:t=q:w=0.9:g=1.4',
      'equalizer=f=3400:t=q:w=1.0:g=-0.6',
      'silenceremove=start_periods=1:start_silence=0.006:start_threshold=-48dB:detection=peak',
      'loudnorm=I=-14:TP=-1.2:LRA=8',
      'alimiter=limit=0.95',
      trimInaudibleTail,
    ].join(',');
  }
  if (job.profile === 'tank75' || job.profile === 'td75') {
    const frontEdge = job.profile === 'td75' ? 0.4 : -0.8;
    return [
      'highpass=f=28',
      'lowpass=f=11000',
      'equalizer=f=68:t=q:w=0.75:g=3.2',
      'equalizer=f=135:t=q:w=0.85:g=2.0',
      `equalizer=f=3100:t=q:w=1.0:g=${frontEdge}`,
      'silenceremove=start_periods=1:start_silence=0.006:start_threshold=-48dB:detection=peak',
      'loudnorm=I=-13:TP=-1.1:LRA=9',
      'alimiter=limit=0.95',
      trimInaudibleTail,
    ].join(',');
  }
  return 'highpass=f=30,lowpass=f=11000,equalizer=f=75:t=q:w=0.8:g=3,loudnorm=I=-13:TP=-1:LRA=9,alimiter=limit=0.96';
}

function convert(source, destination, job) {
  const result = spawnSync(
    'ffmpeg',
    ['-y', '-i', source, '-ac', '1', '-ar', '44100', '-sample_fmt', 's16', '-af', filtersFor(job), destination],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr?.slice(-400)}`);
}

function verifyWav(file) {
  const result = spawnSync(
    'ffprobe',
    [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration',
      '-of', 'json',
      file,
    ],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) throw new Error(`ffprobe failed: ${result.stderr?.slice(-400)}`);
  const data = JSON.parse(result.stdout);
  const stream = data.streams?.[0];
  const duration = Number(data.format?.duration);
  if (
    stream?.codec_name !== 'pcm_s16le' ||
    stream?.sample_rate !== '44100' ||
    stream?.channels !== 1 ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    throw new Error(`Invalid WAV output for ${file}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  validateJobs();
  if (validateOnly) {
    console.log(`Validated ${jobs.length} Japanese ElevenLabs jobs`);
    return;
  }
  if (!apiKey) {
    console.error('Missing ELEVENLABS_API_KEY');
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  mkdirSync(tempDir, { recursive: true });

  let written = 0;
  let skipped = 0;
  let failed = 0;
  for (let index = 0; index < jobs.length; index++) {
    const job = jobs[index];
    const destination = join(outDir, job.file);
    const label = `[${index + 1}/${jobs.length}] ${job.file}`;
    if (!force && existsSync(destination)) {
      console.log(`${label} — skip`);
      skipped += 1;
      continue;
    }
    process.stdout.write(`${label} — generating… `);
    try {
      const encoded = job.group === 'voices' ? await generateVoice(job) : await generateSfx(job);
      const temporary = join(tempDir, `${job.file}.mp3`);
      writeFileSync(temporary, encoded);
      convert(temporary, destination, job);
      verifyWav(destination);
      console.log('ok');
      written += 1;
      await sleep(400);
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
