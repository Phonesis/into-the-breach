import { FACTION_LIST } from '../data/factions.js';
import { MAP_LIST } from '../data/maps.js';
import { MAP_SIZE_LIST, formatMapHudLabel } from '../data/mapSizes.js';
import { GAME_MODE_LIST, ASSAULT_ROLE_LIST, getProducibleUnits } from '../data/gameModes.js';
import { DIFFICULTY_LIST, DEFAULT_DIFFICULTY } from '../data/difficulty.js';
import { FIRE_SUPPORT_LIST } from '../data/fireSupport.js';
import { formatAssaultHud } from '../game/AssaultMode.js';
import { TargetIndicators } from '../visual/TargetIndicators.js';
import { getCoverStatus } from '../game/CoverSystem.js';
import { renderGameGuideHtml } from '../data/gameGuide.js';
import {
  DEFENSE_TYPE_LIST,
  DEFENSE_UPGRADES,
  DEFENSE_TYPES,
  TD_MAX_ARTILLERY_PITS,
  getArtilleryPitCount,
} from '../data/towerDefense.js';
import { formatTowerDefenseHud } from '../game/TowerDefenseMode.js';
import { getUnitIconMarkup } from './unitIcons.js';
import { TabletCameraControls } from './TabletCameraControls.js';
import { isTabletLikeDevice } from '../lib/tabletDetect.js';

const PRODUCE_LABELS = {
  infantry: 'Inf',
  medic: 'Medic',
  engineer: 'Eng',
  machineGun: 'MG',
  sniper: 'Snp',
  mortar: 'Mrt',
  antiTankGun: 'AT',
  armoredCar: 'AC',
  tank: 'Tk',
  superHeavyTank: 'Super Heavy Tank',
  artillery: 'Arty',
};

function hpPercent(hp, maxHp) {
  return Math.max(0, Math.min(100, Math.round((hp / Math.max(maxHp, 1)) * 100)));
}

function hpTier(pct) {
  if (pct < 30) return 'critical';
  if (pct < 60) return 'warn';
  return 'ok';
}

function hpBarMarkup(hp, maxHp, { showValues = true, compact = false } = {}) {
  const pct = hpPercent(hp, maxHp);
  const tier = hpTier(pct);
  const valueLine = showValues
    ? `<span class="hp-bar-values">${Math.ceil(hp)} / ${maxHp}</span>`
    : '';
  return `
    <div class="hp-bar-wrap${compact ? ' hp-bar-wrap--compact' : ''}">
      <div class="hp-bar-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <span class="hp-bar-fill hp-bar-fill--${tier}" style="width:${pct}%"></span>
      </div>
      ${valueLine}
    </div>
  `;
}

const UNIT_FIELD_ICONS_KEY = 'ww2-rts-unit-field-icons';
const FRONTLINE_VISIBLE_KEY = 'ww2-rts-frontline-visible';

const FACTION_ROSTER_LABELS = {
  infantry: 'Infantry',
  medic: 'Medic section',
  engineer: 'Engineer section',
  machineGun: 'MG team',
  sniper: 'Sniper',
  mortar: 'Mortar',
  antiTankGun: 'AT gun',
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
    this.selectedMapSize = 'medium';
    this.selectedGameMode = null;
    this.selectedAssaultRole = null;
    this.selectedDifficulty = DEFAULT_DIFFICULTY;
    this._hudTowerDefense = false;
    this.showUnitFieldIcons = localStorage.getItem(UNIT_FIELD_ICONS_KEY) !== '0';
    this.showFrontline = localStorage.getItem(FRONTLINE_VISIBLE_KEY) !== '0';
    this.render();
    this.tabletCamera = new TabletCameraControls(this.root);
    this._syncFieldIconToggle();
    this._syncFrontlineToggle();
  }

  /** Nation-specific art on the faction picker (hover / selection). */
  updateFactionScreenBg(factionId = null) {
    const screen = this.root.querySelector('#screen-faction');
    if (!screen) return;
    screen.classList.remove('faction-bg-germany', 'faction-bg-usa', 'faction-bg-uk', 'faction-bg-russia');
    if (factionId && ['germany', 'usa', 'uk', 'russia'].includes(factionId)) {
      screen.classList.add(`faction-bg-${factionId}`);
    }
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
          <p>Campaign, Last Stand, Clear Defenses, Training Ground, or Assault & Defend.</p>
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
          <p>Infantry, MG teams, snipers, mortars, AT guns, armored cars, tanks, and artillery.</p>
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
          <div class="map-size-block" id="map-size-block">
            <h2>Map Size</h2>
            <div class="map-size-grid" id="map-size-grid"></div>
          </div>
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
            <div class="td-banner hidden" id="td-banner">
              <span class="td-wave" id="td-wave-label">Wave 0 / 12</span>
              <span class="td-phase" id="td-phase-label">Prepare defenses</span>
            </div>
            <button
              type="button"
              class="frontline-toggle interactive hidden"
              id="btn-toggle-frontline"
              title="Show red frontline on the map"
              aria-pressed="true"
            >
              <span class="frontline-toggle-swatch" aria-hidden="true"></span>
              <span class="frontline-toggle-label">Frontline</span>
            </button>
            <div class="laststand-banner hidden" id="laststand-banner">
              Last Stand — deploy your army, then fight to the last unit. No HQ or reinforcements.
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
              <span class="hud-cheat-badge hidden" id="hud-cheat-badge" title="Cheat mode (iddqd or ?cheat=1)">CHEAT</span>
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

        <div id="td-wave-countdown" class="td-wave-countdown hidden" aria-live="polite">
          <div class="td-wave-countdown-card" id="td-wave-countdown-card">
            <p class="td-wave-countdown-title" id="td-wave-countdown-title">Prepare defenses</p>
            <p class="td-wave-countdown-value" id="td-wave-countdown-value">30</p>
            <p class="td-wave-countdown-sub" id="td-wave-countdown-sub">Wave 1 / 12</p>
            <div class="td-wave-countdown-track">
              <div class="td-wave-countdown-fill" id="td-wave-countdown-fill"></div>
            </div>
            <button
              type="button"
              class="btn btn-primary td-wave-countdown-skip interactive"
              id="btn-td-skip-wave-countdown"
            >
              Start Wave Now
            </button>
          </div>
        </div>

        <div class="capture-bar" id="capture-bar"></div>

        <div id="tablet-camera" class="tablet-camera hidden interactive" aria-label="Camera controls">
          <p class="tablet-camera-label">Camera</p>
          <div class="tablet-camera-actions" role="group" aria-label="Battle orders">
            <button
              type="button"
              class="tablet-cam-btn tablet-mode-btn"
              id="btn-tablet-target"
              aria-pressed="false"
              title="Tap an enemy to highlight — tap again or Engage to attack"
            >
              Target
            </button>
            <button
              type="button"
              class="tablet-cam-btn tablet-mode-btn"
              id="btn-tablet-fire"
              aria-pressed="false"
              title="Tap ground or cover to fire (like Shift + click)"
            >
              Fire
            </button>
          </div>
          <div class="tablet-camera-rotate">
            <button type="button" class="tablet-cam-btn" data-cam="rotateLeft" aria-label="Rotate view left">⟲</button>
            <button type="button" class="tablet-cam-btn" data-cam="rotateRight" aria-label="Rotate view right">⟳</button>
          </div>
          <div class="tablet-camera-pad" role="group" aria-label="Pan camera">
            <button type="button" class="tablet-cam-btn pad-up" data-cam="panForward" aria-label="Pan forward">▲</button>
            <button type="button" class="tablet-cam-btn pad-left" data-cam="panLeft" aria-label="Pan left">◀</button>
            <button type="button" class="tablet-cam-btn pad-center" tabindex="-1" aria-hidden="true">◎</button>
            <button type="button" class="tablet-cam-btn pad-right" data-cam="panRight" aria-label="Pan right">▶</button>
            <button type="button" class="tablet-cam-btn pad-down" data-cam="panBack" aria-label="Pan back">▼</button>
          </div>
          <div class="tablet-camera-zoom" role="group" aria-label="Zoom">
            <button type="button" class="tablet-cam-btn" data-cam="zoomIn" aria-label="Move camera in">＋</button>
            <button type="button" class="tablet-cam-btn" data-cam="zoomOut" aria-label="Move camera out">－</button>
          </div>
        </div>

        <aside class="unit-roster interactive" id="unit-roster" aria-label="Your forces">
          <h3 class="unit-roster-title">Forces</h3>
          <button
            type="button"
            class="unit-roster-toggle interactive"
            id="btn-toggle-field-icons"
            title="Show unit type icons above your forces on the battlefield"
            aria-pressed="true"
          >
            <span class="unit-roster-toggle-icon" aria-hidden="true">${getUnitIconMarkup('infantry')}</span>
            <span class="unit-roster-toggle-label">Field icons</span>
          </button>
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
              <p class="target-offer-hint" id="target-offer-hint">Or left-click the highlighted enemy</p>
            </div>
            <div class="fire-mission-actions hidden" id="fire-mission-actions">
              <button type="button" class="btn btn-cancel-fire interactive" id="btn-cancel-fire-missions">
                Cancel fire missions
              </button>
            </div>
            <div class="engineer-build-actions hidden" id="engineer-build-actions">
              <button type="button" class="btn btn-primary interactive" id="btn-build-sandbags">
                Build sandbags
              </button>
              <p class="engineer-build-hint" id="engineer-build-hint">
                Heavy cover for infantry — engineer must be within ~24 m. Esc to cancel.
              </p>
            </div>
          </div>
          <div class="production-panel interactive hidden" id="production-panel">
            <h3>Reinforcements</h3>
            <div class="produce-btns" id="produce-btns"></div>
            <p class="queue-text" id="queue-text">Queue empty</p>
          </div>
          <div class="defense-panel interactive hidden" id="defense-panel">
            <h3>Defenses</h3>
            <div class="defense-btns" id="defense-btns"></div>
            <p class="defense-selected" id="defense-selected"></p>
            <button type="button" class="btn btn-primary defense-upgrade-btn interactive hidden" id="btn-defense-upgrade">
              Upgrade emplacement
            </button>
            <p class="defense-hint" id="defense-hint">Click a structure, then click behind the frontline to build.</p>
          </div>
          <div class="firesupport-panel interactive" id="firesupport-panel">
            <h3>Fire Support</h3>
            <div class="firesupport-btns" id="firesupport-btns"></div>
            <p class="firesupport-hint" id="firesupport-hint">Off-map assets on cooldown</p>
          </div>
          <p class="hud-hint" id="hud-hint">LMB select · Shift+LMB fire at ground or cover · RMB move/attack</p>
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
    this.renderMapSizes();
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

  renderMapSizes() {
    const grid = this.root.querySelector('#map-size-grid');
    if (!grid) return;
    grid.innerHTML = MAP_SIZE_LIST.map((preset) => {
      const selected = preset.id === this.selectedMapSize;
      return `
      <button type="button" class="card-btn interactive map-size-card${selected ? ' selected' : ''}" data-id="${preset.id}">
        <span class="name">${preset.name}</span>
        <span class="meta">${preset.subtitle}</span>
      </button>
    `;
    }).join('');
  }

  bind() {
    const menuScreens = new Set(['title', 'mode', 'assault-role', 'faction', 'map']);

    const show = (id) => {
      this.root.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
      const el = this.root.querySelector(`#screen-${id}`);
      if (el) el.classList.remove('hidden');
      if (id === 'faction') this.updateFactionScreenBg(this.selectedFaction);
      if (this.callbacks.onMenuVisible) {
        this.callbacks.onMenuVisible(menuScreens.has(id));
      }
    };

    this.root.querySelector('#btn-start').onclick = () => show('mode');
    this.root.querySelector('#btn-guide-title').onclick = () => this.openGuide(true);
    this.root.querySelector('#btn-guide-hud')?.addEventListener('click', () => this.openGuide(false));
    this.root.querySelector('#btn-toggle-field-icons')?.addEventListener('click', () => {
      this.setUnitFieldIconsEnabled(!this.showUnitFieldIcons);
      if (this.callbacks.onToggleUnitFieldIcons) {
        this.callbacks.onToggleUnitFieldIcons(this.showUnitFieldIcons);
      }
    });
    this.root.querySelector('#btn-toggle-frontline')?.addEventListener('click', () => {
      this.setFrontlineVisible(!this.showFrontline);
      if (this.callbacks.onToggleFrontline) {
        this.callbacks.onToggleFrontline(this.showFrontline);
      }
    });
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
      btn.addEventListener('mouseenter', () => this.updateFactionScreenBg(btn.dataset.id));
      btn.addEventListener('mouseleave', () => this.updateFactionScreenBg(this.selectedFaction));
      btn.onclick = () => {
        this.root.querySelectorAll('.faction-card').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedFaction = btn.dataset.id;
        this.updateFactionScreenBg(this.selectedFaction);
        this.root.querySelector('#btn-to-maps').disabled = false;
      };
    });

    this.root.querySelector('#btn-to-maps').onclick = () => {
      this.updateDifficultyPanel();
      this.renderMapSizes();
      show('map');
    };

    this.root.querySelector('#map-size-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.map-size-card');
      if (!btn) return;
      this.root.querySelectorAll('.map-size-card').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      this.selectedMapSize = btn.dataset.id;
    });

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
          mapSize: this.selectedMapSize ?? 'medium',
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

    this.root.querySelector('#btn-td-skip-wave-countdown')?.addEventListener('click', () => {
      this.callbacks.onSkipTowerDefenseWave?.();
    });

    this.root.querySelector('#btn-engage-target').onclick = () => {
      if (this.callbacks.onConfirmTarget) this.callbacks.onConfirmTarget();
    };

    this.root.querySelector('#btn-build-sandbags')?.addEventListener('click', () => {
      this.callbacks.onArmSandbags?.();
    });

    const tabletTargetBtn = this.root.querySelector('#btn-tablet-target');
    const tabletFireBtn = this.root.querySelector('#btn-tablet-fire');
    const stopTabletPointer = (e) => e.stopPropagation();
    for (const btn of [tabletTargetBtn, tabletFireBtn]) {
      btn?.addEventListener('pointerdown', stopTabletPointer);
    }
    tabletTargetBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = !tabletTargetBtn.classList.contains('is-active');
      this.setTabletTargetMode(on);
      if (this.callbacks.onTabletTargetMode) this.callbacks.onTabletTargetMode(on);
    });
    tabletFireBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = !tabletFireBtn.classList.contains('is-active');
      this.setTabletFireMode(on);
      if (this.callbacks.onTabletFireMode) this.callbacks.onTabletFireMode(on);
    });

    const cancelFireBtn = this.root.querySelector('#btn-cancel-fire-missions');
    const stopHudPointer = (e) => e.stopPropagation();
    cancelFireBtn?.addEventListener('pointerdown', stopHudPointer);
    cancelFireBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onCancelFireMissions?.();
    });

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
    this.root.querySelector('#hud-map').textContent = `${formatMapHudLabel(mapDef)}${diffLabel}`;

    const tutorial = gameMode === 'tutorial';
    const assault = gameMode === 'assault';
    const clearance = gameMode === 'clearance';
    const towerDefense = gameMode === 'towerDefense' || options.towerDefense;
    const lastStand = gameMode === 'lastStand' || options.lastStand;
    this._hudLastStand = lastStand;
    this._hudLastStandDeploy = lastStand;
    const banner = this.root.querySelector('#tutorial-banner');
    if (banner) banner.classList.toggle('hidden', !tutorial);

    const assaultBanner = this.root.querySelector('#assault-banner');
    if (assaultBanner) assaultBanner.classList.toggle('hidden', !assault);

    const clearanceBanner = this.root.querySelector('#clearance-banner');
    if (clearanceBanner) clearanceBanner.classList.toggle('hidden', !clearance);

    this.root.querySelector('#td-banner')?.classList.toggle('hidden', !towerDefense);
    this.root.querySelector('#td-wave-countdown')?.classList.add('hidden');
    this.root.querySelector('#laststand-banner')?.classList.toggle('hidden', !lastStand);
    this._hudTowerDefense = towerDefense;
    this._hudHasFrontline = assault || towerDefense;
    this.root.querySelector('#btn-toggle-frontline')?.classList.toggle('hidden', !this._hudHasFrontline);
    this._syncFrontlineToggle();
    this._setProductionPanelVisible(lastStand);
    this.root.querySelector('#firesupport-panel')?.classList.toggle('hidden', towerDefense || lastStand);
    this.root.querySelector('#unit-roster')?.classList.toggle('hidden', towerDefense);
    this.root.querySelector('#defense-panel')?.classList.toggle('hidden', !towerDefense);
    this.root.querySelector('#capture-bar')?.classList.toggle('hidden', towerDefense || lastStand);
    const prodTitle = this.root.querySelector('#production-panel h3');
    if (prodTitle) prodTitle.textContent = lastStand ? 'Deployment' : 'Reinforcements';

    const surrenderBtn = this.root.querySelector('#btn-surrender');
    if (surrenderBtn) {
      surrenderBtn.textContent = tutorial ? 'Leave Training' : 'Surrender';
      surrenderBtn.title = tutorial
        ? 'Leave practice and return to the main menu'
        : 'Surrender and return to the main menu';
    }

    const tabletOn = this.tabletCamera?.shouldEnable() ?? isTabletLikeDevice();
    this.tabletCamera?.setVisible(tabletOn);

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
      } else if (towerDefense) {
        this._defaultHudHint =
          'Tower Defence: build behind the frontline · LMB place · Barrage needs an Artillery Pit · hold 12 waves';
      } else if (lastStand) {
        this._defaultHudHint =
          'Last Stand: pick a unit, LMB on the map to place · enemy deploys in parallel · Begin Battle when ready';
      } else if (tabletOn) {
        this._defaultHudHint =
          'Tap to select · Target: tap enemy twice or Engage · Fire: tap ground/cover · Long-press = move/attack';
      } else {
        this._defaultHudHint =
          'WASD pan · ↑↓ move in/out · ←→ rotate view · Wheel zoom · LMB/RMB orders · Shift+LMB fire ground/cover';
      }
      hint.textContent = this._defaultHudHint;
      if (tabletOn && tutorial) {
        hint.textContent =
          'Tutorial: tap to select · Target/Fire buttons (camera pad) · long-press map to move/attack';
      } else if (tabletOn && lastStand) {
        hint.textContent =
          'Last Stand: tap unit, tap map to place · camera pad (right) · Begin Battle when ready';
      } else if (tabletOn && !hint.textContent.includes('camera pad')) {
        hint.textContent += ' · Camera pad (right)';
      }
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
          <span class="produce-icon" aria-hidden="true">${getUnitIconMarkup(type)}</span>
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
    this.renderDefenseButtons();
    this._bindUnitRoster();
    this._syncFieldIconToggle();
  }

  setUnitFieldIconsEnabled(on) {
    this.showUnitFieldIcons = !!on;
    localStorage.setItem(UNIT_FIELD_ICONS_KEY, on ? '1' : '0');
    this._syncFieldIconToggle();
  }

  _syncFieldIconToggle() {
    const btn = this.root.querySelector('#btn-toggle-field-icons');
    if (!btn) return;
    btn.classList.toggle('off', !this.showUnitFieldIcons);
    btn.setAttribute('aria-pressed', this.showUnitFieldIcons ? 'true' : 'false');
    btn.title = this.showUnitFieldIcons
      ? 'Hide unit type icons above your forces'
      : 'Show unit type icons above your forces';
  }

  setFrontlineVisible(on) {
    this.showFrontline = !!on;
    localStorage.setItem(FRONTLINE_VISIBLE_KEY, on ? '1' : '0');
    this._syncFrontlineToggle();
  }

  _syncFrontlineToggle() {
    const btn = this.root.querySelector('#btn-toggle-frontline');
    if (!btn) return;
    btn.classList.toggle('off', !this.showFrontline);
    btn.setAttribute('aria-pressed', this.showFrontline ? 'true' : 'false');
    btn.title = this.showFrontline
      ? 'Hide red frontline on the map'
      : 'Show red frontline on the map';
  }

  _setProductionPanelVisible(visible) {
    const panel = this.root.querySelector('#production-panel');
    if (!panel) return;
    const show = this._hudLastStand
      ? this._hudLastStandDeploy
      : !this._hudTowerDefense && visible;
    panel.classList.toggle('hidden', !show);
  }

  renderDefenseButtons() {
    const wrap = this.root.querySelector('#defense-btns');
    if (!wrap) return;
    wrap.innerHTML = DEFENSE_TYPE_LIST.map(
      (d) => `
      <button type="button" class="defense-btn interactive" data-id="${d.id}" title="${d.subtitle}">
        <span class="defense-name">${d.name}</span>
        <span class="defense-cost">${d.cost}</span>
      </button>
    `
    ).join('');
    wrap.innerHTML += `
      <button type="button" class="defense-btn interactive defense-btn-barrage" data-id="barrage" title="Requires Artillery Pit — click map to strike">
        <span class="defense-name">Barrage</span>
        <span class="defense-cost">CD</span>
      </button>`;
    wrap.querySelectorAll('.defense-btn').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.id;
        if (id === 'barrage') this.callbacks.onTowerDefenseBarrage?.();
        else this.callbacks.onPlaceDefense?.(id);
      };
    });

    const upgradeBtn = this.root.querySelector('#btn-defense-upgrade');
    upgradeBtn?.addEventListener('click', () => this.callbacks.onUpgradeDefense?.());
  }

  setPlacementCapture(active) {
    const layer = document.getElementById('placement-layer');
    if (!layer) return;
    layer.classList.toggle('hidden', !active);
    layer.classList.toggle('active', !!active);
    layer.setAttribute('aria-hidden', active ? 'false' : 'true');
  }

  updateDefenses(game) {
    const isTd = game?.gameMode === 'towerDefense' || !!game?.towerDefense;
    if (!isTd || !game.defenses) return;
    const pts = Math.floor(game.resources.player);
    const label = this.root.querySelector('.resource-label');
    if (label) label.textContent = 'Defense pts';
    const resEl = this.root.querySelector('#hud-resources');
    if (resEl) resEl.textContent = String(pts);

    const selected = game.defenses.getSelected();
    const selEl = this.root.querySelector('#defense-selected');
    const upgradeBtn = this.root.querySelector('#btn-defense-upgrade');
    const path = selected ? DEFENSE_UPGRADES[selected.typeId] : null;
    const nextDef = path ? DEFENSE_TYPES[path.next] : null;

    if (selEl) {
      if (selected) {
        const cal = selected.def.caliber ? ` · ${selected.def.caliber} mm` : '';
        const hpPct = Math.round((selected.hp / selected.maxHp) * 100);
        selEl.textContent = `${selected.def.name}${cal} — ${hpPct}% HP (${selected.hp}/${selected.maxHp})`;
      } else {
        selEl.textContent = '';
      }
    }

    if (upgradeBtn) {
      const show = selected && path && nextDef;
      upgradeBtn.classList.toggle('hidden', !show);
      if (show) {
        upgradeBtn.textContent = `Upgrade → ${nextDef.name} (${path.cost} pts)`;
        upgradeBtn.disabled = pts < path.cost;
      }
    }

    const pending = game.defenses.getPending();
    const hint = this.root.querySelector('#defense-hint');
    if (hint) {
      if (pending === 'barrage') {
        hint.textContent = 'Barrage armed — click the assault side of the map to strike.';
      } else if (pending) {
        const def = DEFENSE_TYPE_LIST.find((d) => d.id === pending);
        hint.textContent = `Placing ${def?.name ?? pending} — click your side of the frontline. Esc to cancel.`;
      } else if (selected && path) {
        hint.textContent = 'Selected emplacement — use Upgrade or click elsewhere to deselect.';
      } else {
        hint.textContent =
          'LMB place on your side of the frontline · LMB emplacement to select & upgrade · Guns auto-fire.';
      }
    }

    this.root.querySelectorAll('.defense-btn').forEach((btn) => {
      const id = btn.dataset.id;
      if (id === 'barrage') {
        const ready =
          game.defenses.hasArtillery() && game.defenses.barrageCooldown <= 0;
        const cdMax = game.defenses.getEffectiveBarrageCooldown();
        btn.disabled = !ready && pending !== 'barrage';
        btn.classList.toggle('selected', pending === 'barrage');
        const pitCount = getArtilleryPitCount(game.defenses.entries);
        btn.title =
          pitCount > 0
            ? `Artillery barrage — ${cdMax}s cooldown (${pitCount} pit${pitCount === 1 ? '' : 's'})`
            : 'Requires Artillery Pit — click map to strike';
        const costEl = btn.querySelector('.defense-cost');
        if (costEl) {
          costEl.textContent =
            game.defenses.barrageCooldown > 0
              ? `${Math.ceil(game.defenses.barrageCooldown)}s`
              : `${cdMax}s`;
        }
        return;
      }
      const def = DEFENSE_TYPE_LIST.find((d) => d.id === id);
      const atCap = id === 'artillery' && game.defenses.isArtilleryPitCapReached();
      btn.disabled = !def || pts < def.cost || atCap;
      if (id === 'artillery') {
        const pitCount = getArtilleryPitCount(game.defenses.entries);
        btn.title = atCap
          ? `Maximum ${TD_MAX_ARTILLERY_PITS} artillery pits`
          : `${def.subtitle} (${pitCount}/${TD_MAX_ARTILLERY_PITS})`;
      }
      btn.classList.toggle('selected', pending === id);
    });
  }

  updateTowerDefense(game) {
    const hud = formatTowerDefenseHud(game?.towerDefense);
    if (!hud) return;
    const waveEl = this.root.querySelector('#td-wave-label');
    const phaseEl = this.root.querySelector('#td-phase-label');
    if (waveEl) waveEl.textContent = `Wave ${hud.wave} / ${hud.maxWaves}`;
    if (phaseEl) phaseEl.textContent = hud.phaseLabel;

    const countdown = this.root.querySelector('#td-wave-countdown');
    const card = this.root.querySelector('#td-wave-countdown-card');
    const title = this.root.querySelector('#td-wave-countdown-title');
    const value = this.root.querySelector('#td-wave-countdown-value');
    const sub = this.root.querySelector('#td-wave-countdown-sub');
    const fill = this.root.querySelector('#td-wave-countdown-fill');
    const skipBtn = this.root.querySelector('#btn-td-skip-wave-countdown');
    if (!countdown) return;

    const showCountdown =
      this._hudTowerDefense && hud.phase === 'prepare' && hud.secondsLeft > 0.05;
    countdown.classList.toggle('hidden', !showCountdown);
    if (!showCountdown) {
      card?.classList.remove('td-wave-countdown-urgent');
      return;
    }

    const s = Math.max(1, Math.ceil(hud.secondsLeft));
    const pct = Math.min(100, Math.max(0, hud.prepareProgress * 100));
    if (title) title.textContent = hud.countdownTitle;
    if (value) value.textContent = String(s);
    if (sub) sub.textContent = hud.countdownSubtitle;
    if (fill) fill.style.width = `${pct}%`;
    card?.classList.toggle('td-wave-countdown-urgent', s <= 5);
    if (skipBtn) {
      skipBtn.disabled = !this.callbacks.onSkipTowerDefenseWave;
    }
  }

  showEngineerBuildHint(message) {
    const hint = this.root.querySelector('#engineer-build-hint');
    if (!hint || !message) return;
    hint.textContent = message;
    hint.classList.add('engineer-build-hint-error');
    clearTimeout(this._engineerBuildHintTimer);
    this._engineerBuildHintTimer = setTimeout(() => {
      hint.classList.remove('engineer-build-hint-error');
      const actions = this.root.querySelector('#engineer-build-actions');
      if (actions && !actions.classList.contains('hidden')) {
        hint.textContent =
          'Heavy cover for infantry — engineer must be within ~24 m. Esc to cancel.';
      }
    }, 3200);
  }

  updateEngineerBuild(game) {
    const panel = this.root.querySelector('#engineer-build-actions');
    const btn = this.root.querySelector('#btn-build-sandbags');
    const hint = this.root.querySelector('#engineer-build-hint');
    if (!panel || !btn) return;

    const canUse = game?.engineerSandbags?.canUse?.() ?? false;
    const selectedEngineers =
      game?.units?.filter(
        (u) =>
          u.selected &&
          u.team === 'player' &&
          !u.dead &&
          !u.surrendered &&
          u.def?.type === 'engineer'
      ) ?? [];
    const freeEngineers = selectedEngineers.filter((u) => !u._sandbagSite);
    const show = canUse && selectedEngineers.length > 0;

    panel.classList.toggle('hidden', !show);
    if (!show) return;

    const pending = !!game.engineerSandbags.getPending();
    btn.classList.toggle('btn-armed', pending);
    btn.textContent = pending ? 'Placing sandbags…' : 'Build sandbags';

    if (hint && !hint.classList.contains('engineer-build-hint-error')) {
      if (pending) {
        hint.textContent = 'Click the map within ~24 m of your engineer. Esc to cancel.';
      } else if (freeEngineers.length === 0) {
        hint.textContent = 'Selected engineer is already building sandbags.';
      } else {
        hint.textContent =
          'Heavy cover for infantry — engineer must be within ~24 m. Esc to cancel.';
      }
    }
  }

  showDefensePlacementHint(message, game = null) {
    const hint = this.root.querySelector('#defense-hint');
    if (!hint || !message) return;
    hint.textContent = message;
    hint.classList.add('defense-hint-error');
    clearTimeout(this._defenseHintTimer);
    this._defenseHintTimer = setTimeout(() => {
      hint.classList.remove('defense-hint-error');
      if (game?.towerDefense) this.updateDefenses(game);
    }, 2200);
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
        const hpPct = hpPercent(u.hp, u.maxHp);
        const tier = hpTier(hpPct);
        const sel = selectedIds.has(u.id) ? ' selected' : '';
        const low = hpPct < 35 ? ' low-hp' : '';
        return `
        <button type="button" class="unit-roster-item${sel}${low}" data-unit-id="${u.id}" title="${u.name} — ${u.def?.designation ?? ''}">
          <span class="unit-roster-icon">${getUnitIconMarkup(u.type)}</span>
          <span class="unit-roster-meta">
            <span class="unit-roster-name">${short}</span>
            <span class="unit-roster-hp-wrap">
              <span class="unit-roster-hp-bar"><span class="unit-roster-hp-fill unit-roster-hp-fill--${tier}" style="width:${hpPct}%"></span></span>
              <span class="unit-roster-hp">${hpPct}%</span>
            </span>
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

  getTabletCameraInput() {
    return this.tabletCamera?.getInput() ?? null;
  }

  setTabletTargetMode(on) {
    const btn = this.root.querySelector('#btn-tablet-target');
    if (!btn) return;
    btn.classList.toggle('is-active', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  setTabletFireMode(on) {
    const btn = this.root.querySelector('#btn-tablet-fire');
    if (!btn) return;
    btn.classList.toggle('is-active', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  hideHUD() {
    this.closeGuide();
    this.tabletCamera?.setVisible(false);
    this.callbacks.onTabletTargetMode?.(false);
    this.callbacks.onTabletFireMode?.(false);
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
    } else if (opts.towerDefense) {
      el.textContent = `Assault force: ${enemyAlive} · Defenses: ${opts.defenseCount ?? '—'}`;
    } else if (assault) {
      const you = assault.playerRole === 'attack' ? 'Assault' : 'Garrison';
      const foe = assault.playerRole === 'attack' ? 'Defenders' : 'Attackers';
      el.textContent = `${you}: ${playerAlive} · ${foe}: ${enemyAlive}`;
    } else {
      el.textContent = `Your forces: ${playerAlive} · Enemy: ${enemyAlive}`;
    }
  }

  updateResources(supplies, capturePoints, cheatMode = false) {
    const el = this.root.querySelector('#hud-resources');
    if (el) el.textContent = cheatMode ? '∞' : String(supplies);

    const owned = capturePoints?.filter((p) => p.owner === 'player').length ?? 0;
    const total = capturePoints?.length ?? 0;
    const label = this.root.querySelector('.resource-label');
    if (label) {
      label.textContent = cheatMode
        ? 'Supplies (unlimited)'
        : `Supplies (+${owned}/${total} pts)`;
    }
  }

  setCheatHud(active) {
    const badge = this.root.querySelector('#hud-cheat-badge');
    if (badge) badge.classList.toggle('hidden', !active);
    this.root.classList.toggle('cheat-mode-active', !!active);
  }

  showCheatToast(active) {
    const hint = this.root.querySelector('#hud-hint');
    if (!hint) return;
    const prev = hint.dataset.cheatRestore;
    if (active) {
      if (!prev) hint.dataset.cheatRestore = hint.textContent;
      hint.textContent =
        'Cheat mode ON — instant builds, unlimited supplies (iddqd to toggle off, or remove ?cheat=1 from the URL)';
      hint.classList.add('hud-hint-cheat');
    } else {
      hint.textContent = prev || hint.textContent;
      delete hint.dataset.cheatRestore;
      hint.classList.remove('hud-hint-cheat');
    }
  }

  updateLastStandDeploy(game) {
    if (!game?.lastStand) return;

    const banner = this.root.querySelector('#opening-countdown');
    const title = this.root.querySelector('#opening-countdown-title');
    const value = this.root.querySelector('#opening-countdown-value');
    const sub = this.root.querySelector('#opening-countdown-sub');
    const fill = this.root.querySelector('#opening-countdown-fill');
    const launchBtn = this.root.querySelector('#btn-launch-battle-now');
    const qEl = this.root.querySelector('#queue-text');
    const playerCount = game._playerAlive?.length ?? 0;
    const enemyCount = game._enemyAlive?.length ?? 0;
    const supplies = game.cheatMode ? '∞' : game.lastStand.supplies.player;

    if (game.lastStand.phase !== 'deploy') {
      banner?.classList.add('hidden');
      launchBtn?.classList.add('hidden');
      this._hudLastStandDeploy = false;
      this._setProductionPanelVisible(false);
      const hint = this.root.querySelector('#hud-hint');
      if (hint) {
        hint.textContent = 'Last Stand — no reinforcements · wipe out all enemy units to win';
        hint.classList.remove('hud-hint-opening');
      }
      return;
    }

    this._hudLastStandDeploy = true;
    this._setProductionPanelVisible(true);
    banner?.classList.remove('hidden');
    if (title) title.textContent = 'Deploy your forces';
    if (value) value.textContent = String(playerCount);
    if (sub) {
      sub.textContent = `${supplies} supplies left · ${enemyCount} enemy units placed · Esc cancels selection`;
    }
    if (fill) fill.style.width = '100%';
    if (launchBtn) {
      launchBtn.textContent = 'Begin Battle';
      launchBtn.classList.remove('hidden');
      launchBtn.disabled = playerCount === 0 || !this.callbacks.onLaunchBattleNow;
    }
    if (qEl) {
      const pending = game.lastStand.pendingType;
      qEl.textContent = pending
        ? `Placing ${game.playerFaction.units[pending]?.name ?? pending} — click the map`
        : 'Select a unit type, then click the map to deploy';
    }

    const resources = game.cheatMode ? '∞' : Math.floor(game.lastStand.supplies.player);
    const resEl = this.root.querySelector('#hud-resources');
    if (resEl) resEl.textContent = String(resources);

    this.root.querySelectorAll('.produce-btn').forEach((btn) => {
      const type = btn.dataset.type;
      const def = game.playerFaction?.units?.[type];
      if (!def) return;
      const can =
        game.cheatMode ||
        game.lastStand.supplies.player >= def.cost;
      btn.disabled = !can;
      btn.classList.toggle('armed', game.lastStand.pendingType === type);
      btn.querySelector('.produce-cost').textContent = game.cheatMode ? '—' : String(def.cost);
    });

    const hint = this.root.querySelector('#hud-hint');
    if (hint) {
      hint.textContent = this._defaultHudHint ?? hint.textContent;
      hint.classList.add('hud-hint-opening');
    }
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
    if (game.lastStand) {
      this.updateLastStandDeploy(game);
      return;
    }
    const resources = Math.floor(game.resources.player);
    const progress = game.production.getQueueProgress('player');
    const queue = game.production.getQueue('player');

    this.updateResources(resources, game.capturePoints, game.cheatMode);
    this.setCheatHud(game.cheatMode);

    const qEl = this.root.querySelector('#queue-text');
    if (qEl) {
      if (progress) {
        const pct =
          progress.total <= 0
            ? 100
            : Math.round((1 - progress.remaining / progress.total) * 100);
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
      btn.querySelector('.produce-cost').textContent = game.cheatMode ? '—' : String(def.cost);
    });
  }

  updateFireMissionControls(activeCount = 0) {
    const wrap = this.root.querySelector('#fire-mission-actions');
    const btn = this.root.querySelector('#btn-cancel-fire-missions');
    if (!wrap || !btn) return;
    const n = Math.max(0, activeCount | 0);
    wrap.classList.toggle('hidden', n === 0);
    btn.textContent = n === 1 ? 'Cancel fire mission' : `Cancel fire missions (${n})`;
  }

  updateSelection(units, hoverTarget = null, hq = null, game = null) {
    const body = this.root.querySelector('#selection-body');
    const offer = this.root.querySelector('#target-offer');
    const offerLabel = this.root.querySelector('#target-offer-label');
    if (!body) return;

    const showProduction =
      (this._hudLastStand && this._hudLastStandDeploy) ||
      (hq && !hq.dead && hq.team === 'player');
    this._setProductionPanelVisible(showProduction);

    const targetName = hoverTarget && !hoverTarget.dead ? TargetIndicators.getTargetLabel(hoverTarget) : null;
    const tabletOn = this.tabletCamera?.shouldEnable() ?? isTabletLikeDevice();
    const targetHint = this.root.querySelector('#target-offer-hint');
    if (offer) {
      offer.classList.toggle('hidden', !(units.length > 0 && targetName));
      if (offerLabel && targetName) offerLabel.textContent = `Target: ${targetName}`;
    }
    if (targetHint) {
      targetHint.textContent = tabletOn
        ? 'Tap enemy again or press Engage'
        : 'Or left-click the highlighted enemy';
    }

    if (hq && !hq.dead) {
      this._renderCoverBanner([]);
      const teamLabel = hq.team === 'player' ? 'Your headquarters' : 'Enemy headquarters';
      body.innerHTML = `
        <h3 class="hq-selected-title">${hq.name ?? 'Headquarters'}</h3>
        <p class="hq-selected-meta">${teamLabel}</p>
        ${hpBarMarkup(hq.hp, hq.maxHp)}
        <p class="hq-selected-hint">HQ selected — issue move orders to units, or attack enemy forces.</p>
      `;
      this.updateEngineerBuild(game);
      return;
    }

    if (units.length === 0) {
      body.innerHTML = `<h3>No selection</h3><p>Click or drag to select units. Click your HQ for status.</p>`;
      this._renderCoverBanner([]);
      this.updateEngineerBuild(game);
      return;
    }

    this._renderCoverBanner(units);

    if (units.length === 1) {
      const u = units[0];
      const rangeLabel = u.def.rangeMeters ? `${u.def.rangeMeters} m` : `${u.def.range * 10} m`;
      const coaxLine = u.def.coaxMG
        ? ` · Coax ${u.def.coaxMG.rangeMeters ?? u.def.coaxMG.range * 10} m / ${u.def.coaxMG.damage} dmg`
        : '';
      const orderLine = u.attackOrder
        ? u.attackOrder.isGround
          ? ' · Fire mission'
          : ` · Attacking <strong>${TargetIndicators.getTargetLabel(u.attackOrder)}</strong>`
        : '';
      const cover = getCoverStatus(u);
      let coverBlock = '';
      if (cover.inCover) {
        coverBlock = `<p class="unit-cover-status in-cover"><strong>In cover:</strong> ${cover.label} — takes only <strong>${Math.round(cover.mult * 100)}%</strong> of incoming damage (${cover.reduction}% reduction). Leave cover or destroy the position to lose protection.</p>`;
      } else if (u.def?.type === 'engineer') {
        const build = game?.engineerSandbags?.getEngineerBuildStatus?.(u);
        const buildLine = build
          ? `<p class="unit-support-status"><strong>Building sandbags</strong> — ${build.pct}%</p>`
          : '';
        coverBlock = `${buildLine}<p class="unit-support-status">Support — repairs vehicles within ~16 m; can erect <strong>heavy-cover</strong> sandbag positions (Build sandbags).</p>`;
      } else if (u.def?.type === 'medic') {
        coverBlock =
          '<p class="unit-support-status">Support — heals infantry within ~14 m; nearby troops retreat less often.</p>';
      } else if (
        u.def?.type === 'infantry' ||
        u.def?.type === 'machineGun' ||
        u.def?.type === 'sniper'
      ) {
        coverBlock =
          '<p class="unit-cover-status exposed"><strong>Exposed</strong> — no cover bonus. Move into sandbags, hedges, or fighting pits.</p>';
      }
      const surrenderBlock = u.surrendered
        ? '<p class="unit-surrender-status"><strong>Surrendered</strong> — move a friendly unit within ~11 m to liberate; enemy contact captures them.</p>'
        : '';
      body.innerHTML = `
        <h3>${u.name}${cover.inCover ? ' <span class="cover-tag">COVER</span>' : ''}${u.surrendered ? ' <span class="cover-tag">SURRENDER</span>' : ''}</h3>
        ${hpBarMarkup(u.hp, u.maxHp)}
        <p class="selection-unit-meta">${u.def.designation} · Range ${rangeLabel} · Dmg ${u.def.damage}${coaxLine}${orderLine}</p>
        ${surrenderBlock}
        ${coverBlock}
      `;
      this.updateEngineerBuild(game);
      return;
    }

    this.updateEngineerBuild(game);

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
    const totalHp = units.reduce((sum, u) => sum + u.hp, 0);
    const totalMax = units.reduce((sum, u) => sum + u.maxHp, 0);
    body.innerHTML = `
      <h3>${units.length} units selected</h3>
      ${hpBarMarkup(totalHp, totalMax, { showValues: true })}
      <p>${summary}</p>
      ${orderNote}
    `;
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
    const listRows = (lines, emptyLabel) =>
      lines.length > 0
        ? lines
            .map(
              (l) =>
                `<li><span class="loss-type">${l.label}</span><span class="loss-n">${l.count}</span></li>`
            )
            .join('')
        : `<li class="loss-none">${emptyLabel}</li>`;

    const col = (
      side,
      {
        unitLines,
        unitTotal,
        defenseLines,
        defenseTotal,
        captureLines,
        captureTotal,
        hqLost,
        hqLabel,
        materielLabel,
        showDefenses = false,
      }
    ) => {
      const unitRows = listRows(unitLines, 'No unit losses');
      const hqRow = hqLost
        ? `<li class="loss-hq"><span class="loss-type">${hqLabel}</span><span class="loss-n">Destroyed</span></li>`
        : '';
      const defenseBlock = showDefenses
        ? `
          <p class="end-stats-subheading">Emplacements lost</p>
          <p class="end-stats-total">${defenseTotal} emplacement${defenseTotal === 1 ? '' : 's'} lost</p>
          <ul class="end-stats-list">${listRows(defenseLines, 'No emplacement losses')}</ul>
        `
        : '';
      const captureBlock =
        captureTotal > 0
          ? `
          <p class="end-stats-subheading">Prisoners taken</p>
          <p class="end-stats-total">${captureTotal} prisoner${captureTotal === 1 ? '' : 's'} captured</p>
          <ul class="end-stats-list">${listRows(captureLines, 'No prisoners taken')}</ul>
        `
          : '';
      return `
        <div class="end-stats-col">
          <h3>${side}</h3>
          <p class="end-stats-subheading">Units lost</p>
          <p class="end-stats-total">${unitTotal} unit${unitTotal === 1 ? '' : 's'} lost</p>
          <ul class="end-stats-list">${unitRows}${hqRow}</ul>
          ${captureBlock}
          ${defenseBlock}
          <p class="end-stats-materiel">
            <span class="end-stats-materiel-label">Est. materiel cost</span>
            <span class="end-stats-materiel-value">${materielLabel}</span>
          </p>
        </div>
      `;
    };

    const showPlayerDefenses =
      report.towerDefense || (report.playerDefenseTotal ?? 0) > 0;

    return `
      <h3 class="end-stats-heading">Battle casualties</h3>
      <div class="end-stats-grid">
        ${col(report.playerName, {
          unitLines: report.playerLines,
          unitTotal: report.playerTotal,
          defenseLines: report.playerDefenseLines ?? [],
          defenseTotal: report.playerDefenseTotal ?? 0,
          captureLines: report.playerCaptureLines ?? [],
          captureTotal: report.playerCaptureTotal ?? 0,
          hqLost: report.playerHqLost,
          hqLabel: 'Headquarters',
          materielLabel: report.playerMaterielLabel,
          showDefenses: showPlayerDefenses,
        })}
        ${col(report.enemyName, {
          unitLines: report.enemyLines,
          unitTotal: report.enemyTotal,
          defenseLines: [],
          defenseTotal: 0,
          captureLines: report.enemyCaptureLines ?? [],
          captureTotal: report.enemyCaptureTotal ?? 0,
          hqLost: report.enemyHqLost,
          hqLabel: report.tutorial ? 'Practice HQ' : 'Headquarters',
          materielLabel: report.enemyMaterielLabel,
        })}
      </div>
      <p class="end-stats-footnote">${report.materielNote}</p>
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