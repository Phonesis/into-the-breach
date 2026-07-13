import { sampleTerrainHeight } from './Terrain.js';
import { createSandbagEmplacementGroup } from './SandbagEmplacement.js';
import { createMapRandom } from './MapRandom.js';

function factionForPosition(x, z, mapDef, factions) {
  if (!factions?.player) return null;
  const fl = mapDef.frontline;
  const pb = mapDef.playerBase;
  if (!fl || !pb || !factions.enemy) return factions.player;
  const toPlayerX = pb.x - fl.x;
  const toPlayerZ = pb.z - fl.z;
  const along = (x - fl.x) * toPlayerX + (z - fl.z) * toPlayerZ;
  return along >= 0 ? factions.player : factions.enemy;
}

/** Place sandbag fighting positions and return cover zone data. */
export function buildCoverSites(mapDef, scene, scenery = null, factions = null, options = {}) {
  const zones = [];
  const random = createMapRandom(mapDef, 'cover');

  const addBunker = (x, z, type = 'medium') => {
    const y = sampleTerrainHeight(x, z, mapDef);
    const sideFaction = factionForPosition(x, z, mapDef, factions);
    const g = createSandbagEmplacementGroup({
      factionId: sideFaction?.id ?? null,
      seed: x * 0.13 + z * 0.19,
    });
    g.position.set(x, y, z);

    if (scenery) {
      scenery.register(g, { x, z, kind: 'bunker', coverType: type, source: 'map' });
    } else {
      scene.add(g);
      zones.push({ x, z, type });
    }
  };

  const sizeScale = mapDef.sizeScale ?? 1;
  const baseCount = mapDef.terrain === 'desert' ? 14 : mapDef.terrain === 'bocage' ? 22 : 18;
  const count = Math.round(baseCount * sizeScale * (sizeScale > 1 ? 1.1 : 1));

  for (let i = 0; i < count; i++) {
    const x = (random() - 0.5) * mapDef.size * 0.75;
    const z = (random() - 0.5) * mapDef.size * 0.75;
    if (Math.abs(x) < 10 * sizeScale && Math.abs(z) < 8 * sizeScale) continue;
    const t = random() < 0.25 ? 'heavy' : 'medium';
    addBunker(x, z, t);
  }

  if (mapDef.terrain === 'bocage') {
    for (let i = 0; i < Math.round(35 * sizeScale * (sizeScale > 1 ? 1.1 : 1)); i++) {
      const hx = (random() - 0.5) * mapDef.size * 0.55;
      const hz = (random() - 0.5) * mapDef.size * 0.55;
      zones.push({ x: hx, z: hz, type: 'heavy' });
    }
  }

  for (let i = 0; i < 25; i++) {
    const x = (random() - 0.5) * mapDef.size * 0.8;
    const z = (random() - 0.5) * mapDef.size * 0.8;
    const h = sampleTerrainHeight(x, z, mapDef);
    if (h > 2.5) {
      zones.push({ x, z, type: 'light' });
    }
  }

  if (!options.towerDefense) {
    const fl = mapDef.frontline ?? { x: 0, z: 0 };
    addBunker(fl.x - 8 * sizeScale, fl.z, 'heavy');
    addBunker(fl.x + 8 * sizeScale, fl.z, 'heavy');
    addBunker(fl.x, fl.z - 10 * sizeScale, 'medium');
    addBunker(fl.x, fl.z + 10 * sizeScale, 'medium');
  }

  return zones;
}