/**
 * Generate realistic, historically specific anti-tank-gun reports via ElevenLabs.
 *
 *   ELEVENLABS_API_KEY=sk_... npm run bake-elevenlabs-at-guns -- --validate
 *   ELEVENLABS_API_KEY=sk_... npm run bake-elevenlabs-at-guns -- --force
 *   ELEVENLABS_API_KEY=sk_... npm run bake-elevenlabs-at-guns -- --only=germany,usa
 *
 * The API key is read only from the environment and is never written to the repo.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, '../public/sounds');
const tempDir = join(tmpdir(), 'ww2-rts-elevenlabs-at-guns');
const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
const force = process.argv.includes('--force');
const validateOnly = process.argv.includes('--validate');
const onlyValue = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7) ?? null;
const only = onlyValue
  ?.split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean) ?? null;

const fieldRecording =
  'authentic WWII live-fire field recording outdoors, dry close microphone, short natural decay; no voices, music, reload, impact, ricochet, explosion, echo, ring, or cinematic effects';

const jobs = [
  {
    faction: 'germany',
    file: 'at-75-germany-el-01.wav',
    duration: 1.08,
    text:
      `Exactly one German Pak 40 7.5 cm anti-tank gun firing one armor-piercing round in an open field. ` +
      `One unified report starting immediately: hard high-velocity muzzle crack, dense powder blast, ` +
      `short low-frequency pressure body, then a brief dry outdoor decay. ${fieldRecording}`,
  },
  {
    faction: 'germany',
    file: 'at-75-germany-el-02.wav',
    duration: 1.02,
    text:
      `A single German Pak 40 75 mm towed anti-tank cannon firing once outdoors. Immediate compact ` +
      `live gun report with a sharp front, heavy powder concussion and firm low body; one shot only, ` +
      `not a separate crack followed by a second boom. ${fieldRecording}`,
  },
  {
    faction: 'usa',
    file: 'at-57-usa-el-01.wav',
    duration: 0.96,
    text:
      `Exactly one American M1 57 mm anti-tank gun firing one armor-piercing round in an open field. ` +
      `Single integrated high-velocity report: crisp muzzle crack over a compact powder blast and ` +
      `short low pressure thump, with natural outdoor decay. ${fieldRecording}`,
  },
  {
    faction: 'usa',
    file: 'at-57-usa-el-02.wav',
    duration: 0.92,
    text:
      `One World War Two US 57 mm M1 towed anti-tank cannon firing one round at a live-fire range. ` +
      `Immediate dry gunshot with a hard ballistic front, restrained medium-caliber muzzle body and ` +
      `brief irregular field tail; never a tank cannon or artillery barrage. ${fieldRecording}`,
  },
  {
    faction: 'uk',
    file: 'at-57-uk-el-01.wav',
    duration: 0.98,
    text:
      `Exactly one British QF 6-pounder 57 mm anti-tank gun firing one round outdoors. One unified ` +
      `sharp high-velocity report with a dry muzzle crack, compact heavy powder blast and a short ` +
      `natural open-field decay. ${fieldRecording}`,
  },
  {
    faction: 'uk',
    file: 'at-57-uk-el-02.wav',
    duration: 0.94,
    text:
      `A single British six-pounder towed anti-tank cannon firing once at a World War Two field range. ` +
      `Immediate clean live-fire transient, hard sharp front followed by a solid medium-gun pressure ` +
      `body; one report, no double blast or theatrical boom. ${fieldRecording}`,
  },
  {
    faction: 'russia',
    file: 'at-76-russia-el-01.wav',
    duration: 1.04,
    text:
      `Exactly one Soviet ZiS-3 76.2 mm divisional gun firing one anti-tank round in an open field. ` +
      `Single integrated report starting immediately: hard high-velocity crack, broad powder blast, ` +
      `deep compact pressure body and brief natural outdoor decay. ${fieldRecording}`,
  },
  {
    faction: 'russia',
    file: 'at-76-russia-el-02.wav',
    duration: 1.0,
    text:
      `One Soviet 76 mm ZiS-3 field gun firing directly at armor, one shot only, outdoors. Realistic ` +
      `dry cannon transient with a sharp muzzle front, weighty powder concussion and short uneven ` +
      `field tail; medium anti-tank gun, not a howitzer barrage. ${fieldRecording}`,
  },
  {
    faction: 'japan',
    file: 'at-47-japan-el-01.wav',
    duration: 0.9,
    text:
      `Exactly one Japanese Type 1 47 mm anti-tank gun firing one round outdoors. Single compact ` +
      `high-velocity report with a sharp dry muzzle crack, small-caliber powder blast and brief ` +
      `natural field decay; restrained weight, not a tank cannon. ${fieldRecording}`,
  },
  {
    faction: 'japan',
    file: 'at-47-japan-el-02.wav',
    duration: 0.88,
    text:
      `A single World War Two Japanese Type 1 47 mm towed anti-tank cannon firing once at a live-fire ` +
      `range. Immediate unified gunshot, crisp high-velocity front over a compact low pressure body ` +
      `and short irregular outdoor decay; one report only. ${fieldRecording}`,
  },
];

function selectedJobs() {
  if (!only?.length) return jobs;
  return jobs.filter((job) => only.includes(job.faction) || only.includes(job.file));
}

function validate() {
  let invalid = 0;
  for (const job of selectedJobs()) {
    const promptOk = job.text.length <= 450;
    const durationOk = job.duration >= 0.5 && job.duration <= 30;
    if (!promptOk || !durationOk) {
      console.error(`FAIL ${job.file}: prompt ${job.text.length}/450, duration ${job.duration}s`);
      invalid += 1;
    } else {
      console.log(`ok ${job.file}: prompt ${job.text.length}/450, ${job.duration}s`);
    }
  }
  if (invalid) process.exit(1);
}

async function generate(job) {
  const response = await fetch(
    'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
      body: JSON.stringify({
        text: job.text,
        model_id: 'eleven_text_to_sound_v2',
        duration_seconds: job.duration,
        prompt_influence: 0.86,
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function convert(source, job) {
  const filters = [
    'highpass=f=34',
    'lowpass=f=11500',
    'equalizer=f=78:t=q:w=0.8:g=2.8',
    'equalizer=f=170:t=q:w=0.9:g=1.7',
    'equalizer=f=3000:t=q:w=1.0:g=-2.5',
    'silenceremove=start_periods=1:start_silence=0.01:start_threshold=-50dB:detection=peak',
    'apad=pad_dur=0.018',
    'afade=t=in:st=0:d=0.002',
    'areverse,afade=t=in:st=0:d=0.055,areverse',
    'loudnorm=I=-11:TP=-1.0:LRA=7',
    'volume=1.08',
    'alimiter=limit=0.97',
  ].join(',');
  const result = spawnSync(
    'ffmpeg',
    ['-y', '-i', source, '-ac', '1', '-ar', '44100', '-af', filters, join(outDir, job.file)],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${job.file}: ${result.stderr?.slice(-400) ?? ''}`);
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  mkdirSync(tempDir, { recursive: true });

  if (validateOnly) {
    validate();
    console.log(`Validated ${selectedJobs().length} anti-tank gun prompt(s)`);
    return;
  }
  if (!apiKey) {
    console.error('Missing ELEVENLABS_API_KEY');
    process.exit(1);
  }

  const selected = selectedJobs();
  if (!selected.length) throw new Error(`No sound job matches --only=${onlyValue}`);
  for (let index = 0; index < selected.length; index++) {
    const job = selected[index];
    const destination = join(outDir, job.file);
    if (!force && existsSync(destination)) {
      console.log(`[${index + 1}/${selected.length}] ${job.file} — skip`);
      continue;
    }
    process.stdout.write(`[${index + 1}/${selected.length}] ${job.file} — generating... `);
    try {
      const mp3 = await generate(job);
      const temp = join(tempDir, `${job.file}.mp3`);
      writeFileSync(temp, mp3);
      convert(temp, job);
      console.log('ok');
    } catch (error) {
      console.log('FAIL');
      console.error(error.message);
      if (/401|quota|credit|429/i.test(error.message)) process.exit(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
