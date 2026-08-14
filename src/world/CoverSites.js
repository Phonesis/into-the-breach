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
    let px = x;
    let pz = z;
    // Map-gen sandbags must sit on open ground / streets, never inside tenements.
    if (scenery?.isFieldWorksPlacementBlocked?.(px, pz, 1.7)) {
      const clear = scenery.findClearVehiclePlacement?.(px, pz, 1.7, mapDef);
      if (!clear) return false;
      px = clear.x;
      pz = clear.z;
      if (scenery.isFieldWorksPlacementBlocked?.(px, pz, 1.7)) return false;
    }
    const y = sampleTerrainHeight(px, pz, mapDef);
    const sideFaction = factionForPosition(px, pz, mapDef, factions);
    const g = createSandbagEmplacementGroup({
      factionId: sideFaction?.id ?? null,
      seed: px * 0.13 + pz * 0.19,
    });
    g.position.set(px, y, pz);

    if (scenery) {
      scenery.register(g, { x: px, z: pz, kind: 'bunker', coverType: type, source: 'map' });
    } else {
      scene.add(g);
      zones.push({ x: px, z: pz, type });
    }
    return true;
  };

  const sizeScale = mapDef.sizeScale ?? 1;
  const baseCount = mapDef.terrain === 'desert' ? 14 : mapDef.terrain === 'bocage' ? 22 : mapDef.terrain === 'urban' ? 12 : 18;
  const count = Math.round(baseCount * sizeScale * (sizeScale > 1 ? 1.1 : 1));

  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 6;
  while (placed < count && attempts < maxAttempts) {
    attempts++;
    let x = (random() - 0.5) * mapDef.size * 0.75;
    let z = (random() - 0.5) * mapDef.size * 0.75;
    if (mapDef.terrain === 'urban') {
      const spacing = mapDef.streetSpacing ?? 21;
      // Prefer street corridors rather than block centres on urban maps.
      if (random() < 0.72) {
        if (random() < 0.5) x = Math.round(x / spacing) * spacing;
        else z = Math.round(z / spacing) * spacing;
      } else {
        x = Math.round(x / spacing) * spacing + (random() - 0.5) * (mapDef.streetWidth ?? 6.4) * 0.35;
        z = Math.round(z / spacing) * spacing + (random() - 0.5) * (mapDef.streetWidth ?? 6.4) * 0.35;
      }
    }
    if (Math.abs(x) < 10 * sizeScale && Math.abs(z) < 8 * sizeScale) continue;
    const t = random() < 0.25 ? 'heavy' : 'medium';
    if (addBunker(x, z, t)) placed++;
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
