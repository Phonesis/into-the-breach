import * as THREE from 'three';

function hex(n) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function noise2d(x, y, seed) {
  return Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453 % 1;
}

export function createGroundTexture(mapDef) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const base = mapDef.groundColor ?? 0x4a6b3a;
  const c2 = mapDef.groundColor2 ?? 0x3d5a32;

  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, hex(base));
  g.addColorStop(0.45, hex(c2));
  g.addColorStop(1, hex(base));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const terrain = mapDef.terrain;
  const seed = mapDef.id.length * 13;

  for (let octave = 0; octave < 3; octave++) {
    const step = 4 + octave * 2;
    const a = 0.03 + octave * 0.02;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        const n = noise2d(x * 0.02, y * 0.02, seed + octave);
        ctx.fillStyle = `rgba(0,0,0,${a * n})`;
        ctx.fillRect(x, y, step, step);
      }
    }
  }

  const speckle = terrain === 'desert' ? 6000 : 9000;
  for (let i = 0; i < speckle; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const bright = Math.random() > 0.5;
    ctx.fillStyle = bright ? `rgba(255,255,240,${0.02 + Math.random() * 0.04})` : `rgba(0,0,0,${0.03 + Math.random() * 0.06})`;
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1);
  }

  if (terrain === 'desert') {
    for (let i = 0; i < 55; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 10 + Math.random() * 32;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,235,190,0.18)');
      grd.addColorStop(0.6, 'rgba(180,140,90,0.06)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  } else if (terrain === 'bocage' || terrain === 'hills') {
    ctx.strokeStyle = 'rgba(25,45,20,0.12)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 80; i++) {
      ctx.beginPath();
      let x = Math.random() * size;
      let y = Math.random() * size;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += (Math.random() - 0.5) * 36;
        y += (Math.random() - 0.5) * 36;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(45,70,35,0.08)';
    for (let i = 0; i < 120; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, 2 + Math.random() * 8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (terrain === 'steppe') {
    ctx.strokeStyle = 'rgba(90,80,50,0.08)';
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 40 + Math.random() * 60, y + (Math.random() - 0.5) * 8);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
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
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  return tex;
}

export function createNormalMap() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);

  const heightAt = (x, y) => {
    let h = 0;
    let amp = 1;
    let freq = 0.08;
    for (let o = 0; o < 4; o++) {
      h += Math.sin(x * freq + y * freq * 1.3) * amp;
      h += Math.cos(x * freq * 1.7 - y * freq) * amp * 0.7;
      amp *= 0.5;
      freq *= 2.1;
    }
    return h;
  };

  const strength = 2.8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const dx = (heightAt(u + 0.002, v) - heightAt(u - 0.002, v)) * strength;
      const dy = (heightAt(u, v + 0.002) - heightAt(u, v - 0.002)) * strength;
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, Math.max(0, 128 + dx * 80));
      img.data[i + 1] = Math.min(255, Math.max(0, 128 + dy * 80));
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
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
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  return tex;
}