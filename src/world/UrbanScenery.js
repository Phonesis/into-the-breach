import * as THREE from 'three';
import {
  getUrbanRoadExtent,
  getUrbanStreetSpacing,
} from './UrbanLayout.js';

const FACADE_COLORS = [
  0x9a927f,
  0x92826c,
  0x85857c,
  0xa39a83,
  0x877563,
  0x7f887c,
  0x9a7b68,
];

let detailTextures = null;

function makeTexture(size, draw, { colorSpace = true, repeat = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  if (colorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function seededNoise(index, salt = 0) {
  const value = Math.sin(index * 91.713 + salt * 37.119) * 43758.5453;
  return value - Math.floor(value);
}

function getDetailTextures() {
  if (detailTextures) return detailTextures;

  const stucco = makeTexture(256, (ctx, size) => {
    ctx.fillStyle = '#d1cdc0';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) {
      const x = seededNoise(i, 1) * size;
      const y = seededNoise(i, 2) * size;
      const light = seededNoise(i, 3) > 0.48;
      ctx.fillStyle = light ? 'rgba(255,255,244,0.055)' : 'rgba(42,38,32,0.075)';
      const r = 0.5 + seededNoise(i, 4) * 1.7;
      ctx.fillRect(x, y, r, r);
    }
    for (let i = 0; i < 18; i++) {
      const x = seededNoise(i, 5) * size;
      const y = seededNoise(i, 6) * size;
      ctx.strokeStyle = 'rgba(53,48,41,0.13)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (seededNoise(i, 7) - 0.5) * 17, y + 6 + seededNoise(i, 8) * 22);
      ctx.lineTo(x + (seededNoise(i, 9) - 0.5) * 24, y + 18 + seededNoise(i, 10) * 30);
      ctx.stroke();
    }
  });
  stucco.repeat.set(2.3, 2.3);

  const brick = makeTexture(256, (ctx, size) => {
    ctx.fillStyle = '#825744';
    ctx.fillRect(0, 0, size, size);
    const course = 16;
    const brickWidth = 31;
    ctx.lineWidth = 2;
    for (let y = 0; y <= size; y += course) {
      ctx.strokeStyle = 'rgba(207,190,167,0.42)';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      const offset = (Math.floor(y / course) % 2) * brickWidth * 0.5;
      for (let x = -brickWidth + offset; x < size; x += brickWidth) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + course);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 620; i++) {
      ctx.fillStyle = seededNoise(i, 11) > 0.5 ? 'rgba(34,22,17,0.09)' : 'rgba(246,219,184,0.055)';
      ctx.fillRect(seededNoise(i, 12) * size, seededNoise(i, 13) * size, 1.2, 1.2);
    }
  });
  brick.repeat.set(2.8, 2.8);

  const roof = makeTexture(256, (ctx, size) => {
    ctx.fillStyle = '#77706b';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 14) {
      ctx.strokeStyle = 'rgba(34,31,29,0.3)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      const offset = (Math.floor(y / 14) % 2) * 11;
      for (let x = -22 + offset; x < size; x += 22) {
        ctx.strokeStyle = 'rgba(42,38,35,0.18)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 14);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 480; i++) {
      ctx.fillStyle = seededNoise(i, 14) > 0.5 ? 'rgba(255,242,225,0.035)' : 'rgba(24,22,21,0.07)';
      ctx.fillRect(seededNoise(i, 15) * size, seededNoise(i, 16) * size, 1.5, 1);
    }
  });
  roof.repeat.set(2.1, 2.1);

  const pavement = makeTexture(256, (ctx, size) => {
    ctx.fillStyle = '#77766f';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 28) {
      for (let x = 0; x < size; x += 34) {
        const ox = (Math.floor(y / 28) % 2) * 17;
        ctx.strokeStyle = 'rgba(39,39,37,0.26)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + ox, y, 33, 27);
      }
    }
  });
  pavement.repeat.set(4, 4);

  const churchBrick = makeTexture(512, (ctx, size) => {
    ctx.fillStyle = '#75483c';
    ctx.fillRect(0, 0, size, size);
    const courseHeight = 19;
    const brickWidth = 39;
    for (let y = 0; y < size; y += courseHeight) {
      const row = Math.floor(y / courseHeight);
      const offset = (row & 1) * brickWidth * 0.5;
      for (let x = -brickWidth + offset; x < size; x += brickWidth) {
        const index = row * 31 + Math.floor((x + brickWidth) / brickWidth);
        const warm = seededNoise(index, 71);
        ctx.fillStyle = warm > 0.72
          ? 'rgba(178,111,83,0.2)'
          : warm < 0.22
            ? 'rgba(44,29,26,0.2)'
            : 'rgba(112,66,52,0.12)';
        ctx.fillRect(x + 1.3, y + 1.4, brickWidth - 2.5, courseHeight - 2.7);
        if (seededNoise(index, 72) < 0.075) {
          ctx.fillStyle = 'rgba(30,27,24,0.36)';
          ctx.fillRect(x + 3, y + 3, brickWidth * 0.48, courseHeight * 0.5);
        }
      }
      ctx.strokeStyle = 'rgba(191,176,151,0.43)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      for (let x = -brickWidth + offset; x < size; x += brickWidth) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + courseHeight);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 34; i++) {
      const x = seededNoise(i, 73) * size;
      const width = 4 + seededNoise(i, 74) * 19;
      const stain = ctx.createLinearGradient(x, 0, x + width, 0);
      stain.addColorStop(0, 'rgba(17,17,16,0)');
      stain.addColorStop(0.5, `rgba(20,20,18,${0.035 + seededNoise(i, 75) * 0.1})`);
      stain.addColorStop(1, 'rgba(17,17,16,0)');
      ctx.fillStyle = stain;
      ctx.fillRect(x - width, 0, width * 2, size);
    }
    for (let i = 0; i < 1100; i++) {
      ctx.fillStyle = seededNoise(i, 76) > 0.5
        ? 'rgba(231,207,174,0.035)'
        : 'rgba(21,20,18,0.075)';
      ctx.fillRect(seededNoise(i, 77) * size, seededNoise(i, 78) * size, 0.8 + seededNoise(i, 79) * 1.8, 1);
    }
  });
  churchBrick.repeat.set(2.7, 2.55);

  const churchStone = makeTexture(512, (ctx, size) => {
    ctx.fillStyle = '#8f8878';
    ctx.fillRect(0, 0, size, size);
    const courseHeight = 46;
    const blockWidth = 82;
    for (let y = 0; y < size; y += courseHeight) {
      const row = Math.floor(y / courseHeight);
      const offset = (row & 1) * blockWidth * 0.5;
      ctx.strokeStyle = 'rgba(42,40,36,0.42)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      for (let x = -blockWidth + offset; x < size; x += blockWidth) {
        const index = row * 19 + Math.floor((x + blockWidth) / blockWidth);
        const shade = seededNoise(index, 81);
        ctx.fillStyle = shade > 0.58 ? 'rgba(209,199,176,0.1)' : 'rgba(50,46,40,0.1)';
        ctx.fillRect(x + 2, y + 2, blockWidth - 4, courseHeight - 4);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + courseHeight);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 46; i++) {
      const x = seededNoise(i, 82) * size;
      const y = seededNoise(i, 83) * size;
      const length = 18 + seededNoise(i, 84) * 85;
      const gradient = ctx.createLinearGradient(x, y, x, y + length);
      gradient.addColorStop(0, 'rgba(26,27,24,0.2)');
      gradient.addColorStop(1, 'rgba(26,27,24,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - 2, y, 4 + seededNoise(i, 85) * 9, length);
    }
    for (let i = 0; i < 1250; i++) {
      ctx.fillStyle = seededNoise(i, 86) > 0.5
        ? 'rgba(242,232,205,0.035)'
        : 'rgba(20,20,18,0.06)';
      const grain = 0.8 + seededNoise(i, 87) * 2.2;
      ctx.fillRect(seededNoise(i, 88) * size, seededNoise(i, 89) * size, grain, grain * 0.55);
    }
  });
  churchStone.repeat.set(2.2, 2.7);

  const churchSlate = makeTexture(512, (ctx, size) => {
    ctx.fillStyle = '#414546';
    ctx.fillRect(0, 0, size, size);
    const courseHeight = 25;
    const tileWidth = 27;
    for (let y = 0; y < size; y += courseHeight) {
      const row = Math.floor(y / courseHeight);
      const offset = (row & 1) * tileWidth * 0.5;
      ctx.strokeStyle = 'rgba(14,17,18,0.48)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      for (let x = -tileWidth + offset; x < size; x += tileWidth) {
        const index = row * 37 + Math.floor((x + tileWidth) / tileWidth);
        ctx.fillStyle = seededNoise(index, 91) > 0.55
          ? 'rgba(126,132,130,0.09)'
          : 'rgba(17,20,21,0.1)';
        ctx.fillRect(x + 1, y + 1, tileWidth - 2, courseHeight - 2);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + courseHeight);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 42; i++) {
      const x = seededNoise(i, 92) * size;
      const y = seededNoise(i, 93) * size;
      const radius = 5 + seededNoise(i, 94) * 24;
      const patch = ctx.createRadialGradient(x, y, 0, x, y, radius);
      patch.addColorStop(0, seededNoise(i, 95) < 0.55 ? 'rgba(80,71,57,0.2)' : 'rgba(67,80,69,0.16)');
      patch.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = patch;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  });
  churchSlate.repeat.set(3.15, 2.65);

  detailTextures = { stucco, brick, roof, pavement, churchBrick, churchStone, churchSlate };
  return detailTextures;
}

function material(color, options = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    map: options.map ?? null,
    bumpMap: options.bumpMap ?? null,
    bumpScale: options.bumpScale ?? 0,
    roughness: options.roughness ?? 0.88,
    metalness: options.metalness ?? 0,
    envMapIntensity: options.envMapIntensity ?? 0.3,
    flatShading: options.flatShading ?? false,
    polygonOffset: options.polygonOffset ?? false,
    polygonOffsetFactor: options.polygonOffsetFactor ?? 0,
    polygonOffsetUnits: options.polygonOffsetUnits ?? 0,
  });
  return mat;
}

function box(group, w, h, d, mat, x, y, z, name = '', options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.name = name;
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  group.add(mesh);
  return mesh;
}

function createGableGeometry(width, depth, height) {
  const x = width * 0.5;
  const z = depth * 0.5;
  const positions = [];
  const uvs = [];
  const addTriangle = (a, b, c, uvA, uvB, uvC) => {
    positions.push(...a, ...b, ...c);
    uvs.push(...uvA, ...uvB, ...uvC);
  };
  const a = [-x, 0, -z];
  const b = [x, 0, -z];
  const c = [-x, 0, z];
  const d = [x, 0, z];
  const e = [-x, height, 0];
  const f = [x, height, 0];

  addTriangle(a, b, f, [0, 0], [1, 0], [1, 1]);
  addTriangle(a, f, e, [0, 0], [1, 1], [0, 1]);
  addTriangle(c, e, f, [0, 0], [0, 1], [1, 1]);
  addTriangle(c, f, d, [0, 0], [1, 1], [1, 0]);
  addTriangle(a, e, c, [0, 0], [0.5, 1], [1, 0]);
  addTriangle(b, d, f, [0, 0], [1, 0], [0.5, 1]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createJaggedDiskGeometry(radius, random, segments = 11) {
  const positions = [];
  const uvs = [];
  const points = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const r = radius * (0.72 + random() * 0.36);
    points.push([Math.cos(angle) * r, Math.sin(angle) * r, 0]);
  }
  for (let i = 0; i < segments; i++) {
    const a = points[i];
    const b = points[(i + 1) % segments];
    positions.push(0, 0, 0, ...a, ...b);
    uvs.push(0.5, 0.5, 0.5 + a[0] / (radius * 2), 0.5 + a[1] / (radius * 2), 0.5 + b[0] / (radius * 2), 0.5 + b[1] / (radius * 2));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function createWallShellGeometry(width, depth, height, floors, damagedCells) {
  const positions = [];
  const uvs = [];
  const frontCols = Math.max(3, Math.round(width / 1.55));
  const sideCols = Math.max(2, Math.round(depth / 1.75));
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const addQuad = (a, b, c, d) => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  };

  const panelPoint = (side, u, y) => {
    if (side === 'front') return [u, y, halfDepth];
    if (side === 'back') return [u, y, -halfDepth];
    if (side === 'right') return [halfWidth, y, u];
    return [-halfWidth, y, u];
  };

  const addPanelQuad = (side, a, b, c, d) => {
    const points = [a, b, c, d].map(([u, y]) => panelPoint(side, u, y));
    if (side === 'back' || side === 'right') {
      addQuad(points[1], points[0], points[3], points[2]);
    } else {
      addQuad(points[0], points[1], points[2], points[3]);
    }
  };

  const addDamageablePanel = (side, floor, col, u0, u1, y0, y1) => {
    const key = `${side}:${floor}:${col}`;
    const severity = damagedCells?.get?.(key) ?? 0;
    if (severity <= 0) {
      addPanelQuad(side, [u0, y0], [u1, y0], [u1, y1], [u0, y1]);
      return;
    }

    // Preserve four irregular masonry shoulders rather than deleting an entire
    // rectangular façade cell. Adjacent damaged cells join into a ragged breach.
    const cellWidth = u1 - u0;
    const cellHeight = y1 - y0;
    const seed = floor * 41 + col * 17 + side.length * 73;
    const centerU = (u0 + u1) * 0.5 + (seededNoise(seed, 31) - 0.5) * cellWidth * 0.15;
    const centerY = (y0 + y1) * 0.5 + (seededNoise(seed, 32) - 0.5) * cellHeight * 0.13;
    const halfHoleWidth = cellWidth * (0.24 + severity * 0.3);
    const halfHoleHeight = cellHeight * (0.24 + severity * 0.3);
    const leftBottom = Math.max(u0, centerU - halfHoleWidth * (0.82 + seededNoise(seed, 33) * 0.28));
    const leftTop = Math.max(u0, centerU - halfHoleWidth * (0.82 + seededNoise(seed, 34) * 0.28));
    const rightBottom = Math.min(u1, centerU + halfHoleWidth * (0.82 + seededNoise(seed, 35) * 0.28));
    const rightTop = Math.min(u1, centerU + halfHoleWidth * (0.82 + seededNoise(seed, 36) * 0.28));
    const bottomLeft = Math.max(y0, centerY - halfHoleHeight * (0.78 + seededNoise(seed, 37) * 0.34));
    const bottomRight = Math.max(y0, centerY - halfHoleHeight * (0.78 + seededNoise(seed, 38) * 0.34));
    const topLeft = Math.min(y1, centerY + halfHoleHeight * (0.78 + seededNoise(seed, 39) * 0.34));
    const topRight = Math.min(y1, centerY + halfHoleHeight * (0.78 + seededNoise(seed, 40) * 0.34));

    addPanelQuad(side, [u0, y0], [u1, y0], [rightBottom, bottomRight], [leftBottom, bottomLeft]);
    addPanelQuad(side, [leftTop, topLeft], [rightTop, topRight], [u1, y1], [u0, y1]);
    addPanelQuad(side, [u0, bottomLeft], [leftBottom, bottomLeft], [leftTop, topLeft], [u0, topLeft]);
    addPanelQuad(side, [rightBottom, bottomRight], [u1, bottomRight], [u1, topRight], [rightTop, topRight]);
  };

  for (let floor = 0; floor < floors; floor++) {
    const y0 = (floor / floors) * height;
    const y1 = ((floor + 1) / floors) * height;
    for (let col = 0; col < frontCols; col++) {
      const x0 = -halfWidth + (col / frontCols) * width;
      const x1 = -halfWidth + ((col + 1) / frontCols) * width;
      addDamageablePanel('front', floor, col, x0, x1, y0, y1);
      addDamageablePanel('back', floor, col, x0, x1, y0, y1);
    }
    for (let col = 0; col < sideCols; col++) {
      const z0 = -halfDepth + (col / sideCols) * depth;
      const z1 = -halfDepth + ((col + 1) / sideCols) * depth;
      addDamageablePanel('right', floor, col, z0, z1, y0, y1);
      addDamageablePanel('left', floor, col, z0, z1, y0, y1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function addDamageableWallShell(
  group,
  width,
  depth,
  height,
  floors,
  facadeMaterial,
  darkMaterial,
  random,
  detailMaterials = {}
) {
  const frontCols = Math.max(3, Math.round(width / 1.55));
  const sideCols = Math.max(2, Math.round(depth / 1.75));
  const cellKeys = [];
  for (let floor = 0; floor < floors; floor++) {
    for (const side of ['front', 'back']) {
      for (let col = 0; col < frontCols; col++) cellKeys.push({ key: `${side}:${floor}:${col}`, side, floor, col, cols: frontCols });
    }
    for (const side of ['left', 'right']) {
      for (let col = 0; col < sideCols; col++) cellKeys.push({ key: `${side}:${floor}:${col}`, side, floor, col, cols: sideCols });
    }
  }

  const breachSide = ['front', 'back', 'left', 'right'][Math.floor(random() * 4)];
  const breachFloor = Math.min(floors - 1, Math.floor(random() * Math.max(1, floors * 0.72)));
  const breachCol = random();
  cellKeys.sort((a, b) => {
    const score = (cell) =>
      (cell.side === breachSide ? 0 : 3.2) +
      Math.abs(cell.floor - breachFloor) * 1.15 +
      Math.abs((cell.col + 0.5) / cell.cols - breachCol) * 2.3 +
      seededNoise(cell.floor * 53 + cell.col * 11, cell.side.length) * 0.34;
    return score(a) - score(b);
  });

  facadeMaterial.side = THREE.DoubleSide;
  const wall = new THREE.Mesh(
    createWallShellGeometry(width, depth, height, floors, new Map()),
    facadeMaterial
  );
  wall.name = 'buildingWall';
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  const interiorMaterial = darkMaterial.clone();
  interiorMaterial.color.setHex(0x4a4138);
  const interior = box(
    group,
    Math.max(0.5, width - 0.9),
    Math.max(0.5, height - 0.34),
    Math.max(0.5, depth - 0.9),
    interiorMaterial,
    0,
    height * 0.5,
    0,
    'buildingInterior',
    { castShadow: false, receiveShadow: false }
  );
  interior.material.side = THREE.DoubleSide;

  const floorHeight = height / floors;
  const floorMaterial = detailMaterials.floor?.clone() ?? facadeMaterial.clone();
  floorMaterial.color.setHex(0x5e5548);
  const floorTransforms = [];
  for (let floor = 1; floor < floors; floor++) {
    floorTransforms.push({
      position: new THREE.Vector3(0, floor * floorHeight, 0),
      scale: new THREE.Vector3(width - 0.58, 0.11, depth - 0.58),
    });
  }
  createInstances(
    group,
    new THREE.BoxGeometry(1, 1, 1),
    floorMaterial,
    floorTransforms,
    'exposedInteriorFloors',
    { castShadow: false }
  );

  const partitionMaterial = floorMaterial.clone();
  partitionMaterial.color.setHex(0x6a6256);
  const partitionTransforms = [];
  for (let floor = 0; floor < floors; floor++) {
    const centerY = floor * floorHeight + floorHeight * 0.48;
    partitionTransforms.push({
      position: new THREE.Vector3(width * (seededNoise(floor, 44) - 0.5) * 0.24, centerY, 0),
      scale: new THREE.Vector3(width * 0.46, floorHeight * 0.84, 0.1),
    });
    if (floor % 2 === 0) {
      partitionTransforms.push({
        position: new THREE.Vector3(0, centerY, depth * (seededNoise(floor, 45) - 0.5) * 0.2),
        rotation: { y: Math.PI * 0.5 },
        scale: new THREE.Vector3(depth * 0.38, floorHeight * 0.82, 0.09),
      });
    }
  }
  createInstances(
    group,
    new THREE.BoxGeometry(1, 1, 1),
    partitionMaterial,
    partitionTransforms,
    'exposedInteriorPartitions',
    { castShadow: false }
  );

  const masonryMaterial = detailMaterials.exposed?.clone() ?? facadeMaterial.clone();
  const timberMaterial = detailMaterials.timber?.clone() ?? darkMaterial.clone();
  const masonryTransforms = [];
  const timberTransforms = [];
  const positionOnFacade = (cell, offsetU, offsetY, inset = 0.04) => {
    const horizontalSize = cell.side === 'front' || cell.side === 'back' ? width : depth;
    const cellSpan = horizontalSize / cell.cols;
    const u = -horizontalSize * 0.5 + (cell.col + 0.5) * cellSpan + offsetU * cellSpan;
    const y = (cell.floor + 0.5) * floorHeight + offsetY * floorHeight;
    if (cell.side === 'front') return { position: new THREE.Vector3(u, y, depth * 0.5 + inset), rotationY: 0, cellSpan };
    if (cell.side === 'back') return { position: new THREE.Vector3(u, y, -depth * 0.5 - inset), rotationY: Math.PI, cellSpan };
    if (cell.side === 'right') return { position: new THREE.Vector3(width * 0.5 + inset, y, u), rotationY: Math.PI * 0.5, cellSpan };
    return { position: new THREE.Vector3(-width * 0.5 - inset, y, u), rotationY: -Math.PI * 0.5, cellSpan };
  };
  const detailedCells = cellKeys.slice(0, Math.min(16, cellKeys.length));
  for (let index = 0; index < detailedCells.length; index++) {
    const cell = detailedCells[index];
    for (const [offsetU, offsetY, horizontal] of [[-0.34, 0.02, false], [0.04, 0.36, true]]) {
      const placed = positionOnFacade(cell, offsetU, offsetY, 0.055);
      masonryTransforms.push({
        position: placed.position,
        rotation: {
          y: placed.rotationY,
          z: (seededNoise(index * 5 + masonryTransforms.length, 46) - 0.5) * 0.38,
        },
        scale: horizontal
          ? new THREE.Vector3(placed.cellSpan * 0.2, 0.12, 0.14)
          : new THREE.Vector3(0.11, floorHeight * 0.18, 0.14),
      });
    }
    if (index >= 2) {
      const placed = positionOnFacade(cell, 0, -0.06, -0.2);
      timberTransforms.push({
        position: placed.position,
        rotation: { y: placed.rotationY, z: (seededNoise(index, 47) - 0.5) * 0.48 },
        scale: new THREE.Vector3(placed.cellSpan * 0.7, 0.1, 0.1),
      });
    }
  }
  const breachMasonry = createInstances(
    group,
    new THREE.DodecahedronGeometry(1, 0),
    masonryMaterial,
    masonryTransforms,
    'progressiveBreachMasonry',
    { castShadow: true }
  );
  const exposedTimbers = createInstances(
    group,
    new THREE.BoxGeometry(1, 1, 1),
    timberMaterial,
    timberTransforms,
    'progressiveExposedTimbers',
    { castShadow: true }
  );
  if (breachMasonry) breachMasonry.count = 0;
  if (exposedTimbers) exposedTimbers.count = 0;

  const stageCounts = [0, 1, 2, 4, 6, Math.min(9, Math.ceil(cellKeys.length * 0.1))];
  group.userData.damageBounds = { width, depth, height };
  group.userData.applyDamageStage = (stage) => {
    group.userData.damageStage = stage;
    const count = Math.min(
      cellKeys.length,
      stageCounts[stage] ?? stageCounts[stageCounts.length - 1]
    );
    const damaged = new Map();
    for (let i = 0; i < count; i++) {
      const priority = count > 0 ? 1 - i / count : 0;
      const variation = seededNoise(i + stage * 19, 48) * 0.14;
      damaged.set(
        cellKeys[i].key,
        Math.min(0.94, 0.24 + stage * 0.09 + priority * 0.15 + variation)
      );
    }
    const nextGeometry = createWallShellGeometry(width, depth, height, floors, damaged);
    wall.geometry.dispose();
    wall.geometry = nextGeometry;
    if (breachMasonry) breachMasonry.count = Math.min(masonryTransforms.length, count * 2);
    if (exposedTimbers) exposedTimbers.count = Math.min(timberTransforms.length, Math.max(0, count - 3));

    for (const child of group.children) {
      if (child.userData.damageMark) continue;
      if (child.name === 'buildingWindows') child.visible = stage < 5;
      if (child.name === 'windowSurrounds' || child.name === 'windowSills') child.visible = stage < 5;
      // Roofs, cornices, and floor courses remain as broken structural remnants
      // until the final collapse instead of vanishing as complete clean panels.
      if (child.name === 'buildingRoof' || child.name === 'roofRidge') child.visible = true;
      if (child.name === 'buildingChimney') child.visible = stage < 5;
      if (child.name === 'facadeCourse' || child.name === 'buildingCornice') child.visible = true;
    }
  };
}

function createInstances(group, geometry, mat, transforms, name, options = {}) {
  if (!transforms.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, mat, transforms.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Euler();
  transforms.forEach((transform, i) => {
    position.copy(transform.position);
    rotation.set(
      transform.rotation?.x ?? 0,
      transform.rotation?.y ?? 0,
      transform.rotation?.z ?? 0
    );
    quaternion.setFromEuler(rotation);
    scale.copy(transform.scale ?? new THREE.Vector3(1, 1, 1));
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
  });
  mesh.name = name;
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  return mesh;
}

function addFacadeWindows(group, width, depth, floors, floorHeight, damaged, mats, random) {
  const surrounds = [];
  const panes = [];
  const boards = [];
  const sills = [];
  const lookoutWindows = [];
  const cols = Math.max(2, Math.floor(width / 1.75));
  const sideCols = Math.max(1, Math.floor(depth / 2.35));
  const addWindow = (x, y, z, rotationY, broken) => {
    const rotation = { y: rotationY };
    surrounds.push({ position: new THREE.Vector3(x, y, z), rotation });
    panes.push({
      position: new THREE.Vector3(
        x + Math.sin(rotationY) * 0.035,
        y,
        z + Math.cos(rotationY) * 0.035
      ),
      rotation,
    });
    if (broken) {
      boards.push({
        position: new THREE.Vector3(
          x + Math.sin(rotationY) * 0.075,
          y + (random() - 0.5) * 0.18,
          z + Math.cos(rotationY) * 0.075
        ),
        rotation: { y: rotationY, z: (random() - 0.5) * 0.32 },
      });
    }
    sills.push({
      position: new THREE.Vector3(
        x + Math.sin(rotationY) * 0.09,
        y - 0.54,
        z + Math.cos(rotationY) * 0.09
      ),
      rotation,
    });
    lookoutWindows.push({
      position: {
        x: x + Math.sin(rotationY) * 0.105,
        y: y - 0.02,
        z: z + Math.cos(rotationY) * 0.105,
      },
      rotationY,
      broken: !!broken,
    });
  };

  for (let floor = 0; floor < floors; floor++) {
    const y = 1.25 + floor * floorHeight;
    for (let col = 0; col < cols; col++) {
      const x = -width * 0.5 + (col + 0.5) * (width / cols);
      addWindow(x, y, depth * 0.5 + 0.055, 0, damaged && random() < 0.34);
      if (random() > 0.12) addWindow(x, y, -depth * 0.5 - 0.055, Math.PI, damaged && random() < 0.25);
    }
    for (let col = 0; col < sideCols; col++) {
      const z = -depth * 0.5 + (col + 0.5) * (depth / sideCols);
      if (random() > 0.35) addWindow(width * 0.5 + 0.055, y, z, Math.PI * 0.5, damaged && random() < 0.24);
      if (random() > 0.35) addWindow(-width * 0.5 - 0.055, y, z, -Math.PI * 0.5, damaged && random() < 0.24);
    }
  }

  createInstances(group, new THREE.BoxGeometry(0.88, 1.13, 0.11), mats.surround, surrounds, 'windowSurrounds', { castShadow: false });
  createInstances(group, new THREE.BoxGeometry(0.62, 0.87, 0.08), mats.window, panes, 'buildingWindows', { castShadow: false, receiveShadow: false });
  createInstances(group, new THREE.BoxGeometry(0.82, 0.09, 0.24), mats.stone, sills, 'windowSills', { castShadow: false });
  createInstances(group, new THREE.BoxGeometry(0.76, 0.11, 0.1), mats.boarded, boards, 'buildingBoards', { castShadow: false });
  group.userData.garrisonWindows = lookoutWindows;
}

function addDamageDetails(group, width, depth, bodyHeight, mats, random) {
  const breachSide = random() < 0.78 ? 1 : -1;
  const scorchRadius = Math.min(width * 0.16, 1.35);
  const scorch = new THREE.Mesh(
    createJaggedDiskGeometry(scorchRadius, random, 12),
    mats.soot
  );
  scorch.position.set(
    width * (random() - 0.5) * 0.42,
    bodyHeight * (0.48 + random() * 0.28),
    breachSide * (depth * 0.5 + 0.026)
  );
  scorch.rotation.y = breachSide > 0 ? 0 : Math.PI;
  scorch.scale.y = 0.82 + random() * 0.48;
  scorch.name = 'battleScorch';
  scorch.castShadow = false;
  scorch.receiveShadow = false;
  group.add(scorch);
  const exposedBrick = new THREE.Mesh(
    createJaggedDiskGeometry(scorchRadius * 0.7, random, 10),
    mats.exposedBrick
  );
  exposedBrick.position.copy(scorch.position);
  exposedBrick.position.z += breachSide * 0.004;
  exposedBrick.rotation.copy(scorch.rotation);
  exposedBrick.scale.y = scorch.scale.y * 0.86;
  exposedBrick.name = 'exposedBrickwork';
  exposedBrick.castShadow = false;
  exposedBrick.receiveShadow = false;
  group.add(exposedBrick);
  for (let i = 0; i < 7; i++) {
    const rubble = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.18 + random() * 0.26, 0),
      i % 3 === 0 ? mats.timber : mats.stone
    );
    rubble.position.set(
      (random() - 0.5) * width * 0.78,
      0.14 + random() * 0.13,
      breachSide * (depth * 0.5 + 0.28 + random() * 0.65)
    );
    rubble.scale.set(1.4 + random(), 0.48 + random() * 0.35, 0.8 + random() * 0.6);
    rubble.rotation.set(random(), random() * Math.PI, random());
    rubble.castShadow = true;
    rubble.receiveShadow = true;
    group.add(rubble);
  }
}

function createPeriodBuilding(kind, width, depth, floors, random) {
  const group = new THREE.Group();
  group.name = kind;
  group.userData.uniqueSceneryMaterials = true;
  const textures = getDetailTextures();
  const factory = kind === 'factory';
  const floorHeight = factory ? 1.65 : 1.55;
  const bodyHeight = Math.max(3.4, floors * floorHeight);
  const roofHeight = factory ? 0 : 1.2 + random() * 0.42;
  const facadeColor = FACADE_COLORS[Math.floor(random() * FACADE_COLORS.length)];
  const facadeMap = factory ? textures.brick : textures.stucco;
  const mats = {
    facade: material(factory ? 0xffffff : facadeColor, {
      map: facadeMap,
      bumpMap: facadeMap,
      bumpScale: factory ? 0.028 : 0.018,
      roughness: 0.91,
    }),
    stone: material(0x898579, { map: textures.pavement, roughness: 0.94 }),
    surround: material(0xb8b19e, { map: textures.stucco, roughness: 0.92 }),
    roof: material(random() < 0.48 ? 0x5d5550 : 0x494a49, {
      map: textures.roof,
      roughness: 0.91,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    window: material(0x182124, { roughness: 0.42, metalness: 0.08, envMapIntensity: 0.72 }),
    boarded: material(0x4b3729, { roughness: 0.97 }),
    timber: material(0x3a2920, { roughness: 0.96 }),
    soot: material(0x211d1a, { roughness: 1 }),
    exposedBrick: material(0xffffff, {
      map: textures.brick,
      bumpMap: textures.brick,
      bumpScale: 0.025,
      roughness: 0.97,
    }),
    metal: material(0x333737, { roughness: 0.68, metalness: 0.34 }),
  };

  const damaged = random() < 0.74;
  const heavilyDamaged = damaged && random() < 0.38;
  addDamageableWallShell(
    group,
    width,
    depth,
    bodyHeight,
    floors,
    mats.facade,
    mats.soot,
    random,
    {
      exposed: mats.exposedBrick,
      floor: mats.stone,
      timber: mats.timber,
    }
  );
  box(group, width + 0.18, 0.62, depth + 0.18, mats.stone, 0, 0.31, 0, 'buildingPlinth');

  const roofless = damaged && !factory && random() < (heavilyDamaged ? 0.62 : 0.29);
  if (factory) {
    box(group, width + 0.16, 0.3, depth + 0.16, mats.roof, 0, bodyHeight + 0.17, 0, 'buildingRoof', {
      receiveShadow: false,
    });
  } else if (roofless) {
    const parapetY = bodyHeight + 0.28;
    box(group, width + 0.14, 0.56, 0.28, mats.facade, 0, parapetY, depth * 0.5, 'buildingRoof');
    box(group, width + 0.14, 0.56, 0.28, mats.facade, 0, parapetY, -depth * 0.5, 'buildingRoof');
    box(group, 0.28, 0.56, depth, mats.facade, width * 0.5, parapetY, 0, 'buildingRoof');
    box(group, 0.28, 0.56, depth, mats.facade, -width * 0.5, parapetY, 0, 'buildingRoof');
    box(group, width * 0.72, 0.16, depth * 0.68, mats.soot, 0, bodyHeight + 0.09, 0, 'burnedRoofDeck', {
      receiveShadow: false,
    });
    const rafters = [];
    for (let i = -2; i <= 2; i++) {
      rafters.push({
        position: new THREE.Vector3(i * width * 0.115, bodyHeight + 0.22, 0),
        scale: new THREE.Vector3(0.12, 0.12, depth * 0.68),
      });
    }
    createInstances(group, new THREE.BoxGeometry(1, 1, 1), mats.timber, rafters, 'exposedRoofRafters', {
      receiveShadow: false,
    });
  } else {
    const roof = new THREE.Mesh(createGableGeometry(width + 0.48, depth + 0.48, roofHeight), mats.roof);
    roof.position.y = bodyHeight + 0.045;
    roof.name = 'buildingRoof';
    roof.castShadow = true;
    roof.receiveShadow = false;
    group.add(roof);
    box(group, width + 0.58, 0.13, 0.16, mats.metal, 0, bodyHeight + roofHeight + 0.075, 0, 'roofRidge', {
      receiveShadow: false,
    });
  }

  addFacadeWindows(group, width, depth, floors, floorHeight, damaged, mats, random);

  for (let floor = 1; floor < floors; floor++) {
    const y = floor * floorHeight;
    box(group, width + 0.08, 0.09, 0.14, mats.surround, 0, y, depth * 0.5 + 0.045, 'facadeCourse', {
      castShadow: false,
    });
    box(group, width + 0.08, 0.09, 0.14, mats.surround, 0, y, -depth * 0.5 - 0.045, 'facadeCourse', {
      castShadow: false,
    });
  }
  box(group, width + 0.24, 0.22, depth + 0.24, mats.surround, 0, bodyHeight - 0.12, 0, 'buildingCornice');

  box(group, 1.12, 1.92, 0.15, mats.timber, -width * 0.24, 0.96, depth * 0.5 + 0.09, 'buildingDoor');
  box(group, 1.35, 0.22, 0.65, mats.metal, -width * 0.24, 2.0, depth * 0.5 + 0.34, 'doorCanopy');

  if (!factory && random() < 0.38) {
    const balconyY = 2.75 + Math.floor(random() * Math.max(1, floors - 2)) * floorHeight;
    box(
      group,
      Math.min(2.8, width * 0.42),
      0.14,
      0.72,
      mats.stone,
      width * 0.18,
      balconyY,
      depth * 0.5 + 0.34,
      'balcony'
    );
    const railTransforms = [];
    for (let i = -2; i <= 2; i++) {
      railTransforms.push({
        position: new THREE.Vector3(
          width * 0.18 + i * Math.min(0.48, width * 0.075),
          balconyY + 0.48,
          depth * 0.5 + 0.68
        ),
      });
    }
    createInstances(group, new THREE.BoxGeometry(0.05, 0.9, 0.05), mats.metal, railTransforms, 'balconyRail', {
      castShadow: false,
    });
  }

  const chimneyCount = factory ? 1 : width > 8.5 ? 3 : 2;
  const chimneys = [];
  for (let i = 0; i < chimneyCount; i++) {
    const chimneyHeight = factory ? 5.8 : 1.35;
    chimneys.push({
      position: new THREE.Vector3(
        (i / Math.max(1, chimneyCount - 1) - 0.5) * width * 0.56,
        bodyHeight + (factory ? 2.7 : roofless ? 0.8 : roofHeight * 0.52 + 0.65),
        -depth * 0.14
      ),
      scale: new THREE.Vector3(factory ? 1.25 : 0.72, chimneyHeight, factory ? 1.25 : 0.72),
    });
  }
  createInstances(
    group,
    new THREE.BoxGeometry(0.56, 1, 0.56),
    factory ? mats.facade : mats.stone,
    chimneys,
    'buildingChimney',
    { receiveShadow: false }
  );

  if (!factory && random() < 0.34) {
    box(group, width * 0.38, 1.35, 0.12, mats.boarded, width * 0.19, 0.82, depth * 0.5 + 0.11, 'boardedShopfront');
    box(group, width * 0.4, 0.28, 0.24, mats.surround, width * 0.19, 1.64, depth * 0.5 + 0.14, 'shopLintel');
  }

  if (damaged) addDamageDetails(group, width, depth, bodyHeight, mats, random);
  group.userData.roofDamageProfile = {
    bodyHeight,
    roofHeight: roofless || factory ? 0.18 : roofHeight,
    style: roofless || factory ? 'flat' : 'gable',
    width,
    depth,
  };
  group.userData.initialHpRatio = heavilyDamaged
    ? 0.38 + random() * 0.19
    : damaged
      ? 0.66 + random() * 0.22
      : 1;
  return group;
}

function createChurch(random) {
  const group = new THREE.Group();
  group.name = 'church';
  group.userData.uniqueSceneryMaterials = true;
  const textures = getDetailTextures();
  const brick = material(0xffffff, {
    map: textures.churchBrick,
    bumpMap: textures.churchBrick,
    bumpScale: 0.034,
    roughness: 0.95,
  });
  const stone = material(0xffffff, {
    map: textures.churchStone,
    bumpMap: textures.churchStone,
    bumpScale: 0.026,
    roughness: 0.96,
  });
  const trim = material(0xbab29f, {
    map: textures.churchStone,
    bumpMap: textures.churchStone,
    bumpScale: 0.018,
    roughness: 0.94,
  });
  const roofMat = material(0x68706e, {
    map: textures.churchSlate,
    bumpMap: textures.churchSlate,
    bumpScale: 0.022,
    roughness: 0.94,
    envMapIntensity: 0.2,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const dark = material(0x15191a, { roughness: 0.55 });
  const weatheredMetal = material(0x314744, {
    roughness: 0.73,
    metalness: 0.48,
    envMapIntensity: 0.5,
  });
  const stainedGlass = new THREE.MeshStandardMaterial({
    color: 0x263d46,
    emissive: 0x101b20,
    emissiveIntensity: 0.32,
    roughness: 0.38,
    metalness: 0.05,
    envMapIntensity: 0.75,
  });
  addDamageableWallShell(group, 11.5, 6.8, 6.2, 4, brick, dark, random, {
    exposed: brick,
    floor: stone,
    timber: dark,
  });

  // Dressed-stone plinth, cornice and buttresses give the landmark readable
  // historic construction detail instead of one uninterrupted red box.
  box(group, 11.82, 0.66, 7.12, stone, 0, 0.33, 0, 'facadeCourse');
  box(group, 11.78, 0.24, 7.08, trim, 0, 5.98, 0, 'buildingCornice');
  for (const zSide of [-1, 1]) {
    for (const x of [-5.05, 0.05, 5.05]) {
      box(
        group,
        0.62,
        3.25,
        0.58,
        stone,
        x,
        1.62,
        zSide * 3.62,
        'facadeCourse'
      );
      box(
        group,
        0.82,
        0.26,
        0.72,
        trim,
        x,
        3.27,
        zSide * 3.62,
        'facadeCourse'
      );
    }
  }

  const naveRoof = new THREE.Mesh(createGableGeometry(11.95, 7.25, 2.35), roofMat);
  naveRoof.position.y = 6.25;
  naveRoof.name = 'buildingRoof';
  naveRoof.castShadow = true;
  naveRoof.receiveShadow = false;
  group.add(naveRoof);
  box(group, 12.08, 0.14, 0.16, weatheredMetal, 0, 8.64, 0, 'roofRidge', {
    receiveShadow: false,
  });
  box(group, 3.35, 9.6, 3.55, brick, -3.9, 4.8, 0, 'buildingTower');
  box(group, 3.58, 0.72, 3.78, stone, -3.9, 0.36, 0, 'buildingTower');
  for (const y of [3.15, 6.15, 9.08]) {
    box(group, 3.56, 0.2, 3.76, trim, -3.9, y, 0, 'buildingTower', {
      castShadow: false,
    });
  }
  for (const xSide of [-1, 1]) {
    for (const zSide of [-1, 1]) {
      box(
        group,
        0.24,
        8.62,
        0.26,
        trim,
        -3.9 + xSide * 1.58,
        4.78,
        zSide * 1.68,
        'buildingTower',
        { castShadow: false }
      );
    }
  }
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.35, 4.9, 4), roofMat);
  spire.position.set(-3.9, 12.05, 0);
  spire.rotation.y = Math.PI * 0.25;
  spire.name = 'buildingRoof';
  spire.castShadow = true;
  spire.receiveShadow = false;
  group.add(spire);
  box(group, 0.12, 1.18, 0.12, weatheredMetal, -3.9, 14.95, 0, 'roofRidge', {
    receiveShadow: false,
  });
  box(group, 0.82, 0.12, 0.12, weatheredMetal, -3.9, 15.06, 0, 'roofRidge', {
    receiveShadow: false,
  });
  group.userData.roofDamageProfile = {
    bodyHeight: 6.25,
    roofHeight: 2.35,
    style: 'gable',
    width: 11.95,
    depth: 7.25,
    heightAt(localX, localZ) {
      const towerX = localX + 3.9;
      if (Math.abs(towerX) < 2.35 && Math.abs(localZ) < 2.35) {
        const edgeRatio = Math.max(Math.abs(towerX), Math.abs(localZ)) / 2.35;
        return 9.62 + 4.9 * Math.max(0, 1 - edgeRatio);
      }
      return 6.27 + 2.35 * Math.max(0, 1 - Math.abs(localZ) / 3.625);
    },
    normalAt(localX, localZ) {
      const towerX = localX + 3.9;
      if (Math.abs(towerX) < 2.35 && Math.abs(localZ) < 2.35) {
        if (Math.abs(towerX) >= Math.abs(localZ)) {
          return { x: Math.sign(towerX) * 4.9 / 2.35, y: 1, z: 0 };
        }
        return { x: 0, y: 1, z: Math.sign(localZ) * 4.9 / 2.35 };
      }
      return { x: 0, y: 1, z: Math.sign(localZ) * 2.35 / 3.625 };
    },
  };
  for (const z of [-1.79, 1.79]) {
    box(group, 0.72, 1.55, 0.1, dark, -3.9, 7.1, z, 'buildingWindow', { castShadow: false });
  }
  const churchLookoutWindows = [];
  for (const zSide of [-1, 1]) {
    const rotationY = zSide > 0 ? 0 : Math.PI;
    for (const x of [-1.7, 1.15, 3.7]) {
      for (const y of [2.05, 4.15]) {
        const z = zSide * 3.46;
        box(group, 0.68, 1.18, 0.1, dark, x, y, z, 'buildingWindow', {
          castShadow: false,
          receiveShadow: false,
        });
        churchLookoutWindows.push({
          position: { x, y, z: z + zSide * 0.11 },
          rotationY,
          broken: random() < 0.45,
        });
      }
    }
    const rose = new THREE.Mesh(new THREE.CircleGeometry(0.82, 24), stainedGlass);
    rose.position.set(3.38, 5.28, zSide * 3.472);
    rose.rotation.y = zSide > 0 ? 0 : Math.PI;
    rose.name = 'buildingWindow';
    rose.castShadow = false;
    rose.receiveShadow = false;
    group.add(rose);
    const roseSurround = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.12, 8, 28), trim);
    roseSurround.position.copy(rose.position);
    roseSurround.position.z += zSide * 0.018;
    roseSurround.rotation.copy(rose.rotation);
    roseSurround.name = 'facadeCourse';
    roseSurround.castShadow = false;
    group.add(roseSurround);
  }
  group.userData.garrisonWindows = churchLookoutWindows;
  box(group, 1.82, 2.72, 0.18, trim, -1.7, 1.36, 3.49, 'facadeCourse');
  box(group, 1.5, 2.35, 0.12, dark, -1.7, 1.2, 3.59, 'buildingDoor');
  if (random() < 0.82) {
    box(group, 1.45, 1.9, 0.14, dark, 3.35, 4.25, 3.47, 'battleScorch', { castShadow: false, receiveShadow: false });
  }
  const applyNaveDamage = group.userData.applyDamageStage;
  group.userData.applyDamageStage = (stage) => {
    applyNaveDamage?.(stage);
    let windowIndex = 0;
    for (const child of group.children) {
      if (child.name === 'buildingTower') child.visible = stage < 5;
      if (child.name === 'buildingWindow') {
        child.visible = stage < 5 && (stage < 4 || windowIndex % 3 !== 0);
        windowIndex++;
      }
    }
  };
  group.userData.initialHpRatio = 0.48 + random() * 0.28;
  group.scale.setScalar(1.18);
  return group;
}

export function urbanSpacing(mapDef) {
  return getUrbanStreetSpacing(mapDef);
}

export function getUrbanCanalDefinition(mapDef) {
  if (mapDef?.terrain !== 'urban' || !Number.isFinite(mapDef.canalOffsetCells)) return null;
  const spacing = urbanSpacing(mapDef);
  const extent = getUrbanRoadExtent(mapDef);
  const x = spacing * mapDef.canalOffsetCells;
  const width = mapDef.canalWidth ?? 5.4;
  const roadWidth = mapDef.streetWidth ?? 6.4;
  const bridges = [];
  for (let z = -extent; z <= extent + 0.01; z += spacing) bridges.push(z);
  return {
    x,
    width,
    halfWidth: width * 0.5,
    bridgeHalfWidth: (roadWidth + 0.65) * 0.5,
    bridges,
  };
}

export function isUrbanCanalBridge(z, mapDef, margin = 0) {
  const canal = getUrbanCanalDefinition(mapDef);
  if (!canal) return false;
  const halfWidth = Math.max(0.5, canal.bridgeHalfWidth + margin);
  return canal.bridges.some((bridgeZ) => Math.abs(z - bridgeZ) <= halfWidth);
}

export function isUrbanCanalWater(x, z, mapDef, bankMargin = 0) {
  const canal = getUrbanCanalDefinition(mapDef);
  if (!canal) return false;
  return (
    Math.abs(x - canal.x) < canal.halfWidth + Math.max(0, bankMargin) &&
    !isUrbanCanalBridge(z, mapDef)
  );
}

export function nearestUrbanCanalBridgeZ(z, mapDef, destinationZ = z) {
  const canal = getUrbanCanalDefinition(mapDef);
  if (!canal?.bridges.length) return null;
  return canal.bridges.reduce((best, bridgeZ) => {
    const score = Math.abs(z - bridgeZ) + Math.abs(destinationZ - bridgeZ) * 0.45;
    const bestScore = Math.abs(z - best) + Math.abs(destinationZ - best) * 0.45;
    return score < bestScore ? bridgeZ : best;
  });
}

function createUrbanSurfaceTexture(mapDef, extent, spacing, roadWidth, sidewalkWidth, random) {
  const size = 1536;
  const canvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  const roughnessCanvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  roughnessCanvas.width = size;
  roughnessCanvas.height = size;
  const ctx = canvas.getContext('2d');
  const bump = bumpCanvas.getContext('2d');
  const roughness = roughnessCanvas.getContext('2d');
  const worldSpan = extent * 2 + roadWidth + sidewalkWidth * 2;
  const toPx = (value) => ((value + worldSpan * 0.5) / worldSpan) * size;
  const pxScale = size / worldSpan;
  const roadCenters = [];
  for (let p = -extent; p <= extent + 0.01; p += spacing) roadCenters.push(p);

  // Courtyards and exposed building plots: compacted, soot-darkened urban soil.
  ctx.fillStyle = '#514d45';
  ctx.fillRect(0, 0, size, size);
  bump.fillStyle = '#8c8c8c';
  bump.fillRect(0, 0, size, size);
  roughness.fillStyle = '#eeeeee';
  roughness.fillRect(0, 0, size, size);
  for (let i = 0; i < 3200; i++) {
    const x = random() * size;
    const y = random() * size;
    const shade = 46 + Math.floor(random() * 38);
    const radius = 0.8 + random() * 5;
    ctx.fillStyle = `rgba(${shade},${shade - 3},${shade - 8},${0.035 + random() * 0.085})`;
    ctx.fillRect(x, y, radius, radius * (0.35 + random() * 0.85));
    bump.fillStyle = random() < 0.58 ? 'rgba(45,45,45,0.12)' : 'rgba(225,225,225,0.09)';
    bump.fillRect(x, y, radius, Math.max(1, radius * 0.35));
  }

  const drawStrip = (target, center, width, vertical) => {
    if (vertical) target.fillRect(center - width * 0.5, 0, width, size);
    else target.fillRect(0, center - width * 0.5, size, width);
  };

  // Lay sidewalks first so later road passes form a clean, continuous carriageway
  // through intersections.
  const drawSidewalk = (p, vertical) => {
    const center = toPx(p);
    const walkPx = (roadWidth + sidewalkWidth * 2) * pxScale;
    ctx.fillStyle = '#6f6d65';
    drawStrip(ctx, center, walkPx, vertical);
    bump.fillStyle = '#b5b5b5';
    drawStrip(bump, center, walkPx, vertical);
    roughness.fillStyle = '#f2f2f2';
    drawStrip(roughness, center, walkPx, vertical);
  };
  for (const p of roadCenters) {
    drawSidewalk(p, true);
    drawSidewalk(p, false);
  }

  const drawRoadBase = (p, vertical) => {
    const center = toPx(p);
    const roadPx = roadWidth * pxScale;
    const isMainRoad = Math.abs(p) < 0.01;
    ctx.fillStyle = isMainRoad ? '#343735' : '#444540';
    drawStrip(ctx, center, roadPx, vertical);
    bump.fillStyle = isMainRoad ? '#888888' : '#949494';
    drawStrip(bump, center, roadPx, vertical);
    roughness.fillStyle = isMainRoad ? '#d7d7d7' : '#e5e5e5';
    drawStrip(roughness, center, roadPx, vertical);
  };
  for (const p of roadCenters) {
    drawRoadBase(p, true);
    drawRoadBase(p, false);
  }

  const drawLine = (target, x1, y1, x2, y2, color, width) => {
    target.strokeStyle = color;
    target.lineWidth = width;
    target.beginPath();
    target.moveTo(x1, y1);
    target.lineTo(x2, y2);
    target.stroke();
  };

  // Berlin side streets retain rows of small granite setts. Deliberately keep
  // these irregular and subdued: they should read as road construction, not a
  // bright game grid.
  const cobbleStep = Math.max(3.2, pxScale * 0.34);
  const cobbleCourse = Math.max(3.4, pxScale * 0.31);
  const drawCobbleStreet = (p, vertical) => {
    const center = toPx(p);
    const roadPx = roadWidth * pxScale;
    for (let cross = center - roadPx * 0.5; cross <= center + roadPx * 0.5; cross += cobbleCourse) {
      const course = Math.round(cross / cobbleCourse);
      if (vertical) {
        drawLine(ctx, cross, 0, cross, size, 'rgba(22,23,21,0.23)', 0.65);
        drawLine(bump, cross, 0, cross, size, 'rgba(35,35,35,0.48)', 0.8);
        for (let along = (course & 1) ? cobbleStep * 0.5 : 0; along < size; along += cobbleStep) {
          drawLine(ctx, cross, along, cross + cobbleCourse, along, 'rgba(25,26,24,0.19)', 0.55);
          drawLine(bump, cross, along, cross + cobbleCourse, along, 'rgba(42,42,42,0.42)', 0.7);
        }
      } else {
        drawLine(ctx, 0, cross, size, cross, 'rgba(22,23,21,0.23)', 0.65);
        drawLine(bump, 0, cross, size, cross, 'rgba(35,35,35,0.48)', 0.8);
        for (let along = (course & 1) ? cobbleStep * 0.5 : 0; along < size; along += cobbleStep) {
          drawLine(ctx, along, cross, along, cross + cobbleCourse, 'rgba(25,26,24,0.19)', 0.55);
          drawLine(bump, along, cross, along, cross + cobbleCourse, 'rgba(42,42,42,0.42)', 0.7);
        }
      }
    }
  };
  for (const p of roadCenters) {
    if (Math.abs(p) < 0.01) continue;
    drawCobbleStreet(p, true);
    drawCobbleStreet(p, false);
  }

  // Individual stone and aggregate variation breaks the machine-perfect paving
  // rhythm while preserving the readable street direction.
  const randomRoadPoint = (margin = 0.2) => {
    const vertical = random() < 0.5;
    const center = toPx(roadCenters[Math.floor(random() * roadCenters.length)]);
    const lateral = (random() - 0.5) * roadWidth * pxScale * (1 - margin);
    return vertical
      ? { x: center + lateral, y: random() * size, vertical }
      : { x: random() * size, y: center + lateral, vertical };
  };
  for (let i = 0; i < 9400; i++) {
    const point = randomRoadPoint(0.04);
    const light = random() < 0.42;
    const alpha = 0.035 + random() * 0.095;
    ctx.fillStyle = light
      ? `rgba(174,171,158,${alpha})`
      : `rgba(17,19,18,${alpha})`;
    const grain = 0.55 + random() * 1.8;
    ctx.fillRect(point.x, point.y, grain * (0.65 + random()), grain);
  }

  // Flagstone joints, chipped curb lines, and periodic kerb blocks.
  const slabLength = Math.max(13, pxScale * 1.35);
  const curbWidth = Math.max(1, pxScale * 0.08);
  for (const p of roadCenters) {
    const center = toPx(p);
    for (const side of [-1, 1]) {
      const curb = center + side * (roadWidth * 0.5) * pxScale;
      drawLine(ctx, curb, 0, curb, size, 'rgba(213,207,190,0.32)', curbWidth);
      drawLine(bump, curb, 0, curb, size, 'rgba(238,238,238,0.58)', curbWidth + 0.7);
      drawLine(ctx, 0, curb, size, curb, 'rgba(213,207,190,0.32)', curbWidth);
      drawLine(bump, 0, curb, size, curb, 'rgba(238,238,238,0.58)', curbWidth + 0.7);
      for (let along = 0; along < size; along += slabLength) {
        const jitter = (random() - 0.5) * 1.4;
        drawLine(ctx, curb, along + jitter, curb + side * sidewalkWidth * pxScale, along + jitter, 'rgba(42,41,38,0.2)', 0.7);
        drawLine(bump, curb, along + jitter, curb + side * sidewalkWidth * pxScale, along + jitter, 'rgba(48,48,48,0.38)', 0.8);
        drawLine(ctx, along + jitter, curb, along + jitter, curb + side * sidewalkWidth * pxScale, 'rgba(42,41,38,0.2)', 0.7);
        drawLine(bump, along + jitter, curb, along + jitter, curb + side * sidewalkWidth * pxScale, 'rgba(48,48,48,0.38)', 0.8);
      }
      for (let chip = slabLength * 0.5; chip < size; chip += slabLength * (2.4 + random() * 2.2)) {
        const chipLength = 2 + random() * 6;
        if (random() < 0.5) {
          drawLine(ctx, curb, chip, curb, chip + chipLength, 'rgba(27,27,25,0.64)', curbWidth + 1.2);
          drawLine(bump, curb, chip, curb, chip + chipLength, 'rgba(30,30,30,0.72)', curbWidth + 1.1);
        } else {
          drawLine(ctx, chip, curb, chip + chipLength, curb, 'rgba(27,27,25,0.64)', curbWidth + 1.2);
          drawLine(bump, chip, curb, chip + chipLength, curb, 'rgba(30,30,30,0.72)', curbWidth + 1.1);
        }
      }
    }
  }

  const randomSidewalkPoint = () => {
    const vertical = random() < 0.5;
    const center = toPx(roadCenters[Math.floor(random() * roadCenters.length)]);
    const side = random() < 0.5 ? -1 : 1;
    const lateral = side * (roadWidth * 0.5 + random() * sidewalkWidth) * pxScale;
    return vertical
      ? { x: center + lateral, y: random() * size, vertical }
      : { x: random() * size, y: center + lateral, vertical };
  };
  for (let i = 0; i < 3100; i++) {
    const point = randomSidewalkPoint();
    const dirt = random() < 0.72;
    ctx.fillStyle = dirt
      ? `rgba(31,29,25,${0.025 + random() * 0.1})`
      : `rgba(191,185,165,${0.025 + random() * 0.06})`;
    const fleck = 0.7 + random() * 2.6;
    ctx.fillRect(point.x, point.y, fleck, fleck * (0.3 + random()));
  }
  for (let i = 0; i < 230; i++) {
    const point = randomSidewalkPoint();
    const radius = 3 + random() * 15;
    const stain = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    stain.addColorStop(0, random() < 0.72 ? 'rgba(28,27,23,0.17)' : 'rgba(108,83,57,0.13)');
    stain.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = stain;
    ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
  }

  // Soot, fuel, tracked-vehicle wear and dust collect in long, soft streaks.
  for (let i = 0; i < 260; i++) {
    const point = randomRoadPoint(0.16);
    const length = 18 + random() * 95;
    const width = 1.2 + random() * 5.5;
    const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, length);
    gradient.addColorStop(0, random() < 0.7 ? 'rgba(12,13,12,0.13)' : 'rgba(112,91,65,0.1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.scale(point.vertical ? width / length : 1, point.vertical ? 1 : width / length);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, length, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Wartime utility cuts and resurfaced patches interrupt the otherwise regular
  // street pattern.
  for (let i = 0; i < 88; i++) {
    const point = randomRoadPoint(0.35);
    const w = 7 + random() * 22;
    const h = 7 + random() * 30;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate((random() - 0.5) * 0.15);
    ctx.fillStyle = random() < 0.5 ? 'rgba(28,29,28,0.46)' : 'rgba(91,88,79,0.38)';
    ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
    ctx.strokeStyle = 'rgba(18,18,17,0.32)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-w * 0.5, -h * 0.5, w, h);
    ctx.restore();
    bump.fillStyle = 'rgba(77,77,77,0.18)';
    bump.fillRect(point.x - w * 0.5, point.y - h * 0.5, w, h);
    roughness.fillStyle = 'rgba(135,135,135,0.3)';
    roughness.fillRect(point.x - w * 0.5, point.y - h * 0.5, w, h);
  }

  // Branching cracks are concentrated on carriageways.
  for (let i = 0; i < 460; i++) {
    const point = randomRoadPoint(0.08);
    const length = 7 + random() * 31;
    ctx.strokeStyle = 'rgba(11,12,11,0.34)';
    ctx.lineWidth = 0.55 + random() * 0.8;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    const dx = (random() - 0.5) * length;
    const dy = (random() - 0.5) * length;
    ctx.lineTo(point.x + dx * 0.42, point.y + dy * 0.31);
    ctx.lineTo(point.x + dx, point.y + dy);
    ctx.stroke();
    bump.strokeStyle = 'rgba(15,15,15,0.72)';
    bump.lineWidth = ctx.lineWidth + 0.55;
    bump.beginPath();
    bump.moveTo(point.x, point.y);
    bump.lineTo(point.x + dx * 0.42, point.y + dy * 0.31);
    bump.lineTo(point.x + dx, point.y + dy);
    bump.stroke();
    if (random() < 0.38) {
      drawLine(ctx, point.x + dx * 0.42, point.y + dy * 0.31, point.x + dx * 0.7 + dy * 0.2, point.y + dy * 0.52 - dx * 0.2, 'rgba(11,12,11,0.28)', 0.55);
    }
  }

  // Potholes and shallow shell scars have a broken rim rather than a flat dot.
  for (let i = 0; i < 112; i++) {
    const point = randomRoadPoint(0.12);
    const radius = 2.7 + random() * 7.8;
    ctx.fillStyle = 'rgba(17,17,15,0.5)';
    ctx.beginPath();
    ctx.ellipse(point.x, point.y, radius * (1.15 + random() * 0.75), radius, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(137,127,108,0.36)';
    ctx.lineWidth = 1 + random() * 1.4;
    ctx.stroke();
    bump.fillStyle = 'rgba(8,8,8,0.74)';
    bump.beginPath();
    bump.ellipse(point.x, point.y, radius * 1.35, radius, 0, 0, Math.PI * 2);
    bump.fill();
    bump.strokeStyle = 'rgba(220,220,220,0.42)';
    bump.lineWidth = 1.6;
    bump.stroke();
  }

  // Cast-iron drainage grates sit at the kerb and help communicate scale.
  for (const p of roadCenters) {
    const center = toPx(p);
    for (const side of [-1, 1]) {
      const offset = side * (roadWidth * 0.5 - 0.22) * pxScale;
      for (let along = spacing * pxScale * 0.45; along < size; along += spacing * pxScale) {
        const w = Math.max(2.4, pxScale * 0.28);
        const h = Math.max(4.5, pxScale * 0.54);
        ctx.fillStyle = 'rgba(20,23,22,0.82)';
        ctx.fillRect(center + offset - w * 0.5, along - h * 0.5, w, h);
        ctx.fillRect(along - h * 0.5, center + offset - w * 0.5, h, w);
        roughness.fillStyle = 'rgba(92,92,92,0.8)';
        roughness.fillRect(center + offset - w * 0.5, along - h * 0.5, w, h);
        roughness.fillRect(along - h * 0.5, center + offset - w * 0.5, h, w);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  const roughnessTexture = new THREE.CanvasTexture(roughnessCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  for (const surfaceTexture of [texture, bumpTexture, roughnessTexture]) {
    surfaceTexture.minFilter = THREE.LinearMipmapLinearFilter;
    surfaceTexture.magFilter = THREE.LinearFilter;
    surfaceTexture.anisotropy = 12;
  }
  return { texture, bumpTexture, roughnessTexture, worldSpan };
}

function addRoadNetwork(mapDef, scene, random) {
  const group = new THREE.Group();
  group.name = 'urbanRoadNetwork';
  const spacing = urbanSpacing(mapDef);
  const roadWidth = mapDef.streetWidth ?? 6.4;
  const sidewalkWidth = 1.15;
  const extent = getUrbanRoadExtent(mapDef);
  const { texture, bumpTexture, roughnessTexture, worldSpan } = createUrbanSurfaceTexture(
    mapDef,
    extent,
    spacing,
    roadWidth,
    sidewalkWidth,
    random
  );
  const surfaceMat = material(0xffffff, {
    map: texture,
    bumpMap: bumpTexture,
    bumpScale: 0.055,
    roughness: 0.95,
    envMapIntensity: 0.16,
  });
  surfaceMat.roughnessMap = roughnessTexture;
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(worldSpan, worldSpan), surfaceMat);
  surface.rotation.x = -Math.PI * 0.5;
  surface.position.y = 0.035;
  surface.name = 'urbanSurface';
  surface.receiveShadow = true;
  surface.castShadow = false;
  group.add(surface);

  const length = extent * 2 + roadWidth;
  const railMat = material(0x5a6060, { roughness: 0.55, metalness: 0.62, envMapIntensity: 0.7 });
  const sleeperMat = material(0x49362b, { roughness: 0.96 });
  for (const z of [-0.92, 0.92]) {
    box(group, length, 0.055, 0.075, railMat, 0, 0.091, z, 'tramRail', { receiveShadow: false });
  }
  const sleepers = [];
  for (let x = -extent; x <= extent; x += 1.35) {
    sleepers.push({ position: new THREE.Vector3(x, 0.071, 0) });
  }
  createInstances(group, new THREE.BoxGeometry(0.14, 0.045, 2.35), sleeperMat, sleepers, 'tramSleepers', { castShadow: false, receiveShadow: false });

  const poleMat = material(0x2d3232, { roughness: 0.72, metalness: 0.44 });
  const globeMat = material(0x9c9274, { roughness: 0.58, metalness: 0.08, envMapIntensity: 0.5 });
  const poles = [];
  const globes = [];
  const lampCount = Math.max(8, Math.floor(length / 11));
  for (let i = 0; i < lampCount; i++) {
    const x = -extent + (i + 0.5) * (length / lampCount) + (random() - 0.5) * 0.4;
    const z = (i % 2 ? 1 : -1) * (roadWidth * 0.5 + sidewalkWidth * 0.58);
    poles.push({ position: new THREE.Vector3(x, 1.45, z), scale: new THREE.Vector3(1, 2.9, 1) });
    globes.push({ position: new THREE.Vector3(x, 2.94, z), scale: new THREE.Vector3(1.15, 0.72, 1.15) });
  }
  createInstances(group, new THREE.CylinderGeometry(0.055, 0.075, 1, 7), poleMat, poles, 'streetLampPoles');
  createInstances(group, new THREE.SphereGeometry(0.15, 8, 6), globeMat, globes, 'streetLampGlobes', {
    castShadow: false,
  });
  scene.add(group);
  return { extent, spacing, roadWidth, sidewalkWidth };
}

function addUrbanCanal(mapDef, scene, layout, random) {
  const { extent, spacing, roadWidth } = layout;
  const canalX = spacing * (mapDef.canalOffsetCells ?? 1.5);
  const canalWidth = mapDef.canalWidth ?? 5.4;
  const length = extent * 2 + roadWidth;
  const group = new THREE.Group();
  group.name = 'urbanCanalDistrict';

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2d4a4d,
    roughness: 0.34,
    metalness: 0.08,
    transparent: true,
    opacity: 0.88,
    envMapIntensity: 0.72,
    depthWrite: true,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(canalWidth, length), waterMat);
  water.rotation.x = -Math.PI * 0.5;
  water.position.set(canalX, 0.066, 0);
  water.name = 'urbanCanalWater';
  water.receiveShadow = true;
  group.add(water);

  const quayMat = material(0x615e56, {
    map: getDetailTextures().pavement,
    roughness: 0.98,
  });
  for (const side of [-1, 1]) {
    box(
      group,
      0.62,
      0.52,
      length,
      quayMat,
      canalX + side * (canalWidth * 0.5 + 0.28),
      0.27,
      0,
      'canalEmbankment'
    );
  }

  const bridgeMat = material(0x74716a, {
    map: getDetailTextures().pavement,
    roughness: 0.95,
  });
  const railMat = material(0x353a3a, { roughness: 0.72, metalness: 0.38 });
  for (let z = -extent; z <= extent + 0.01; z += spacing) {
    box(
      group,
      canalWidth + 1.7,
      0.18,
      roadWidth + 0.35,
      bridgeMat,
      canalX,
      0.17,
      z,
      'canalBridge'
    );
    for (const edge of [-1, 1]) {
      box(
        group,
        canalWidth + 1.9,
        0.18,
        0.09,
        railMat,
        canalX,
        0.64,
        z + edge * (roadWidth * 0.5 - 0.18),
        'bridgeRail',
        { castShadow: false }
      );
    }
  }

  const bargeMat = material(0x3a332b, { roughness: 0.94, metalness: 0.1 });
  const bargeZ = spacing * (random() < 0.5 ? 0.55 : -0.55);
  const barge = new THREE.Group();
  barge.position.set(canalX, 0.17, bargeZ);
  barge.rotation.y = (random() - 0.5) * 0.18;
  box(barge, canalWidth * 0.55, 0.38, 4.5, bargeMat, 0, 0, 0, 'sunkenBarge');
  box(barge, canalWidth * 0.42, 0.44, 1.25, bargeMat, 0.18, 0.28, -0.75, 'bargeCabin');
  barge.rotation.z = 0.08;
  group.add(barge);

  scene.add(group);
  return { x: canalX, width: canalWidth };
}

function createParkTree(random) {
  const group = new THREE.Group();
  group.name = 'bombedParkTree';
  const bark = material(0x453a2e, { roughness: 1 });
  box(group, 0.48, 3.9, 0.48, bark, 0, 1.95, 0, 'treeTrunk');
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 5; i++) {
    const start = new THREE.Vector3(0, 2.4 + random() * 1.1, 0);
    const end = new THREE.Vector3(
      (random() - 0.5) * 2.4,
      start.y + 0.7 + random() * 1.25,
      (random() - 0.5) * 2.4
    );
    const direction = end.clone().sub(start);
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.16, direction.length(), 6),
      bark
    );
    branch.position.copy(start).add(end).multiplyScalar(0.5);
    branch.quaternion.setFromUnitVectors(up, direction.normalize());
    branch.name = 'treeBranch';
    branch.castShadow = true;
    group.add(branch);
  }
  return group;
}

function addUrbanPark(cell, mapDef, scene, scenery, layout, sampleHeight, random) {
  const { spacing, roadWidth, sidewalkWidth } = layout;
  const blockSize = spacing - roadWidth - sidewalkWidth * 2 - 0.45;
  const group = new THREE.Group();
  group.name = 'urbanParkSection';
  group.position.set(cell.x, sampleHeight(cell.x, cell.z), cell.z);
  const lawnMat = material(0x505748, { roughness: 0.99 });
  const pathMat = material(0x777168, {
    map: getDetailTextures().pavement,
    roughness: 0.98,
  });
  const craterMat = material(0x292722, { roughness: 1 });
  box(group, blockSize, 0.08, blockSize, lawnMat, 0, 0.055, 0, 'parkGround', {
    castShadow: false,
  });
  box(group, blockSize, 0.07, 1.35, pathMat, 0, 0.105, 0, 'parkPath', {
    castShadow: false,
  });
  box(group, 1.35, 0.07, blockSize, pathMat, 0, 0.108, 0, 'parkPath', {
    castShadow: false,
  });
  for (let i = 0; i < 4; i++) {
    const crater = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6 + random() * 0.6, 0.78 + random() * 0.8, 0.1, 14),
      craterMat
    );
    crater.position.set(
      (random() - 0.5) * blockSize * 0.72,
      0.12,
      (random() - 0.5) * blockSize * 0.72
    );
    crater.scale.z = 0.68 + random() * 0.28;
    crater.receiveShadow = true;
    group.add(crater);
  }
  const benchMat = material(0x493528, { roughness: 0.98 });
  const benches = [];
  for (const side of [-1, 1]) {
    benches.push({
      position: new THREE.Vector3(side * blockSize * 0.23, 0.28, 1.15),
      rotation: { y: side > 0 ? Math.PI : 0 },
      scale: new THREE.Vector3(1.7, 0.22, 0.45),
    });
  }
  createInstances(group, new THREE.BoxGeometry(1, 1, 1), benchMat, benches, 'damagedParkBenches');
  scene.add(group);

  const treePositions = [
    [-0.31, -0.31],
    [0.31, -0.31],
    [-0.31, 0.31],
    [0.31, 0.31],
    [-0.4, 0.05],
    [0.4, -0.02],
  ];
  for (let i = 0; i < treePositions.length; i++) {
    if (random() < 0.2) continue;
    const [px, pz] = treePositions[i];
    const x = cell.x + px * blockSize + (random() - 0.5) * 0.65;
    const z = cell.z + pz * blockSize + (random() - 0.5) * 0.65;
    const tree = createParkTree(random);
    tree.position.set(x, sampleHeight(x, z), z);
    tree.rotation.y = random() * Math.PI * 2;
    if (scenery) {
      scenery.register(tree, {
        x,
        z,
        kind: 'tree',
        radius: 1.35,
        coverRadius: 2.25,
        source: 'map',
      });
    } else {
      scene.add(tree);
    }
  }
}

function addChurchSquare(scene, cell, layout, sampleHeight) {
  const blockSize = layout.spacing - layout.roadWidth - layout.sidewalkWidth * 2 - 0.25;
  const square = new THREE.Group();
  square.name = 'churchSquare';
  square.position.set(cell.x, sampleHeight(cell.x, cell.z), cell.z);
  const stone = material(0x74716a, {
    map: getDetailTextures().pavement,
    roughness: 0.97,
  });
  box(square, blockSize, 0.09, blockSize, stone, 0, 0.055, 0, 'churchPlaza', {
    castShadow: false,
  });
  scene.add(square);
}

function isReserved(x, z, mapDef, radius) {
  const points = [mapDef.playerBase, mapDef.enemyBase, mapDef.frontline, ...(mapDef.capturePoints ?? [])].filter(Boolean);
  return points.some((point) => Math.hypot(x - point.x, z - point.z) < radius);
}

function addStreetRubble(scene, extent, spacing, roadWidth, sidewalkWidth, random) {
  const group = new THREE.Group();
  group.name = 'urbanBattleDebris';
  // Keep debris light — rubble is cosmetic only.
  const count = Math.max(48, Math.round(extent * 1.45));
  const masonry = material(0x827a6f, { roughness: 0.97 });
  const brick = material(0x765143, { roughness: 0.98 });
  const timber = material(0x3f2d23, { roughness: 0.98 });
  const chunks = [];
  const bricks = [];
  const beams = [];
  const curb = roadWidth * 0.5 + sidewalkWidth * 0.72;
  for (let i = 0; i < count; i++) {
    const vertical = random() < 0.5;
    const free = (random() - 0.5) * extent * 2;
    const snapped = Math.round(((random() - 0.5) * extent * 2) / spacing) * spacing;
    const side = random() > 0.5 ? 1 : -1;
    const x = vertical ? snapped + side * curb : free;
    const z = vertical ? free : snapped + side * curb;
    const transform = {
      position: new THREE.Vector3(x, 0.17 + random() * 0.08, z),
      rotation: { x: random(), y: random() * Math.PI, z: random() },
      scale: new THREE.Vector3(0.7 + random() * 1.5, 0.42 + random() * 0.42, 0.65 + random()),
    };
    (i % 4 === 0 ? bricks : chunks).push(transform);
    if (i % 7 === 0) {
      beams.push({
        position: new THREE.Vector3(x + (random() - 0.5), 0.2, z + (random() - 0.5)),
        rotation: { y: random() * Math.PI, z: (random() - 0.5) * 0.2 },
        scale: new THREE.Vector3(1.6 + random() * 1.7, 0.18, 0.18),
      });
    }
  }
  createInstances(group, new THREE.DodecahedronGeometry(0.25, 0), masonry, chunks, 'masonryRubble');
  createInstances(group, new THREE.BoxGeometry(0.36, 0.2, 0.24), brick, bricks, 'brickRubble');
  createInstances(group, new THREE.BoxGeometry(1, 1, 1), timber, beams, 'fallenTimbers');
  scene.add(group);
}

function registerBuilding(scenery, scene, group, x, z, kind, width, depth) {
  const radius = Math.max(width, depth) * 0.53;
  // Guarantee a footprint even if a builder forgot damageBounds (LOS / collision).
  if (!group.userData.damageBounds) {
    group.userData.damageBounds = { width, depth, height: 4 };
  } else {
    group.userData.damageBounds.width = group.userData.damageBounds.width ?? width;
    group.userData.damageBounds.depth = group.userData.damageBounds.depth ?? depth;
  }
  if (scenery) {
    const entry = scenery.register(group, {
      x,
      z,
      kind,
      radius,
      coverRadius: radius + 1.15,
      source: 'map',
    });
    entry.footprintWidth = group.userData.damageBounds.width;
    entry.footprintDepth = group.userData.damageBounds.depth;
    const initialHpRatio = group.userData.initialHpRatio ?? 1;
    if (initialHpRatio < 1) {
      entry.hp = Math.max(1, entry.maxHp * initialHpRatio);
      scenery._updateDamageVisual(entry);
    }
  } else {
    scene.add(group);
  }
}

function createUrbanWall(length, random) {
  const group = new THREE.Group();
  group.name = 'urbanWall';
  group.userData.uniqueSceneryMaterials = true;
  const textures = getDetailTextures();
  const brick = material(0xffffff, {
    map: textures.brick,
    bumpMap: textures.brick,
    bumpScale: 0.025,
    roughness: 0.97,
  });
  const cap = material(0x81796c, { map: textures.pavement, roughness: 0.96 });
  const segments = [];
  const count = Math.max(4, Math.round(length / 1.15));
  const segmentLength = length / count;
  for (let i = 0; i < count; i++) {
    const segment = new THREE.Group();
    segment.position.x = -length * 0.5 + (i + 0.5) * segmentLength;
    box(segment, segmentLength - 0.035, 1.42, 0.34, brick, 0, 0.71, 0, 'urbanWallSegment');
    box(segment, segmentLength + 0.025, 0.13, 0.45, cap, 0, 1.46, 0, 'urbanWallCap', { castShadow: false });
    group.add(segment);
    segments.push(segment);
  }
  const breakOrder = segments
    .map((segment, index) => ({ segment, score: Math.abs(index - random() * count) + random() * 0.25 }))
    .sort((a, b) => a.score - b.score);
  group.userData.damageBounds = { width: length, depth: 0.34, height: 1.52 };
  group.userData.applyDamageStage = (stage) => {
    const countToHide = Math.min(breakOrder.length, Math.max(0, stage - 1) * 2);
    for (let i = 0; i < breakOrder.length; i++) {
      breakOrder[i].segment.visible = i >= countToHide;
    }
  };
  group.userData.initialHpRatio = random() < 0.55 ? 0.56 + random() * 0.3 : 1;
  return group;
}

function placeTenementFrontage(
  cell,
  layout,
  mapDef,
  scene,
  scenery,
  sampleHeight,
  random,
  { alongX, streetSide, frontageCount, depth }
) {
  const { spacing, roadWidth, sidewalkWidth } = layout;
  const blockSize = spacing - roadWidth - sidewalkWidth * 2 - 0.5;
  // Tight seams between neighbouring houses — AT shell footprint margin seals the rest.
  const frontageGap = 0.04;
  // Minimal corner inset so cross-street frontages almost meet; LOS still treats
  // the remaining seam as solid for anti-tank / tank shells.
  const cornerInset = Math.min(0.55, depth * 0.12);
  const usableSpan = Math.max(depth * 1.35, blockSize - cornerInset * 2);
  const frontage = (usableSpan - frontageGap * (frontageCount - 1)) / frontageCount;
  const offsetToStreet = (blockSize - depth) * 0.5;

  for (let i = 0; i < frontageCount; i++) {
    // No bomb-gap vacancies on street walls — empty plots opened fire lanes
    // that read as “shooting through buildings” for AT guns.
    const sequence = (i - (frontageCount - 1) * 0.5) * (frontage + frontageGap);
    let x;
    let z;
    let yaw;
    if (alongX) {
      x = cell.x + sequence;
      z = cell.z + streetSide * offsetToStreet;
      yaw = streetSide > 0 ? 0 : Math.PI;
    } else {
      x = cell.x + streetSide * offsetToStreet;
      z = cell.z + sequence;
      yaw = streetSide > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    }
    if (isReserved(x, z, mapDef, Math.max(5.2, frontage * 0.6))) continue;
    const kind = random() < 0.42 ? 'apartmentBlock' : 'urbanHouse';
    const floors = kind === 'apartmentBlock' ? 4 + Math.floor(random() * 2) : 3 + Math.floor(random() * 2);
    const group = createPeriodBuilding(kind, frontage, depth, floors, random);
    group.position.set(x, sampleHeight(x, z), z);
    group.rotation.y = yaw;
    registerBuilding(scenery, scene, group, x, z, kind, frontage, depth);
  }
}

/**
 * Place a courtyard / seam wall that still blocks direct fire.
 */
function placeBlockingWall(
  scenery,
  scene,
  sampleHeight,
  random,
  x,
  z,
  length,
  yaw
) {
  const wall = createUrbanWall(length, random);
  wall.position.set(x, sampleHeight(x, z), z);
  wall.rotation.y = yaw;
  registerBuilding(scenery, scene, wall, x, z, 'urbanWall', length, 0.45);
}

/**
 * Berlin-style courtyard block: sealed O-ring of tenements so AT guns cannot
 * fire straight through an empty Hof or open rear lot.
 */
function addTenementRow(cell, layout, mapDef, scene, scenery, sampleHeight, random) {
  const { spacing, roadWidth, sidewalkWidth } = layout;
  const blockSize = spacing - roadWidth - sidewalkWidth * 2 - 0.5;
  // Deeper frontages shrink the Hof while still leaving a walkable courtyard.
  const depth = blockSize * (0.34 + random() * 0.05);
  const primaryAlongX = random() < 0.5;
  const frontageCount = random() < 0.35 ? 3 : 2;
  const sideDepth = depth * (0.92 + random() * 0.06);

  // Seal all four street edges — U-shaped and open-backed blocks let shells
  // cross the plot while the camera still shows a solid urban mass.
  for (const streetSide of [1, -1]) {
    placeTenementFrontage(cell, layout, mapDef, scene, scenery, sampleHeight, random, {
      alongX: primaryAlongX,
      streetSide,
      frontageCount,
      depth,
    });
  }
  for (const streetSide of [1, -1]) {
    placeTenementFrontage(cell, layout, mapDef, scene, scenery, sampleHeight, random, {
      alongX: !primaryAlongX,
      streetSide,
      frontageCount: random() < 0.4 ? 2 : 1,
      depth: sideDepth,
    });
  }

  // One courtyard divider wall is enough for LOS; extra plugs were costly.
  if (!isReserved(cell.x, cell.z, mapDef, 4.2) && random() < 0.7) {
    placeBlockingWall(
      scenery,
      scene,
      sampleHeight,
      random,
      cell.x,
      cell.z,
      blockSize * (0.38 + random() * 0.1),
      random() < 0.5 ? 0 : Math.PI * 0.5
    );
  }
}

export function addUrbanDistrict(mapDef, scene, scenery, options = {}) {
  const random = options.random ?? Math.random;
  const sampleHeight = options.sampleHeight ?? (() => 0);
  const layout = addRoadNetwork(mapDef, scene, random);
  const { extent, spacing, roadWidth, sidewalkWidth } = layout;
  const cells = [];
  for (let x = -extent + spacing * 0.5; x < extent; x += spacing) {
    for (let z = -extent + spacing * 0.5; z < extent; z += spacing) {
      cells.push({ x, z });
    }
  }

  const canal = addUrbanCanal(mapDef, scene, layout, random);
  const cellDistance = (cell, target) => Math.hypot(cell.x - target.x, cell.z - target.z);
  const churchTarget = { x: -spacing * 0.5, z: -spacing * 0.5 };
  const churchCell = cells.reduce((best, cell) =>
    cellDistance(cell, churchTarget) < cellDistance(best, churchTarget) ? cell : best
  );
  const parkCells = [];
  for (const target of [
    { x: -extent * 0.52, z: extent * 0.52 },
    { x: -extent * 0.2, z: extent * 0.52 },
  ]) {
    const eligible = cells.filter(
      (cell) =>
        cell !== churchCell &&
        !parkCells.includes(cell) &&
        Math.abs(cell.x - canal.x) > spacing * 0.42 &&
        !isReserved(cell.x, cell.z, mapDef, 10.5)
    );
    if (eligible.length) {
      parkCells.push(
        eligible.reduce((best, cell) =>
          cellDistance(cell, target) < cellDistance(best, target) ? cell : best
        )
      );
    }
  }

  let factoryPlaced = false;
  const landmarkRadius = Math.max(15.5, spacing * 0.64);
  for (const cell of cells) {
    if (cell === churchCell) {
      addChurchSquare(scene, cell, layout, sampleHeight);
      const group = createChurch(random);
      group.position.set(cell.x, sampleHeight(cell.x, cell.z), cell.z);
      group.rotation.y = Math.PI * 0.5;
      registerBuilding(scenery, scene, group, cell.x, cell.z, 'church', 13.6, 8.4);
      continue;
    }

    if (parkCells.includes(cell)) {
      addUrbanPark(cell, mapDef, scene, scenery, layout, sampleHeight, random);
      continue;
    }

    if (Math.abs(cell.x - canal.x) < spacing * 0.42) {
      continue;
    }

    if (isReserved(cell.x, cell.z, mapDef, landmarkRadius)) continue;

    const factoryCandidate = !factoryPlaced && Math.abs(cell.z) > extent * 0.58;
    if (factoryCandidate) {
      const blockSize = spacing - roadWidth - sidewalkWidth * 2 - 0.8;
      const group = createPeriodBuilding('factory', blockSize, blockSize * 0.82, 3, random);
      group.position.set(cell.x, sampleHeight(cell.x, cell.z), cell.z);
      group.rotation.y = random() < 0.5 ? 0 : Math.PI * 0.5;
      registerBuilding(scenery, scene, group, cell.x, cell.z, 'factory', blockSize, blockSize * 0.82);
      factoryPlaced = true;
      continue;
    }

    addTenementRow(cell, layout, mapDef, scene, scenery, sampleHeight, random);
  }

  addStreetRubble(scene, extent, spacing, roadWidth, sidewalkWidth, random);
}
