import * as THREE from 'three';

/**
 * Period rural buildings for non-Berlin theaters. Gameplay kinds stay
 * farmHouse / barn / outbuilding so garrison, crush, and collapse still work.
 */

const STYLE = {
  bocage: {
    wall: 0xc2b496,
    wallAlt: 0xb4a588,
    barnWall: 0x8a8170,
    roof: 0x4a5052,
    shutter: 0x3d4f45,
    timber: 0x3b2a20,
    stone: 0x8a8474,
    fascia: 0x2f2c26,
    roofKind: 'slate',
    barnRoofKind: 'slate',
    pitch: 1.18,
    eaves: 0.38,
  },
  hills: {
    wall: 0xc9a56c,
    wallAlt: 0xd4b88a,
    barnWall: 0xb89668,
    roof: 0xb45a34,
    shutter: 0x35563d,
    timber: 0x4a3224,
    stone: 0x9a8b72,
    fascia: 0x5a3a28,
    roofKind: 'terracotta',
    barnRoofKind: 'terracotta',
    pitch: 0.92,
    eaves: 0.44,
  },
  steppe: {
    wall: 0xc8c2ac,
    wallAlt: 0xb8b09a,
    barnWall: 0x6a5038,
    roof: 0x5c4a38,
    shutter: 0x4a3828,
    timber: 0x3a281c,
    stone: 0x7a7060,
    fascia: 0x2a2018,
    roofKind: 'shingle',
    barnRoofKind: 'shingle',
    pitch: 1.32,
    eaves: 0.32,
  },
  desert: {
    wall: 0xc4a878,
    wallAlt: 0xb89868,
    barnWall: 0xb08c60,
    roof: 0xb89868,
    shutter: 0x6a5840,
    timber: 0x5a4030,
    stone: 0xb09a72,
    fascia: 0x8a7350,
    roofKind: 'flat',
    barnRoofKind: 'flat',
    pitch: 0,
    eaves: 0.12,
  },
};

let ruralTextures = null;

function seededNoise(index, salt = 0) {
  const value = Math.sin(index * 91.713 + salt * 37.119) * 43758.5453;
  return value - Math.floor(value);
}

function makeTexture(size, draw, { colorSpace = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  if (colorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function getRuralTextures() {
  if (ruralTextures) return ruralTextures;
  if (typeof document === 'undefined') return {};

  const stucco = makeTexture(256, (ctx, size) => {
    ctx.fillStyle = '#d4cbb6';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2800; i++) {
      const light = seededNoise(i, 1) > 0.5;
      ctx.fillStyle = light ? 'rgba(255,250,236,0.06)' : 'rgba(52,44,34,0.07)';
      ctx.fillRect(seededNoise(i, 2) * size, seededNoise(i, 3) * size, 0.8 + seededNoise(i, 4) * 2.2, 0.8 + seededNoise(i, 5) * 2);
    }
    for (let i = 0; i < 16; i++) {
      ctx.strokeStyle = 'rgba(70,58,44,0.1)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      const x = seededNoise(i, 6) * size;
      const y = seededNoise(i, 7) * size;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (seededNoise(i, 8) - 0.5) * 22, y + 10 + seededNoise(i, 9) * 28);
      ctx.stroke();
    }
  });
  stucco.repeat.set(2.1, 2.1);

  const stone = makeTexture(256, (ctx, size) => {
    ctx.fillStyle = '#8d8676';
    ctx.fillRect(0, 0, size, size);
    const course = 28;
    const block = 46;
    for (let y = 0; y < size; y += course) {
      const row = Math.floor(y / course);
      const offset = (row & 1) * block * 0.5;
      ctx.strokeStyle = 'rgba(40,36,30,0.38)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      for (let x = -block + offset; x < size; x += block) {
        const shade = seededNoise(row * 17 + x, 10);
        ctx.fillStyle = shade > 0.55 ? 'rgba(210,200,178,0.12)' : 'rgba(40,36,30,0.12)';
        ctx.fillRect(x + 1, y + 1, block - 3, course - 3);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + course);
        ctx.stroke();
      }
    }
  });
  stone.repeat.set(2.4, 2.2);

  const slate = makeTexture(256, (ctx, size) => {
    ctx.fillStyle = '#454a4c';
    ctx.fillRect(0, 0, size, size);
    const course = 16;
    const tile = 20;
    for (let y = 0; y < size; y += course) {
      const row = Math.floor(y / course);
      const offset = (row & 1) * tile * 0.5;
      ctx.strokeStyle = 'rgba(16,18,19,0.5)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      for (let x = -tile + offset; x < size; x += tile) {
        ctx.fillStyle = seededNoise(row * 29 + x, 11) > 0.55
          ? 'rgba(140,148,146,0.1)'
          : 'rgba(18,20,22,0.12)';
        ctx.fillRect(x + 1, y + 1, tile - 2, course - 2);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + course);
        ctx.stroke();
      }
    }
  });
  slate.repeat.set(2.6, 2.4);

  const terracotta = makeTexture(256, (ctx, size) => {
    ctx.fillStyle = '#b45a34';
    ctx.fillRect(0, 0, size, size);
    const course = 14;
    const tile = 18;
    for (let y = 0; y < size; y += course) {
      const row = Math.floor(y / course);
      const offset = (row & 1) * tile * 0.5;
      for (let x = -tile + offset; x < size; x += tile) {
        const warm = seededNoise(row * 31 + x, 12);
        ctx.fillStyle = warm > 0.66
          ? 'rgba(214,126,74,0.28)'
          : warm < 0.28
            ? 'rgba(92,32,18,0.22)'
            : 'rgba(176,78,42,0.12)';
        ctx.beginPath();
        ctx.ellipse(x + tile * 0.5, y + course * 0.55, tile * 0.42, course * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(70,28,16,0.28)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(90,34,18,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
  });
  terracotta.repeat.set(2.8, 2.5);

  const shingle = makeTexture(256, (ctx, size) => {
    ctx.fillStyle = '#5a4634';
    ctx.fillRect(0, 0, size, size);
    const course = 18;
    const tile = 16;
    for (let y = 0; y < size; y += course) {
      const row = Math.floor(y / course);
      const offset = (row & 1) * tile * 0.5;
      ctx.strokeStyle = 'rgba(28,18,12,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      for (let x = -tile + offset; x < size; x += tile) {
        ctx.fillStyle = seededNoise(row * 23 + x, 13) > 0.5
          ? 'rgba(140,112,78,0.12)'
          : 'rgba(30,20,12,0.14)';
        ctx.fillRect(x + 1, y + 1, tile - 2, course - 2);
      }
    }
  });
  shingle.repeat.set(2.4, 2.2);

  const timber = makeTexture(256, (ctx, size) => {
    ctx.fillStyle = '#4a3424';
    ctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 14) {
      ctx.fillStyle = seededNoise(x, 14) > 0.5 ? 'rgba(90,64,42,0.18)' : 'rgba(24,16,10,0.16)';
      ctx.fillRect(x, 0, 11, size);
      ctx.strokeStyle = 'rgba(20,12,8,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = 'rgba(20,12,8,0.08)';
      ctx.fillRect(seededNoise(i, 15) * size, seededNoise(i, 16) * size, 1, 6 + seededNoise(i, 17) * 18);
    }
  });
  timber.repeat.set(1.8, 2.4);

  ruralTextures = { stucco, stone, slate, terracotta, shingle, timber };
  return ruralTextures;
}

function ruralStyle(terrain) {
  if (terrain === 'hills') return STYLE.hills;
  if (terrain === 'steppe') return STYLE.steppe;
  if (terrain === 'desert') return STYLE.desert;
  return STYLE.bocage;
}

function roofTexture(tex, kind) {
  if (kind === 'terracotta') return tex.terracotta;
  if (kind === 'shingle') return tex.shingle;
  if (kind === 'flat') return tex.stucco;
  return tex.slate;
}

function mat(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    map: options.map ?? null,
    bumpMap: options.bumpMap ?? null,
    bumpScale: options.bumpScale ?? 0,
    roughness: options.roughness ?? 0.88,
    metalness: options.metalness ?? 0,
    envMapIntensity: options.env ?? 0.3,
  });
}

function addBox(group, w, h, d, material, x, y, z, name, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.name = name;
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  group.add(mesh);
  return mesh;
}

function createPitchedRoofGeometry(width, depth, height) {
  const x = width * 0.5;
  const z = depth * 0.5;
  const positions = [];
  const uvs = [];
  const add = (a, b, c, uvA, uvB, uvC) => {
    positions.push(...a, ...b, ...c);
    uvs.push(...uvA, ...uvB, ...uvC);
  };
  const a = [-x, 0, -z];
  const b = [x, 0, -z];
  const c = [-x, 0, z];
  const d = [x, 0, z];
  const e = [-x, height, 0];
  const f = [x, height, 0];
  add(a, b, f, [0, 0], [1, 0], [1, 1]);
  add(a, f, e, [0, 0], [1, 1], [0, 1]);
  add(c, e, f, [0, 0], [0, 1], [1, 1]);
  add(c, f, d, [0, 0], [1, 1], [1, 0]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createGablePeakGeometry(width, height) {
  const x = width * 0.5;
  const positions = [-x, 0, 0, x, 0, 0, 0, height, 0];
  const uvs = [0, 0, 1, 0, 0.5, 1];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  return geometry;
}

function createLeanToRoofGeometry(width, depth, height) {
  const x = width * 0.5;
  const z = depth * 0.5;
  const positions = [];
  const uvs = [];
  const add = (a, b, c, uvA, uvB, uvC) => {
    positions.push(...a, ...b, ...c);
    uvs.push(...uvA, ...uvB, ...uvC);
  };
  const backL = [-x, height, -z];
  const backR = [x, height, -z];
  const frontL = [-x, 0, z];
  const frontR = [x, 0, z];
  add(backL, backR, frontR, [0, 1], [1, 1], [1, 0]);
  add(backL, frontR, frontL, [0, 1], [1, 0], [0, 0]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

export function createFarmMaterials(mapDef) {
  const style = ruralStyle(mapDef?.terrain);
  const tex = getRuralTextures();
  const wallMap = style.roofKind === 'flat' ? tex.stucco : tex.stucco;
  return {
    style,
    mats: {
      wall: mat(style.wall, { map: wallMap, bumpMap: wallMap, bumpScale: 0.016, roughness: 0.9, env: 0.32 }),
      wallAlt: mat(style.wallAlt, { map: tex.stucco, roughness: 0.91, env: 0.3 }),
      barn: mat(style.barnWall, {
        map: style.roofKind === 'flat' ? tex.stucco : tex.stone,
        bumpMap: tex.stone,
        bumpScale: 0.024,
        roughness: 0.92,
        env: 0.28,
      }),
      roof: mat(style.roof, {
        map: roofTexture(tex, style.roofKind),
        bumpMap: roofTexture(tex, style.roofKind),
        bumpScale: 0.03,
        roughness: 0.86,
        env: 0.36,
      }),
      barnRoof: mat(style.roof, {
        map: roofTexture(tex, style.barnRoofKind),
        bumpMap: roofTexture(tex, style.barnRoofKind),
        bumpScale: 0.028,
        roughness: 0.88,
        env: 0.34,
      }),
      timber: mat(style.timber, { map: tex.timber, roughness: 0.94, env: 0.22 }),
      shutter: mat(style.shutter, { roughness: 0.9, env: 0.24 }),
      window: mat(0x1a2224, { roughness: 0.42, metalness: 0.08, env: 0.62 }),
      stone: mat(style.stone, { map: tex.stone, bumpMap: tex.stone, bumpScale: 0.03, roughness: 0.93, env: 0.26 }),
      fascia: mat(style.fascia, { roughness: 0.9, env: 0.22 }),
    },
  };
}

export function disposeFarmMaterials(pack) {
  if (!pack?.mats) return;
  Object.values(pack.mats).forEach((material) => material.dispose());
}

function clonePack(pack) {
  const local = {};
  for (const [key, material] of Object.entries(pack.mats)) {
    local[key] = material.clone();
  }
  return local;
}

function addWindow(
  group,
  mats,
  x,
  y,
  z,
  width = 0.5,
  height = 0.62,
  { withShutters = true, facing = 1 } = {}
) {
  addBox(group, width, height, 0.06, mats.window, x, y, z, 'buildingWindow', { castShadow: false });
  addBox(
    group,
    width + 0.1,
    0.06,
    0.08,
    mats.timber,
    x,
    y + height * 0.5 + 0.03,
    z + facing * 0.01,
    'windowLintel',
    { castShadow: false }
  );
  addBox(
    group,
    width + 0.08,
    0.05,
    0.1,
    mats.stone,
    x,
    y - height * 0.5 - 0.03,
    z + facing * 0.02,
    'windowSill',
    { castShadow: false }
  );
  if (withShutters) {
    const shutterW = 0.14;
    addBox(
      group,
      shutterW,
      height * 0.96,
      0.04,
      mats.shutter,
      x - width * 0.5 - shutterW * 0.55,
      y,
      z + facing * 0.02,
      'windowShutter',
      { castShadow: false }
    );
    addBox(
      group,
      shutterW,
      height * 0.96,
      0.04,
      mats.shutter,
      x + width * 0.5 + shutterW * 0.55,
      y,
      z + facing * 0.02,
      'windowShutter',
      { castShadow: false }
    );
  }
}

function addQuoins(group, mats, w, d, h) {
  const insetX = w * 0.5 - 0.08;
  const insetZ = d * 0.5 + 0.03;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBox(
        group,
        0.22,
        h * 0.92,
        0.1,
        mats.stone,
        sx * insetX,
        h * 0.48,
        sz * insetZ,
        'buildingQuoin',
        { castShadow: false }
      );
    }
  }
}

function addPitchedRoof(group, mats, wallMat, w, d, h, style, { barn = false } = {}) {
  const roofH = Math.max(0.7, style.pitch);
  const eaves = style.eaves;
  const roofW = w + eaves * 2;
  const roofD = d + eaves * 2;
  const roofMat = barn ? mats.barnRoof : mats.roof;
  const roof = new THREE.Mesh(createPitchedRoofGeometry(roofW, roofD, roofH), roofMat);
  roof.name = 'buildingRoof';
  roof.position.y = h;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  for (const side of [-1, 1]) {
    const peakMat = wallMat.clone();
    peakMat.side = THREE.DoubleSide;
    const peak = new THREE.Mesh(createGablePeakGeometry(w, roofH), peakMat);
    peak.name = 'buildingWall';
    peak.position.set(0, h, side * (d * 0.5 - 0.01));
    if (side < 0) peak.rotation.y = Math.PI;
    peak.castShadow = true;
    peak.receiveShadow = true;
    group.add(peak);
  }

  addBox(group, roofW + 0.08, 0.08, 0.1, mats.fascia, 0, h + roofH + 0.03, 0, 'roofRidge', {
    castShadow: false,
    receiveShadow: false,
  });
  return { roofH, roofW, roofD };
}

function addFlatRoof(group, mats, w, d, h) {
  addBox(group, w + 0.16, 0.22, d + 0.16, mats.roof, 0, h + 0.1, 0, 'buildingRoof');
  const parapetY = h + 0.28;
  addBox(group, w + 0.18, 0.38, 0.16, mats.wall, 0, parapetY, d * 0.5, 'buildingRoof', { castShadow: false });
  addBox(group, w + 0.18, 0.38, 0.16, mats.wall, 0, parapetY, -d * 0.5, 'buildingRoof', { castShadow: false });
  addBox(group, 0.16, 0.38, d, mats.wall, w * 0.5, parapetY, 0, 'buildingRoof', { castShadow: false });
  addBox(group, 0.16, 0.38, d, mats.wall, -w * 0.5, parapetY, 0, 'buildingRoof', { castShadow: false });
  return { roofH: 0.22, roofW: w + 0.16, roofD: d + 0.16 };
}

function addLeanToRoof(group, mats, w, d, h, style) {
  const roofH = 0.55 + style.pitch * 0.15;
  const roof = new THREE.Mesh(
    createLeanToRoofGeometry(w + style.eaves * 1.4, d + style.eaves, roofH),
    mats.roof
  );
  roof.name = 'buildingRoof';
  roof.position.y = h;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);
  return { roofH, roofW: w + style.eaves * 1.4, roofD: d + style.eaves };
}

function attachRuralDamage(group, w, d, h, roofH, roofStyle) {
  group.userData.uniqueSceneryMaterials = true;
  group.userData.damageBounds = { width: w, depth: d, height: h + roofH };
  const profile = {
    bodyHeight: h,
    roofHeight: roofH,
    style: roofStyle === 'lean-to' ? 'flat' : roofStyle,
    width: w,
    depth: d,
  };
  if (roofStyle === 'lean-to') {
    profile.heightAt = (_localX, localZ) => {
      const half = Math.max(0.5, d * 0.5);
      const t = THREE.MathUtils.clamp((localZ + half) / (half * 2), 0, 1);
      return h + roofH * (1 - t) + 0.04;
    };
    profile.normalAt = () => ({ x: 0, y: 1, z: roofH / Math.max(d, 1) });
  }
  group.userData.roofDamageProfile = profile;
  group.userData.applyDamageStage = (stage) => {
    group.userData.damageStage = stage;
    for (const child of group.children) {
      if (child.name === 'buildingWindow' || child.name === 'windowShutter') {
        child.visible = stage < 4;
      }
      if (child.name === 'buildingChimney') child.visible = stage < 5;
    }
  };
}

export function createFarmBuilding(kind, pack, random = Math.random) {
  const g = new THREE.Group();
  g.name = kind;
  const style = pack.style;
  const mats = clonePack(pack);
  const isBarn = kind === 'barn';
  const isOutbuilding = kind === 'outbuilding';
  const flat = style.roofKind === 'flat';
  const wallTint = random() < 0.45 ? mats.wallAlt : mats.wall;

  const w = isBarn ? 5.6 : isOutbuilding ? 3.15 : 4.55;
  const d = isBarn ? 3.85 : isOutbuilding ? 2.55 : 3.55;
  const h = isBarn ? 2.85 : isOutbuilding ? 1.92 : 2.42;
  const wallMat = isBarn ? mats.barn : wallTint;

  addBox(g, w + 0.2, 0.38, d + 0.2, mats.stone, 0, 0.19, 0, 'buildingPlinth', { castShadow: false });

  const body = addBox(g, w, h, d, wallMat, 0, h * 0.5, 0, 'buildingWall');
  void body;
  addQuoins(g, mats, w, d, h);

  let roofInfo;
  if (flat) {
    roofInfo = addFlatRoof(g, mats, w, d, h);
  } else if (isOutbuilding) {
    roofInfo = addLeanToRoof(g, mats, w, d, h, style);
  } else {
    roofInfo = addPitchedRoof(g, mats, wallMat, w, d, h, style, { barn: isBarn });
  }

  if (isBarn) {
    addBox(g, w * 0.42, h * 0.72, 0.1, mats.timber, 0, h * 0.38, d * 0.505, 'buildingDoor');
    addBox(g, 0.08, h * 0.7, 0.06, mats.fascia, 0, h * 0.38, d * 0.56, 'barnDoorGap', { castShadow: false });
    addBox(g, 0.72, 0.62, 0.08, mats.window, 0, h * 0.78, d * 0.51, 'buildingWindow', { castShadow: false });
    addBox(g, 0.78, 0.08, 0.1, mats.timber, 0, h * 0.78 + 0.36, d * 0.52, 'loftLintel', { castShadow: false });
    for (const sx of [-0.34, 0.34]) {
      addWindow(g, mats, w * sx, h * 0.58, d * 0.515, 0.42, 0.48, { withShutters: false });
    }
  } else if (isOutbuilding) {
    addBox(g, 0.72, h * 0.62, 0.08, mats.timber, -w * 0.12, h * 0.33, d * 0.51, 'buildingDoor');
    addWindow(g, mats, w * 0.28, h * 0.58, d * 0.515, 0.4, 0.44, {
      withShutters: style.roofKind !== 'flat',
    });
  } else {
    addBox(g, 0.86, h * 0.58, 0.1, mats.timber, -w * 0.18, h * 0.32, d * 0.51, 'buildingDoor');
    addBox(g, 1.15, 0.12, 0.55, mats.timber, -w * 0.18, h * 0.64, d * 0.5 + 0.28, 'doorCanopy', {
      castShadow: false,
    });
    const shutters = style.roofKind !== 'flat';
    addWindow(g, mats, w * 0.26, h * 0.62, d * 0.515, 0.5, 0.62, { withShutters: shutters });
    addWindow(g, mats, -w * 0.38, h * 0.62, d * 0.515, 0.5, 0.62, { withShutters: shutters });
    addWindow(g, mats, w * 0.12, h * 0.62, -d * 0.515, 0.5, 0.62, {
      withShutters: shutters,
      facing: -1,
    });
    if (!flat) {
      const chimneyH = 1.05 + style.pitch * 0.15;
      addBox(
        g,
        0.38,
        chimneyH,
        0.38,
        mats.stone,
        w * 0.28,
        h + roofInfo.roofH * 0.42 + chimneyH * 0.28,
        -d * 0.08,
        'buildingChimney'
      );
      addBox(
        g,
        0.46,
        0.08,
        0.46,
        mats.fascia,
        w * 0.28,
        h + roofInfo.roofH * 0.42 + chimneyH * 0.55,
        -d * 0.08,
        'chimneyCap',
        { castShadow: false }
      );
    }
  }

  attachRuralDamage(g, w, d, h, roofInfo.roofH, flat ? 'flat' : isOutbuilding ? 'lean-to' : 'gable');
  return g;
}

export function createJungleHut(sharedMats, large = false) {
  const g = new THREE.Group();
  g.name = large ? 'farmHouse' : 'outbuilding';
  const w = large ? 4.5 : 3.25;
  const d = large ? 3.45 : 2.7;
  const floorY = 0.58;
  const wallH = large ? 1.72 : 1.42;
  const bamboo = sharedMats.bamboo.clone();
  const timber = sharedMats.timber.clone();
  const thatch = sharedMats.thatch.clone();
  const shadow = sharedMats.shadow.clone();

  for (const x of [-w * 0.42, w * 0.42]) {
    for (const z of [-d * 0.38, d * 0.38]) {
      const stilt = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, floorY + 0.18, 7), timber);
      stilt.position.set(x, (floorY + 0.18) * 0.5, z);
      stilt.castShadow = true;
      g.add(stilt);
    }
  }

  addBox(g, w, 0.16, d, timber, 0, floorY, 0, 'hutFloor');
  addBox(g, w, wallH, d, bamboo, 0, floorY + wallH * 0.5, 0, 'buildingWall');

  for (const x of [-w * 0.24, w * 0.24]) {
    addBox(g, w * 0.2, 0.48, 0.06, shadow, x, floorY + wallH * 0.58, d * 0.505, 'buildingWindow', {
      castShadow: false,
    });
  }
  addBox(g, w * 0.22, wallH * 0.68, 0.07, shadow, 0, floorY + wallH * 0.34, -d * 0.505, 'buildingDoor', {
    castShadow: false,
  });

  const roofH = 1.05;
  const roof = new THREE.Mesh(createPitchedRoofGeometry(w + 0.7, d + 0.7, roofH), thatch);
  roof.name = 'buildingRoof';
  roof.position.y = floorY + wallH;
  roof.castShadow = true;
  roof.receiveShadow = true;
  g.add(roof);

  g.userData.uniqueSceneryMaterials = true;
  g.userData.buildingDimensions = { width: w, depth: d, height: floorY + wallH + roofH };
  g.userData.damageBounds = { width: w, depth: d, height: floorY + wallH + roofH };
  g.userData.roofDamageProfile = {
    bodyHeight: floorY + wallH,
    roofHeight: roofH,
    style: 'gable',
    width: w,
    depth: d,
  };
  return g;
}

export function createStoneWall(mat, random = Math.random) {
  const g = new THREE.Group();
  const localMat = mat.clone();
  g.userData.uniqueSceneryMaterials = true;
  for (let i = 0; i < 6; i++) {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.55 + random() * 0.22, 0.52 + random() * 0.1),
      localMat
    );
    block.position.set((i - 2.5) * 0.92, 0.28, (random() - 0.5) * 0.14);
    block.rotation.y = (random() - 0.5) * 0.08;
    block.castShadow = true;
    block.receiveShadow = true;
    g.add(block);
  }
  return g;
}
