export function isBaseBuildingTarget(target) {
  return target?.isBaseBuilding === true;
}

export function getBaseBuildingTargetLabel(target) {
  if (!isBaseBuildingTarget(target)) return 'Structure';
  return target.entry?.def?.name ?? 'Structure';
}

export function wrapBaseBuildingTarget(entry, manager) {
  if (!entry || entry.destroyed || entry.building) return null;
  if (entry._attackTarget && !entry._attackTarget.dead) return entry._attackTarget;

  const position = {
    get x() {
      return entry.x;
    },
    get z() {
      return entry.z;
    },
    get y() {
      return entry.mesh?.position?.y ?? 0;
    },
  };

  const hpLabel = `${Math.ceil(entry.hp)}/${entry.maxHp}`;

  entry._attackTarget = {
    isBaseBuilding: true,
    dead: false,
    team: entry.team,
    entry,
    name: entry.def.name,
    label: `${entry.def.name} — ${hpLabel}`,
    hitRadius: (entry.def.hitRadius ?? entry.def.radius ?? 4) + 1.2,
    position,
    mesh: entry.mesh,
    takeDamage(amount) {
      if (entry.destroyed) {
        this.dead = true;
        return;
      }
      entry.hp -= amount;
      this.label = `${entry.def.name} — ${Math.ceil(Math.max(0, entry.hp))}/${entry.maxHp}`;
      if (entry.hp <= 0) {
        entry.hp = 0;
        manager?.destroyEntry(entry);
        this.dead = true;
      } else {
        manager?.onDamaged?.(entry);
      }
    },
  };

  return entry._attackTarget;
}