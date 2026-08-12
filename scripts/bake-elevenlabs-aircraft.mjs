/**
 * Bake faction fighter + transport engine loops + air-bomb one-shots via ElevenLabs SFX.
 *
 * Requires ELEVENLABS_API_KEY + ffmpeg.
 *
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-aircraft.mjs
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-aircraft.mjs --force
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-aircraft.mjs --only=bomb
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-aircraft.mjs --only=whistle
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-aircraft.mjs --only=engines
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-aircraft.mjs --only=transport
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

// Sound-design language works better than long aircraft model lists for EL SFX.
// Emphasize: real piston prop plane, steady RPM, outdoor mono field recording.
const REAL =
  'real outdoor mono field recording of a living airplane, steady constant RPM, natural mechanical texture, no music, no voices, no speech, no siren, no electronic drone';

/**
 * @type {{
 *   file: string, duration: number, influence: number, loop?: boolean,
 *   kind: string, group: string, text: string, takes?: number, altTexts?: string[]
 * }[]}
 */
const CATALOG = [
  // —— Fighters: acoustic character first, model names light ——
  {
    file: 'aircraft-flyby-germany.wav',
    duration: 4.5,
    influence: 0.45,
    loop: true,
    kind: 'engine',
    group: 'engines',
    takes: 4,
    text: `Seamless loop of a real vintage single-engine propeller fighter at full throttle, outdoor ground recording. Harsh inverted-V piston roar, raspy exhaust crackle, valve tick, and propeller thrash mixed as one continuous engine note. Steady RPM like a Bf 109 flyby. ${REAL}`,
    altTexts: [
      `Seamless loop of a real WWII fighter piston engine at combat power, continuous mechanical roar with sharp exhaust stacks and prop wash, outdoor airfield, constant throttle. ${REAL}`,
    ],
  },
  {
    file: 'aircraft-flyby-germany-exhaust.wav',
    duration: 4.0,
    influence: 0.42,
    loop: true,
    kind: 'exhaust',
    group: 'engines',
    takes: 3,
    text: `Seamless loop of vintage fighter engine exhaust stacks only, continuous raspy popping pulses and dark low burble, outdoor, no propeller thrash. ${REAL}`,
  },
  {
    file: 'aircraft-flyby-germany-prop.wav',
    duration: 3.8,
    influence: 0.4,
    loop: true,
    kind: 'prop',
    group: 'engines',
    takes: 3,
    text: `Seamless loop of a real airplane propeller chopping air only, continuous blade thrash and wind whoosh, no engine tone, outdoor. ${REAL}`,
  },
  {
    file: 'aircraft-flyby-usa.wav',
    duration: 4.5,
    influence: 0.45,
    loop: true,
    kind: 'engine',
    group: 'engines',
    takes: 4,
    text: `Seamless loop of a real vintage single-engine propeller fighter at combat power, outdoor ground recording. Smooth deep V12 piston roar, powerful continuous propeller thrash, steady Merlin-like howl. Constant RPM. ${REAL}`,
    altTexts: [
      `Seamless loop of a real P-51 style warbird engine flyby at full power, continuous deep piston rumble and prop thrash, outdoor field recording. ${REAL}`,
    ],
  },
  {
    file: 'aircraft-flyby-usa-exhaust.wav',
    duration: 4.0,
    influence: 0.42,
    loop: true,
    kind: 'exhaust',
    group: 'engines',
    takes: 3,
    text: `Seamless loop of V12 fighter exhaust only, smooth continuous deep exhaust pulses, outdoor, no propeller. ${REAL}`,
  },
  {
    file: 'aircraft-flyby-usa-prop.wav',
    duration: 3.8,
    influence: 0.4,
    loop: true,
    kind: 'prop',
    group: 'engines',
    takes: 3,
    text: `Seamless loop of a four-blade warbird propeller thrash only, continuous air chop, outdoor, no engine. ${REAL}`,
  },
  {
    file: 'aircraft-flyby-uk.wav',
    duration: 4.5,
    influence: 0.45,
    loop: true,
    kind: 'engine',
    group: 'engines',
    takes: 4,
    text: `Seamless loop of a real vintage British single-engine fighter at full throttle, outdoor recording. Bright singing V12 piston howl, continuous prop thrash, Spitfire-like engine note at steady RPM. ${REAL}`,
    altTexts: [
      `Seamless loop of a real Merlin-powered warbird at combat power, continuous bright piston roar and propeller wash, outdoor airfield. ${REAL}`,
    ],
  },
  {
    file: 'aircraft-flyby-uk-exhaust.wav',
    duration: 4.0,
    influence: 0.42,
    loop: true,
    kind: 'exhaust',
    group: 'engines',
    takes: 3,
    text: `Seamless loop of Merlin-style fighter exhaust only, bright mid-forward continuous exhaust song with low body, outdoor, no prop. ${REAL}`,
  },
  {
    file: 'aircraft-flyby-uk-prop.wav',
    duration: 3.8,
    influence: 0.4,
    loop: true,
    kind: 'prop',
    group: 'engines',
    takes: 3,
    text: `Seamless loop of fighter propeller blade thrash only, continuous air whoosh, outdoor, no engine. ${REAL}`,
  },
  {
    file: 'aircraft-flyby-russia.wav',
    duration: 4.5,
    influence: 0.45,
    loop: true,
    kind: 'engine',
    group: 'engines',
    takes: 4,
    text: `Seamless loop of a real vintage single-engine attack plane at full power, outdoor ground recording. Rough lower growling inline piston engine, heavy continuous prop thrash, Il-2-like thick engine note. Steady RPM. ${REAL}`,
    altTexts: [
      `Seamless loop of a real heavy WWII attack aircraft piston engine, continuous rough deep roar and prop thrash, outdoor field recording. ${REAL}`,
    ],
  },
  {
    file: 'aircraft-flyby-russia-exhaust.wav',
    duration: 4.0,
    influence: 0.42,
    loop: true,
    kind: 'exhaust',
    group: 'engines',
    takes: 3,
    text: `Seamless loop of rough attack-plane exhaust only, deep continuous growling exhaust pulses, outdoor, no propeller. ${REAL}`,
  },
  {
    file: 'aircraft-flyby-russia-prop.wav',
    duration: 3.8,
    influence: 0.4,
    loop: true,
    kind: 'prop',
    group: 'engines',
    takes: 3,
    text: `Seamless loop of heavy aircraft propeller thrash only, continuous air chopping, outdoor, no engine. ${REAL}`,
  },
  {
    file: 'aircraft-flyby-japan.wav',
    duration: 4.5,
    influence: 0.45,
    loop: true,
    kind: 'engine',
    group: 'engines',
    takes: 5,
    text: `Seamless loop of a real vintage single-engine air-cooled radial fighter at full throttle, outdoor ground recording. Deep continuous radial piston roar, cylinder bark, exhaust crackle, and propeller thrash as one steady engine note. Constant RPM. ${REAL}`,
    altTexts: [
      `Seamless loop of a real WWII radial-engine fighter flyby, continuous throaty piston rumble and prop wash, outdoor airfield, no thin buzz. ${REAL}`,
      `Seamless loop of a real air-cooled radial airplane engine at combat power, thick continuous mechanical roar with prop thrash, outdoor mono recording. ${REAL}`,
    ],
  },
  {
    file: 'aircraft-flyby-japan-exhaust.wav',
    duration: 4.0,
    influence: 0.42,
    loop: true,
    kind: 'exhaust',
    group: 'engines',
    takes: 4,
    text: `Seamless loop of air-cooled radial fighter exhaust only, continuous deep stacked exhaust pulses and dark burble, outdoor, no propeller. ${REAL}`,
  },
  {
    file: 'aircraft-flyby-japan-prop.wav',
    duration: 3.8,
    influence: 0.4,
    loop: true,
    kind: 'prop',
    group: 'engines',
    takes: 3,
    text: `Seamless loop of fighter propeller thrash only, continuous blade air chop, outdoor, no engine. ${REAL}`,
  },

  // —— Transports: multi-engine beds with CLEAR engine roar + prop thrash ——
  // (Prior “bass only” prompts produced mute glider-like whooshes.)
  {
    file: 'aircraft-transport-germany.wav',
    duration: 4.8,
    influence: 0.5,
    loop: true,
    kind: 'engine',
    group: 'transport',
    takes: 4,
    text: `Seamless loop of a real vintage three-engine propeller transport flying overhead, outdoor ground recording. Loud continuous multi-radial piston engines, clear mechanical roar, raspy exhaust, strong propeller thrash like a Ju 52. Audible engines not wind, steady RPM. ${REAL}`,
    altTexts: [
      `Seamless loop of a real trimotor cargo plane flyby, continuous loud piston engines and chopping propellers, outdoor field recording, clear engine noise. ${REAL}`,
    ],
  },
  {
    file: 'aircraft-transport-germany-exhaust.wav',
    duration: 4.2,
    influence: 0.46,
    loop: true,
    kind: 'exhaust',
    group: 'transport',
    takes: 3,
    text: `Seamless loop of multi-radial transport engine exhaust stacks only, continuous audible popping exhaust pulses and low-mid engine burble, outdoor, no propeller thrash. ${REAL}`,
  },
  {
    file: 'aircraft-transport-germany-prop.wav',
    duration: 4.0,
    influence: 0.48,
    loop: true,
    kind: 'prop',
    group: 'transport',
    takes: 3,
    text: `Seamless loop of three large transport propellers chopping air hard, continuous loud blade thrash and prop wash, outdoor, no engine tone. ${REAL}`,
  },
  {
    file: 'aircraft-transport-usa.wav',
    duration: 4.8,
    influence: 0.5,
    loop: true,
    kind: 'engine',
    group: 'transport',
    takes: 4,
    text: `Seamless loop of a real vintage twin-engine cargo plane flying overhead, outdoor ground recording. Loud continuous twin radial piston engines, clear mechanical roar, exhaust crackle, and strong propeller thrash like a C-47. Audible engines not wind, steady RPM. ${REAL}`,
    altTexts: [
      `Seamless loop of a real DC-3 style transport flyby, continuous loud twin piston engines and propellers thrashing, outdoor field recording. ${REAL}`,
    ],
  },
  {
    file: 'aircraft-transport-usa-exhaust.wav',
    duration: 4.2,
    influence: 0.46,
    loop: true,
    kind: 'exhaust',
    group: 'transport',
    takes: 3,
    text: `Seamless loop of twin radial cargo-plane exhaust only, continuous audible exhaust roar and pulses, outdoor, no propeller. ${REAL}`,
  },
  {
    file: 'aircraft-transport-usa-prop.wav',
    duration: 4.0,
    influence: 0.48,
    loop: true,
    kind: 'prop',
    group: 'transport',
    takes: 3,
    text: `Seamless loop of twin large transport propellers chopping air hard, continuous loud blade thrash, outdoor, no engine. ${REAL}`,
  },
  {
    file: 'aircraft-transport-uk.wav',
    duration: 4.8,
    influence: 0.5,
    loop: true,
    kind: 'engine',
    group: 'transport',
    takes: 4,
    text: `Seamless loop of a real RAF Dakota twin-engine transport flying overhead, outdoor recording. Loud continuous twin piston engines, clear mechanical roar and strong propeller thrash. Audible engines not wind, steady RPM. ${REAL}`,
  },
  {
    file: 'aircraft-transport-uk-exhaust.wav',
    duration: 4.2,
    influence: 0.46,
    loop: true,
    kind: 'exhaust',
    group: 'transport',
    takes: 3,
    text: `Seamless loop of Dakota twin-engine exhaust only, continuous audible exhaust pulses, outdoor, no propeller. ${REAL}`,
  },
  {
    file: 'aircraft-transport-uk-prop.wav',
    duration: 4.0,
    influence: 0.48,
    loop: true,
    kind: 'prop',
    group: 'transport',
    takes: 3,
    text: `Seamless loop of twin transport propellers chopping air hard, continuous loud blade thrash, outdoor, no engine. ${REAL}`,
  },
  {
    file: 'aircraft-transport-russia.wav',
    duration: 4.8,
    influence: 0.5,
    loop: true,
    kind: 'engine',
    group: 'transport',
    takes: 4,
    text: `Seamless loop of a real Soviet twin-engine transport flying overhead, outdoor ground recording. Loud continuous rough twin piston engines, clear mechanical roar and heavy propeller thrash. Audible engines not wind, steady RPM. ${REAL}`,
  },
  {
    file: 'aircraft-transport-russia-exhaust.wav',
    duration: 4.2,
    influence: 0.46,
    loop: true,
    kind: 'exhaust',
    group: 'transport',
    takes: 3,
    text: `Seamless loop of rough twin transport exhaust only, continuous audible growling exhaust pulses, outdoor, no propeller. ${REAL}`,
  },
  {
    file: 'aircraft-transport-russia-prop.wav',
    duration: 4.0,
    influence: 0.48,
    loop: true,
    kind: 'prop',
    group: 'transport',
    takes: 3,
    text: `Seamless loop of heavy transport propellers chopping air hard, continuous loud blade thrash, outdoor, no engine. ${REAL}`,
  },
  {
    file: 'aircraft-transport-japan.wav',
    duration: 4.8,
    influence: 0.5,
    loop: true,
    kind: 'engine',
    group: 'transport',
    takes: 4,
    text: `Seamless loop of a real twin-engine propeller transport flying overhead, outdoor ground recording. Loud continuous twin radial piston engines, clear mechanical roar, exhaust, and strong propeller thrash. Audible engines not wind, steady RPM. ${REAL}`,
    altTexts: [
      `Seamless loop of a real Pacific twin-engine cargo plane flyby, continuous loud piston engines and propellers thrashing air, outdoor field recording. ${REAL}`,
    ],
  },
  {
    file: 'aircraft-transport-japan-exhaust.wav',
    duration: 4.2,
    influence: 0.46,
    loop: true,
    kind: 'exhaust',
    group: 'transport',
    takes: 3,
    text: `Seamless loop of twin radial transport exhaust only, continuous audible exhaust pulses, outdoor, no propeller. ${REAL}`,
  },
  {
    file: 'aircraft-transport-japan-prop.wav',
    duration: 4.0,
    influence: 0.48,
    loop: true,
    kind: 'prop',
    group: 'transport',
    takes: 3,
    text: `Seamless loop of twin transport propellers chopping air hard, continuous loud blade thrash, outdoor, no engine. ${REAL}`,
  },

  // —— Freefall (played at rack release; ~1.3 s fall in-game).
  // "Iconic whistle" yields a cartoon sine. Ask for air rush + a breathy howl;
  // convert() then buries any leftover tone in generated turbulence.
  {
    file: 'bomb-whistle-01.wav',
    duration: 1.45,
    influence: 0.68,
    kind: 'whistle',
    group: 'whistle',
    text:
      'Realistic incoming World War Two high explosive falling through air toward the listener, rushing hiss that grows ' +
      'and slightly falls, outdoor combat recording, dry, no cartoon, no siren, no explosion yet, no airplane, no music, no voices',
  },
  {
    file: 'bomb-whistle-02.wav',
    duration: 1.45,
    influence: 0.68,
    kind: 'whistle',
    group: 'whistle',
    text:
      'Realistic incoming World War Two high explosive falling through air toward the listener, rushing hiss that grows ' +
      'and slightly falls, outdoor combat recording, dry, no cartoon, no siren, no explosion yet, no airplane, no music, no voices',
  },
  {
    file: 'bomb-whistle-03.wav',
    duration: 1.5,
    influence: 0.68,
    kind: 'whistle',
    group: 'whistle',
    text:
      'Heavy steel bomb falling from an airplane through open air, rushing wind growing louder, slight falling Doppler, ' +
      'turbulent outdoor field recording, no cartoon, no musical note, no explosion, no airplane engine, no music, no voices',
  },

  // —— Air bomb detonation. Format convert only — no EQ.
  // Loud/close prompts so takes match bomb-explosion-02 level.
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
print(f'{(quiet/n if n else 1):.4f}')
`;
  const quietR = spawnSync('python3', ['-c', py, wavPath], { encoding: 'utf8' });
  const quietLine = (quietR.stdout || '').trim().split(/\s+/).pop();
  const quietRatio = Number(quietLine);
  const quietSafe = Number.isFinite(quietRatio) ? quietRatio : 1;

  // Prefer continuous, loud, with real engine midrange — not pure sub (glider).
  // Penalize takes that are only low-end with dead mids/highs.
  const lowV = low ?? -60;
  const midV = mid ?? -60;
  const highV = high ?? -60;
  const midGap = Math.max(0, midV - lowV); // more negative mid vs low = bad (pure bass)
  // midGap is mid - low; if mid is much quieter, mid - low is large negative... wait
  // low=-15, mid=-30 → mid-low = -15. We want to penalize when mid is much quieter than low.
  const midTooQuiet = Math.max(0, lowV - midV); // positive when mid weaker than low
  const score =
    -quietSafe * 90 +
    (overall + 40) * 1.35 +
    (lowV + 40) * 1.2 +
    (midV + 40) * 1.9 +
    (highV + 40) * 0.55 -
    midTooQuiet * 1.4 -
    Math.max(0, highV - midV) * 0.8;

  return { score, overall, low, mid, high, quietRatio: quietSafe };
}

/**
 * Light mastering. Transports get extra low-end / darker EQ for a deeper bed.
 */
function engineAf(job) {
  const kind = job.kind;
  const deep = job.group === 'transport';
  if (kind === 'explosion') {
    return job.reverse ? 'areverse' : null;
  }
  if (kind === 'whistle') {
    // Light EQ only — convert() layers turbulence so a leftover tone does not read as a toy whistle.
    return [
      'highpass=f=160',
      'lowpass=f=7000',
      'equalizer=f=2800:t=q:w=1.2:g=-3',
      'equalizer=f=5500:t=q:w=1.0:g=-4',
    ].join(',');
  }
  if (kind === 'exhaust') {
    return deep
      ? [
          // Keep mid exhaust crackle audible (not pure sub)
          'highpass=f=40',
          'lowpass=f=2200',
          'equalizer=f=80:t=q:w=0.7:g=2.5',
          'equalizer=f=220:t=q:w=0.85:g=2',
          'equalizer=f=700:t=q:w=1.0:g=1.5',
          'equalizer=f=4500:t=q:w=1.0:g=-2',
          'afade=t=in:st=0:d=0.05',
          'areverse,afade=t=in:st=0:d=0.05,areverse',
          'loudnorm=I=-14:TP=-1.3:LRA=9',
          'alimiter=limit=0.95',
        ].join(',')
      : [
          'highpass=f=45',
          'lowpass=f=1400',
          'equalizer=f=90:t=q:w=0.8:g=1.5',
          'equalizer=f=3500:t=q:w=1.0:g=-2',
          'afade=t=in:st=0:d=0.05',
          'areverse,afade=t=in:st=0:d=0.05,areverse',
          'loudnorm=I=-16:TP=-1.5:LRA=9',
          'alimiter=limit=0.95',
        ].join(',');
  }
  if (kind === 'prop') {
    return deep
      ? [
          // Bright thrash so props read on the fly-by
          'highpass=f=100',
          'lowpass=f=9000',
          'equalizer=f=350:t=q:w=0.9:g=1.5',
          'equalizer=f=1200:t=q:w=1.0:g=2.5',
          'equalizer=f=2800:t=q:w=1.0:g=2',
          'afade=t=in:st=0:d=0.05',
          'areverse,afade=t=in:st=0:d=0.05,areverse',
          'loudnorm=I=-14:TP=-1.3:LRA=9',
          'alimiter=limit=0.95',
        ].join(',')
      : [
          'highpass=f=90',
          'lowpass=f=8000',
          'equalizer=f=5000:t=q:w=1.0:g=-1.5',
          'afade=t=in:st=0:d=0.05',
          'areverse,afade=t=in:st=0:d=0.05,areverse',
          'loudnorm=I=-17:TP=-1.5:LRA=9',
          'alimiter=limit=0.95',
        ].join(',');
  }
  // main engine
  return deep
    ? [
        // Body + clear mid engine roar (must not become a mute whoosh)
        'highpass=f=35',
        'lowpass=f=10000',
        'equalizer=f=90:t=q:w=0.7:g=2.5',
        'equalizer=f=220:t=q:w=0.85:g=2',
        'equalizer=f=550:t=q:w=0.9:g=2.5',
        'equalizer=f=1400:t=q:w=1.0:g=1.5',
        'equalizer=f=3200:t=q:w=1.0:g=0.5',
        'afade=t=in:st=0:d=0.05',
        'areverse,afade=t=in:st=0:d=0.05,areverse',
        'loudnorm=I=-13:TP=-1.2:LRA=10',
        'alimiter=limit=0.95',
      ].join(',')
    : [
        'highpass=f=35',
        'lowpass=f=9000',
        'equalizer=f=110:t=q:w=0.7:g=1.2',
        'equalizer=f=5500:t=q:w=1.0:g=-2',
        'afade=t=in:st=0:d=0.05',
        'areverse,afade=t=in:st=0:d=0.05,areverse',
        'loudnorm=I=-15:TP=-1.4:LRA=10',
        'alimiter=limit=0.95',
      ].join(',');
}

/**
 * Bury a leftover falling tone in turbulence so it does not read as a cartoon sine.
 */
function convertWhistle(srcPath, dest, job = {}) {
  const duration = Math.max(1.2, Number(job.duration) || 1.48);
  const elAf = engineAf({ ...job, kind: 'whistle' });
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      srcPath,
      '-f',
      'lavfi',
      '-i',
      `anoisesrc=d=${duration}:c=pink:r=44100:a=0.32`,
      '-f',
      'lavfi',
      '-i',
      `anoisesrc=d=${duration}:c=brown:r=44100:a=0.4`,
      '-filter_complex',
      [
        `[0:a]aformat=channel_layouts=mono,aresample=44100,${elAf},chorus=0.4:0.55:26:0.2:0.22:1.2,volume=0.72[el]`,
        '[1:a]highpass=f=350,lowpass=f=4200,afade=t=in:d=0.06,volume=0.26[pink]',
        '[2:a]highpass=f=200,lowpass=f=700,afade=t=in:d=0.05,volume=0.28[brown]',
        '[el][pink][brown]amix=inputs=3:duration=first:dropout_transition=0:normalize=0',
        'highpass=f=200',
        'equalizer=f=120:t=q:w=1.2:g=-10',
        'lowpass=f=8500',
        'afade=t=in:st=0:d=0.04',
        'areverse,afade=t=in:st=0:d=0.08,areverse',
        'loudnorm=I=-16:TP=-1.2:LRA=10',
        'alimiter=limit=0.96',
        'aresample=44100',
      ].join(','),
      '-ac',
      '1',
      '-ar',
      '44100',
      '-c:a',
      'pcm_s16le',
      dest,
    ],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-500));
    throw new Error(`ffmpeg failed for ${dest}`);
  }
}

/**
 * Mono 44.1 kHz. Engines get body EQ + loudnorm (match vehicle engine bake);
 * bombs stay format-only so existing loud takes keep their character.
 */
function convert(srcPath, destName, job = {}) {
  const dest = join(OUT, destName);
  if (job.kind === 'whistle') {
    convertWhistle(srcPath, dest, job);
    return;
  }
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
