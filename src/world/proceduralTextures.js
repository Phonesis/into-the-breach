import * as THREE from 'three';

const COLOR_SIZE = 1024;
const DETAIL_SIZE = 512;
const TAU = Math.PI * 2;
// Cache CPU sources, not live textures: completed battles dispose their own GPU
// resources, while later battles can upload a fresh set from the same images.
const surfaceSources = new Map();
const MAX_CACHED_SURFACES = 3;

const SURFACES = {
  bocage: { tileMeters: 18, soil: 0x756343, stone: 0x999384, stem: 0x918355, soilAmount: 0.52, roughness: 0.94, stones: 1150, stems: 9200, relief: 1 },
  desert: { tileMeters: 20, soil: 0xb89a70, stone: 0xb7ac95, stem: 0x9b885d, soilAmount: 0.25, roughness: 0.98, stones: 1750, stems: 0, relief: 0.7 },
  steppe: { tileMeters: 18, soil: 0x8d7950, stone: 0xa59c81, stem: 0xb1a16b, soilAmount: 0.58, roughness: 0.96, stones: 900, stems: 11600, relief: 0.85 },
  hills: { tileMeters: 18, soil: 0x837660, stone: 0xb0ada0, stem: 0xa19467, soilAmount: 0.56, roughness: 0.95, stones: 2650, stems: 6800, relief: 1.2 },
  jungle: { tileMeters: 16, soil: 0x68553c, stone: 0x858b76, stem: 0x96804c, soilAmount: 0.7, roughness: 0.9, stones: 650, stems: 6200, relief: 1.05 },
  urban: { tileMeters: 16, soil: 0x807566, stone: 0xaaa69b, stem: 0x9c8b60, soilAmount: 0.45, roughness: 0.96, stones: 5600, stems: 0, relief: 0.8 },
};

function stringSeed(value) {
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

function rgb(color) {
  return [(color >> 16) & 255, (color >> 8) & 255, color & 255];
}

function smoothstep(lo, hi, value) {
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

// Periodic value noise matches heights AND derivatives at tile edges. Ordinary
// repeat wrapping then uses one consistent tangent frame for every material map.
function noiseLayer(cells, random) {
  const grid = Float32Array.from({ length: cells * cells }, random);
  // The lattice indices and smooth weights repeat for every row/column.
  // Compute them once, instead of millions of floor/modulo operations while
  // generating the 1K sheet. Float64 keeps the authored interpolation exact.
  const lower = new Uint16Array(COLOR_SIZE);
  const upper = new Uint16Array(COLOR_SIZE);
  const weights = new Float64Array(COLOR_SIZE);
  for (let x = 0; x < COLOR_SIZE; x++) {
    const gx = x * cells / COLOR_SIZE;
    const ix = Math.floor(gx);
    const fraction = gx - ix;
    lower[x] = ix % cells;
    upper[x] = (ix + 1) % cells;
    weights[x] = fraction * fraction * (3 - 2 * fraction);
  }
  return (x, y) => {
    const sx = weights[x];
    const sy = weights[y];
    const y0 = lower[y] * cells;
    const y1 = upper[y] * cells;
    const top = grid[y0 + lower[x]] * (1 - sx) + grid[y0 + upper[x]] * sx;
    const bottom = grid[y1 + lower[x]] * (1 - sx) + grid[y1 + upper[x]] * sx;
    return top * (1 - sy) + bottom * sy;
  };
}

function imageCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  return { canvas, context, image: context.createImageData(size, size) };
}

// Stones, thatch and leaf litter affect the same albedo, relief and roughness.
// Wrapping every stamp also keeps those details seamless at the tile edges.
function stampDetail(field, color, roughness, x, y, rx, ry, angle, tint, height, finish, opacity) {
  const radius = Math.ceil(Math.max(rx, ry));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const sx = (dx * cos + dy * sin) / rx;
      const sy = (-dx * sin + dy * cos) / ry;
      const distance = sx * sx + sy * sy;
      if (distance >= 1) continue;
      const coverage = Math.min(1, (1 - distance) * 3);
      const mix = coverage * opacity;
      const px = (cx + dx + COLOR_SIZE) % COLOR_SIZE;
      const py = (cy + dy + COLOR_SIZE) % COLOR_SIZE;
      const index = py * COLOR_SIZE + px;
      field[index] += Math.sqrt(1 - distance) * height;
      roughness[index] += (finish - roughness[index]) * mix;
      for (let c = 0; c < 3; c++) color[index * 4 + c] += (tint[c] - color[index * 4 + c]) * mix;
    }
  }
}

function buildSurfaceSources(mapDef, profile) {
  const terrain = mapDef.terrain ?? 'bocage';
  const random = seededRandom(stringSeed(`${mapDef.id ?? terrain}:ground-surface`));
  const broadNoise = noiseLayer(7, random);
  const soilNoise = noiseLayer(23, random);
  const fineNoise = noiseLayer(109, random);
  const color = imageCanvas(COLOR_SIZE);
  const normal = imageCanvas(DETAIL_SIZE);
  const surface = imageCanvas(DETAIL_SIZE);
  const heights = new Float32Array(COLOR_SIZE * COLOR_SIZE);
  const roughness = new Float32Array(heights.length);
  const base = rgb(mapDef.groundColor ?? 0x4a6b3a);
  const secondary = rgb(mapDef.groundColor2 ?? mapDef.groundColor ?? 0x3d5a32);
  const earth = rgb(profile.soil);
  if (terrain !== 'desert' && terrain !== 'urban') {
    for (let c = 0; c < 3; c++) {
      base[c] = base[c] * 0.85 + earth[c] * 0.15;
      secondary[c] = secondary[c] * 0.85 + earth[c] * 0.15;
    }
  }

  for (let y = 0; y < COLOR_SIZE; y++) {
    for (let x = 0; x < COLOR_SIZE; x++) {
      const index = y * COLOR_SIZE + x;
      const broad = broadNoise(x, y);
      const soil = soilNoise(x, y);
      const fine = fineNoise(x, y);
      const grain = random() - 0.5;
      const bare = smoothstep(0.28, 0.7, broad * 0.55 + soil * 0.45) * profile.soilAmount;
      const pigment = 0.22 + soil * 0.42;
      const brightness = 0.94 + broad * 0.12 + (fine - 0.5) * 0.1;
      let height = ((soil - 0.5) * 0.018 + (fine - 0.5) * 0.014 + grain * 0.0015) * profile.relief;
      let ripple = 0;
      if (terrain === 'desert') {
        ripple = Math.sin(TAU * (x * 52 + y * 7) / COLOR_SIZE + (soil - 0.5) * 2.8);
        height += ripple * 0.009 * (0.35 + soil * 0.65);
      }
      // Damp jungle earth has a softer highlight; dry aggregate and sand stay
      // matte. These maps contain material response without painted lighting.
      roughness[index] = profile.roughness - (terrain === 'jungle' ? bare * 0.15 : bare * 0.025) + grain * 0.028;
      heights[index] = height;
      for (let c = 0; c < 3; c++) {
        const vegetation = base[c] * (1 - pigment) + secondary[c] * pigment;
        color.image.data[index * 4 + c] = (vegetation * (1 - bare) + earth[c] * bare) * brightness + grain * 7 + ripple * 1.7;
      }
      color.image.data[index * 4 + 3] = 255;
    }
  }

  const stone = rgb(profile.stone);
  for (let i = 0; i < profile.stones; i++) {
    const scale = 0.75 + random() * 2.6;
    const shade = 0.65 + random() * 0.42;
    const tint = stone.map((value, channel) => value * shade * 0.65 + earth[channel] * 0.35);
    if (terrain === 'urban' && i % 7 === 0) { tint[0] *= 1.13; tint[1] *= 0.78; tint[2] *= 0.7; }
    stampDetail(heights, color.image.data, roughness, random() * COLOR_SIZE, random() * COLOR_SIZE,
      scale, scale * (0.4 + random() * 0.45), random() * TAU, tint,
      (0.004 + random() * 0.012) * profile.relief, 0.88 + random() * 0.1, 0.36 + random() * 0.22);
  }
  const stem = rgb(profile.stem);
  for (let i = 0; i < profile.stems; i++) {
    const living = i % 4 !== 0;
    const shade = 0.84 + random() * 0.34;
    const tint = (living ? base : stem).map((value, channel) => value * shade * 0.74 + earth[channel] * 0.26);
    stampDetail(heights, color.image.data, roughness, random() * COLOR_SIZE, random() * COLOR_SIZE,
      1.4 + random() * 3.3, 0.5 + random() * 0.35, random() * TAU, tint,
      0.0015 + random() * 0.002, 0.93, 0.24 + random() * 0.28);
  }
  if (terrain === 'jungle') {
    for (let i = 0; i < 1600; i++) {
      const shade = 0.65 + random() * 0.48;
      stampDetail(heights, color.image.data, roughness, random() * COLOR_SIZE, random() * COLOR_SIZE,
        2 + random() * 4, 0.9 + random() * 1.6, random() * TAU, stem.map((value) => value * shade),
        0.003, 0.86, 0.45);
    }
  }

  const heightAt = (x, y) => heights[((y + COLOR_SIZE) % COLOR_SIZE) * COLOR_SIZE + (x + COLOR_SIZE) % COLOR_SIZE];
  const texelMeters = profile.tileMeters / COLOR_SIZE;
  for (let y = 0; y < DETAIL_SIZE; y++) {
    for (let x = 0; x < DETAIL_SIZE; x++) {
      const sx = x * 2;
      const sy = y * 2;
      const index = sy * COLOR_SIZE + sx;
      const pixel = (y * DETAIL_SIZE + x) * 4;
      // Average neighbouring rows/columns so tiny grains remain stable when the
      // RTS camera pulls back and the normal map enters its mip chain.
      const dx = (heightAt(sx + 2, sy) + heightAt(sx + 2, sy + 1) - heightAt(sx - 2, sy) - heightAt(sx - 2, sy + 1)) / (8 * texelMeters);
      const dy = (heightAt(sx, sy + 2) + heightAt(sx + 1, sy + 2) - heightAt(sx, sy - 2) - heightAt(sx + 1, sy - 2)) / (8 * texelMeters);
      const inv = 1 / Math.hypot(dx, dy, 1);
      normal.image.data[pixel] = (-dx * inv * 0.5 + 0.5) * 255;
      normal.image.data[pixel + 1] = (dy * inv * 0.5 + 0.5) * 255;
      normal.image.data[pixel + 2] = (inv * 0.5 + 0.5) * 255;
      normal.image.data[pixel + 3] = 255;
      const surrounding = (heightAt(sx - 4, sy) + heightAt(sx + 4, sy) + heightAt(sx, sy - 4) + heightAt(sx, sy + 4)) * 0.25;
      const cavity = Math.min(0.13, Math.max(0, surrounding - heights[index]) * 12);
      surface.image.data[pixel] = (1 - cavity) * 255;
      surface.image.data[pixel + 1] = roughness[index] * 255;
      surface.image.data[pixel + 2] = 0;
      surface.image.data[pixel + 3] = 255;
    }
  }
  for (const source of [color, normal, surface]) source.context.putImageData(source.image, 0, 0);
  return { color: color.canvas, normal: normal.canvas, surface: surface.canvas };
}

/** Albedo, normal, and packed occlusion/roughness from one physical surface. */
export function createGroundMaterialMaps(mapDef = {}) {
  const profile = SURFACES[mapDef.terrain] ?? SURFACES.bocage;
  const key = `${mapDef.id}:${mapDef.terrain}:${mapDef.groundColor}:${mapDef.groundColor2}`;
  let sources = surfaceSources.get(key);
  if (!sources) {
    sources = buildSurfaceSources(mapDef, profile);
    if (surfaceSources.size >= MAX_CACHED_SURFACES) surfaceSources.delete(surfaceSources.keys().next().value);
  } else {
    surfaceSources.delete(key);
  }
  surfaceSources.set(key, sources);
  const maps = {};
  for (const [name, canvas] of Object.entries(sources)) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `terrain-${mapDef.terrain ?? 'bocage'}-${name}`;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    const repeats = (mapDef.size ?? 120) / profile.tileMeters;
    texture.repeat.set(repeats, repeats);
    texture.anisotropy = 16;
    if (name === 'color') texture.colorSpace = THREE.SRGBColorSpace;
    maps[name] = texture;
  }
  return maps;
}
