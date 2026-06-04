import { FACTION_LIST } from '../data/factions.js';
import { MAP_LIST } from '../data/maps.js';
import { GAME_MODE_LIST, ASSAULT_ROLE_LIST, getProducibleUnits } from '../data/gameModes.js';
import { DIFFICULTY_LIST, DEFAULT_DIFFICULTY } from '../data/difficulty.js';
import { FIRE_SUPPORT_LIST } from '../data/fireSupport.js';
import { formatAssaultHud } from '../game/AssaultMode.js';
import { TargetIndicators } from '../visual/TargetIndicators.js';
import { getCoverStatus } from '../game/CoverSystem.js';
import { renderGameGuideHtml } from '../data/gameGuide.js';
import { getUnitIconMarkup } from './unitIcons.js';

const PRODUCE_LABELS = {
  infantry: 'Inf',
  machineGun: 'MG',
  sniper: 'Snp',
  mortar: 'Mrt',
  armoredCar: 'AC',
  tank: 'Tk',
  superHeavyTank: 'Super Heavy Tank',
  artillery: 'Arty',
};

const FACTION_ROSTER_LABELS = {
  infantry: 'Infantry',
  machineGun: 'MG team',
  sniper: 'Sniper',
  mortar: 'Mortar',
  armoredCar: 'Armored car',
  tank: 'Tank',
  superHeavyTank: 'Super Heavy Tank',
  artillery: 'Artillery',
};

export class UIManager {
  constructor(root, callbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.selectedFaction = null;
    this.selectedMap = null;
    this.selectedGameMode = null;
    this.selectedAssaultRole = null;
    this.selectedDifficulty = DEFAULT_DIFFICULTY;
    this.render();
  }

  render() {
    this.root.innerHTML = `
      <div id="screen-title" class="screen interactive">
        <div class="title-block">
          <h1>Into the Breach</h1>
          <p>Command historically accurate forces. Capture strategic points, build your army, and break the enemy line.</p>
        </div>
        <div class="title-actions">
          <button class="btn btn-primary interactive" id="btn-start">Begin</button>
          <button class="btn btn-secondary interactive" id="btn-guide-title">Field Manual</button>
        </div>
      </div>

      <div id="screen-mode" class="screen interactive hidden">
        <div class="title-block">
          <h1>Game Mode</h1>
          <p>Campaign, Clear Defenses, Training Ground, or Assault & Defend.</p>
        </div>
        <div class="panel">
          <h2>Select Mode</h2>
          <div class="mode-grid" id="mode-grid"></div>
          <div class="actions">
            <button class="btn btn-secondary interactive" id="btn-back-title">Back</button>
            <button class="btn btn-primary interactive" id="btn-to-faction" disabled>Continue</button>
          </div>
        </div>
      </div>

      <div id="screen-assault-role" class="screen interactive hidden">
        <div class="title-block">
          <h1>Your Mission</h1>
          <p>Attackers must capture and hold the frontline. Defenders must hold until time expires.</p>
        </div>
        <div class="panel">
          <h2>Attack or Defend</h2>
          <div class="mode-grid" id="role-grid"></div>
          <div class="actions">
            <button class="btn btn-secondary interactive" id="btn-back-mode-role">Back</button>
            <button class="btn btn-primary interactive" id="btn-to-faction-role" disabled>Continue</button>
          </div>
        </div>
      </div>

      <div id="screen-faction" class="screen interactive hidden">
        <div class="title-block">
          <h1>Select Your Nation</h1>
          <p>Infantry, MG teams, snipers, mortars, armored cars, tanks, and artillery.</p>
        </div>
        <div class="panel">
          <h2>Choose Side</h2>
          <div class="faction-grid" id="faction-grid"></div>
          <div class="actions">
            <button class="btn btn-secondary interactive" id="btn-back-mode">Back</button>
            <button class="btn btn-primary interactive" id="btn-to-maps" disabled>Continue</button>
          </div>
        </div>
      </div>

      <div id="screen-map" class="screen interactive hidden">
        <div class="title-block">
          <h1>Select Theater</h1>
          <p>Fight on battlefields modeled after real WW2 campaigns.</p>
        </div>
        <div class="panel">
          <h2>Choose Map</h2>
          <div class="map-grid" id="map-grid"></div>
          <div class="difficulty-block" id="difficulty-block">
            <h2>AI Difficulty</h2>
            <div class="difficulty-grid" id="difficulty-grid"></div>
          </div>
          <div class="actions">
            <button class="btn btn-secondary interactive" id="btn-back-faction">Back</button>
            <button class="btn btn-primary interactive" id="btn-launch" disabled>Deploy Forces</button>
          </div>
        </div>
      </div>

      <div id="hud" class="hud hidden">
        <div class="hud-top">
          <div>
            <div class="hud-badge" id="hud-faction">—</div>
            <div class="hud-stats" id="hud-map">—</div>
            <div class="tutorial-banner hidden" id="tutorial-banner">Training — no enemy AI</div>
            <div class="assault-banner hidden" id="assault-banner">
              <span class="assault-role" id="assault-role-label">—</span>
              <span class="assault-objective" id="assault-objective">—</span>
              <span class="assault-timer" id="assault-timer">—</span>
            </div>
            <div class="clearance-banner hidden" id="clearance-banner">
              Clear all dug-in defenders — no enemy HQ
            </div>
          </div>
          <div class="hud-top-right">
            <button
              type="button"
              class="btn-surrender-hud interactive"
              id="btn-surrender"
              title="Surrender and return to main menu"
            >
              Surrender
            </button>
            <div class="hud-resources">
              <span class="resource-label">Supplies</span>
              <span class="resource-value" id="hud-resources">0</span>
            </div>
            <div class="hud-stats" id="hud-army">Army: —</div>
          </div>
        </div>

        <div id="opening-countdown" class="opening-countdown hidden" aria-live="polite">
          <div class="opening-countdown-card">
            <p class="opening-countdown-title" id="opening-countdown-title">Quiet sector</p>
            <p class="opening-countdown-value" id="opening-countdown-value">32</p>
            <p class="opening-countdown-sub" id="opening-countdown-sub">—</p>
            <div class="opening-countdown-track">
              <div class="opening-countdown-fill" id="opening-countdown-fill"></div>
            </div>
            <button
              type="button"
              class="btn btn-primary opening-countdown-launch interactive hidden"
              id="btn-launch-battle-now"
            >
              Launch Battle Now
            </button>
          </div>
        </div>

        <div class="capture-bar" id="capture-bar"></div>

        <aside class="unit-roster interactive" id="unit-roster" aria-label="Your forces">
          <h3 class="unit-roster-title">Forces</h3>
          <div class="unit-roster-list" id="unit-roster-list"></div>
        </aside>

        <div class="hud-bottom">
          <div class="selection-panel interactive" id="selection-panel">
            <div id="selection-body">
              <h3>No selection</h3>
              <p>Click a unit in Forces or on the battlefield to select.</p>
            </div>
            <div id="selection-cover" class="selection-cover hidden"></div>
            <div class="target-offer hidden" id="target-offer">
              <p class="target-offer-label" id="target-offer-label">Enemy in sights</p>
              <button type="button" class="btn btn-target interactive" id="btn-engage-target">Engage target</button>
              <p class="target-offer-hint">Or left-click the highlighted enemy</p>
            </div>
          </div>
          <div class="production-panel interactive" id="production-panel">
            <h3>Reinforcements</h3>
            <div class="produce-btns" id="produce-btns"></div>
            <p class="queue-text" id="queue-text">Queue empty</p>
          </div>
          <div class="firesupport-panel interactive" id="firesupport-panel">
            <h3>Fire Support</h3>
            <div class="firesupport-btns" id="firesupport-btns"></div>
            <p class="firesupport-hint" id="firesupport-hint">Off-map assets on cooldown</p>
          </div>
          <p class="hud-hint" id="hud-hint">LMB select · Shift+LMB fire mission · RMB move/attack · Alt+click destroy cover</p>
          <button type="button" class="btn-guide-hud interactive" id="btn-guide-hud">Field Manual</button>
        </div>
      </div>

      <div id="overlay-guide" class="overlay-guide hidden interactive">
        <div class="guide-box">
          <h2>Field Manual</h2>
          <p class="guide-lead">How to play Into the Breach — controls, economy, combat, and victory conditions.</p>
          <div class="guide-scroll" id="guide-content"></div>
          <div class="guide-actions">
            <button type="button" class="btn btn-secondary interactive" id="btn-guide-close">Close</button>
          </div>
        </div>
      </div>

      <div id="overlay-end" class="overlay-msg hidden interactive">
        <div class="box end-box">
          <h2 id="end-title">Victory</h2>
          <p id="end-msg"></p>
          <div id="end-stats" class="end-stats hidden"></div>
          <div class="end-actions">
            <button class="btn btn-primary interactive hidden" id="btn-replay">Replay battle</button>
            <button class="btn btn-secondary interactive" id="btn-menu">Main Menu</button>
          </div>
        </div>
      </div>

      <div id="select-box" class="select-box"></div>
    `;

    this.renderModes();
    this.renderAssaultRoles();
    this.renderFactions();
    this.renderMaps();
    this.renderDifficulties();
    const guideEl = this.root.querySelector('#guide-content');
    if (guideEl) guideEl.innerHTML = renderGameGuideHtml();
    this.guideFromMenu = false;
    this.bind();
    this._bindUnitRoster();
  }

  renderDifficulties() {
    const grid = this.root.querySelector('#difficulty-grid');
    if (!grid) return;
    grid.innerHTML = DIFFICULTY_LIST.map(
      (d) => `
      <button type="button" class="card-btn interactive difficulty-card${d.id === this.selectedDifficulty ? ' selected' : ''}" data-id="${d.id}">
        <span class="name">${d.name}</span>
        <span class="meta">${d.subtitle}</span>
      </button>
    `
    ).join('');
  }

  updateDifficultyPanel() {
    const block = this.root.querySelector('#difficulty-block');
    const isTutorial = this.selectedGameMode === 'tutorial';
    if (block) block.classList.toggle('hidden', isTutorial);
    this.renderDifficulties();
  }

  renderAssaultRoles() {
    const grid = this.root.querySelector('#role-grid');
    if (!grid) return;
    grid.innerHTML = ASSAULT_ROLE_LIST.map(
      (r) => `
      <button class="card-btn interactive role-card" data-id="${r.id}">
        <span class="name">${r.name}</span>
        <span class="meta">${r.subtitle}</span>
      </button>
    `
    ).join('');
  }

  renderModes() {
    const grid = this.root.querySelector('#mode-grid');
    grid.innerHTML = GAME_MODE_LIST.map(
      (m) => `
      <button class="card-btn interactive mode-card" data-id="${m.id}">
        <span class="name">${m.name}</span>
        <span class="meta">${m.subtitle}</span>
      </button>
    `
    ).join('');
  }

  renderFactions() {
    const grid = this.root.querySelector('#faction-grid');
    grid.innerHTML = FACTION_LIST.map((f) => {
      const roster = getProducibleUnits(f)
        .map((key) => {
          const def = f.units[key];
          const role = FACTION_ROSTER_LABELS[key] ?? key;
          return `<li title="${def.designation}"><span class="unit-role">${role}</span><span class="unit-name">${def.name}</span></li>`;
        })
        .join('');
      return `
      <button class="card-btn interactive faction-card" data-id="${f.id}">
        <img class="faction-flag" src="${f.flag}" alt="" loading="lazy" draggable="false" />
        <span class="name">${f.name}</span>
        <span class="meta">${f.era}</span>
        <span class="units-preview-label">Units</span>
        <ul class="faction-units">${roster}</ul>
      </button>
    `;
    }).join('');
  }

  renderMaps() {
    const grid = this.root.querySelector('#map-grid');
    grid.innerHTML = MAP_LIST.map(
      (m) => `
      <button class="card-btn interactive map-card" data-id="${m.id}">
        <span class="name">${m.name}</span>
        <span class="meta">${m.subtitle}</span>
        <span class="units-preview">${m.features.join(' · ')}</span>
      </button>
    `
    ).join('');
  }

  bind() {
    const menuScreens = new Set(['title', 'mode', 'assault-role', 'faction', 'map']);

    const show = (id) => {
      this.root.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
      const el = this.root.querySelector(`#screen-${id}`);
      if (el) el.classList.remove('hidden');
      if (this.callbacks.onMenuVisible) {
        this.callbacks.onMenuVisible(menuScreens.has(id));
      }
    };

    this.root.querySelector('#btn-start').onclick = () => show('mode');
    this.root.querySelector('#btn-guide-title').onclick = () => this.openGuide(true);
    this.root.querySelector('#btn-guide-hud')?.addEventListener('click', () => this.openGuide(false));
    this.root.querySelector('#btn-guide-close').onclick = () => this.closeGuide();
    this.root.querySelector('#btn-back-title').onclick = () => show('title');

    this.root.querySelectorAll('.mode-card').forEach((btn) => {
      btn.onclick = () => {
        this.root.querySelectorAll('.mode-card').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedGameMode = btn.dataset.id;
        if (btn.dataset.id !== 'assault') {
          this.selectedAssaultRole = null;
        }
        this.root.querySelector('#btn-to-faction').disabled = false;
        this.updateDifficultyPanel();
      };
    });

    this.root.querySelector('#btn-to-faction').onclick = () => {
      if (this.selectedGameMode === 'assault') show('assault-role');
      else show('faction');
    };

    this.root.querySelector('#btn-back-mode-role').onclick = () => show('mode');
    this.root.querySelectorAll('.role-card').forEach((btn) => {
      btn.onclick = () => {
        this.root.querySelectorAll('.role-card').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedAssaultRole = btn.dataset.id;
        this.root.querySelector('#btn-to-faction-role').disabled = false;
      };
    });
    this.root.querySelector('#btn-to-faction-role').onclick = () => show('faction');
    this.root.querySelector('#btn-back-mode').onclick = () => show('mode');
    this.root.querySelector('#btn-back-faction').onclick = () => show('faction');

    this.root.querySelectorAll('.faction-card').forEach((btn) => {
      btn.onclick = () => {
        this.root.querySelectorAll('.faction-card').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedFaction = btn.dataset.id;
        this.root.querySelector('#btn-to-maps').disabled = false;
      };
    });

    this.root.querySelector('#btn-to-maps').onclick = () => {
      this.updateDifficultyPanel();
      show('map');
    };

    this.root.querySelector('#difficulty-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.difficulty-card');
      if (!btn) return;
      this.root.querySelectorAll('.difficulty-card').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      this.selectedDifficulty = btn.dataset.id;
    });

    this.root.querySelectorAll('.map-card').forEach((btn) => {
      btn.onclick = () => {
        this.root.querySelectorAll('.map-card').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedMap = btn.dataset.id;
        this.root.querySelector('#btn-launch').disabled = false;
      };
    });

    this.root.querySelector('#btn-launch').onclick = () => {
      if (!this.selectedFaction || !this.selectedMap || !this.selectedGameMode) return;
      if (this.selectedGameMode === 'assault' && !this.selectedAssaultRole) return;
      if (this.callbacks.onStartGame) {
        this.callbacks.onStartGame(this.selectedFaction, this.selectedMap, this.selectedGameMode, {
          assaultRole: this.selectedAssaultRole ?? 'defend',
          difficulty: this.selectedDifficulty,
        });
      }
    };

    this.root.querySelector('#btn-menu').onclick = () => {
      this.hideEndOverlay();
      if (this.callbacks.onReturnMenu) this.callbacks.onReturnMenu();
      show('title');
    };

    this.root.querySelector('#btn-replay').onclick = () => {
      this.hideEndOverlay();
      if (this.callbacks.onReplay) this.callbacks.onReplay();
    };

    this.root.querySelector('#btn-launch-battle-now')?.addEventListener('click', () => {
      this.callbacks.onLaunchBattleNow?.();
    });

    this.root.querySelector('#btn-engage-target').onclick = () => {
      if (this.callbacks.onConfirmTarget) this.callbacks.onConfirmTarget();
    };

    this.root.querySelector('#btn-surrender')?.addEventListener('click', () => {
      const tutorial = !this.root.querySelector('#tutorial-banner')?.classList.contains('hidden');
      const msg = tutorial
        ? 'Leave the training ground and return to the main menu?'
        : 'Surrender this battle and return to the main menu?';
      if (!confirm(msg)) return;
      this.callbacks.onSurrender?.();
    });

    if (this.callbacks.onMenuVisible) this.callbacks.onMenuVisible(true);
  }

  openGuide(fromMenu = false) {
    this.guideFromMenu = fromMenu;
    const overlay = this.root.querySelector('#overlay-guide');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.classList.toggle('guide-from-menu', fromMenu);
    if (fromMenu) {
      this.root.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
    }
  }

  closeGuide() {
    const overlay = this.root.querySelector('#overlay-guide');
    if (overlay) overlay.classList.add('hidden');
    if (this.guideFromMenu) {
      this.root.querySelector('#screen-title')?.classList.remove('hidden');
    }
    this.guideFromMenu = false;
  }

  showHUD(faction, mapDef, gameMode = 'campaign', options = {}) {
    this.closeGuide();
    if (this.callbacks.onMenuVisible) this.callbacks.onMenuVisible(false);
    this.root.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
    this.root.querySelector('#hud').classList.remove('hidden');
    this.root.querySelector('#hud-faction').textContent = faction.name;
    const diffLabel = options.difficulty ? ` · ${options.difficulty.name}` : '';
    this.root.querySelector('#hud-map').textContent = `${mapDef.name}${diffLabel}`;

    const tutorial = gameMode === 'tutorial';
    const assault = gameMode === 'assault';
    const clearance = gameMode === 'clearance';
    const banner = this.root.querySelector('#tutorial-banner');
    if (banner) banner.classList.toggle('hidden', !tutorial);

    const assaultBanner = this.root.querySelector('#assault-banner');
    if (assaultBanner) assaultBanner.classList.toggle('hidden', !assault);

    const clearanceBanner = this.root.querySelector('#clearance-banner');
    if (clearanceBanner) clearanceBanner.classList.toggle('hidden', !clearance);

    const surrenderBtn = this.root.querySelector('#btn-surrender');
    if (surrenderBtn) {
      surrenderBtn.textContent = tutorial ? 'Leave Training' : 'Surrender';
      surrenderBtn.title = tutorial
        ? 'Leave practice and return to the main menu'
        : 'Surrender and return to the main menu';
    }

    const hint = this.root.querySelector('#hud-hint');
    if (hint) {
      if (tutorial) {
        this._defaultHudHint =
          'Tutorial: practice vs static HQ — train all unit types, capture neutral points';
      } else if (clearance) {
        this._defaultHudHint =
          'Clear Defenses: wipe out all enemy units · capture points for supplies · enemy holds the line';
      } else if (assault) {
        this._defaultHudHint =
          'Assault: capture & hold the frontline (45s) · Shift+RMB fire support · Flank points earn supplies';
      } else {
        this._defaultHudHint =
          'WASD pan · ↑↓ move in/out · ←→ rotate view · Wheel zoom · LMB/RMB orders · Alt+click cover';
      }
      hint.textContent = this._defaultHudHint;
      hint.classList.remove('hud-hint-opening');
    }

    if (assault && options.assaultRole) {
      const roleLabel = this.root.querySelector('#assault-role-label');
      if (roleLabel) {
        roleLabel.textContent =
          options.assaultRole === 'attack' ? 'You are attacking' : 'You are defending';
      }
    }

    const types = getProducibleUnits(faction);
    const btns = this.root.querySelector('#produce-btns');
    btns.innerHTML = types
      .map((type) => {
        const def = faction.units[type];
        const short = PRODUCE_LABELS[type] ?? type;
        return `
        <button class="produce-btn interactive" data-type="${type}" title="${def.name} — ${def.designation}">
          <span class="produce-name">${short}</span>
          <span class="produce-cost">${def.cost}</span>
        </button>
      `;
      })
      .join('');

    btns.querySelectorAll('.produce-btn').forEach((btn) => {
      btn.onclick = () => {
        if (this.callbacks.onProduce) this.callbacks.onProduce(btn.dataset.type);
      };
    });

    this.renderFireSupportButtons();
    this._bindUnitRoster();
  }

  _bindUnitRoster() {
    if (this._unitRosterBound) return;
    const roster = this.root.querySelector('#unit-roster');
    const list = this.root.querySelector('#unit-roster-list');
    if (!roster || !list) return;
    this._unitRosterBound = true;

    const handlePick = (e) => {
      const btn = e.target.closest('.unit-roster-item');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      const id = Number(btn.dataset.unitId);
      if (!Number.isFinite(id)) return;
      this.callbacks.onSelectUnit?.(id, e.shiftKey);
    };

    list.addEventListener('pointerdown', handlePick);
    roster.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.unit-roster-item')) handlePick(e);
    });
  }

  updateUnitRoster(units, selectedUnits = []) {
    const list = this.root.querySelector('#unit-roster-list');
    const panel = this.root.querySelector('#unit-roster');
    if (!list || !panel) return;

    const alive = (units ?? []).filter((u) => !u.dead);
    const selectedIds = new Set((selectedUnits ?? []).map((u) => u.id));

    if (alive.length === 0) {
      list.innerHTML = '<p class="unit-roster-empty">No units in the field</p>';
      return;
    }

    const sorted = [...alive].sort((a, b) => {
      const ta = a.type ?? '';
      const tb = b.type ?? '';
      if (ta !== tb) return ta.localeCompare(tb);
      return a.id - b.id;
    });

    list.innerHTML = sorted
      .map((u) => {
        const short = PRODUCE_LABELS[u.type] ?? u.type;
        const hpPct = Math.max(0, Math.round((u.hp / u.maxHp) * 100));
        const sel = selectedIds.has(u.id) ? ' selected' : '';
        const low = hpPct < 35 ? ' low-hp' : '';
        return `
        <button type="button" class="unit-roster-item${sel}${low}" data-unit-id="${u.id}" title="${u.name} — ${u.def?.designation ?? ''}">
          <span class="unit-roster-icon">${getUnitIconMarkup(u.type)}</span>
          <span class="unit-roster-meta">
            <span class="unit-roster-name">${short}</span>
            <span class="unit-roster-hp">${hpPct}%</span>
          </span>
        </button>
      `;
      })
      .join('');
  }

  renderFireSupportButtons() {
    const wrap = this.root.querySelector('#firesupport-btns');
    if (!wrap) return;
    wrap.innerHTML = FIRE_SUPPORT_LIST.map(
      (fs) => `
      <button type="button" class="firesupport-btn interactive" data-fs="${fs.id}" title="${fs.label}">
        <span class="fs-name">${fs.short}</span>
        <span class="fs-cd" data-cd="${fs.id}">Ready</span>
      </button>
    `
    ).join('');

    wrap.querySelectorAll('.firesupport-btn').forEach((btn) => {
      btn.onclick = () => {
        if (this.callbacks.onFireSupport) this.callbacks.onFireSupport(btn.dataset.fs);
      };
    });
  }

  updateFireSupport(manager) {
    const panel = this.root.querySelector('#firesupport-panel');
    const hint = this.root.querySelector('#firesupport-hint');
    if (!panel || !manager) return;

    panel.classList.toggle('targeting', !!manager.pending);

    for (const fs of FIRE_SUPPORT_LIST) {
      const cdEl = panel.querySelector(`[data-cd="${fs.id}"]`);
      const btn = panel.querySelector(`[data-fs="${fs.id}"]`);
      const rem = manager.getCooldownRemaining(fs.id);
      const ready = manager.isReady(fs.id);
      const armed = manager.pending === fs.id;

      if (cdEl) {
        cdEl.textContent = ready ? 'Ready' : `${Math.ceil(rem)}s`;
      }
      if (btn) {
        btn.disabled = !ready && !armed;
        btn.classList.toggle('armed', armed);
        btn.classList.toggle('on-cooldown', !ready);
      }
    }

    if (hint) {
      if (manager.pending === 'strafe') {
        hint.textContent = 'Click the map to call fighter strafe (Esc to cancel)';
      } else if (manager.pending === 'barrage') {
        hint.textContent = 'Click the map for artillery barrage (Esc to cancel)';
      } else {
        hint.textContent = 'Call off-map support — each strike has a long cooldown';
      }
    }
  }

  hideHUD() {
    this.closeGuide();
    this.root.querySelector('#hud').classList.add('hidden');
    const panel = this.root.querySelector('#firesupport-panel');
    if (panel) panel.classList.remove('targeting');
  }

  updateArmyStats(playerAlive, enemyAlive, opts = {}) {
    const el = this.root.querySelector('#hud-army');
    if (!el) return;

    const tutorial = opts.tutorial === true;
    const clearance = opts.clearance === true;
    const assault = opts.assault ?? null;
    const wipeHint = opts.wipeHint ?? null;

    if (wipeHint) {
      el.textContent = wipeHint;
      el.classList.add('hud-army-wiped');
      return;
    }

    el.classList.remove('hud-army-wiped');
    if (tutorial) {
      el.textContent = `Your forces: ${playerAlive} · Practice mode`;
    } else if (clearance) {
      el.textContent = `Your forces: ${playerAlive} · Defenders left: ${enemyAlive}`;
    } else if (assault) {
      const you = assault.playerRole === 'attack' ? 'Assault' : 'Garrison';
      const foe = assault.playerRole === 'attack' ? 'Defenders' : 'Attackers';
      el.textContent = `${you}: ${playerAlive} · ${foe}: ${enemyAlive}`;
    } else {
      el.textContent = `Your forces: ${playerAlive} · Enemy: ${enemyAlive}`;
    }
  }

  updateResources(supplies, capturePoints) {
    const el = this.root.querySelector('#hud-resources');
    if (el) el.textContent = String(supplies);

    const owned = capturePoints?.filter((p) => p.owner === 'player').length ?? 0;
    const total = capturePoints?.length ?? 0;
    const label = this.root.querySelector('.resource-label');
    if (label) label.textContent = `Supplies (+${owned}/${total} pts)`;
  }

  updateDeployCountdown(phase) {
    const banner = this.root.querySelector('#opening-countdown');
    const title = this.root.querySelector('#opening-countdown-title');
    const value = this.root.querySelector('#opening-countdown-value');
    const sub = this.root.querySelector('#opening-countdown-sub');
    const fill = this.root.querySelector('#opening-countdown-fill');
    const launchBtn = this.root.querySelector('#btn-launch-battle-now');
    if (!banner) return;

    if (!phase || phase.secondsLeft <= 0.05) {
      banner.classList.add('hidden');
      launchBtn?.classList.add('hidden');
      return;
    }

    const s = Math.max(1, Math.ceil(phase.secondsLeft));
    const pct = Math.min(100, Math.max(0, (phase.secondsLeft / phase.total) * 100));

    banner.classList.remove('hidden');
    if (title) title.textContent = phase.title ?? 'Quiet sector';
    if (value) value.textContent = String(s);
    if (sub) sub.textContent = phase.subtitle ?? '';
    if (fill) fill.style.width = `${pct}%`;
    if (launchBtn) {
      launchBtn.classList.toggle('hidden', phase.canLaunchEarly === false);
      launchBtn.disabled = !this.callbacks.onLaunchBattleNow;
    }
  }

  updateBattleOpening(secondsLeft) {
    const hint = this.root.querySelector('#hud-hint');
    if (!hint || !this._defaultHudHint) return;
    if (secondsLeft > 0.5) {
      const s = Math.ceil(secondsLeft);
      hint.textContent = `Staging only — ${s}s until combat (stay inside HQ ring)`;
      hint.classList.add('hud-hint-opening');
    } else {
      hint.textContent = this._defaultHudHint;
      hint.classList.remove('hud-hint-opening');
    }
  }

  updateCapturePoints(points) {
    const bar = this.root.querySelector('#capture-bar');
    if (!bar || !points?.length) return;

    bar.innerHTML = points
      .map((p) => {
        const status = p.getCaptureStatus?.() ?? {
          contested: false,
          pct: Math.round(p.progress * 100),
          team: p.owner,
          label: p.name,
          phase: 'idle',
        };
        let state =
          p.owner === 'player' ? 'owned-player' : p.owner === 'enemy' ? 'owned-enemy' : 'neutral';
        if (status.contested) {
          state = status.team === 'player' ? 'capturing-player' : 'capturing-enemy';
        }
        const fl = p.isFrontline ? ' cp-frontline' : '';
        const tag = p.isFrontline ? ' ★' : '';
        const pct = status.pct;
        const barFill = status.contested
          ? `<span class="cp-progress-track"><span class="cp-progress-fill ${state}" style="width:${pct}%"></span></span>`
          : '';
        const statusText = status.contested ? status.label : `${pct}%`;
        return `<div class="cp-chip ${state}${fl}" title="${p.name} — ${status.label}">
          <span class="cp-chip-name">${p.name}${tag}</span>
          ${barFill}
          <span class="cp-chip-status">${statusText}</span>
        </div>`;
      })
      .join('');
  }

  _renderCoverBanner(units) {
    const el = this.root.querySelector('#selection-cover');
    if (!el) return;

    const covered = units
      .map((u) => ({ unit: u, cover: getCoverStatus(u) }))
      .filter((x) => x.cover.inCover);

    if (covered.length === 0) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }

    el.classList.remove('hidden');

    if (covered.length === 1) {
      const { unit, cover } = covered[0];
      el.className = `selection-cover cover-tier-${cover.tier}`;
      el.innerHTML = `
        <div class="cover-banner-inner">
          <span class="cover-banner-icon" aria-hidden="true">⛨</span>
          <div class="cover-banner-text">
            <strong class="cover-banner-title">${unit.name} — IN COVER</strong>
            <span class="cover-banner-sub">${cover.label} · ${cover.reduction}% damage reduction</span>
            <span class="cover-banner-detail">${cover.note}</span>
          </div>
        </div>
      `;
      return;
    }

    el.className = 'selection-cover cover-tier-mixed';
    const parts = covered.map(({ cover }) => `${cover.shortLabel} (${cover.reduction}%)`);
    el.innerHTML = `
      <div class="cover-banner-inner">
        <span class="cover-banner-icon" aria-hidden="true">⛨</span>
        <div class="cover-banner-text">
          <strong class="cover-banner-title">${covered.length} of ${units.length} in cover</strong>
          <span class="cover-banner-detail">${parts.join(' · ')}</span>
        </div>
      </div>
    `;
  }

  updateAssaultHUD(assault) {
    if (!assault) return;
    const hud = formatAssaultHud(assault);
    const obj = this.root.querySelector('#assault-objective');
    const timer = this.root.querySelector('#assault-timer');
    if (obj) obj.textContent = hud.objective;
    if (timer) timer.textContent = hud.timer;
  }

  updateProduction(game) {
    if (!game?.playerFaction) return;
    const resources = Math.floor(game.resources.player);
    const progress = game.production.getQueueProgress('player');
    const queue = game.production.getQueue('player');

    this.updateResources(resources, game.capturePoints);

    const qEl = this.root.querySelector('#queue-text');
    if (qEl) {
      if (progress) {
        const pct = Math.round((1 - progress.remaining / progress.total) * 100);
        qEl.textContent = `Building ${progress.def.name}… ${pct}% (${queue.length} queued)`;
      } else if (queue.length > 0) {
        qEl.textContent = `${queue.length} in queue`;
      } else {
        qEl.textContent = 'Queue empty — click to train';
      }
    }

    this.root.querySelectorAll('.produce-btn').forEach((btn) => {
      const type = btn.dataset.type;
      const def = game.playerFaction.units[type];
      if (!def) return;
      const can =
        game.production.canEnqueue('player', type, game.resources.player) && game.running;
      btn.disabled = !can;
      btn.querySelector('.produce-cost').textContent = def.cost;
    });
  }

  updateSelection(units, hoverTarget = null, hq = null) {
    const body = this.root.querySelector('#selection-body');
    const offer = this.root.querySelector('#target-offer');
    const offerLabel = this.root.querySelector('#target-offer-label');
    if (!body) return;

    const targetName = hoverTarget && !hoverTarget.dead ? TargetIndicators.getTargetLabel(hoverTarget) : null;
    if (offer) {
      offer.classList.toggle('hidden', !(units.length > 0 && targetName));
      if (offerLabel && targetName) offerLabel.textContent = `Target: ${targetName}`;
    }

    if (hq && !hq.dead) {
      this._renderCoverBanner([]);
      const teamLabel = hq.team === 'player' ? 'Your headquarters' : 'Enemy headquarters';
      body.innerHTML = `
        <h3 class="hq-selected-title">${hq.name ?? 'Headquarters'}</h3>
        <p class="hq-selected-meta">${teamLabel} · HP <strong>${Math.ceil(hq.hp)}</strong> / ${hq.maxHp}</p>
        <p class="hq-selected-hint">HQ selected — issue move orders to units, or attack enemy forces.</p>
      `;
      return;
    }

    if (units.length === 0) {
      body.innerHTML = `<h3>No selection</h3><p>Click or drag to select units. Click your HQ for status.</p>`;
      this._renderCoverBanner([]);
      return;
    }

    this._renderCoverBanner(units);

    if (units.length === 1) {
      const u = units[0];
      const rangeLabel = u.def.rangeMeters ? `${u.def.rangeMeters} m` : `${u.def.range * 10} m`;
      const orderLine = u.attackOrder
        ? u.attackOrder.isGround
          ? ' · Fire mission'
          : ` · Attacking <strong>${TargetIndicators.getTargetLabel(u.attackOrder)}</strong>`
        : '';
      const cover = getCoverStatus(u);
      const coverBlock = cover.inCover
        ? `<p class="unit-cover-status in-cover"><strong>In cover:</strong> ${cover.label} — takes only <strong>${Math.round(cover.mult * 100)}%</strong> of incoming damage (${cover.reduction}% reduction). Leave cover or destroy the position to lose protection.</p>`
        : u.def?.type === 'infantry' || u.def?.type === 'machineGun' || u.def?.type === 'sniper'
          ? '<p class="unit-cover-status exposed"><strong>Exposed</strong> — no cover bonus. Move into sandbags, hedges, or fighting pits.</p>'
          : '';
      body.innerHTML = `
        <h3>${u.name}${cover.inCover ? ' <span class="cover-tag">COVER</span>' : ''}</h3>
        <p>${u.def.designation} — HP ${Math.ceil(u.hp)}/${u.maxHp} · Range ${rangeLabel} · Dmg ${u.def.damage}${orderLine}</p>
        ${coverBlock}
      `;
      return;
    }

    const types = {};
    for (const u of units) types[u.type] = (types[u.type] || 0) + 1;
    const summary = Object.entries(types)
      .map(([t, n]) => `${n} ${PRODUCE_LABELS[t] ?? t}`)
      .join(', ');
    const attacking = units.filter((u) => u.attackOrder && !u.attackOrder.isGround && !u.attackOrder.dead);
    const uniqueTargets = [...new Set(attacking.map((u) => TargetIndicators.getTargetLabel(u.attackOrder)))];
    const orderNote =
      uniqueTargets.length === 1
        ? `<p class="selection-orders">Engaging: <strong>${uniqueTargets[0]}</strong></p>`
        : uniqueTargets.length > 1
          ? `<p class="selection-orders">Multiple targets (${uniqueTargets.length})</p>`
          : '';
    body.innerHTML = `<h3>${units.length} units selected</h3><p>${summary}</p>${orderNote}`;
  }

  showEndOverlay(victory, message, report, canReplay = false) {
    const overlay = this.root.querySelector('#overlay-end');
    if (!overlay) return;

    const titleEl = this.root.querySelector('#end-title');
    const msgEl = this.root.querySelector('#end-msg');
    const statsEl = this.root.querySelector('#end-stats');
    const replayBtn = this.root.querySelector('#btn-replay');

    overlay.classList.remove('hidden');
    if (titleEl) titleEl.textContent = victory ? 'Victory' : 'Defeat';
    if (msgEl) msgEl.textContent = message;

    if (statsEl && report) {
      this.updateEndStats(report);
    } else if (statsEl) {
      statsEl.classList.remove('hidden');
      statsEl.innerHTML = '<p class="end-stats-loading">Tallying casualties…</p>';
    }

    if (replayBtn) replayBtn.classList.toggle('hidden', !canReplay);
  }

  updateEndStats(report) {
    const statsEl = this.root.querySelector('#end-stats');
    if (!statsEl || !report) return;
    statsEl.classList.remove('hidden');
    statsEl.innerHTML = this.renderBattleReport(report);
  }

  renderBattleReport(report) {
    const col = (side, lines, total, hqLost, hqLabel) => {
      const rows =
        lines.length > 0
          ? lines
              .map((l) => `<li><span class="loss-type">${l.label}</span><span class="loss-n">${l.count}</span></li>`)
              .join('')
          : '<li class="loss-none">No unit losses</li>';
      const hqRow = hqLost
        ? `<li class="loss-hq"><span class="loss-type">${hqLabel}</span><span class="loss-n">Destroyed</span></li>`
        : '';
      return `
        <div class="end-stats-col">
          <h3>${side}</h3>
          <p class="end-stats-total">${total} unit${total === 1 ? '' : 's'} lost</p>
          <ul class="end-stats-list">${rows}${hqRow}</ul>
        </div>
      `;
    };

    return `
      <h3 class="end-stats-heading">Battle casualties</h3>
      <div class="end-stats-grid">
        ${col(report.playerName, report.playerLines, report.playerTotal, report.playerHqLost, 'Headquarters')}
        ${col(report.enemyName, report.enemyLines, report.enemyTotal, report.enemyHqLost, report.tutorial ? 'Practice HQ' : 'Headquarters')}
      </div>
    `;
  }

  hideEndOverlay() {
    this.root.querySelector('#overlay-end').classList.add('hidden');
    const statsEl = this.root.querySelector('#end-stats');
    if (statsEl) {
      statsEl.classList.add('hidden');
      statsEl.innerHTML = '';
    }
  }

  getSelectBoxEl() {
    return this.root.querySelector('#select-box');
  }
}