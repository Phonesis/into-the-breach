/** Wraps destructible scenery so units can attack cover objects directly. */

const LABELS = {
  tree: 'Tree',
  bush: 'Brush',
  hedge: 'Hedge / wall',
  rock: 'Rock',
  bunker: 'Fighting position',
};

export function isSceneryTarget(target) {
  return target?.isScenery === true;
}

export function getSceneryTargetLabel(target) {
  if (!isSceneryTarget(target)) return 'Cover';
  const kind = target.entry?.kind;
  return LABELS[kind] ?? 'Cover';
}

export function wrapSceneryTarget(entry, scenery) {
  if (!entry || entry.destroyed) return null;
  if (entry._attackTarget && !entry._attackTarget.dead) return entry._attackTarget;

  const position = {
    get x() {
      return entry.x;
    },
    get z() {
      return entry.z;
    },
    get y() {
      return entry.group?.position?.y ?? 0;
    },
  };

  entry._attackTarget = {
    isScenery: true,
    dead: false,
    team: 'neutral',
    entry,
    scenery,
    name: LABELS[entry.kind] ?? 'Cover',
    label: LABELS[entry.kind] ?? 'Cover',
    hitRadius: entry.radius + 1.2,
    position,
    mesh: entry.group,
    takeDamage(amount) {
      if (entry.destroyed) {
        this.dead = true;
        return;
      }
      scenery.damageObject(entry, amount);
      if (entry.destroyed) this.dead = true;
    },
  };

  return entry._attackTarget;
}