import * as THREE from 'three';

/**
 * Clear on-map construction markers for engineer field works and infantry trenches.
 * Shows footprint, progress arc, rising ghost, and a name/% label.
 */

const TEAM = {
  player: { main: 0x5a9fd4, accent: 0xc9e8ff, ghost: 0x7ab8e8, bar: 0xc9a227 },
  enemy: { main: 0xd45a5a, accent: 0xffb0a0, ghost: 0xe87878, bar: 0xe0a030 },
};

const KIND = {
  sandbags: {
    label: 'Sandbags',
    radius: 2.8,
    ghost: { w: 3.4, h: 0.9, d: 2.6 },
    color: 0xc9a84a,
  },
  bunker: {
    label: 'Bunker',
    radius: 3.4,
    ghost: { w: 4.2, h: 1.8, d: 3.6 },
    color: 0x7a6a4a,
  },
  trench: {
    label: 'Trench',
    radius: 2.6,
    ghost: { w: 4.0, h: 0.55, d: 2.2 },
    color: 0x8b6914,
  },
};

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

function makeLabelTexture(title, pct, team, verb = 'Building') {
  const canvas = document.createElement('canvas');
  canvas.width = 288;
  canvas.height = 112;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const isPlayer = team === 'player';
  ctx.fillStyle = isPlayer ? 'rgba(10, 24, 40, 0.92)' : 'rgba(42, 12, 12, 0.92)';
  ctx.strokeStyle = isPlayer ? 'rgba(90, 159, 212, 0.98)' : 'rgba(220, 100, 90, 0.98)';
  ctx.lineWidth = 4;
  roundRect(ctx, 6, 6, 276, 100, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isPlayer ? '#9ec8ea' : '#f0b0a8';
  ctx.font = 'bold 18px "Source Sans 3", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(verb, 144, 32);

  ctx.fillStyle = isPlayer ? '#e8f4ff' : '#fff0f0';
  ctx.font = 'bold 26px "Source Sans 3", system-ui, sans-serif';
  const name = title.length > 16 ? `${title.slice(0, 15)}…` : title;
  ctx.fillText(name, 144, 60);

  ctx.fillStyle = '#f0c84a';
  ctx.font = 'bold 28px "Source Sans 3", system-ui, sans-serif';
  ctx.fillText(`${pct}%`, 144, 92);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function setProgressArc(mesh, radius, progress, lastBucket = -1) {
  const bucket = Math.min(200, Math.floor(Math.max(0, Math.min(1, progress)) * 200));
  if (bucket === lastBucket) return lastBucket;
  const inner = radius * 0.7;
  const outer = radius * 0.95;
  const theta = Math.max(0.06, bucket / 200) * Math.PI * 2;
  if (mesh.geometry) mesh.geometry.dispose();
  mesh.geometry = new THREE.RingGeometry(inner, outer, 36, 1, Math.PI / 2, -theta);
  return bucket;
}

/**
 * @param {object} opts
 * @param {'sandbags'|'bunker'|'trench'} opts.kind
 * @param {'player'|'enemy'} [opts.team]
 * @param {string} [opts.label] — override display name
 * @param {string} [opts.verb] — "Building" / "Digging"
 */
export function createFieldConstructionVisual({
  kind = 'sandbags',
  team = 'player',
  label = null,
  verb = null,
} = {}) {
  const preset = KIND[kind] ?? KIND.sandbags;
  const colors = TEAM[team] ?? TEAM.player;
  const radius = preset.radius;
  const title = label ?? preset.label;
  const actionVerb = verb ?? (kind === 'trench' ? 'Digging' : 'Building');

  const group = new THREE.Group();
  group.name = 'fieldConstruction';

  // Soft ground fill
  const footprint = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 1.05, 40),
    new THREE.MeshBasicMaterial({
      color: colors.main,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    })
  );
  footprint.rotation.x = -Math.PI / 2;
  footprint.position.y = 0.05;
  footprint.renderOrder = 6;
  group.add(footprint);

  // Outer guide ring
  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.96, radius * 1.18, 48),
    new THREE.MeshBasicMaterial({
      color: colors.accent,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    })
  );
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.09;
  outerRing.renderOrder = 7;
  group.add(outerRing);

  // Progress arc (fills clockwise as work completes)
  const progressArc = new THREE.Mesh(
    new THREE.RingGeometry(1, 1, 8),
    new THREE.MeshBasicMaterial({
      color: colors.bar,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
    })
  );
  progressArc.rotation.x = -Math.PI / 2;
  progressArc.position.y = 0.13;
  progressArc.renderOrder = 8;
  setProgressArc(progressArc, radius, 0.03);
  group.add(progressArc);

  // Ghost of the finished work (rises with progress)
  const g = preset.ghost;
  const ghost = new THREE.Mesh(
    new THREE.BoxGeometry(g.w, g.h, g.d),
    new THREE.MeshStandardMaterial({
      color: preset.color,
      transparent: true,
      opacity: 0.4,
      roughness: 0.9,
      metalness: 0.05,
      depthWrite: false,
    })
  );
  ghost.name = 'ghost';
  ghost.position.y = 0.1;
  ghost.scale.y = 0.15;
  group.add(ghost);

  // Corner stakes so the site reads clearly from a distance
  const stakeMat = new THREE.MeshStandardMaterial({
    color: 0x8a6a38,
    roughness: 0.9,
    metalness: 0.05,
  });
  const stakes = new THREE.Group();
  stakes.name = 'stakes';
  const s = radius * 0.78;
  for (const [px, pz] of [
    [-s, -s],
    [s, -s],
    [-s, s],
    [s, s],
  ]) {
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.35, 6), stakeMat);
    stake.position.set(px, 0.7, pz);
    stakes.add(stake);
    // Flag ribbon
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.22, 0.04),
      new THREE.MeshBasicMaterial({
        color: colors.bar,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      })
    );
    flag.position.set(px + 0.22, 1.25, pz);
    stakes.add(flag);
  }
  group.add(stakes);

  // Beacon
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    })
  );
  beacon.name = 'beacon';
  beacon.position.y = 2.1;
  beacon.renderOrder = 10;
  group.add(beacon);

  // Name + % billboard
  const labelTex = makeLabelTexture(title, 0, team, actionVerb);
  const labelMat = new THREE.SpriteMaterial({
    map: labelTex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const labelSprite = new THREE.Sprite(labelMat);
  labelSprite.name = 'label';
  labelSprite.position.y = 3.6;
  labelSprite.scale.set(6.2, 2.4, 1);
  labelSprite.renderOrder = 14;
  group.add(labelSprite);

  group.userData.fieldConstruction = {
    kind,
    team,
    title,
    verb: actionVerb,
    radius,
    progressArc,
    outerRing,
    footprint,
    ghost,
    stakes,
    beacon,
    label: labelSprite,
    labelMat,
    labelTex,
    lastLabelPct: -1,
    lastArcBucket: -1,
    phase: Math.random() * Math.PI * 2,
    ghostH: g.h,
  };

  return group;
}

export function updateFieldConstructionVisual(group, progress, dt = 0) {
  const data = group?.userData?.fieldConstruction;
  if (!data) return;

  const p = Math.max(0, Math.min(1, progress ?? 0));
  data.phase += dt * 3.4;

  data.lastArcBucket = setProgressArc(data.progressArc, data.radius, p, data.lastArcBucket);

  const pulse = 0.55 + Math.sin(data.phase) * 0.28;
  data.outerRing.material.opacity = 0.55 + pulse * 0.4;
  data.footprint.material.opacity = 0.18 + p * 0.18;

  // Rising ghost mass
  const rise = 0.12 + p * 0.88;
  data.ghost.scale.y = rise;
  data.ghost.position.y = data.ghostH * rise * 0.5 + 0.06;
  data.ghost.material.opacity = 0.3 + p * 0.35;

  data.stakes.scale.y = 0.55 + p * 0.45;

  data.beacon.position.y = 1.7 + p * 0.9 + Math.sin(data.phase * 2.2) * 0.1;
  data.beacon.material.opacity = 0.7 + Math.sin(data.phase * 4.5) * 0.28;
  data.beacon.scale.setScalar(0.9 + Math.sin(data.phase * 3) * 0.15);
  data.label.position.y = data.beacon.position.y + 1.55;

  const pct = Math.round(p * 100);
  if (pct !== data.lastLabelPct) {
    data.lastLabelPct = pct;
    if (data.labelTex) data.labelTex.dispose();
    data.labelTex = makeLabelTexture(data.title, pct, data.team, data.verb);
    data.labelMat.map = data.labelTex;
    data.labelMat.needsUpdate = true;
  }
}

export function disposeFieldConstructionVisual(group) {
  if (!group) return;
  if (group.parent) group.parent.remove(group);
  const data = group.userData?.fieldConstruction;
  if (data?.labelTex) data.labelTex.dispose();
  group.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (Array.isArray(c.material)) {
        c.material.forEach((m) => {
          if (m.map && m.map !== data?.labelTex) m.map.dispose?.();
          m.dispose?.();
        });
      } else {
        if (c.material.map && c.material.map !== data?.labelTex) c.material.map.dispose?.();
        c.material.dispose?.();
      }
    }
  });
}
