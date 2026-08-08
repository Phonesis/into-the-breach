/**
 * Bake faction fighter engine loops + air-bomb one-shots via ElevenLabs SFX.
 *
 * Requires ELEVENLABS_API_KEY + ffmpeg.
 *
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-aircraft.mjs
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-aircraft.mjs --force
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-aircraft.mjs --only=bomb
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-aircraft.mjs --only=engines
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-aircraft.mjs --validate
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-aircraft');
const API = 'https://api.elevenlabs.io/v1/sound-generation';
const PROMPT_LIMIT = 450;

const API_KEY = process.env.ELEVENLABS_API_KEY?.trim();
const force = process.argv.includes('--force');
const validateOnly = process.argv.includes('--validate');
const onlyArg =
  process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length) ?? null;

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const REAL =
  'authentic outdoor field recording, natural acoustic, full low-end body, dry short natural decay, no music, no voices, no speech, not synthetic, not electronic, not cinematic trailer';

/** @type {{ file: string, duration: number, influence: number, loop?: boolean, kind: string, group: string, text: string }[]} */
const CATALOG = [
  // —— Faction fighter main engines (seamless loops) ——
  {
    file: 'aircraft-flyby-germany.wav',
    duration: 4.2,
    influence: 0.55,
    loop: true,
    kind: 'engine',
    group: 'engines',
    text: `Seamless loop of a World War Two Messerschmitt Bf 109 Daimler-Benz DB 605 inverted V twelve cylinder engine at full throttle flyby, harsh high-rev growl and raspy exhaust crackle, propeller wash, outdoor airfield recording, continuous cruise power, ${REAL}`,
  },
  {
    file: 'aircraft-flyby-germany-exhaust.wav',
    duration: 3.8,
    influence: 0.5,
    loop: true,
    kind: 'exhaust',
    group: 'engines',
    text: `Seamless loop of Bf 109 DB 605 exhaust only, sharp raspy stacked exhaust pulses and dark low mid engine burble, continuous, outdoor, no propeller slap, ${REAL}`,
  },
  {
    file: 'aircraft-flyby-germany-prop.wav',
    duration: 3.6,
    influence: 0.48,
    loop: true,
    kind: 'prop',
    group: 'engines',
    text: `Seamless loop of World War Two fighter propeller wash and blade whoosh only, continuous air chopping thrash without engine tone, outdoor, ${REAL}`,
  },
  {
    file: 'aircraft-flyby-usa.wav',
    duration: 4.2,
    influence: 0.55,
    loop: true,
    kind: 'engine',
    group: 'engines',
    text: `Seamless loop of a World War Two North American P-51 Mustang Packard Merlin V-1650 engine at combat power flyby, smooth powerful deep V12 roar and strong continuous propeller thrash, outdoor, ${REAL}`,
  },
  {
    file: 'aircraft-flyby-usa-exhaust.wav',
    duration: 3.8,
    influence: 0.5,
    loop: true,
    kind: 'exhaust',
    group: 'engines',
    text: `Seamless loop of Packard Merlin fighter exhaust only, smooth deep continuous V12 exhaust pulses, outdoor, no voices, ${REAL}`,
  },
  {
    file: 'aircraft-flyby-usa-prop.wav',
    duration: 3.6,
    influence: 0.48,
    loop: true,
    kind: 'prop',
    group: 'engines',
    text: `Seamless loop of four-blade fighter propeller thrash and airflow whoosh only, continuous, outdoor, no engine growl, ${REAL}`,
  },
  {
    file: 'aircraft-flyby-uk.wav',
    duration: 4.2,
    influence: 0.55,
    loop: true,
    kind: 'engine',
    group: 'engines',
    text: `Seamless loop of a World War Two Supermarine Spitfire Rolls-Royce Merlin engine at full throttle flyby, bright singing V12 howl and continuous prop thrash, outdoor British fighter, ${REAL}`,
  },
  {
    file: 'aircraft-flyby-uk-exhaust.wav',
    duration: 3.8,
    influence: 0.5,
    loop: true,
    kind: 'exhaust',
    group: 'engines',
    text: `Seamless loop of Rolls-Royce Merlin Spitfire exhaust only, bright mid-forward continuous exhaust song and low body, outdoor, ${REAL}`,
  },
  {
    file: 'aircraft-flyby-uk-prop.wav',
    duration: 3.6,
    influence: 0.48,
    loop: true,
    kind: 'prop',
    group: 'engines',
    text: `Seamless loop of Spitfire propeller blade thrash and air whoosh only, continuous, outdoor, ${REAL}`,
  },
  {
    file: 'aircraft-flyby-russia.wav',
    duration: 4.2,
    influence: 0.55,
    loop: true,
    kind: 'engine',
    group: 'engines',
    text: `Seamless loop of a World War Two Soviet Il-2 Shturmovik AM-38 engine at full power flyby, rough lower growling inline engine and heavy continuous prop thrash, outdoor, ${REAL}`,
  },
  {
    file: 'aircraft-flyby-russia-exhaust.wav',
    duration: 3.8,
    influence: 0.5,
    loop: true,
    kind: 'exhaust',
    group: 'engines',
    text: `Seamless loop of Il-2 attack aircraft exhaust only, rough deep continuous growling exhaust pulses, outdoor, ${REAL}`,
  },
  {
    file: 'aircraft-flyby-russia-prop.wav',
    duration: 3.6,
    influence: 0.48,
    loop: true,
    kind: 'prop',
    group: 'engines',
    text: `Seamless loop of heavy Soviet attack aircraft propeller thrash only, continuous air chopping, outdoor, ${REAL}`,
  },
  // Japan: multi-take + body EQ. Prior "radial buzz/cyclic" prompts made gated, thin,
  // harmonic takes (half silence). Mirror Germany-style continuous full-throttle language.
  {
    file: 'aircraft-flyby-japan.wav',
    duration: 4.2,
    influence: 0.5,
    loop: true,
    kind: 'engine',
    group: 'engines',
    takes: 5,
    text: `Seamless continuous loop of a World War Two Japanese fighter air-cooled radial engine at full throttle flyby, powerful deep continuous engine roar and raspy exhaust crackle, strong propeller wash, outdoor airfield recording, unbroken cruise power, ${REAL}`,
    altTexts: [
      `Seamless continuous loop of a Mitsubishi A6M Zero fighter engine flyby, full power Nakajima Sakae radial roar with deep low-end body and continuous propeller thrash, outdoor combat airfield, no music no voices, not synthetic`,
      `Seamless continuous loop of a World War Two Pacific fighter radial engine at combat power, thick continuous engine growl and prop thrash, full low frequency body, outdoor field recording, no gaps no music no speech`,
    ],
  },
  {
    file: 'aircraft-flyby-japan-exhaust.wav',
    duration: 3.8,
    influence: 0.48,
    loop: true,
    kind: 'exhaust',
    group: 'engines',
    takes: 5,
    text: `Seamless continuous loop of World War Two Japanese fighter radial exhaust only, deep continuous stacked exhaust pulses and dark low mid engine burble, outdoor, no propeller slap, ${REAL}`,
    altTexts: [
      `Seamless continuous loop of Sakae radial fighter exhaust only, rough deep continuous exhaust roar and low body, outdoor airfield, no prop thrash no music no voices`,
      `Seamless continuous loop of air-cooled radial fighter muffler and exhaust only, dark continuous low-mid pulses, outdoor, no propeller, ${REAL}`,
    ],
  },
  {
    file: 'aircraft-flyby-japan-prop.wav',
    duration: 3.6,
    influence: 0.48,
    loop: true,
    kind: 'prop',
    group: 'engines',
    takes: 4,
    text: `Seamless continuous loop of World War Two fighter propeller wash and blade whoosh only, continuous air chopping thrash without engine tone, outdoor, ${REAL}`,
    altTexts: [
      `Seamless continuous loop of fighter propeller thrash and airflow whoosh only, steady continuous blade slap, outdoor, no engine growl, ${REAL}`,
    ],
  },

  // —— Air bomb detonation (no freefall whistle — intentionally omitted).
  // Format convert only — no EQ. Loud/close prompts so takes match bomb-explosion-02 level.
  {
    file: 'bomb-explosion-01.wav',
    duration: 2.6,
    influence: 0.72,
    kind: 'explosion',
    group: 'bomb',
    text:
      'Massive close-range World War Two aerial bomb detonation, very loud thunderous boom with heavy low end, ' +
      'ground-shaking blast and gravel ejecta, outdoor combat recording, powerful and close, no music no speech',
  },
  {
    file: 'bomb-explosion-02.wav',
    duration: 2.9,
    influence: 0.55,
    kind: 'explosion',
    group: 'bomb',
    text: `Huge World War Two general purpose bomb ground impact explosion, violent deep thunderous blast, earth shock and debris, long low frequency tail, outdoor battlefield, ${REAL}`,
  },
  {
    file: 'bomb-explosion-03.wav',
    duration: 2.5,
    influence: 0.72,
    kind: 'explosion',
    group: 'bomb',
    text:
      'Huge close bomb detonation World War Two, very loud deep thunderous explosion with long bass tail, ' +
      'dirt and pressure wave, outdoor field recording at full power, no plane no music no speech',
  },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function generateSfx(job, textOverride = null) {
  const body = {
    text: textOverride ?? job.text,
    model_id: 'eleven_text_to_sound_v2',
    prompt_influence: job.influence ?? 0.5,
    duration_seconds: job.duration,
  };
  if (job.loop) body.loop = true;

  const res = await fetch(`${API}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Parse one ffmpeg volumedetect mean_volume line; returns null if missing. */
function meanVolumeDb(wavPath, filter = null) {
  const af = filter ? `${filter},volumedetect` : 'volumedetect';
  const r = spawnSync(
    'ffmpeg',
    ['-i', wavPath, '-af', af, '-f', 'null', '-'],
    { encoding: 'utf8' }
  );
  const text = `${r.stderr ?? ''}\n${r.stdout ?? ''}`;
  const m = text.match(/mean_volume:\s*([-\d.]+)\s*dB/);
  return m ? Number(m[1]) : null;
}

/**
 * Score a continuous engine-style loop. Higher is better.
 * Rejects gated / harmonic junk: many quiet windows, weak low end.
 */
function scoreLoopWav(wavPath) {
  const overall = meanVolumeDb(wavPath);
  const low = meanVolumeDb(wavPath, 'lowpass=f=250');
  const mid = meanVolumeDb(wavPath, 'bandpass=f=600:width_type=h:w=900');
  const high = meanVolumeDb(wavPath, 'highpass=f=2800');
  if (overall == null) return { score: -1e9, overall, low, mid, high, quietRatio: 1 };

  // Quiet-window ratio via python (portable, no deps).
  const py = `
import wave, struct, math, sys
p=sys.argv[1]
w=wave.open(p,'rb')
fr=w.getnframes(); sr=w.getframerate(); raw=w.readframes(fr)
samples=struct.unpack('<'+'h'*fr, raw)
win=max(1,int(sr*0.05)); quiet=0; n=0
for i in range(0, fr-win, win):
  chunk=samples[i:i+win]
  rms=math.sqrt(sum(s*s for s in chunk)/len(chunk))/32768
  db=20*math.log10(rms+1e-12)
  if db < -40: quiet += 1
  n += 1
print(f'{quiet/n if n else 1:.4f}')
`;
  const quietR = spawnSync('python3', ['-c', py, wavPath], { encoding: 'utf8' });
  const quietRatio = Number((quietR.stdout || '1').trim()) || 1;

  // Prefer continuous (low quiet), loud, body-forward (low/mid), not shrill (high << mid).
  const score =
    -quietRatio * 80 +
    (overall + 40) * 1.4 +
    ((low ?? -60) + 40) * 1.6 +
    ((mid ?? -60) + 40) * 1.1 -
    Math.max(0, (high ?? -60) - (mid ?? -60)) * 0.8;

  return { score, overall, low, mid, high, quietRatio };
}

function engineAf(job) {
  const kind = job.kind;
  if (kind === 'explosion') {
    // Format only for bombs — intentional (match existing loud takes).
    return job.reverse ? 'areverse' : null;
  }
  if (kind === 'exhaust') {
    return [
      'highpass=f=40',
      'lowpass=f=900',
      'equalizer=f=75:t=q:w=0.7:g=4',
      'equalizer=f=160:t=q:w=0.8:g=3',
      'equalizer=f=400:t=q:w=1.0:g=-1.5',
      'afade=t=in:st=0:d=0.06',
      'areverse,afade=t=in:st=0:d=0.06,areverse',
      'loudnorm=I=-14:TP=-1.2:LRA=8',
      'alimiter=limit=0.94',
    ].join(',');
  }
  if (kind === 'prop') {
    return [
      'highpass=f=80',
      'lowpass=f=7000',
      'equalizer=f=220:t=q:w=0.9:g=1.5',
      'equalizer=f=1200:t=q:w=1.0:g=1',
      'equalizer=f=4500:t=q:w=1.0:g=-2',
      'afade=t=in:st=0:d=0.06',
      'areverse,afade=t=in:st=0:d=0.06,areverse',
      'loudnorm=I=-16:TP=-1.5:LRA=8',
      'alimiter=limit=0.94',
    ].join(',');
  }
  // main engine
  return [
    'highpass=f=40',
    'lowpass=f=5200',
    'equalizer=f=85:t=q:w=0.75:g=4',
    'equalizer=f=200:t=q:w=0.85:g=2.5',
    'equalizer=f=550:t=q:w=1.0:g=1.5',
    'equalizer=f=2800:t=q:w=1.0:g=-3',
    'equalizer=f=4500:t=q:w=1.0:g=-4',
    'afade=t=in:st=0:d=0.06',
    'areverse,afade=t=in:st=0:d=0.06,areverse',
    'loudnorm=I=-14:TP=-1.2:LRA=8',
    'alimiter=limit=0.94',
  ].join(',');
}

/**
 * Mono 44.1 kHz. Engines get body EQ + loudnorm (match vehicle engine bake);
 * bombs stay format-only so existing loud takes keep their character.
 */
function convert(srcPath, destName, job = {}) {
  const dest = join(OUT, destName);
  const args = ['-y', '-i', srcPath, '-ac', '1', '-ar', '44100'];
  const af = engineAf(job);
  if (af) args.push('-af', af);
  args.push('-c:a', 'pcm_s16le', dest);
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-500));
    throw new Error(`ffmpeg failed for ${destName}`);
  }
}

/** Raw PCM convert for scoring candidates before final process. */
function convertRaw(srcPath, destPath) {
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', srcPath, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', destPath],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-400));
    throw new Error(`ffmpeg raw convert failed for ${destPath}`);
  }
}

function promptVariants(job) {
  const list = [job.text, ...(job.altTexts ?? [])];
  return list.filter(Boolean);
}

function selectedJobs() {
  if (!onlyArg) return CATALOG;
  const tokens = onlyArg.split(',').map((s) => s.trim()).filter(Boolean);
  return CATALOG.filter(
    (job) =>
      tokens.includes(job.group) ||
      tokens.includes(job.kind) ||
      tokens.includes(job.file) ||
      tokens.some((t) => job.file.includes(t))
  );
}

async function generateBestTake(job, label) {
  const takes = Math.max(1, job.takes ?? 1);
  const variants = promptVariants(job);
  let best = null;

  for (let t = 0; t < takes; t++) {
    const text = variants[t % variants.length];
    process.stdout.write(t === 0 ? `generating ${takes} take(s)…` : ` take${t + 1}`);
    const mp3 = await generateSfx(job, text);
    const tmpMp3 = join(TMP, `${job.file}.t${t}.mp3`);
    const tmpWav = join(TMP, `${job.file}.t${t}.wav`);
    writeFileSync(tmpMp3, mp3);
    convertRaw(tmpMp3, tmpWav);
    const metrics = scoreLoopWav(tmpWav);
    const line = `  take ${t + 1}/${takes}: score=${metrics.score.toFixed(1)} quiet=${(metrics.quietRatio * 100).toFixed(0)}% mean=${metrics.overall?.toFixed(1)} low=${metrics.low?.toFixed(1)} mid=${metrics.mid?.toFixed(1)} high=${metrics.high?.toFixed(1)}`;
    console.log(`\n${label}${line}`);
    if (!best || metrics.score > best.metrics.score) {
      best = { tmpMp3, tmpWav, metrics, take: t + 1 };
    }
    await sleep(480);
  }

  if (!best) throw new Error('no takes produced');
  convert(best.tmpMp3, job.file, job);
  const finalMetrics = scoreLoopWav(join(OUT, job.file));
  console.log(
    `${label} — picked take ${best.take} → final mean=${finalMetrics.overall?.toFixed(1)} quiet=${(finalMetrics.quietRatio * 100).toFixed(0)}%`
  );
  return finalMetrics;
}

async function main() {
  const jobs = selectedJobs();
  if (!jobs.length) {
    console.error(`No jobs match --only=${onlyArg}`);
    process.exit(1);
  }

  let invalid = false;
  for (const job of jobs) {
    for (const text of promptVariants(job)) {
      const len = [...text].length;
      const ok = len <= PROMPT_LIMIT && job.duration >= 0.5 && job.duration <= 30;
      console.log(`${ok ? 'ok' : 'INVALID'} ${job.file}: prompt ${len}/${PROMPT_LIMIT}, ${job.duration}s`);
      invalid ||= !ok;
    }
  }
  if (invalid) process.exit(1);
  if (validateOnly) return;

  if (!API_KEY) {
    console.error('Missing ELEVENLABS_API_KEY');
    process.exit(1);
  }

  console.log(`\nElevenLabs aircraft / bomb SFX — ${jobs.length} clips`);
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const dest = join(OUT, job.file);
    const label = `[${i + 1}/${jobs.length}] ${job.file}`;
    if (!force && existsSync(dest)) {
      console.log(`${label} — skip`);
      skipped += 1;
      continue;
    }
    try {
      process.stdout.write(`${label} — `);
      if ((job.takes ?? 1) > 1 || (job.altTexts?.length ?? 0) > 0) {
        await generateBestTake(job, label);
      } else {
        process.stdout.write('generating… ');
        const mp3 = await generateSfx(job);
        const tmp = join(TMP, `${job.file}.mp3`);
        writeFileSync(tmp, mp3);
        convert(tmp, job.file, job);
        console.log('ok');
        await sleep(480);
      }
      ok += 1;
    } catch (err) {
      console.log('FAIL');
      console.error(`  ${err.message}`);
      failed += 1;
      if (String(err.message).includes('401')) process.exit(1);
      if (/429|quota|credit/i.test(err.message)) {
        console.error('Quota hit — stopping.');
        break;
      }
    }
  }

  console.log(`\nDone — ok ${ok}, skipped ${skipped}, failed ${failed}`);
  console.log(`WAVs in ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
