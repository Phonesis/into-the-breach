#!/usr/bin/env python3
"""Procedural WW2 cinematic menu theme (seamless loop). Output: WAV for ffmpeg → OGG."""

import math
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 44100
DURATION_SEC = 64.0
OUTPUT = Path(__file__).resolve().parent.parent / "public" / "music" / "menu-theme.wav"


def clamp(x, lo=-1.0, hi=1.0):
    return max(lo, min(hi, x))


def soft_clip(x):
    return math.tanh(x * 1.35)


def lfo(t, hz, depth=1.0, offset=0.0):
    return offset + depth * math.sin(2 * math.pi * hz * t)


def env_adsr(t, note_start, attack, decay, sustain, release, note_end):
    if t < note_start:
        return 0.0
    if t < note_start + attack:
        return (t - note_start) / attack
    if t < note_start + attack + decay:
        a = note_start + attack
        return 1.0 - (1.0 - sustain) * ((t - a) / decay)
    if t < note_end - release:
        return sustain
    if t < note_end:
        return sustain * (1.0 - (t - (note_end - release)) / release)
    return 0.0


def tone(freq, t, phase=0.0):
    return math.sin(2 * math.pi * freq * t + phase)


def detuned_pad(freq, t, detune_cents=6.0):
    ratio = 2 ** (detune_cents / 1200)
    return 0.55 * tone(freq, t) + 0.45 * tone(freq * ratio, t + 0.7)


def filtered_noise(t, seed=1.7):
    # Deterministic "wind" texture
    n = math.sin(t * 4373.1 + seed) * math.cos(t * 2719.4 + seed * 2.1)
    n += 0.5 * math.sin(t * 913.7 + seed * 0.3)
    return n * lfo(t, 0.11, 0.35, 0.65)


def timpani_hit(t, hit_time, pitch=58.0):
    dt = t - hit_time
    if dt < 0 or dt > 1.4:
        return 0.0
    env = math.exp(-dt * 4.2) * (1.0 - math.exp(-dt * 80))
    body = tone(pitch, t) * env
    click = tone(pitch * 2.3, t) * math.exp(-dt * 22) * 0.35
    return body + click


def snare_ghost(t, beat_time):
    dt = t - beat_time
    if dt < 0 or dt > 0.18:
        return 0.0
    env = math.exp(-dt * 38)
    burst = filtered_noise(t, seed=beat_time * 17) * env
    return burst * 0.22


# D minor cinematic progression (8-bar phrases, 60 BPM → 32s per phrase; 2 phrases = 64s loop)
CHORDS = [
    # (root, fifth, octave weights) per 16s segment
    [(73.42, 110.0, 146.83), (87.31, 130.81, 174.61), (65.41, 98.0, 130.81), (73.42, 110.0, 146.83)],
]
SEGMENT = DURATION_SEC / 4


def chord_at(t):
    idx = int(t / SEGMENT) % 4
    return CHORDS[0][idx]


def generate():
    total = int(SAMPLE_RATE * DURATION_SEC)
    samples = []

    bpm = 60.0
    beat = 60.0 / bpm

    for i in range(total):
        t = i / SAMPLE_RATE
        root, fifth, octave = chord_at(t)

        # Master swell — two-bar breathing
        master = 0.62 + 0.38 * math.sin(2 * math.pi * t / (beat * 8))

        # Low battlefield drone
        drone = (
            0.28 * tone(41.2, t)
            + 0.18 * tone(55.0, t + 1.2)
            + 0.12 * tone(root * 0.5, t)
        )
        drone *= 0.75 + 0.25 * lfo(t, 0.04, 1.0, 0.0)

        # String-like pad
        pad = (
            0.22 * detuned_pad(root, t)
            + 0.16 * detuned_pad(fifth, t, 4)
            + 0.1 * detuned_pad(octave, t, -3)
        )
        pad *= env_adsr(t % SEGMENT, 0, 2.5, 1.2, 0.85, 3.0, SEGMENT)

        # Distant brass swell (fifth + octave, slow)
        brass_phase = (t % (beat * 16)) / (beat * 16)
        brass = (0.14 * tone(fifth * 0.5, t) + 0.1 * tone(octave * 0.5, t)) * (
            0.35 + 0.65 * math.sin(math.pi * brass_phase) ** 2
        )

        # High string shimmer
        shimmer = 0.06 * tone(octave * 2, t) * lfo(t, 0.23, 1.0, 0.0)
        shimmer += 0.04 * tone(octave * 2.01, t + 0.4)

        # Wind / battlefield air
        wind = 0.09 * filtered_noise(t) * lfo(t, 0.07, 0.5, 0.5)

        # Percussion — sparse military pulse (half-time feel)
        perc = 0.0
        beat_idx = int(t / beat)
        if beat_idx % 2 == 0:
            perc += timpani_hit(t, beat_idx * beat, pitch=55.0) * 0.55
        if beat_idx % 4 == 2:
            perc += snare_ghost(t, beat_idx * beat + beat * 0.5)

        # Occasional distant trumpet-like fifth (very soft)
        call = 0.0
        if int(t / (beat * 16)) % 2 == 0:
            call_t = (t % (beat * 16)) - beat * 4
            if 0 <= call_t <= beat * 6:
                call = 0.05 * tone(fifth, t) * env_adsr(call_t, 0, 0.8, 0.4, 0.5, 1.2, beat * 6)

        mix = (drone + pad + brass + shimmer + wind + perc + call) * master
        samples.append(soft_clip(mix * 0.82))

    return samples


def write_wav(samples, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for s in samples:
            v = int(clamp(s) * 32767)
            frames.extend(struct.pack("<h", v))
        wf.writeframes(frames)


if __name__ == "__main__":
    write_wav(generate(), OUTPUT)
    print(f"Wrote {OUTPUT} ({DURATION_SEC}s loop)")