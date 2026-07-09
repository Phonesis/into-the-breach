/**
 * Panic under-fire voice lines via ElevenLabs TTS (all factions).
 * Overwrites public/sounds/unit-underfire-{faction}-NN.wav
 *
 * Low stability + emotional text cues for scared / panicked delivery.
 * Post: field-radio style EQ (no pitch cloning of samples).
 *
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-underfire.mjs --force
 */
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const TMP = join(__dir, '../.tmp-elevenlabs-underfire');
const API = 'https://api.elevenlabs.io/v1/text-to-speech';

const API_KEY = process.env.ELEVENLABS_API_KEY?.trim();
if (!API_KEY) {
  console.error('Missing ELEVENLABS_API_KEY');
  process.exit(1);
}

const force = process.argv.includes('--force');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

/**
 * Premade ElevenLabs voice IDs (no voices_read required).
 * Multilingual v2 handles DE / RU on these voices.
 */
// Only free/default voices that work without a paid library plan
const VOICES = {
  usa: [
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },
    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },
  ],
  uk: [
    { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' },
    { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel' },
    { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger' },
    { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum' },
  ],
  germany: [
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },
    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },
  ],
  russia: [
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },
    { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum' },
  ],
};

/** Emotional stage directions help Multilingual v2 / expressive models. */
const LINES = {
  usa: [
    'Taking fire! Taking fire!',
    "We're under fire! Get down!",
    'Contact! They are shooting at us!',
    'I need cover now! Move!',
    "Incoming! Everybody down!",
    "Man down! We're taking hits!",
    "Suppress them! We're pinned!",
    "Fall back to cover! Go go!",
    "They're all over us! Taking fire!",
    "Help! We're getting shot up!",
    "Stay down! Stay down!",
    "Get me out of here! Taking fire!",
  ],
  uk: [
    'Taking fire! Taking fire!',
    "We're under fire! Get down!",
    'Contact front! Incoming!',
    "They're on us! Take cover!",
    'Under fire, sir! Under fire!',
    "Everybody down! Now!",
    "We're pinned! Need cover!",
    "Incoming rounds! Get down!",
    "Bloody hell, taking fire!",
    "Move to cover! Move!",
    "They're shooting! Take cover!",
    "Stay down! Stay down!",
  ],
  germany: [
    'Feindfeuer! Feindfeuer!',
    'Unter Beschuss! Deckung!',
    'Sie schießen auf uns! Runter!',
    'Alle in Deckung! Sofort!',
    'Feindfeuer von vorne! Deckung!',
    'Runter, runter! Unter Beschuss!',
    'Wir werden beschossen! Deckung!',
    'Sofort in Deckung! Los!',
    'Hilfe! Feindfeuer!',
    'Bleibt unten! Bleibt unten!',
    'Zurück in Deckung! Schnell!',
    'Sie schießen! Deckung nehmen!',
  ],
  russia: [
    'Под огнём! Под огнём!',
    'Стреляют! В укрытие!',
    'Нас обстреливают! Ложись!',
    'Ложись! Ложись!',
    'Огонь по нам! В укрытие!',
    'Срочно в укрытие! Быстро!',
    'Помогите! Стреляют!',
    'Все вниз! Под огнём!',
    'Нас прижали! В укрытие!',
    'Не высовывайся! Стреляют!',
    'Отходим в укрытие! Быстро!',
    'Огонь! Ложись на землю!',
  ],
};

const COUNT = 12;

const PANIC_AF =
  'highpass=f=280,lowpass=f=4000,' +
  'acompressor=threshold=-14dB:ratio=6.5:attack=3:release=45,' +
  'equalizer=f=1500:t=q:w=1.0:g=3.5,' +
  'equalizer=f=900:t=q:w=1.0:g=2,' +
  'equalizer=f=3500:t=q:w=1.0:g=-2,' +
  'alimiter=limit=0.92,volume=1.35';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tts(voiceId, text) {
  // Emotional cues in the spoken text; low stability = more panicked variation
  const body = {
    text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.28,
      similarity_boost: 0.72,
      style: 0.55,
      use_speaker_boost: true,
    },
  };

  const res = await fetch(`${API}/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': API_KEY,
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS ${res.status}: ${err}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function convert(srcPath, destPath) {
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', srcPath, '-ac', '1', '-ar', '44100', '-af', PANIC_AF, destPath],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-400));
    throw new Error(`ffmpeg failed ${destPath}`);
  }
}

async function main() {
  console.log(`ElevenLabs under-fire TTS — ${Object.keys(LINES).length} factions × ${COUNT} lines`);
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const faction of Object.keys(LINES)) {
    const lines = LINES[faction];
    const voices = VOICES[faction];
    console.log(`\n=== ${faction} ===`);
    for (let i = 0; i < COUNT; i++) {
      const num = String(i + 1).padStart(2, '0');
      const outName = `unit-underfire-${faction}-${num}.wav`;
      const dest = join(OUT, outName);
      if (!force && existsSync(dest)) {
        console.log(`  ${num} skip`);
        skipped += 1;
        continue;
      }
      const text = lines[i % lines.length];
      const voice = voices[i % voices.length];
      process.stdout.write(`  ${num} [${voice.name}] ${text.slice(0, 40)}… `);
      try {
        const mp3 = await tts(voice.id, text);
        const tmp = join(TMP, `${outName}.mp3`);
        writeFileSync(tmp, mp3);
        convert(tmp, dest);
        console.log('ok');
        ok += 1;
        await sleep(350);
      } catch (err) {
        console.log('FAIL');
        console.error(`    ${err.message}`);
        failed += 1;
        if (String(err.message).includes('401')) process.exit(1);
        if (/429|quota|credit/i.test(err.message)) {
          console.error('Quota hit — stopping.');
          console.log(`\nPartial — wrote ${ok}, skipped ${skipped}, failed ${failed}`);
          process.exit(1);
        }
        await sleep(800);
      }
    }
  }

  console.log(`\nDone — wrote ${ok}, skipped ${skipped}, failed ${failed}`);
  console.log('Update SoundManager UNIT_UNDERFIRE_COUNT if count changed (now 12).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
