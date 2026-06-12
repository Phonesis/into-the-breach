import * as THREE from 'three';
import { getDefenseDesign } from '../units/defenseDesigns.js';
import { getVehicleDesign } from '../units/vehicleDesigns.js';
import {
  addBox,
  buildAtGunFromDesign,
  buildArtilleryFromDesign,
} from '../units/VehicleMeshKit.js';

function addSandbag(group, mat, x, y, z, ry, w = 1.55, h = 0.52, d = 0.88) {
  const bag = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  bag.position.set(x, y, z);
  bag.rotation.y = ry;
  bag.castShadow = true;
  bag.receiveShadow = true;
  group.add(bag);
}

function addSandbagRing(group, mat, { count, radius, y = 0.3, arc = Math.PI * 1.35, centerAngle = 0 }) {
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(count - 1, 1);
    const a = centerAngle - arc / 2 + t * arc;
    const px = Math.sin(a) * radius;
    const pz = Math.cos(a) * radius;
    addSandbag(group, mat, px, y, pz, a + Math.PI / 2);
  }
}

function addEmbrasure(group, mat, dark, steel, emb, y, addMg = false) {
  if (!emb) return;
  addBox(group, new THREE.BoxGeometry(emb.w, emb.h, 0.35), dark, {
    y: y + emb.h * 0.35,
    z: emb.z,
  });
  addBox(group, new THREE.BoxGeometry(emb.w * 1.15, emb.h * 0.35, 0.2), mat, {
    y: y + emb.h * 0.15,
    z: emb.z + 0.12,
  });
  if (addMg) {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.04, 0.55, 8),
      steel
    );
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.12, y + emb.h * 0.42, emb.z + 0.22);
    barrel.castShadow = true;
    group.add(barrel);
  }
}

function addGunPortBarrel(group, steel, gun) {
  if (!gun) return;
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(gun.r1 ?? gun.r0, gun.r0, gun.len, 10),
    steel
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, gun.y, gun.z);
  barrel.castShadow = true;
  group.add(barrel);
  const muzzle = new THREE.Mesh(
    new THREE.CylinderGeometry((gun.r1 ?? gun.r0) * 1.1, gun.r1 ?? gun.r0, 0.22, 8),
    steel
  );
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, gun.y, gun.z + gun.len / 2 + 0.08);
  group.add(muzzle);
}

function buildHexBunker(group, mats, d) {
  const { concrete, sandbag } = mats;
  const y = d.height / 2;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(d.radius, d.radius * 1.04, d.height, 6),
    concrete
  );
  body.position.y = y;
  body.castShadow = true;
  group.add(body);

  const roof = new THREE.Mesh(
    new THREE.CylinderGeometry(d.radius * 0.92, d.radius, d.wall * 0.55, 6),
    concrete
  );
  roof.position.y = d.height + d.wall * 0.22;
  group.add(roof);

  addEmbrasure(group, concrete, mats.dark, mats.steel, d.embrasure, y + d.height * 0.15, !d.gun);
  addGunPortBarrel(group, mats.steel, d.gun);
  if (d.sandbagRing) addSandbagRing(group, sandbag, d.sandbagRing);
}

function buildEarthBunker(group, mats, d) {
  const { concrete, sandbag, earth } = mats;
  const berm = new THREE.Mesh(
    new THREE.BoxGeometry(d.width, d.height * 0.75, d.depth),
    earth
  );
  berm.position.set(0, d.height * 0.38, -0.15);
  berm.castShadow = true;
  group.add(berm);

  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(d.width * 0.88, d.height * 0.35, d.depth * 0.82),
    concrete
  );
  cap.position.set(0, d.height * 0.82, 0.35);
  group.add(cap);

  if (d.logs) {
    for (let i = 0; i < d.logs; i++) {
      const t = (i / Math.max(d.logs - 1, 1) - 0.5) * d.width * 0.78;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, d.depth * 0.9, 6), mats.wood);
      log.rotation.x = Math.PI / 2;
      log.rotation.z = Math.PI / 2;
      log.position.set(t, d.height * 0.55, 0.1);
      group.add(log);
    }
  }

  addEmbrasure(group, concrete, mats.dark, mats.steel, d.embrasure, d.height * 0.65, !d.gun);
  addGunPortBarrel(group, mats.steel, d.gun);
  if (d.sandbagRing) addSandbagRing(group, sandbag, d.sandbagRing);
}

function buildWedgeBunker(group, mats, d) {
  const { concrete, sandbag } = mats;
  const y = d.height / 2;
  const front = new THREE.Mesh(new THREE.BoxGeometry(d.width, d.height, d.depth * 0.55), concrete);
  front.position.set(0, y, d.depth * 0.22);
  front.castShadow = true;
  group.add(front);

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(d.width * 0.72, d.height * 0.82, d.depth * 0.42),
    concrete
  );
  back.position.set(0, y * 0.92, -d.depth * 0.28);
  group.add(back);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(d.width * 0.95, d.height * 0.22, d.depth * 0.88),
    concrete
  );
  roof.position.set(0, d.height + 0.08, 0);
  group.add(roof);

  addEmbrasure(group, concrete, mats.dark, mats.steel, d.embrasure, y, !d.gun);
  addGunPortBarrel(group, mats.steel, d.gun);
  if (d.sandbagRing) addSandbagRing(group, sandbag, d.sandbagRing);
}

function buildLogBunker(group, mats, d) {
  const { sandbag, earth, wood } = mats;
  const berm = new THREE.Mesh(
    new THREE.BoxGeometry(d.width, d.height * 0.65, d.depth),
    earth
  );
  berm.position.set(0, d.height * 0.32, 0);
  group.add(berm);

  const layers = d.logLayers ?? 3;
  for (let layer = 0; layer < layers; layer++) {
    const ly = 0.42 + layer * 0.22;
    const count = 5 + layer;
    for (let i = 0; i < count; i++) {
      const t = (i / Math.max(count - 1, 1) - 0.5) * d.width * 0.82;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, d.depth * 0.85, 6), wood);
      log.rotation.x = Math.PI / 2;
      log.rotation.z = Math.PI / 2;
      log.position.set(t, ly, 0.12);
      group.add(log);
    }
  }

  addEmbrasure(group, sandbag, mats.dark, mats.steel, d.embrasure, d.height * 0.55, !d.gun);
  addGunPortBarrel(group, mats.steel, d.gun);
  if (d.sandbagRing) addSandbagRing(group, sandbag, d.sandbagRing);
}

export function buildBunkerFromDesign(group, mats, design) {
  switch (design.style) {
    case 'hex':
      buildHexBunker(group, mats, design);
      break;
    case 'earth':
      buildEarthBunker(group, mats, design);
      break;
    case 'wedge':
      buildWedgeBunker(group, mats, design);
      break;
    case 'log':
      buildLogBunker(group, mats, design);
      break;
    default:
      buildHexBunker(group, mats, design);
  }
  group.userData.hitRadius = design.hitRadius;
}

function addMgOnTripod(group, steel, gun) {
  const spread = gun.tripodSpread;
  for (const [x, z] of [
    [0, spread],
    [-spread * 0.86, -spread * 0.5],
    [spread * 0.86, -spread * 0.5],
  ]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.48, 6), steel);
    leg.position.set(x, 0.24, z);
    leg.rotation.x = x === 0 ? -0.35 : 0.55;
    leg.rotation.z = x < 0 ? 0.25 : x > 0 ? -0.25 : 0;
    group.add(leg);
  }
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.14), steel);
  receiver.position.set(0, gun.y, 0.05);
  group.add(receiver);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(gun.barrelR, gun.barrelR * 1.1, gun.barrelLen, 8),
    steel
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, gun.y, gun.barrelLen / 2 + 0.15);
  group.add(barrel);
}

export function buildMortarNestFromDesign(group, mats, design) {
  const { sandbag, sandbagAlt, camoDark, earth } = mats;
  const p = design.parapet;
  for (let i = 0; i < p.segments; i++) {
    const t = (i / Math.max(p.segments - 1, 1) - 0.5) * Math.PI * 0.94;
    const boost = Math.cos(t) * p.frontBoost;
    const px = Math.sin(t) * p.radius;
    const pz = Math.cos(t) * p.radius + boost;
    const mat = i % 2 === 0 ? sandbag : sandbagAlt;
    addSandbag(group, mat, px, p.height * 0.5, pz, t + Math.PI / 2, 1.6, p.height, 0.92);
  }

  const pit = new THREE.Mesh(
    new THREE.CylinderGeometry(design.base.r * 0.9, design.base.r, design.base.h, 12),
    earth
  );
  pit.position.y = design.base.h * 0.45;
  pit.receiveShadow = true;
  group.add(pit);

  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(design.base.r * 0.55, design.base.r * 0.62, 0.05, 10),
    camoDark
  );
  plate.position.y = design.base.h + 0.02;
  group.add(plate);

  const tube = design.tube;
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(tube.r1, tube.r0, tube.len, 10),
    camoDark
  );
  barrel.rotation.x = tube.elev;
  barrel.position.set(0, tube.y, tube.z);
  barrel.castShadow = true;
  group.add(barrel);

  const spread = design.bipodSpread;
  for (const x of [-spread, spread]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), camoDark);
    leg.position.set(x, 0.22, tube.z + 0.22);
    leg.rotation.x = -0.58;
    group.add(leg);
  }

  const boxOffsets = [
    [-1.35, 0.32, -0.55],
    [1.3, 0.3, -0.48],
    [-1.55, 0.34, -0.15],
  ];
  for (let i = 0; i < design.ammoBoxes; i++) {
    const [bx, by, bz] = boxOffsets[i];
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.32), sandbagAlt);
    box.position.set(bx, by, bz);
    box.rotation.y = bx < 0 ? 0.35 : -0.3;
    box.castShadow = true;
    group.add(box);
  }

  group.userData.hitRadius = design.hitRadius;
}

export function buildMgNestFromDesign(group, mats, design) {
  const { sandbag, sandbagAlt } = mats;
  const p = design.parapet;
  for (let i = 0; i < p.segments; i++) {
    const t = (i / Math.max(p.segments - 1, 1) - 0.5) * Math.PI * 0.92;
    const boost = Math.cos(t) * p.frontBoost;
    const px = Math.sin(t) * p.radius;
    const pz = Math.cos(t) * p.radius + boost;
    const mat = i % 2 === 0 ? sandbag : sandbagAlt;
    addSandbag(group, mat, px, p.height * 0.5, pz, t + Math.PI / 2, 1.65, p.height, 0.95);
  }
  addMgOnTripod(group, mats.camoDark, design.gun);
  group.userData.hitRadius = design.hitRadius;
}

function scaledGunDesign(base, scale) {
  return {
    ...base,
    trailLen: base.trailLen * scale,
    wheelR: base.wheelR * scale,
    carriage: {
      ...base.carriage,
      wheelSpread: base.carriage.wheelSpread * scale,
      trailSpread: base.carriage.trailSpread * scale,
    },
    shield: {
      ...base.shield,
      w: base.shield.w * scale,
      h: base.shield.h * scale,
      d: base.shield.d * scale,
      y: base.shield.y * scale,
      z: base.shield.z * scale,
    },
    tube: {
      ...base.tube,
      len: base.tube.len * scale,
      r0: base.tube.r0 * scale,
      r1: base.tube.r1 * scale,
      breechLen: (base.tube.breechLen ?? 0.32) * scale,
    },
    hitRadius: base.hitRadius,
  };
}

function addGunRevetment(group, mats, revetment) {
  const { sandbag, sandbagAlt, earth } = mats;
  const pit = new THREE.Mesh(
    new THREE.CylinderGeometry(revetment.radius * 0.82, revetment.radius, revetment.depth, 14),
    earth
  );
  pit.position.y = revetment.depth * 0.35;
  pit.receiveShadow = true;
  group.add(pit);

  const count = revetment.sandbags ?? 12;
  for (let i = 0; i < count; i++) {
    const t = (i / Math.max(count - 1, 1) - 0.5) * Math.PI * 1.1;
    const px = Math.sin(t) * revetment.radius * 0.92;
    const pz = Math.cos(t) * revetment.radius * 0.92;
    addSandbag(
      group,
      i % 2 === 0 ? sandbag : sandbagAlt,
      px,
      revetment.depth * 0.55,
      pz,
      t + Math.PI / 2,
      1.5,
      0.5,
      0.82
    );
  }
}

export function buildAtEmplacement(group, mats, factionId, design, heavy) {
  addGunRevetment(group, mats, design.revetment);

  const gunGroup = new THREE.Group();
  gunGroup.position.y = design.revetment.depth * 0.45;
  const base = getVehicleDesign(factionId, 'antiTankGun');
  const gunDesign = scaledGunDesign(base, design.gunScale ?? 1);
  buildAtGunFromDesign(
    gunGroup,
    mats.camoBody,
    mats.camoDetail,
    mats.camoDark,
    gunDesign
  );
  group.add(gunGroup);
  group.userData.hitRadius = design.hitRadius;
}

export function buildArtilleryPit(group, mats, factionId, design) {
  const { sandbag, sandbagAlt, earth } = mats;
  const pit = design.pit;
  const berm = new THREE.Mesh(
    new THREE.CylinderGeometry(pit.radius * 0.75, pit.radius, pit.depth, 16, 1, true),
    earth
  );
  berm.position.y = pit.depth * 0.28;
  berm.receiveShadow = true;
  group.add(berm);

  for (let i = 0; i < pit.sandbags; i++) {
    const t = (i / pit.sandbags) * Math.PI * 2;
    const px = Math.sin(t) * pit.radius * 0.88;
    const pz = Math.cos(t) * pit.radius * 0.88;
    addSandbag(
      group,
      i % 2 === 0 ? sandbag : sandbagAlt,
      px,
      pit.depth * 0.52,
      pz,
      t + Math.PI / 2,
      1.45,
      0.48,
      0.78
    );
  }

  const gunGroup = new THREE.Group();
  gunGroup.position.y = pit.depth * 0.42;
  const base = getVehicleDesign(factionId, 'artillery');
  const gunDesign = scaledGunDesign(base, design.gunScale ?? 1);
  gunDesign.tube = { ...gunDesign.tube, elev: design.gunElev ?? -0.4 };
  buildArtilleryFromDesign(
    gunGroup,
    mats.camoBody,
    mats.camoDetail,
    mats.camoDark,
    gunDesign
  );
  group.add(gunGroup);
  group.userData.hitRadius = design.hitRadius;
}

export function buildWireObstacle(group, mats, design, razor = false) {
  const { wire, wood } = mats;
  const step = design.span / Math.max(design.posts - 1, 1);
  const posts = [];
  for (let i = 0; i < design.posts; i++) {
    const x = -design.span / 2 + i * step;
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, design.postH, 6),
      wood
    );
    post.position.set(x, design.postH / 2, 0);
    post.castShadow = true;
    group.add(post);
    posts.push(x);
  }

  if (razor) {
    const coils = design.coils ?? 5;
    for (let c = 0; c < coils; c++) {
      const cx = -design.span / 2 + (c + 0.5) * (design.span / coils);
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 6, 14), wire);
      coil.rotation.y = Math.PI / 2;
      coil.rotation.x = Math.PI / 2;
      coil.position.set(cx, design.postH * 0.72, 0);
      group.add(coil);
      const coil2 = coil.clone();
      coil2.position.y = design.postH * 0.48;
      coil2.scale.setScalar(0.88);
      group.add(coil2);
    }
  } else {
    const strands = design.strands ?? 3;
    for (let s = 0; s < strands; s++) {
      const y = design.postH * (0.45 + s * 0.18);
      for (let i = 0; i < posts.length - 1; i++) {
        const x0 = posts[i];
        const x1 = posts[i + 1];
        const seg = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.04, 0.04), wire);
        seg.position.set((x0 + x1) / 2, y, 0);
        group.add(seg);
        const sag = new THREE.Mesh(new THREE.BoxGeometry((x1 - x0) * 0.4, 0.03, 0.03), wire);
        sag.position.set((x0 + x1) / 2, y - 0.08, 0.12);
        sag.rotation.x = 0.35;
        group.add(sag);
      }
    }
  }

  group.userData.hitRadius = design.hitRadius;
}

export function buildMineEmplacement(group, mats, design) {
  const { mine: mineMat, earth, wood } = mats;
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(design.discR * 1.15, design.discR * 1.25, 0.06, 12),
    earth
  );
  pad.position.y = 0.03;
  group.add(pad);

  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(design.discR, design.discR * 1.05, design.discH, 14),
    mineMat
  );
  disc.position.y = design.discH / 2 + 0.04;
  group.add(disc);

  const dome = new THREE.Mesh(
    new THREE.CylinderGeometry(design.domeR * 0.55, design.domeR, design.discH * 1.4, 10),
    mineMat
  );
  dome.position.y = design.discH + 0.1;
  group.add(dome);

  const marker = new THREE.Mesh(new THREE.BoxGeometry(0.1, design.markerH, 0.1), wood);
  marker.position.set(design.discR * 0.5, design.discH + design.markerH / 2 + 0.06, 0);
  group.add(marker);

  group.userData.hitRadius = design.hitRadius;
}

export function resolveDefenseDesign(factionId, typeId) {
  return getDefenseDesign(factionId, typeId);
}