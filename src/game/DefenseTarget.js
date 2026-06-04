/** Attack wrapper for player-built defenses. */

export function isDefenseTarget(target) {
  return target?.isDefense === true;
}

export function getDefenseTargetLabel(target) {
  if (!isDefenseTarget(target)) return 'Defense';
  return target.entry?.def?.name ?? 'Defense';
}

export function wrapDefenseTarget(entry) {
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
      return entry.mesh?.position?.y ?? 0;
    },
  };

  const caliberLabel = entry.def.caliber ? ` (${entry.def.caliber} mm)` : '';
  const hpLabel = `${Math.ceil(entry.hp)}/${entry.maxHp}`;

  entry._attackTarget = {
    isDefense: true,
    dead: false,
    team: 'player',
    entry,
    name: entry.def.name,
    label: `${entry.def.name}${caliberLabel} — ${hpLabel}`,
    hitRadius: entry.radius + 1.4,
    position,
    mesh: entry.mesh,
    takeDamage(amount) {
      if (entry.destroyed) {
        this.dead = true;
        return;
      }
      entry.hp -= amount;
      const cal = entry.def.caliber ? ` (${entry.def.caliber} mm)` : '';
      this.label = `${entry.def.name}${cal} — ${Math.ceil(Math.max(0, entry.hp))}/${entry.maxHp}`;
      if (entry.hp <= 0) {
        entry.hp = 0;
        entry.manager?.destroyEntry(entry);
        this.dead = true;
      } else {
        entry.manager?.onDamaged?.(entry);
      }
    },
  };

  return entry._attackTarget;
}