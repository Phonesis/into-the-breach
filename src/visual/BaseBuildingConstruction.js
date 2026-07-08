import * as THREE from 'three';

const GHOST_DIMS = {
  infantryGarrison: [6.2, 2.8, 5.2],
  hospital: [6.5, 3.2, 5],
  ordnanceYard: [7.5, 2.6, 6.2],
  motorPool: [8.5, 3, 6.8],
  bunker: [5, 2, 4.2],
};

const TEAM_COLORS = {
  player: { main: 0x5a9fd4, accent: 0xc9e8ff, ghost: 0x7ab8e8 },
  enemy: { main: 0xd45a5a, accent: 0xffb0a0, ghost: 0xe87878 },
};

function makeLabelTexture(name, pct, team) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const isPlayer = team === 'player';
  ctx.fillStyle = isPlayer ? 'rgba(12, 28, 48, 0.88)' : 'rgba(48, 14, 14, 0.88)';
  ctx.strokeStyle = isPlayer ? 'rgba(90, 159, 212, 0.95)' : 'rgba(212, 90, 90, 0.95)';
  ctx.lineWidth = 3;
  roundRect(ctx, 8, 8, 240, 80, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isPlayer ? '#c9e8ff' : '#ffd0d0';
  ctx.font = 'bold 22px "Source Sans 3", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(name.length > 18 ? `${name.slice(0, 17)}…` : name, 128, 36);

  ctx.fillStyle = '#c9a227';
  ctx.font = 'bold 26px "Source Sans 3", system-ui, sans-serif';
  ctx.fillText(`${pct}%`, 128, 68);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function setProgressArc(mesh, radius, progress, lastBucket = -1) {
  const bucket = Math.min(200, Math.floor(Math.max(0, Math.min(1, progress)) * 200));
  if (bucket === lastBucket) return lastBucket;
  const inner = radius * 0.72;
  const outer = radius * 0.92;
  const theta = Math.max(0.05, bucket / 200) * Math.PI * 2;
  if (mesh.geometry) mesh.geometry.dispose();
  mesh.geometry = new THREE.RingGeometry(inner, outer, 32, 1, 0, theta);
  return bucket;
}

export function createBaseBuildingConstructionVisual({ def, team }) {
  const colors = TEAM_COLORS[team] ?? TEAM_COLORS.player;
  const radius = def.radius ?? 4;
  const group = new THREE.Group();
  group.name = 'baseBuildingConstruction';

  const footprintMat = new THREE.MeshBasicMaterial({
    color: colors.main,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const footprint = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.05, 36), footprintMat);
  footprint.rotation.x = -Math.PI / 2;
  footprint.position.y = 0.06;
  footprint.renderOrder = 6;
  group.add(footprint);

  const outerMat = new THREE.MeshBasicMaterial({
    color: colors.accent,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.95, radius * 1.12, 40),
    outerMat
  );
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.1;
  outerRing.renderOrder = 7;
  group.add(outerRing);

  const progressMat = new THREE.MeshBasicMaterial({
    color: 0xc9a227,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const progressArc = new THREE.Mesh(new THREE.RingGeometry(1, 1, 8), progressMat);
  progressArc.rotation.x = -Math.PI / 2;
  progressArc.position.y = 0.14;
  progressArc.renderOrder = 8;
  setProgressArc(progressArc, radius, 0.02);
  group.add(progressArc);

  const scaffoldMat = new THREE.MeshStandardMaterial({
    color: 0x6a5038,
    roughness: 0.92,
    metalness: 0.05,
  });
  const scaffold = new THREE.Group();
  scaffold.name = 'scaffold';
  const poleH = 2.8;
  const spread = radius * 0.75;
  for (const [px, pz] of [
    [-spread, -spread],
    [spread, -spread],
    [-spread, spread],
    [spread, spread],
  ]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, poleH, 6), scaffoldMat);
    pole.position.set(px, poleH * 0.5, pz);
    pole.castShadow = false;
    scaffold.add(pole);
  }
  for (const z of [-spread, spread]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(spread * 2.1, 0.1, 0.1), scaffoldMat);
    beam.position.set(0, poleH * 0.55, z);
    scaffold.add(beam);
  }
  group.add(scaffold);

  const dims = GHOST_DIMS[def.id] ?? [6, 2.5, 5];
  const ghostMat = new THREE.MeshStandardMaterial({
    color: colors.ghost,
    transparent: true,
    opacity: 0.38,
    roughness: 0.85,
    metalness: 0.08,
    depthWrite: false,
  });
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(dims[0], dims[1], dims[2]), ghostMat);
  ghost.name = 'ghost';
  ghost.position.y = 0.15;
  ghost.scale.y = 0.12;
  ghost.castShadow = false;
  group.add(ghost);

  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffcc44,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), beaconMat);
  beacon.name = 'beacon';
  beacon.position.y = poleH + 0.35;
  beacon.renderOrder = 9;
  group.add(beacon);

  const labelTex = makeLabelTexture(def.name, 0, team);
  const labelMat = new THREE.SpriteMaterial({
    map: labelTex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const label = new THREE.Sprite(labelMat);
  label.name = 'label';
  label.position.y = poleH + 2.2;
  label.scale.set(5.5, 2.1, 1);
  label.renderOrder = 12;
  group.add(label);

  group.userData.construction = {
    def,
    team,
    radius,
    progressArc,
    outerRing,
    footprint,
    ghost,
    scaffold,
    beacon,
    label,
    labelMat,
    labelTex,
    lastLabelPct: -1,
    lastArcBucket: -1,
    phase: Math.random() * Math.PI * 2,
  };

  return group;
}

export function updateBaseBuildingConstructionVisual(group, progress, dt = 0) {
  const data = group?.userData?.construction;
  if (!data) return;

  const p = Math.max(0, Math.min(1, progress));
  data.phase += dt * 3.2;

  data.lastArcBucket = setProgressArc(data.progressArc, data.radius, p, data.lastArcBucket);

  const pulse = 0.55 + Math.sin(data.phase) * 0.22;
  data.outerRing.material.opacity = 0.5 + pulse * 0.35;
  data.footprint.material.opacity = 0.16 + p * 0.14;

  const rise = 0.12 + p * 0.88;
  data.ghost.scale.y = rise;
  data.ghost.position.y = (data.ghost.geometry.parameters.height * rise) * 0.5 + 0.08;
  data.ghost.material.opacity = 0.28 + p * 0.22;

  data.scaffold.scale.y = 0.35 + p * 0.65;
  data.scaffold.position.y = 0;

  data.beacon.position.y = (2.8 * data.scaffold.scale.y) + 0.35 + Math.sin(data.phase * 2) * 0.08;
  data.beacon.material.opacity = 0.65 + Math.sin(data.phase * 4) * 0.3;
  data.label.position.y = data.beacon.position.y + 1.85;

  const pct = Math.round(p * 100);
  if (pct !== data.lastLabelPct) {
    data.lastLabelPct = pct;
    if (data.labelTex) data.labelTex.dispose();
    data.labelTex = makeLabelTexture(data.def.name, pct, data.team);
    data.labelMat.map = data.labelTex;
    data.labelMat.needsUpdate = true;
  }
}

export function disposeBaseBuildingConstructionVisual(group) {
  if (!group) return;
  if (group.parent) group.parent.remove(group);
  group.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
      else c.material.dispose();
    }
  });
}