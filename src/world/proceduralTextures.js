import * as THREE from 'three';

function hex(n) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function rgba(n, alpha) {
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function noise2d(x, y, seed) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise2d(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = noise2d(ix, iy, seed);
  const n10 = noise2d(ix + 1, iy, seed);
  const n01 = noise2d(ix, iy + 1, seed);
  const n11 = noise2d(ix + 1, iy + 1, seed);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function stringSeed(value = '') {
  let seed = 2166136261;
  for (let i = 0; i < value.length; i++) {
    seed ^= value.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGroundTexture(mapDef) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const base = mapDef.groundColor ?? 0x4a6b3a;
  const c2 = mapDef.groundColor2 ?? 0x3d5a32;

  // A diagonal base gradient becomes an obvious checkerboard when repeated.
  // Keep the base uniform and introduce the secondary tone through organic
  // patches below, allowing mirrored wrapping to remain visually seamless.
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);

  const terrain = mapDef.terrain;
  const seed = stringSeed(`${mapDef.id}:ground`);
  const random = seededRandom(seed);

  // Broad, translucent soil and vegetation patches break up the tiled base at
  // normal RTS camera heights without obscuring units or capture markings.
  const macroPalette = terrain === 'desert'
    ? [rgba(c2, 0.2), 'rgba(239,211,157,0.12)', 'rgba(113,82,47,0.1)', 'rgba(171,132,77,0.09)']
    : terrain === 'steppe'
      ? [rgba(c2, 0.16), 'rgba(133,119,67,0.13)', 'rgba(50,75,39,0.11)', 'rgba(91,73,39,0.08)']
      : [rgba(c2, 0.16), 'rgba(73,98,47,0.12)', 'rgba(33,58,29,0.1)', 'rgba(112,91,57,0.07)'];
  for (let i = 0; i < 170; i++) {
    const x = random() * size;
    const y = random() * size;
    const rx = 12 + random() * 56;
    const ry = 8 + random() * 35;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(random() * Math.PI);
    ctx.scale(1, ry / rx);
    const patch = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    patch.addColorStop(0, macroPalette[i % macroPalette.length]);
    patch.addColorStop(0.72, macroPalette[(i + 1) % macroPalette.length]);
    patch.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = patch;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (let octave = 0; octave < 3; octave++) {
    const step = 4 + octave * 2;
    const a = 0.03 + octave * 0.02;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        const n = noise2d(x * 0.02, y * 0.02, seed + octave);
        ctx.fillStyle = `rgba(0,0,0,${a * n * 0.72})`;
        ctx.fillRect(x, y, step, step);
      }
    }
  }

  const speckle = terrain === 'desert' ? 6000 : 9000;
  for (let i = 0; i < speckle; i++) {
    const x = random() * size;
    const y = random() * size;
    const bright = random() > 0.5;
    ctx.fillStyle = bright ? `rgba(255,255,240,${0.02 + random() * 0.04})` : `rgba(0,0,0,${0.03 + random() * 0.06})`;
    ctx.fillRect(x, y, 1 + random() * 2, 1);
  }

  if (terrain === 'desert') {
    for (let i = 0; i < 80; i++) {
      const x = random() * size;
      const y = random() * size;
      const r = 10 + random() * 32;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,235,190,0.18)');
      grd.addColorStop(0.6, 'rgba(180,140,90,0.06)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.lineCap = 'round';
    for (let i = 0; i < 125; i++) {
      const x = random() * size;
      const y = random() * size;
      ctx.strokeStyle = `rgba(104,76,42,${0.025 + random() * 0.045})`;
      ctx.lineWidth = 0.6 + random() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 15, y - 3, x + 35, y + 3, x + 55 + random() * 50, y - 1);
      ctx.stroke();
    }
  } else if (terrain === 'bocage' || terrain === 'hills') {
    ctx.strokeStyle = 'rgba(25,45,20,0.12)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 80; i++) {
      ctx.beginPath();
      let x = random() * size;
      let y = random() * size;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += (random() - 0.5) * 36;
        y += (random() - 0.5) * 36;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(45,70,35,0.08)';
    for (let i = 0; i < 120; i++) {
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, 2 + random() * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    // Fine blade and dead-stem strokes survive close zooms better than speckle.
    for (let i = 0; i < 2600; i++) {
      const x = random() * size;
      const y = random() * size;
      const h = 2 + random() * 5;
      ctx.strokeStyle = random() > 0.22 ? 'rgba(31,58,27,0.16)' : 'rgba(143,124,73,0.13)';
      ctx.lineWidth = 0.45 + random() * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (random() - 0.5) * 2, y - h);
      ctx.stroke();
    }
  } else if (terrain === 'steppe') {
    ctx.strokeStyle = 'rgba(90,80,50,0.08)';
    for (let i = 0; i < 75; i++) {
      const x = random() * size;
      const y = random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 40 + random() * 60, y + (random() - 0.5) * 8);
      ctx.stroke();
    }
    for (let i = 0; i < 2200; i++) {
      const x = random() * size;
      const y = random() * size;
      ctx.strokeStyle = random() > 0.45 ? 'rgba(104,95,48,0.15)' : 'rgba(44,72,34,0.14)';
      ctx.lineWidth = 0.5 + random() * 0.55;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (random() - 0.5) * 3, y - 3 - random() * 6);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  const repeats = terrain === 'desert' ? 3.2 : 5.5;
  tex.repeat.set(repeats, repeats);
  tex.anisotropy = 16;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRoughnessMap(mapDef) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const seed = (mapDef?.id?.length ?? 1) * 7;
  const base = mapDef?.terrain === 'desert' ? 200 : 175;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const macro = noise2d(x * 0.04, y * 0.04, seed);
      const micro = noise2d(x * 0.25, y * 0.25, seed + 2);
      const n = base + macro * 35 + micro * 25;
      const v = Math.min(255, Math.max(0, n));
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  const repeats = mapDef?.terrain === 'desert' ? 3.2 : 5.5;
  tex.repeat.set(repeats, repeats);
  return tex;
}

export function createNormalMap(mapDef = null) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);

  const terrain = mapDef?.terrain ?? 'bocage';
  const seed = stringSeed(`${mapDef?.id ?? 'map'}:normal`);
  const heightAt = (x, y) => {
    const broad = (smoothNoise2d(x * 0.025, y * 0.025, seed) - 0.5) * 1.3;
    const medium = (smoothNoise2d(x * 0.085, y * 0.085, seed + 17) - 0.5) * 0.72;
    const fine = (smoothNoise2d(x * 0.24, y * 0.24, seed + 31) - 0.5) * 0.3;
    if (terrain === 'desert') {
      return broad * 0.45 + medium * 0.45 + Math.sin(x * 0.11 + y * 0.025) * 0.045 + fine * 0.35;
    }
    if (terrain === 'steppe') {
      return broad * 0.62 + medium * 0.7 + fine * 0.58;
    }
    return broad * 0.78 + medium + fine;
  };

  const strength = terrain === 'desert' ? 1.35 : terrain === 'steppe' ? 1.6 : 1.85;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (heightAt(x + 1, y) - heightAt(x - 1, y)) * strength;
      const dy = (heightAt(x, y + 1) - heightAt(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = Math.round((dx * inv * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((dy * inv * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  // This normal map is generated at sufficient density for the whole map.
  // Stretching it once avoids mirrored tangent discontinuities at tile seams.
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

export function createAOMap(mapDef) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const seed = (mapDef?.id?.length ?? 1) * 11;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const macro = noise2d(x * 0.05, y * 0.05, seed);
      const micro = noise2d(x * 0.2, y * 0.2, seed + 5);
      const v = Math.min(255, Math.max(80, 200 - macro * 90 - micro * 50));
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  const repeats = mapDef?.terrain === 'desert' ? 3.2 : 5.5;
  tex.repeat.set(repeats, repeats);
  return tex;
}
