/**
 * Bake realistic gunfire / explosion WAVs via ElevenLabs Sound Effects API.
 *
 * Requires:
 *   ELEVENLABS_API_KEY   — API key from https://elevenlabs.io/app/developers/api-keys
 *   ffmpeg               — on PATH (for mp3 → mono 44.1 kHz WAV)
 *
 * Usage:
 *   ELEVENLABS_API_KEY=sk_... node scripts/bake-elevenlabs-sfx.mjs
 *   ELEVENLABS_API_KEY=sk_... node scripts/bake-elevenlabs-sfx.mjs --only explosion,impact,rifle
 *   ELEVENLABS_API_KEY=sk_... node scripts/bake-elevenlabs-sfx.mjs --force   # re-download even if file exists
 *
 * Free tier ≈ 200 credits / generation, 10k credits / month (~50 gens).
 * Do not commit API keys. Prefer: export ELEVENLABS_API_KEY=... in your shell.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-sfx');
const API = 'https://api.elevenlabs.io/v1/sound-generation';

const API_KEY = process.env.ELEVENLABS_API_KEY?.trim();

const args = process.argv.slice(2);
const force = args.includes('--force');
const validate = args.includes('--validate');
const onlyIdx = args.indexOf('--only');
const onlyArg = onlyIdx >= 0 ? args[onlyIdx + 1] ?? '' : null;
const onlySet =
  onlyArg !== null
    ? new Set(
        onlyArg
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
    : null;

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

/**
 * Post-process: mono, 44.1 kHz, light trim + normalize for game one-shots.
 * IMPORTANT: never use afade=t=out:st=0 — that zeros the whole clip after 1 ms
 * (sounds like a high-pitched click in-game).
 *
 * Gunfire gets a warmer EQ (more low body, tamed harsh mids) so AI samples
 * don't read as thin/metallic in the Web Audio graph.
 */
function convertToGameWav(srcPath, destName, { fadeOut = 0.05, pad = 0.02 } = {}) {
  const dest = join(OUT, destName);
  const isExplosion = /^explosion/i.test(destName);
  const isImpact = /^(impact|bullet-impact|bullet-structure|bullet-metal)/i.test(destName);
  const isRicochet = /^armor-ricochet/i.test(destName);
  const isWhiz = /^bullet-whiz/i.test(destName);
  const isGun =
    /^(rifle|mg|tank|at-|mortar|howitzer|artillery)/i.test(destName) &&
    !isExplosion;

  const isMortar = /^mortar/i.test(destName);
  const eq = isWhiz
    ? [
        // Passing rounds need a clean transient and little low end.
        'highpass=f=180',
        'lowpass=f=11500',
        'equalizer=f=2800:t=q:w=1.0:g=2',
        'equalizer=f=6500:t=q:w=1.0:g=-3',
      ]
    : isRicochet
      ? [
          // Keep the steel strike present without turning the tail into a bell.
          'highpass=f=65',
          'lowpass=f=13000',
          'equalizer=f=180:t=q:w=0.8:g=2.5',
          'equalizer=f=3200:t=q:w=1.0:g=-2',
          'equalizer=f=7200:t=q:w=1.0:g=-3',
        ]
      : isMortar
        ? [
        // Mortar = low hollow thump, not a bright crack
        'highpass=f=40',
        'lowpass=f=6500',
        'equalizer=f=90:t=q:w=0.8:g=5',
        'equalizer=f=200:t=q:w=0.9:g=3',
        'equalizer=f=2500:t=q:w=1.0:g=-6',
        'equalizer=f=4500:t=q:w=1.0:g=-8',
          ]
        : isGun
          ? [
          // Keep sub-thump; cut thin hiss that reads as "tinny"
          'highpass=f=50',
          'lowpass=f=10500',
          // Body / powder — loud combat presence
          'equalizer=f=110:t=q:w=0.8:g=4.5',
          'equalizer=f=260:t=q:w=0.9:g=2.5',
          'equalizer=f=900:t=q:w=1.0:g=1.5',
          // Tame metallic / clanky mid-high
          'equalizer=f=2800:t=q:w=1.1:g=-5.0',
          'equalizer=f=4500:t=q:w=1.0:g=-5.5',
          'equalizer=f=7000:t=q:w=1.0:g=-3.5',
            ]
          : isExplosion
            ? ['highpass=f=30', 'lowpass=f=12000', 'equalizer=f=60:t=q:w=0.7:g=2.5']
            : isImpact
              ? [
                  'highpass=f=45',
                  'lowpass=f=11500',
                  'equalizer=f=120:t=q:w=0.8:g=2',
                  'equalizer=f=2500:t=q:w=1.0:g=-2',
                ]
              : ['highpass=f=40', 'lowpass=f=12000'];

  const af = [
    ...eq,
    'silenceremove=start_periods=1:start_silence=0.01:start_threshold=-50dB:detection=peak',
    `apad=pad_dur=${pad}`,
    'afade=t=in:st=0:d=0.002',
    // true end fade: reverse → fade in → reverse
    `areverse,afade=t=in:st=0:d=${fadeOut},areverse`,
    // Hotter targets so one-shots punch through battle mix
    isGun || isMortar
      ? 'loudnorm=I=-9:TP=-0.5:LRA=5'
      : isRicochet || isImpact
        ? 'loudnorm=I=-12:TP=-1.0:LRA=7'
        : isWhiz
          ? 'loudnorm=I=-16:TP=-1.0:LRA=7'
          : 'loudnorm=I=-14:TP=-1.0:LRA=7',
    'volume=1.15',
    'alimiter=limit=0.98',
  ].join(',');

  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', srcPath, '-ac', '1', '-ar', '44100', '-af', af, dest],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error(`ffmpeg failed for ${destName}`);
  }
  return dest;
}

async function generateSfx({ text, duration_seconds, prompt_influence = 0.45 }) {
  const body = {
    text,
    model_id: 'eleven_text_to_sound_v2',
    prompt_influence,
  };
  if (duration_seconds != null) body.duration_seconds = duration_seconds;

  const res = await fetch(`${API}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${errText}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Shared prompt tails — avoid words that push the model toward tinny / sci-fi FX
 * (metallic, buzz, ring, clank, synthetic). Game adds reverb at runtime.
 */
const REALISTIC =
  'authentic outdoor field recording, natural acoustic, full low-end body and powder blast, short natural decay, dry, no music, no voices, no speech, no ricochet, not synthetic, not electronic, not cinematic trailer';

/**
 * Catalog of game samples. Gunfire prompts emphasize real ballistic crack +
 * muzzle thump (not metallic clanks). Explosions kept as-is if already good.
 */
const CATALOG = [
  // —— Core impacts (leave alone unless --force; already sounding good) ——
  {
    file: 'explosion.wav',
    duration: 1.8,
    influence: 0.55,
    text: `Massive World War Two high explosive shell detonation outdoors, deep bass boom, dirt and debris, pressure wave, ${REALISTIC}`,
  },
  {
    file: 'explosion-j.wav',
    duration: 1.7,
    influence: 0.55,
    text: `World War Two artillery shell exploding in a muddy field, sharp initial crack, heavy earth burst, deep short boom and natural outdoor decay, authentic field recording, no music, no voices, no speech, no synthetic, no electronic, no cinematic trailer`,
  },
  {
    file: 'explosion-k.wav',
    duration: 1.85,
    influence: 0.53,
    text: `Close World War Two high explosive shell burst beside a stone wall, violent pressure wave, dirt and masonry debris, deep low boom with brief natural rumble, dry outdoor battlefield recording, no music, no voices, no speech, no synthetic, no electronic`,
  },
  {
    file: 'mine-explosion-01.wav',
    duration: 1.15,
    influence: 0.62,
    text: `World War Two anti-tank mine detonating under an armored car, violent close ground blast, deep low thump, tearing hull impact, dirt and stones thrown upward, ${REALISTIC}`,
  },
  {
    file: 'mine-explosion-02.wav',
    duration: 1.25,
    influence: 0.6,
    text: `Buried World War Two anti-tank mine exploding beneath a light armored vehicle in an open field, sharp crack, heavy earth burst, brief metal slam and natural battlefield decay, ${REALISTIC}`,
  },
  {
    file: 'impact.wav',
    duration: 0.55,
    influence: 0.5,
    text: `Bullet striking packed dirt and sand, short thud with gravel spray, soft body, ${REALISTIC}`,
  },
  {
    file: 'impact-f.wav',
    duration: 0.55,
    influence: 0.52,
    text: `Rifle bullet striking dry grass and loose dirt, compact dusty thud and tiny pebble spray, authentic outdoor battlefield recording, short natural decay, no gunshot, no voices, no music, no explosion, no synthetic sound`,
  },
  {
    file: 'impact-g.wav',
    duration: 0.58,
    influence: 0.5,
    text: `Several small arms rounds hitting sandbags and packed earth, irregular dull thumps and dust puffs, close realistic field recording, no muzzle blast, no voices, no music, no explosion, no electronic sound`,
  },
  {
    file: 'armor-ricochet-01.wav',
    duration: 0.8,
    influence: 0.68,
    text:
      'A high velocity World War Two anti-tank shell glancing off thick steel armor plate, violent sharp metal strike, bright shower of sparks, brief rising ricochet whine, outdoor battlefield recording, dry, no voices, no music, no gun muzzle blast, no explosion, not synthetic',
  },
  {
    file: 'armor-ricochet-02.wav',
    duration: 0.75,
    influence: 0.62,
    text:
      'World War Two tank shell deflected by heavy steel armor, hard metallic crack and scraping clang, hot sparks scattering, very short ricochet whine, authentic outdoor recording, dry, no voices, no music, no cannon firing sound, no explosion, not synthetic',
  },

  // —— Generic fallbacks ——
  {
    file: 'rifle.wav',
    duration: 0.65,
    influence: 0.65,
    text: `Single World War Two bolt action rifle gunshot outdoors, deep muzzle blast then sharp ballistic crack of a rifle bullet, heavy powder thump, ${REALISTIC}`,
  },
  {
    file: 'mg.wav',
    duration: 0.9,
    influence: 0.6,
    text: `Short burst of five World War Two machine gun shots outdoors, each shot a real gunshot with muzzle blast, medium rate of fire, heavy thumping reports, ${REALISTIC}`,
  },
  {
    file: 'tank.wav',
    duration: 1.05,
    influence: 0.6,
    text: `World War Two medium tank main gun firing outdoors, huge muzzle blast boom, deep low frequency thump, short open air decay, ${REALISTIC}`,
  },
  {
    file: 'artillery.wav',
    duration: 1.45,
    influence: 0.6,
    text: `World War Two field howitzer firing outdoors, deep cannon boom, long low rumble across an open field, heavy powder charge, ${REALISTIC}`,
  },

  // —— Rifles (single shots; slight variation between A/B) ——
  {
    file: 'rifle-germany.wav',
    duration: 0.65,
    influence: 0.65,
    text: `Single Karabiner 98k Mauser rifle shot outdoors, deep 7.92mm muzzle blast and loud ballistic crack, heavy bolt action rifle report, ${REALISTIC}`,
  },
  {
    file: 'rifle-germany-b.wav',
    duration: 0.62,
    influence: 0.55,
    text: `Single Mauser Kar98k rifle gunshot outdoors, slightly deeper thump, powder blast and crack, open field, ${REALISTIC}`,
  },
  {
    file: 'rifle-usa.wav',
    duration: 0.65,
    influence: 0.65,
    text: `Single M1 Garand thirty aught six rifle gunshot outdoors, powerful deep muzzle blast and sharp crack, semi automatic rifle report, ${REALISTIC}`,
  },
  {
    file: 'rifle-usa-b.wav',
    duration: 0.65,
    influence: 0.55,
    text: `Single M1 Garand rifle shot outdoors, punchy powder blast, full body gunshot, open field, ${REALISTIC}`,
  },
  {
    file: 'rifle-uk.wav',
    duration: 0.7,
    influence: 0.72,
    text:
      'Extremely realistic single Lee-Enfield .303 British bolt-action rifle gunshot recorded outdoors in an open field. Powerful deep muzzle blast, heavy powder thump, then a sharp ballistic crack of a real bullet. Full-bodied loud report like a live-fire range recording. No metal clank, no tinny tones, no synthetic buzz, no music, no voices, dry short natural decay',
  },
  {
    file: 'rifle-uk-b.wav',
    duration: 0.68,
    influence: 0.62,
    text:
      'Realistic Lee-Enfield SMLE .303 rifle single shot outdoors, loud deep powder blast and crisp crack, live-fire field recording feel, full low-end body, no metallic ring, no music, no voices',
  },
  {
    file: 'rifle-russia.wav',
    duration: 0.65,
    influence: 0.65,
    text: `Single Mosin Nagant rifle gunshot outdoors, hard deep muzzle blast and crack, heavy bolt action, ${REALISTIC}`,
  },
  {
    file: 'rifle-russia-b.wav',
    duration: 0.62,
    influence: 0.55,
    text: `Single Mosin Nagant 1891 rifle shot outdoors, deep thumping gunshot, open field, ${REALISTIC}`,
  },

  // —— Machine guns (short bursts) ——
  {
    file: 'mg-germany.wav',
    duration: 0.8,
    influence: 0.62,
    text: `Short MG42 machine gun burst outdoors, very fast successive real gunshots, each with muzzle blast, about eight shots, heavy powder reports not a synthetic buzz, ${REALISTIC}`,
  },
  {
    file: 'mg-germany-b.wav',
    duration: 0.72,
    influence: 0.55,
    text: `Short German MG42 burst outdoors, rapid individual gunshots with deep thumps, open field, ${REALISTIC}`,
  },
  {
    file: 'mg-usa.wav',
    duration: 0.85,
    influence: 0.62,
    text: `Short Browning M1919 machine gun burst outdoors, slower heavy thumping gunshots, four or five distinct shots with deep muzzle blast, ${REALISTIC}`,
  },
  {
    file: 'mg-usa-b.wav',
    duration: 0.85,
    influence: 0.55,
    text: `Short American thirty caliber machine gun burst outdoors, heavy rhythmic gunshots, powder blast, open field, ${REALISTIC}`,
  },
  {
    file: 'mg-uk.wav',
    duration: 0.85,
    influence: 0.62,
    text: `Short Bren light machine gun burst outdoors, measured rate, four or five solid gunshots with deep reports, ${REALISTIC}`,
  },
  {
    file: 'mg-uk-b.wav',
    duration: 0.8,
    influence: 0.55,
    text: `Short British Bren gun burst outdoors, distinct heavy shots, open field, ${REALISTIC}`,
  },
  {
    file: 'mg-russia.wav',
    duration: 0.85,
    influence: 0.62,
    text: `Short Soviet DP-28 light machine gun burst outdoors, five solid gunshots with deep muzzle blast, ${REALISTIC}`,
  },
  {
    file: 'mg-russia-b.wav',
    duration: 0.8,
    influence: 0.55,
    text: `Short DP-28 machine gun burst outdoors, rhythmic heavy shots, open field, ${REALISTIC}`,
  },

  // —— Tank / AT guns ——
  {
    file: 'tank-75-germany.wav',
    duration: 1.05,
    influence: 0.62,
    text: `German Panzer tank 75mm cannon firing outdoors, huge deep muzzle blast boom and pressure thump, heavy artillery style report, ${REALISTIC}`,
  },
  {
    file: 'tank-75-usa.wav',
    duration: 1.0,
    influence: 0.62,
    text: `American Sherman tank 75mm cannon firing outdoors, loud deep boom and powder blast, open field, ${REALISTIC}`,
  },
  {
    file: 'tank-75-uk.wav',
    duration: 1.0,
    influence: 0.62,
    text: `British tank 75mm gun firing outdoors, heavy deep muzzle blast, open field, ${REALISTIC}`,
  },
  {
    file: 'tank-88-germany.wav',
    duration: 1.2,
    influence: 0.65,
    text: `German 88mm tank gun firing outdoors, enormous deep bass boom and violent pressure wave, long low thump, ${REALISTIC}`,
  },
  {
    file: 'tank-90-usa.wav',
    duration: 1.15,
    influence: 0.62,
    text: `American 90mm tank cannon firing outdoors, very loud deep muzzle blast boom, ${REALISTIC}`,
  },
  {
    file: 'tank-17pdr-uk.wav',
    duration: 1.1,
    influence: 0.62,
    text: `British 17 pounder anti tank gun firing outdoors, violent deep crack and boom, heavy powder charge, ${REALISTIC}`,
  },
  {
    file: 'tank-76-russia.wav',
    duration: 1.0,
    influence: 0.62,
    text: `Soviet T-34 76mm tank gun firing outdoors, hard deep boom and muzzle blast, ${REALISTIC}`,
  },
  {
    file: 'tank-122-russia.wav',
    duration: 1.2,
    influence: 0.65,
    text: `Soviet IS-2 122mm tank gun firing outdoors, enormous deep bass boom and long pressure thump, ${REALISTIC}`,
  },
  {
    file: 'at-75-germany.wav',
    duration: 0.95,
    influence: 0.62,
    text: `German Pak 40 75mm anti tank gun firing outdoors, violent deep muzzle blast and crack, open field, ${REALISTIC}`,
  },
  {
    file: 'at-57-usa.wav',
    duration: 0.85,
    influence: 0.62,
    text: `American 57mm anti tank gun firing outdoors, sharp deep gunshot boom, powder blast, ${REALISTIC}`,
  },
  {
    file: 'at-57-uk.wav',
    duration: 0.85,
    influence: 0.62,
    text: `British six pounder anti tank gun firing outdoors, sharp deep crack and boom, open field, ${REALISTIC}`,
  },
  {
    file: 'at-76-russia.wav',
    duration: 0.95,
    influence: 0.62,
    text: `Soviet ZiS-3 76mm field gun firing outdoors, hard deep boom and muzzle blast, ${REALISTIC}`,
  },

  // —— Mortars (soft thump / launch — not a rifle crack) ——
  {
    file: 'mortar-germany.wav',
    duration: 0.85,
    influence: 0.72,
    text:
      'Realistic World War Two German 8 cm GrW 34 mortar firing outdoors. Soft deep hollow thump as the bomb drops and launches from the tube, low-frequency tube pop, brief air whoosh, not a rifle crack, not metallic, not tinny, live field recording, dry, no music, no voices',
  },
  {
    file: 'mortar-usa.wav',
    duration: 0.7,
    influence: 0.6,
    text: `American 60mm mortar firing outdoors, soft hollow pop and low thump, shell launch, ${REALISTIC}`,
  },
  {
    file: 'mortar-uk.wav',
    duration: 0.75,
    influence: 0.6,
    text: `British three inch mortar firing outdoors, soft deep hollow thump, ${REALISTIC}`,
  },
  {
    file: 'mortar-russia.wav',
    duration: 0.75,
    influence: 0.6,
    text: `Soviet 82mm mortar firing outdoors, soft deep hollow thump of a mortar launch, ${REALISTIC}`,
  },

  // —— Field artillery ——
  {
    file: 'howitzer-105-germany.wav',
    duration: 1.45,
    influence: 0.62,
    text: `German 105mm howitzer firing outdoors, deep field gun boom and long low rumble, heavy powder charge, ${REALISTIC}`,
  },
  {
    file: 'howitzer-105-usa.wav',
    duration: 1.45,
    influence: 0.62,
    text: `American 105mm howitzer firing outdoors, deep thunderous boom across an open field, ${REALISTIC}`,
  },
  {
    file: 'howitzer-25pdr-uk.wav',
    duration: 1.35,
    influence: 0.62,
    text: `British 25 pounder field gun firing outdoors, deep boom and powder blast, open field, ${REALISTIC}`,
  },
  {
    file: 'howitzer-122-russia.wav',
    duration: 1.45,
    influence: 0.62,
    text: `Soviet 122mm howitzer firing outdoors, massive deep boom and long rumble, ${REALISTIC}`,
  },
];

/** Additional battlefield one-shots. Keep these separate from the legacy pool
 * so the game can distinguish dirt, masonry/wood, steel and passing rounds. */
const COMBAT_EFFECT_CATALOG = [
  {
    file: 'armor-ricochet-03.wav',
    duration: 0.82,
    influence: 0.67,
    text:
      'World War Two armor-piercing shell glancing off an angled tank plate, hard steel impact, short tearing scrape, hot sparks and a brief rising deflection whistle, authentic outdoor field recording, dry, no voices, no music, no cannon muzzle blast, no explosion, no sci-fi, no synthetic sound',
  },
  {
    file: 'armor-ricochet-04.wav',
    duration: 0.78,
    influence: 0.64,
    text:
      'High velocity 75 millimeter tank shell striking and skipping from sloped armor, sharp plate crack, fragments and sparks, short metallic deflection tail, realistic World War Two range recording, dry, no voices, no music, no gun firing, no explosion, no electronic or cinematic sound',
  },
  {
    file: 'armor-ricochet-05.wav',
    duration: 0.88,
    influence: 0.65,
    text:
      'Heavy 88 millimeter shell hitting thick steel tank armor at a bad angle, brutal low metal slam followed by a short scraping deflection and bright sparks, authentic outdoor battlefield recording, dry, no voices, no music, no muzzle blast, no explosion, no sci-fi or synthetic sound',
  },
  {
    file: 'armor-ricochet-06.wav',
    duration: 0.68,
    influence: 0.6,
    text:
      'Small World War Two anti-tank round striking a steel vehicle side plate and glancing away, dry punch, two fast metal impacts, brief real ricochet whistle, outdoor field recording, no voices, no music, no gun muzzle blast, no explosion, no electronic or cinematic sound',
  },
  {
    file: 'bullet-impact-dirt-01.wav',
    duration: 0.5,
    influence: 0.58,
    text:
      'Single World War Two rifle bullet striking dry packed earth at close range, short dusty thud with a small spray of grit and pebbles, authentic outdoor field recording, dry, no gunshot, no bullet pass-by, no voices, no music, no explosion, no synthetic sound',
  },
  {
    file: 'bullet-impact-dirt-02.wav',
    duration: 0.5,
    influence: 0.56,
    text:
      'Several rifle bullets striking dry grass and loose soil, tight irregular dirt pops and tiny gravel sprays, realistic World War Two battlefield ground impacts, close outdoor recording, no gunshots, no voices, no music, no explosion, no electronic sound',
  },
  {
    file: 'bullet-impact-dirt-03.wav',
    duration: 0.5,
    influence: 0.56,
    text:
      'Single rifle bullet hitting sandy soil and small stones, gritty slap, brief dust puff and scattered pebbles, authentic outdoor live-fire range recording, no muzzle blast, no bullet whiz, no voices, no music, no explosion, no synthetic sound',
  },
  {
    file: 'bullet-impact-dirt-04.wav',
    duration: 0.52,
    influence: 0.55,
    text:
      'Rifle bullets hitting damp battlefield mud, dull wet earth slaps with small flecks of soil, short natural close-mic field recording, no gunshot, no passing bullet, no voices, no music, no explosion, no electronic sound',
  },
  {
    file: 'bullet-impact-structure-01.wav',
    duration: 0.5,
    influence: 0.58,
    text:
      'Single World War Two rifle bullet striking a rough wooden plank and splintering it, dry sharp woody crack with tiny fragments, authentic outdoor field recording, no gunshot, no ricochet, no voices, no music, no explosion, no synthetic sound',
  },
  {
    file: 'bullet-impact-structure-02.wav',
    duration: 0.54,
    influence: 0.56,
    text:
      'Rifle bullet striking old brick and plaster masonry, compact brittle chip and dust puff, realistic battlefield structure impact recorded outdoors, no muzzle blast, no ricochet, no voices, no music, no explosion, no electronic sound',
  },
  {
    file: 'bullet-impact-structure-03.wav',
    duration: 0.52,
    influence: 0.55,
    text:
      'Rifle bullet punching a sandbag wall, muted fabric and packed-sand thump with a little dust, close authentic World War Two field recording, no gunshot, no bullet whiz, no voices, no music, no explosion, no synthetic sound',
  },
  {
    file: 'bullet-impact-metal-01.wav',
    duration: 0.5,
    influence: 0.58,
    text:
      'Single rifle bullet striking thin steel equipment outdoors, short sharp metal ping with a muted body and no long ringing tail, realistic World War Two range recording, no ricochet, no gunshot, no voices, no music, no explosion, no synthetic sound',
  },
  {
    file: 'bullet-impact-metal-02.wav',
    duration: 0.52,
    influence: 0.58,
    text:
      'Several rifle bullets hitting a steel vehicle hull, close compact metallic knocks with different pitches and a dull armored body, authentic outdoor battlefield recording, no ricochet, no cannon firing, no voices, no music, no explosion, no electronic sound',
  },
  {
    file: 'bullet-impact-metal-03.wav',
    duration: 0.5,
    influence: 0.55,
    text:
      'Rifle bullet hitting a steel ammunition box, brief hard tick and muted hollow body, realistic field recording with no sustained ring, no ricochet, no muzzle blast, no voices, no music, no explosion, no synthetic sound',
  },
  {
    file: 'bullet-whiz-01.wav',
    duration: 0.5,
    influence: 0.62,
    text:
      'A supersonic World War Two rifle bullet passing very close past the listener, fast clean air crack and short sharp whip, authentic outdoor battlefield recording, no gunshot, no impact, no voices, no music, no explosion, no synthetic or cinematic sound',
  },
  {
    file: 'bullet-whiz-02.wav',
    duration: 0.52,
    influence: 0.6,
    text:
      'A rifle round passing ten meters overhead, distinct high-speed bullet snap with a brief air rush, realistic open field recording, no muzzle blast, no impact, no voices, no music, no explosion, no electronic sound',
  },
  {
    file: 'bullet-whiz-03.wav',
    duration: 0.58,
    influence: 0.58,
    text:
      'A distant rifle bullet crossing from left to right past the listener, thin but natural supersonic crack and fading air trail, authentic World War Two field recording, no gunshot, no impact, no voices, no music, no explosion, no synthetic sound',
  },
  {
    file: 'bullet-whiz-04.wav',
    duration: 0.5,
    influence: 0.6,
    text:
      'Two staggered rifle bullets passing close through open air, short realistic ballistic snaps with slight distance variation, outdoor combat recording, no muzzle blast, no impact, no voices, no music, no explosion, no electronic or cinematic sound',
  },
];

const ALL_CATALOG = [...CATALOG, ...COMBAT_EFFECT_CATALOG];

function matchesOnly(file) {
  if (!onlySet) return true;
  const stem = file.replace(/\.wav$/i, '');
  if (
    onlySet.has('combat-effects') &&
    COMBAT_EFFECT_CATALOG.some((job) => job.file === file)
  ) {
    return true;
  }
  for (const key of onlySet) {
    if (stem === key || stem.startsWith(key) || file.includes(key)) return true;
  }
  return false;
}

async function main() {
  const jobs = ALL_CATALOG.filter((j) => matchesOnly(j.file));
  if (!jobs.length) {
    console.error('No matching samples for --only filter');
    process.exit(1);
  }

  if (validate) {
    let invalid = 0;
    for (const job of jobs) {
      const promptLength = job.text.length;
      const durationValid = Number.isFinite(job.duration) && job.duration >= 0.5 && job.duration <= 30;
      if (promptLength > 450 || !durationValid) {
        const durationLabel = durationValid ? `${job.duration}s` : `${job.duration}s (expected 0.5–30s)`;
        console.error(`FAIL ${job.file}: prompt ${promptLength}/450, duration ${durationLabel}`);
        invalid += 1;
      } else {
        console.log(`ok ${job.file}: prompt ${promptLength}/450, ${job.duration}s`);
      }
    }
    if (invalid) {
      console.error(`Validation failed for ${invalid} prompt(s)`);
      process.exit(1);
    }
    console.log(`Validated ${jobs.length} ElevenLabs SFX prompt(s)`);
    return;
  }

  if (!API_KEY) {
    console.error(
      'Missing ELEVENLABS_API_KEY. Create one at https://elevenlabs.io/app/developers/api-keys'
    );
    process.exit(1);
  }

  console.log(`ElevenLabs SFX bake — ${jobs.length} sample(s)`);
  console.log(`Output: ${OUT}`);
  if (!force) console.log('Skipping existing files (use --force to re-generate)\n');

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const dest = join(OUT, job.file);
    const label = `[${i + 1}/${jobs.length}] ${job.file}`;

    if (!force && existsSync(dest)) {
      console.log(`${label} — skip (exists)`);
      skipped += 1;
      continue;
    }

    process.stdout.write(`${label} — generating… `);
    try {
      const mp3 = await generateSfx({
        text: job.text,
        duration_seconds: job.duration,
        prompt_influence: job.influence ?? 0.45,
      });
      const tmpMp3 = join(TMP, `${job.file}.mp3`);
      writeFileSync(tmpMp3, mp3);
      convertToGameWav(tmpMp3, job.file, {
        fadeOut: job.file.startsWith('explosion')
          ? 0.12
          : job.file.startsWith('bullet-whiz')
            ? 0.08
            : 0.05,
      });
      console.log('ok');
      ok += 1;
      // Be polite to free-tier rate limits
      await sleep(350);
    } catch (err) {
      console.log('FAIL');
      console.error(`  ${err.message}`);
      failed += 1;
      if (String(err.message).includes('401') || String(err.message).includes('unauthorized')) {
        console.error('API key rejected — aborting.');
        process.exit(1);
      }
      // Credit / rate limit — stop rather than burn retries
      if (
        String(err.message).includes('429') ||
        String(err.message).toLowerCase().includes('quota') ||
        String(err.message).toLowerCase().includes('credit')
      ) {
        console.error('Quota or rate limit hit — aborting remaining jobs.');
        break;
      }
      await sleep(800);
    }
  }

  console.log(`\nDone — wrote ${ok}, skipped ${skipped}, failed ${failed}`);
  console.log('Game loads these from public/sounds/ via SoundManager / WeaponSounds.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
