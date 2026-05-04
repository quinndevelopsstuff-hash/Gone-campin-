/* ============================================================
 *  Gone Campin' — Core Game Logic
 *  Targets game.html. Do not run on other pages.
 * ============================================================ */

'use strict';

// ── CONSTANTS ────────────────────────────────────────────────────────────────

const PHASES       = ['morning', 'afternoon', 'night'];
const PHASE_LABELS = { morning: '[ MORNING ]', afternoon: '[ AFTERNOON ]', night: '[ NIGHT ]' };
const PHASE_CLASSES = { morning: 'phase-morning', afternoon: 'phase-afternoon', night: 'phase-night' };
// Phase arc dot position per phase (matches data-pos on .arc-dot elements)
const ARC_POS = { morning: 1, afternoon: 3, night: 6 };

const BIOME_NAMES = {
  flatwoods:  'Midwest Flatwoods',
  mountain:   'Mountain Forest',
  tundra:     'Snowy Tundra',
  rainforest: 'Coastal Rainforest',
  desert:     'High Desert',
  swamp:      'Swamp / Bayou',
};

const DEATH_QUIPS = {
  health: "Should've been more careful.",
  hunger: "Should've packed more snacks.",
  thirst: "Should've packed more water.",
  warmth: "The cold doesn't hate you. It just doesn't care.",
  energy: "You pushed too hard. The wild doesn't forgive exhaustion.",
};

const ACHIEVEMENTS = {
  first_night: { name: 'First Night',           desc: 'Survived your first night.' },
  fire_keeper: { name: 'Fire Keeper',            desc: 'Kept the fire alive for 3 nights.' },
  gone_fishin: { name: "Gone Fishin'",           desc: 'Caught 5 fish.' },
  macgyver:    { name: 'MacGyver',               desc: 'Crafted every recipe.' },
  day_one:     { name: 'That Escalated Quickly', desc: 'Died on Day 1.' },
  well_fed:    { name: 'Well Fed',               desc: 'Kept hunger above 80 for 3 days.' },
  hydrated:    { name: 'Hydration Station',      desc: 'Drank purified water 10 times.' },
  explorer:    { name: 'Explorer',               desc: 'Explored 10 times.' },
  rescued:     { name: 'Rescued!',               desc: 'Built the Signal Fire and escaped.' },
  tundra_win:  { name: 'Ice Cold',               desc: 'Won on Snowy Tundra.' },
  desert_win:  { name: 'Desert Fox',             desc: 'Won on High Desert.' },
};

// Recipe definitions: needs (ingredients) → gives (results)
const RECIPES = {
  purifiedWater: { needs: { rawWater: 1, wood: 1 },              gives: { purifiedWater: 2 } },
  bandage:       { needs: { cloth: 1, stick: 1 },                gives: { bandage: 1 } },
  fishingRod:    { needs: { stick: 2, vine: 1 },                 gives: { fishingRod: true } },
  shelter:       { needs: { wood: 5, rope: 2 },                  gives: { improvedShelter: true } },
  signalFire:    { needs: { wood: 8, cloth: 3, stone: 2 },       gives: { signalFire: true } },
};

// Must match DOM order of .recipe-craft-btn elements in game.html
const RECIPE_ORDER = ['purifiedWater', 'bandage', 'fishingRod', 'shelter', 'signalFire'];

const RECIPE_LABELS = {
  purifiedWater: 'Purified Water ×2',
  bandage:       'Bandage ×1',
  fishingRod:    'Fishing Rod',
  shelter:       'Improved Shelter',
  signalFire:    'Signal Fire',
};

// ── MODULE VARS ──────────────────────────────────────────────────────────────

let survivorName   = 'SURVIVOR';
let biome          = 'flatwoods';
let biomeModifiers = { foragingBonus: 0, warmthDrain: 1, thirstDrain: 1, fishingBonus: 0, healthRisk: 0 };
let gameState;
let toastTimer     = null;

// ── UTILITIES ────────────────────────────────────────────────────────────────

const clamp   = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
const randInt = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;

function applyDelta(stat, delta) {
  gameState.stats[stat] = clamp(gameState.stats[stat] + delta);
}

function hasAP(cost) {
  return gameState.ap >= cost;
}

// Deduct AP; returns false and logs if insufficient.
function spendAP(cost) {
  if (!hasAP(cost)) {
    addLog('> Not enough Action Points.', 'warning');
    return false;
  }
  gameState.ap -= cost;
  if (gameState.ap === 0) addLog('> Out of Action Points. End your phase.', 'warning');
  renderAP();
  renderActions();
  return true;
}

// ── LOGGING ──────────────────────────────────────────────────────────────────

function addLog(message, type = 'info') {
  const phaseAbbr = { morning: 'AM', afternoon: 'PM', night: 'N' };
  const tag = gameState
    ? `[D${gameState.day}-${phaseAbbr[gameState.phase] || '?'}]`
    : '';
  const stamped = tag ? `${tag} ${message}` : message;
  gameState.log.unshift({ message: stamped, type });
  if (gameState.log.length > 60) gameState.log.pop();
}

// ── RENDER ───────────────────────────────────────────────────────────────────

function renderAll() {
  renderBanner();
  renderStats();
  renderAP();
  renderActions();
  renderInventory();
  renderLog();
  updateScenePhase(gameState.phase);
  moveSunMoon(gameState.phase);
  updateCampfireSprite();
}

function renderBanner() {
  // Day counter
  document.getElementById('day-counter').textContent = `DAY ${gameState.day}`;

  // Phase label
  document.getElementById('phase-label').textContent = PHASE_LABELS[gameState.phase];

  // Sky gradient class — flash on phase change
  const banner = document.getElementById('sky-banner');
  const newPhaseClass = PHASE_CLASSES[gameState.phase];
  const isPhaseChange = !banner.classList.contains(newPhaseClass);
  banner.classList.remove('phase-morning', 'phase-afternoon', 'phase-dusk', 'phase-night');
  banner.classList.add(newPhaseClass);
  if (isPhaseChange) {
    banner.classList.remove('phase-flash');
    void banner.offsetWidth;
    banner.classList.add('phase-flash');
    setTimeout(() => banner.classList.remove('phase-flash'), 350);
  }

  // Sun / moon arc dots
  const targetPos = ARC_POS[gameState.phase];
  document.querySelectorAll('.arc-dot').forEach(dot => {
    const pos = Number(dot.dataset.pos);
    const isActive = pos === targetPos;
    dot.classList.toggle('active', isActive);
    if (isActive) {
      dot.textContent = gameState.phase === 'night' ? '🌙' : '☀️';
    } else {
      dot.textContent = '○';
    }
  });

  // Survivor name + biome (in case they weren't set by the inline boot script)
  document.getElementById('survivor-display').textContent = survivorName.toUpperCase();
  document.getElementById('biome-display').textContent    = biome.toUpperCase();
}

function renderStats() {
  const stats = gameState.stats;
  ['health', 'hunger', 'thirst', 'energy', 'warmth'].forEach(stat => {
    const wrapper = document.getElementById(`stat-${stat}`);
    const fill    = wrapper.querySelector('.stat-bar__fill');
    const valEl   = document.getElementById(`stat-${stat}-value`);
    const barEl   = wrapper.querySelector('.stat-bar');
    const pct     = stats[stat];

    fill.style.width = `${pct}%`;
    valEl.textContent = `${pct}/100`;
    barEl.setAttribute('aria-valuenow', pct);

    wrapper.classList.toggle('stat-critical', pct <= 25);
  });

  // Red vignette when health is critical
  document.body.classList.toggle('vignette-danger', stats.health <= 25);
}

function renderAP() {
  document.getElementById('ap-counter').textContent =
    `[ AP: ${gameState.ap} / ${gameState.maxAp} ]`;
}

function renderActions() {
  const { phase, ap, inventory, gatorFlag } = gameState;
  const isNight = phase === 'night';

  function setBtn(id, disabled, tooltip) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = disabled;
    btn.setAttribute('aria-disabled', String(disabled));
    if (tooltip !== undefined) btn.dataset.tooltip = tooltip;
  }

  // Day-only 1-AP actions
  setBtn('btn-gather-wood', isNight || ap < 1);
  setBtn('btn-forage',      isNight || ap < 1);
  setBtn('btn-rest',        ap < 1);

  // Fetch water: also blocked by gator
  setBtn('btn-fetch-water', isNight || ap < 1 || gatorFlag,
         gatorFlag ? 'Something lurks in the water' : undefined);

  // repairShelter now costs 1 AP; explore stays at 2 AP
  setBtn('btn-repair-shelter', isNight || ap < 1);
  setBtn('btn-explore',        isNight || ap < 2);

  // Fish: needs rod + daytime + 2 AP
  const fishDisabled = !inventory.fishingRod || isNight || ap < 2;
  setBtn('btn-fish', fishDisabled,
         !inventory.fishingRod ? 'Requires Fishing Rod' : 'Unavailable');

  // Tend fire: night only, needs AP and wood
  const noWoodForFire = inventory.wood < 1;
  setBtn('btn-tend-fire', !isNight || ap < 1 || noWoodForFire,
         !isNight ? 'Night phase only' : noWoodForFire ? 'Need wood ×1' : undefined);

  // Free (0 AP) actions
  const hasFood = ['cookedFish', 'berries', 'mushroom', 'rawFish', 'badMushroom', 'bandage']
    .some(k => inventory[k] > 0);
  setBtn('btn-eat',   !hasFood,                    !hasFood ? 'No food available' : undefined);
  setBtn('btn-drink', inventory.purifiedWater <= 0, inventory.purifiedWater <= 0 ? 'No purified water' : undefined);
}

function renderInventory() {
  const inv = gameState.inventory;

  const map = {
    'inv-wood':           inv.wood,
    'inv-rope':           inv.rope,
    'inv-cloth':          inv.cloth,
    'inv-vine':           inv.vine,
    'inv-stone':          inv.stone,
    'inv-stick':          inv.stick,
    'inv-raw-water':      inv.rawWater,
    'inv-raw-fish':       inv.rawFish,
    'inv-cooked-fish':    inv.cookedFish,
    'inv-berries':        inv.berries,
    'inv-mushroom':       inv.mushroom + inv.badMushroom, // bad mushrooms look identical
    'inv-fishing-rod':    inv.fishingRod ? 1 : 0,
    'inv-bandage':        inv.bandage,
    'inv-purified-water': inv.purifiedWater,
  };

  Object.entries(map).forEach(([id, count]) => {
    const el  = document.getElementById(id);
    if (!el) return;
    el.textContent = `×${count}`;
    el.closest('.inv-item')?.classList.toggle('inv-item--stocked', count > 0);
  });
}

function renderLog() {
  const logEl = document.getElementById('event-log');
  logEl.innerHTML = gameState.log.slice(0, 20)
    .map(e => `<span class="log-entry log-${e.type}">${e.message}</span>`)
    .join('');
  logEl.scrollTop = 0;
}

// ── SCENE BANNER ──────────────────────────────────────────────────────────────

function setBiomeScene(b) {
  document.querySelectorAll('.biome-layer').forEach(el => el.classList.remove('active'));
  const layer = document.getElementById(`biome-${b}`);
  if (layer) layer.classList.add('active');

  const label = document.getElementById('biome-scene-label');
  if (label) label.textContent = (BIOME_NAMES[b] || b).toUpperCase();

  const rainEl = document.getElementById('rain-effect');
  const snowEl = document.getElementById('snow-effect');
  if (!rainEl || !snowEl) return;

  rainEl.innerHTML = '';
  snowEl.innerHTML = '';
  rainEl.style.display = 'none';
  snowEl.style.display = 'none';

  if (b === 'rainforest') {
    for (let i = 0; i < 28; i++) {
      const drop = document.createElement('div');
      drop.className = 'raindrop';
      drop.style.left              = `${Math.random() * 100}%`;
      drop.style.top               = `${Math.random() * -20}px`;
      drop.style.animationDuration = `${0.5 + Math.random() * 0.7}s`;
      drop.style.animationDelay    = `${Math.random() * 1.5}s`;
      rainEl.appendChild(drop);
    }
    rainEl.style.display = 'block';
  }

  if (b === 'tundra') {
    for (let i = 0; i < 18; i++) {
      const flake = document.createElement('div');
      flake.className = 'snowflake';
      flake.style.left              = `${Math.random() * 100}%`;
      flake.style.top               = `${Math.random() * -10}px`;
      flake.style.animationDuration = `${2.5 + Math.random() * 3}s`;
      flake.style.animationDelay    = `${Math.random() * 4}s`;
      snowEl.appendChild(flake);
    }
    snowEl.style.display = 'block';
  }
}

function updateScenePhase(phase) {
  const scene = document.getElementById('game-scene');
  if (!scene) return;
  scene.classList.remove('phase-morning', 'phase-afternoon', 'phase-dusk', 'phase-night');
  scene.classList.add(PHASE_CLASSES[phase]);

  const nightOverlay = document.getElementById('night-overlay');
  if (nightOverlay) nightOverlay.style.display = phase === 'night' ? 'block' : 'none';
}

function moveSunMoon(phase) {
  const el = document.getElementById('sun-moon');
  if (!el) return;
  const positions = { morning: '15%', afternoon: '50%', night: '80%' };
  el.style.left    = positions[phase] || '50%';
  el.textContent   = phase === 'night' ? '🌙' : '☀️';
}

function updateCampfireSprite() {
  const el = document.getElementById('campfire-sprite');
  if (!el) return;
  el.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:48px;height:56px;';

  if (gameState.fireActive) {
    wrap.innerHTML = `
      <div style="position:absolute;bottom:0;left:8px;width:32px;height:8px;background:#5a3a0a;box-shadow:2px 2px 0 #000;"></div>
      <div style="position:absolute;bottom:4px;left:12px;width:24px;height:6px;background:#7a4a0a;"></div>
      <div style="position:absolute;bottom:8px;left:20px;width:8px;height:24px;background:#ef4444;animation:flicker 0.4s steps(2) infinite;"></div>
      <div style="position:absolute;bottom:8px;left:13px;width:8px;height:18px;background:#f97316;animation:flicker 0.55s steps(2) infinite 0.15s;"></div>
      <div style="position:absolute;bottom:8px;left:27px;width:8px;height:14px;background:#f97316;animation:flicker 0.5s steps(2) infinite 0.3s;"></div>
      <div style="position:absolute;bottom:18px;left:21px;width:6px;height:12px;background:#fbbf24;animation:flicker 0.35s steps(2) infinite 0.1s;"></div>
      <div style="position:absolute;bottom:6px;left:16px;width:16px;height:6px;background:#fbbf24;opacity:0.5;box-shadow:0 0 8px rgba(251,191,36,0.7);"></div>`;
  } else {
    wrap.innerHTML = `
      <div style="position:absolute;bottom:0;left:8px;width:32px;height:8px;background:#2a1a0a;box-shadow:2px 2px 0 #000;"></div>
      <div style="position:absolute;bottom:0;left:14px;width:20px;height:4px;background:#5a5a5a;"></div>
      <div style="position:absolute;bottom:8px;left:20px;width:4px;height:8px;background:rgba(150,150,150,0.55);animation:smoke-rise 2s ease-out infinite;"></div>
      <div style="position:absolute;bottom:8px;left:26px;width:4px;height:8px;background:rgba(150,150,150,0.4);animation:smoke-rise 2.5s ease-out infinite 0.8s;"></div>`;
  }

  el.appendChild(wrap);
}

// ── ACTION HANDLERS ──────────────────────────────────────────────────────────

function gatherWood() {
  if (!spendAP(1)) return;
  const amount = randInt(2, 4);
  gameState.inventory.wood += amount;
  addLog(`> You gather ${amount} piece${amount > 1 ? 's' : ''} of wood.`, 'info');
  renderAll();
}

function forage() {
  if (!spendAP(1)) return;
  const hasBonus = (biomeModifiers.foragingBonus || 0) > 0;
  const roll     = Math.random();

  if (roll < 0.30) {
    // Bad mushroom — displayed as regular mushroom to player
    const amt = randInt(1, 2);
    gameState.inventory.badMushroom += amt;
    addLog(`> You find ${amt} mushroom${amt > 1 ? 's' : ''}. They look edible.`, 'info');
  } else if (roll < 0.70) {
    const amt = randInt(1, 2) + (hasBonus ? 1 : 0);
    gameState.inventory.berries += amt;
    addLog(`> You find ${amt} handful${amt > 1 ? 's' : ''} of wild berries.`, 'info');
  } else {
    const amt = randInt(1, 2) + (hasBonus ? 1 : 0);
    gameState.inventory.mushroom += amt;
    addLog(`> You find ${amt} mushroom${amt > 1 ? 's' : ''}. Smell earthy, look fine.`, 'info');
  }

  renderAll();
}

function fish() {
  if (!gameState.inventory.fishingRod) return;
  if (!spendAP(2)) return;
  const hasBonus = (biomeModifiers.fishingBonus || 0) > 0;
  const amount   = randInt(2, 3) + (hasBonus ? 1 : 0);
  gameState.inventory.rawFish += amount;
  gameState.counters.fishCaught += amount;
  addLog(`> You cast your line... ${amount} fish caught.`, 'info');
  if (gameState.counters.fishCaught >= 5) unlockAchievement('gone_fishin');
  renderAll();
}

function fetchWater() {
  if (gameState.gatorFlag) {
    addLog('> Something lurks in the water. You dare not approach.', 'warning');
    return;
  }
  if (!spendAP(1)) return;
  const amount = randInt(2, 3);
  gameState.inventory.rawWater += amount;
  if (biome === 'swamp') {
    addLog(`> You collect ${amount} water. It looks murky — purify before drinking.`, 'warning');
  } else if (biome === 'tundra') {
    addLog(`> You melt snow. +${amount} Raw Water.`, 'info');
  } else {
    addLog(`> You collect ${amount} water. Purify before drinking.`, 'info');
  }
  renderAll();
}

function repairShelter() {
  if (gameState.inventory.wood < 2) {
    addLog('> Not enough wood. Need wood ×2.', 'warning');
    return;
  }
  if (!spendAP(1)) return;
  gameState.inventory.wood -= 2;
  gameState.shelterLevel = Math.min(2, gameState.shelterLevel + 1);
  addLog('> You reinforce the shelter. It looks sturdier.', 'success');
  renderAll();
}

function explore() {
  if (!spendAP(2)) return;
  gameState.counters.exploreCount++;

  if (Math.random() < 0.60) {
    const loot = pickExploreLoot();
    loot.forEach(({ item, amount }) => { gameState.inventory[item] += amount; });
    const desc = loot.map(l => `${l.item} ×${l.amount}`).join(', ');
    addLog(`> You explore and find: ${desc}.`, 'info');
    renderAll();
  } else {
    addLog('> While exploring, something unexpected happens...', 'event');
    renderAll();
    setTimeout(triggerRandomEvent, 350);
  }

  if (gameState.counters.exploreCount >= 10) unlockAchievement('explorer');
}

function pickExploreLoot() {
  const pool = [
    { item: 'wood',  weight: 3, lo: 1, hi: 3 },
    { item: 'stick', weight: 3, lo: 1, hi: 2 },
    { item: 'stone', weight: 2, lo: 1, hi: 2 },
    { item: 'vine',  weight: 2, lo: 1, hi: 2 },
    { item: 'rope',  weight: 1, lo: 1, hi: 1 },
    { item: 'cloth', weight: 1, lo: 1, hi: 1 },
  ];
  const total   = pool.reduce((s, p) => s + p.weight, 0);
  const results = [];
  const picks   = randInt(1, 3);
  for (let i = 0; i < picks; i++) {
    let r = Math.random() * total;
    for (const p of pool) {
      r -= p.weight;
      if (r <= 0) { results.push({ item: p.item, amount: randInt(p.lo, p.hi) }); break; }
    }
  }
  return results;
}

function rest() {
  if (!spendAP(1)) return;
  applyDelta('energy', 15);
  applyDelta('health', 5);
  addLog('> You rest for a while. [+15 Energy, +5 Health]', 'success');
  renderAll();
}

function tendFire() {
  if (gameState.phase !== 'night') return;
  if (gameState.inventory.wood < 1) {
    addLog('> No wood left to feed the fire.', 'warning');
    return;
  }
  if (!spendAP(1)) return;
  gameState.inventory.wood -= 1;

  // Rainforest biome: damp wood may fail to light (firePenalty)
  const penalty = biomeModifiers.firePenalty || 0;
  if (penalty > 0 && Math.random() < penalty) {
    addLog('> The damp wood struggles to catch. Fire did not light. [−1 Wood]', 'warning');
    updateCampfireSprite();
    renderAll();
    return;
  }

  gameState.fireActive  = true;
  gameState.fireWentOut = false;
  applyDelta('warmth', 10);
  addLog('> You tend the fire. The flames grow stronger. [+10 Warmth]', 'success');
  renderAll();
}

function eatFood() {
  const inv = gameState.inventory;
  const available = [];
  if (inv.cookedFish  > 0) available.push({ key: 'cookedFish',  label: '🍣 Cooked Fish' });
  if (inv.berries     > 0) available.push({ key: 'berries',     label: '🫐 Berries' });
  if (inv.mushroom    > 0) available.push({ key: 'mushroom',    label: '🍄 Mushroom' });
  if (inv.badMushroom > 0) available.push({ key: 'badMushroom', label: '🍄 Mushroom' }); // looks same!
  if (inv.rawFish     > 0) available.push({ key: 'rawFish',     label: '🐟 Raw Fish' });
  if (inv.bandage     > 0) available.push({ key: 'bandage',     label: '🩹 Bandage (+25 HP)' });

  if (available.length === 0) {
    addLog('> You have nothing to eat.', 'warning');
    return;
  }
  if (available.length === 1) {
    consumeFood(available[0].key);
    return;
  }
  showFoodPicker(available);
}

function consumeFood(key) {
  switch (key) {
    case 'berries':
      gameState.inventory.berries -= 1;
      applyDelta('hunger', 15);
      addLog('> You eat berries. [+15 Hunger]', 'success');
      break;
    case 'mushroom':
      gameState.inventory.mushroom -= 1;
      applyDelta('hunger', 20);
      addLog('> You eat a mushroom. [+20 Hunger]', 'success');
      break;
    case 'badMushroom':
      gameState.inventory.badMushroom -= 1;
      applyDelta('hunger', 5);
      applyDelta('health', -25);
      addLog('> You eat a mushroom. Something tastes very wrong. [+5 Hunger, −25 Health]', 'danger');
      break;
    case 'rawFish':
      gameState.inventory.rawFish -= 1;
      applyDelta('hunger', 15);
      if (Math.random() < 0.40) {
        applyDelta('health', -15);
        gameState.sickDaysLeft = 1;
        addLog('> You eat raw fish. Your stomach lurches. [+15 Hunger, −15 Health]', 'danger');
      } else {
        addLog('> You choke down raw fish. Unpleasant, but filling. [+15 Hunger]', 'info');
      }
      break;
    case 'cookedFish':
      gameState.inventory.cookedFish -= 1;
      applyDelta('hunger', 25);
      addLog('> You eat cooked fish. Much better. [+25 Hunger]', 'success');
      break;
    case 'bandage':
      gameState.inventory.bandage -= 1;
      applyDelta('health', 25);
      addLog('> You apply the bandage. [+25 Health]', 'success');
      break;
  }
  renderAll();
}

function drinkWater() {
  if (gameState.inventory.purifiedWater <= 0) {
    addLog('> No purified water. Craft some at the workbench.', 'warning');
    return;
  }
  gameState.inventory.purifiedWater -= 1;
  applyDelta('thirst', 25);
  gameState.counters.drinkCount++;
  addLog('> You drink clean water. [+25 Thirst]', 'success');
  if (gameState.counters.drinkCount >= 10) unlockAchievement('hydrated');
  renderAll();
}

// ── CRAFTING ─────────────────────────────────────────────────────────────────

function canCraft(id) {
  return Object.entries(RECIPES[id].needs).every(([item, qty]) => {
    const have = gameState.inventory[item];
    return typeof have === 'boolean' ? false : have >= qty;
  });
}

function renderCraftModal() {
  const btns  = document.querySelectorAll('.recipe-craft-btn');
  const cards = document.querySelectorAll('.recipe-card');
  RECIPE_ORDER.forEach((id, i) => {
    if (!btns[i]) return;
    const ok = canCraft(id);
    btns[i].disabled = !ok;
    btns[i].setAttribute('aria-disabled', String(!ok));
    const card = cards[i];
    if (!card) return;
    card.classList.toggle('recipe-card--unavailable', !ok);

    // Inject / update ingredient availability line
    let stockEl = card.querySelector('.recipe-card__stock');
    if (!stockEl) {
      stockEl = document.createElement('div');
      stockEl.className = 'recipe-card__stock';
      stockEl.style.cssText = [
        "font-family:'VT323',monospace",
        'font-size:1rem',
        'line-height:1.5',
        'margin:0.2rem 0 0.3rem',
        'display:flex',
        'flex-wrap:wrap',
        'gap:0.4rem',
      ].join(';');
      const ingrEl = card.querySelector('.recipe-card__ingredients');
      if (ingrEl) ingrEl.after(stockEl);
    }
    const inv = gameState.inventory;
    stockEl.innerHTML = Object.entries(RECIPES[id].needs).map(([item, qty]) => {
      const have = typeof inv[item] === 'boolean' ? (inv[item] ? 1 : 0) : (inv[item] || 0);
      const met  = have >= qty;
      return `<span style="color:${met ? '#4ade80' : '#ef4444'};font-size:1rem;">${item} ×${qty} <em style="opacity:0.7">(have: ${have})</em></span>`;
    }).join('');
  });
}

function craft(recipeId) {
  if (!canCraft(recipeId)) return;
  const recipe = RECIPES[recipeId];

  // Consume ingredients
  Object.entries(recipe.needs).forEach(([item, qty]) => {
    gameState.inventory[item] -= qty;
  });

  // Apply results
  Object.entries(recipe.gives).forEach(([item, val]) => {
    if (typeof val === 'boolean') gameState.inventory[item] = val;
    else gameState.inventory[item] += val;
  });

  // Signal Fire triggers win
  if (recipeId === 'signalFire') {
    addLog('> YOU LIGHT THE SIGNAL FIRE. Black smoke billows into the sky!', 'event');
    renderAll();
    setTimeout(triggerWin, 1200);
    return;
  }

  addLog(`> Crafted: ${RECIPE_LABELS[recipeId]}.`, 'success');

  // MacGyver achievement tracking
  if (!gameState.counters.craftedRecipes.includes(recipeId)) {
    gameState.counters.craftedRecipes.push(recipeId);
  }
  const allCraftable = Object.keys(RECIPES).filter(id => id !== 'signalFire');
  if (allCraftable.every(id => gameState.counters.craftedRecipes.includes(id))) {
    unlockAchievement('macgyver');
  }

  renderCraftModal();
  renderAll();
}

// ── PHASE TRANSITION ─────────────────────────────────────────────────────────

function endPhase() {
  const phase = gameState.phase;
  const mods  = biomeModifiers;

  // ── Stat drains ───────────────────────────────────────────
  applyDelta('hunger', -8);
  applyDelta('thirst', -Math.round(10 * (mods.thirstDrain || 1)));
  applyDelta('energy', -5);

  // Warmth drain depends on phase, fire, and shelter
  let warmthBase;
  if (phase === 'night') {
    warmthBase = gameState.fireActive ? 3 : 20;
    if (gameState.inventory.improvedShelter) warmthBase = Math.floor(warmthBase * 0.5);
    // Fire keeper tracking
    if (gameState.fireActive) {
      gameState.counters.consecutiveFireNights++;
      if (gameState.counters.consecutiveFireNights >= 3) unlockAchievement('fire_keeper');
    } else {
      gameState.counters.consecutiveFireNights = 0;
    }
  } else {
    warmthBase = 5;
  }
  applyDelta('warmth', -Math.round(warmthBase * (mods.warmthDrain || 1)));

  // Sickness tick
  if (gameState.sickDaysLeft > 0) {
    applyDelta('health', -5);
    gameState.sickDaysLeft--;
    addLog('> Sickness drains your strength. [−5 Health]', 'danger');
  }

  // Passive biome health risk (swamp)
  if ((mods.healthRisk || 0) > 0 && Math.random() < mods.healthRisk) {
    applyDelta('health', -5);
    addLog('> The damp air is taking its toll. [−5 Health]', 'warning');
  }

  // Starvation / dehydration / hypothermia secondary damage
  let deathCause = null;
  if (gameState.stats.hunger <= 0) {
    applyDelta('health', -5);
    addLog('> You are starving. [−5 Health]', 'danger');
    deathCause = deathCause || 'hunger';
  }
  if (gameState.stats.thirst <= 0) {
    applyDelta('health', -10);
    addLog('> Severe dehydration. [−10 Health]', 'danger');
    deathCause = deathCause || 'thirst';
  }
  if (gameState.stats.warmth <= 0) {
    applyDelta('health', -8);
    addLog('> Hypothermia is setting in. [−8 Health]', 'danger');
    deathCause = deathCause || 'warmth';
  }

  // Low-stat warnings (once per phase transition, before drain summary)
  const LOW_STAT_WARNINGS = {
    health: '> ⚠️ CRITICAL HEALTH! Find medicine or rest immediately.',
    hunger: '> ⚠️ STARVING! Find food immediately.',
    thirst: '> ⚠️ SEVERELY THIRSTY! Drink water immediately.',
    warmth: '> ⚠️ DANGEROUSLY COLD! Tend your fire or find shelter.',
    energy: '> ⚠️ EXHAUSTED! You need to rest.',
  };
  Object.keys(LOW_STAT_WARNINGS).forEach(stat => {
    if (gameState.stats[stat] <= 25) addLog(LOW_STAT_WARNINGS[stat], 'danger');
  });

  const thirstDrain = Math.round(10 * (mods.thirstDrain || 1));
  const warmthDrain = Math.round(warmthBase * (mods.warmthDrain || 1));
  addLog(
    `> Phase end. [Hunger −8, Thirst −${thirstDrain}, Energy −5, Warmth −${warmthDrain}]`,
    'info'
  );

  // ── Death check ───────────────────────────────────────────
  if (gameState.stats.health <= 0) {
    renderAll();
    triggerDeath(deathCause || 'health');
    return;
  }

  // ── Advance phase ─────────────────────────────────────────
  gameState.phaseIndex = (gameState.phaseIndex + 1) % 3;
  gameState.phase      = PHASES[gameState.phaseIndex];

  if (gameState.phaseIndex === 0) {
    // New day starts
    gameState.day++;
    gameState.fireActive = false;   // fire goes out overnight unless tended
    gameState.gatorFlag  = false;   // per-day flag resets

    // Well Fed check
    if (gameState.stats.hunger > 80) {
      gameState.counters.wellFedDays++;
      if (gameState.counters.wellFedDays >= 3) unlockAchievement('well_fed');
    } else {
      gameState.counters.wellFedDays = 0;
    }
  }

  // First night cleared achievement
  if (gameState.phase === 'morning' && gameState.day === 2) {
    unlockAchievement('first_night');
  }

  // Reset AP (tundra biome costs 1 AP per phase due to cold)
  const apPenalty = biomeModifiers.apPenalty || 0;
  gameState.ap    = Math.max(1, gameState.maxAp - apPenalty);

  // New phase log entry with flavor
  addLog(`> DAY ${gameState.day} — ${gameState.phase.toUpperCase()}. ${phaseFlavorText()}`, 'info');

  // Random event (25% chance per phase; no event on Day 1 morning→afternoon)
  const isGracePeriod = gameState.day === 1 && gameState.phase === 'afternoon';
  if (!isGracePeriod && Math.random() < 0.25) {
    setTimeout(triggerRandomEvent, 400);
  }

  console.log('[Gone Campin\'] Phase:', gameState.phase, '| Day:', gameState.day, gameState);

  renderAll();
  saveAchievements();
}

function phaseFlavorText() {
  const lines = {
    morning:   ['The forest stirs.', 'Another day.', 'Birds. Somewhere.', 'Light, barely.'],
    afternoon: ['The sun is overhead.', 'Time burns.', 'Stay busy.', 'Shadows shrink.'],
    night:     ['Darkness closes in.', 'The sounds change at night.', "Keep the fire alive.", 'Something moves out there.'],
  };
  const arr = lines[gameState.phase];
  return arr[randInt(0, arr.length - 1)];
}

// ── RANDOM EVENTS ────────────────────────────────────────────────────────────

function loseRandomFood() {
  const keys      = ['cookedFish', 'berries', 'mushroom', 'rawFish'];
  const available = keys.filter(k => gameState.inventory[k] > 0);
  if (!available.length) return 'nothing';
  const key = available[randInt(0, available.length - 1)];
  gameState.inventory[key] = Math.max(0, gameState.inventory[key] - 2);
  return key;
}

// Universal event pool
const EVENT_POOL = [
  {
    id: 'bearAttack',
    title: '🐻 BEAR IN CAMP',
    text:  'A bear crashes through the undergrowth, sniffing at your supplies. It stops and stares.',
    choices: [
      {
        label: 'FIGHT IT',
        resolve() {
          if (Math.random() < 0.5) {
            applyDelta('health', -20);
            addLog('> You fight the bear. It mauls you before fleeing. [−20 Health]', 'danger');
          } else {
            addLog('> You stand your ground. The bear backs off.', 'info');
          }
        },
      },
      {
        label: 'FLEE',
        resolve() {
          const lost = loseRandomFood();
          addLog(`> You flee. The bear raids your camp. Lost: ${lost} ×2.`, 'warning');
        },
      },
    ],
  },
  {
    id: 'rainstorm',
    title: '🌧️ RAINSTORM',
    text:  'The sky opens up. Cold rain soaks everything in seconds.',
    resolve() {
      applyDelta('warmth', -20);
      gameState.fireActive  = false;
      gameState.fireWentOut = true;
      gameState.inventory.rawWater += 2;
      addLog('> Rainstorm. [−20 Warmth, Fire extinguished, +2 Raw Water]', 'warning');
    },
  },
  {
    id: 'luckyFind',
    title: '🍀 LUCKY FIND',
    text:  'You stumble across something useful half-buried in the dirt.',
    resolve() {
      const items = ['rope', 'cloth', 'stick', 'stone', 'vine'];
      const item  = items[randInt(0, items.length - 1)];
      gameState.inventory[item] += 1;
      addLog(`> Lucky find: ${item} ×1.`, 'success');
    },
  },
  {
    id: 'deerSpotted',
    title: '🦌 DEER SPOTTED',
    text:  "A deer stands at the treeline, watching you. It hasn't bolted yet.",
    choices: [
      {
        label: 'CHASE IT (1 AP)',
        resolve() {
          if (!spendAP(1)) return;
          if (Math.random() < 0.60) {
            gameState.inventory.rawFish += 2;  // raw meat, stored as rawFish
            addLog('> You run it down. Raw meat secured. [+2 Raw Meat]', 'success');
          } else {
            addLog('> The deer bolts. You return empty-handed.', 'info');
          }
        },
      },
      {
        label: 'IGNORE IT',
        resolve() { addLog('> You let the deer go. Probably for the best.', 'info'); },
      },
    ],
  },
  {
    id: 'fellSick',
    title: '🤒 YOU FEEL ILL',
    text:  'Something you ate — or the water, or the cold — has made you sick.',
    resolve() {
      gameState.sickDaysLeft = 2;
      applyDelta('health', -5);
      addLog('> You fall ill. [−5 Health, sick for 2 phases]', 'danger');
    },
  },
  {
    id: 'clearNight',
    title: '⭐ CLEAR NIGHT',
    text:  'The stars are out. You sleep better than expected.',
    resolve() {
      applyDelta('energy', 20);
      addLog('> A clear, restful night. [+20 Energy]', 'success');
    },
  },
  {
    id: 'fireWentOut',
    title: '🔥 FIRE WENT OUT',
    text:  'You wake to cold ash. The fire died in the night.',
    resolve() {
      gameState.fireActive  = false;
      gameState.fireWentOut = true;
      gameState.counters.consecutiveFireNights = 0;
      applyDelta('warmth', -15);
      addLog('> Fire went out. [−15 Warmth]', 'warning');
    },
  },
];

// Biome-specific event pools
const BIOME_EVENTS = {
  rainforest: [
    {
      id: 'flashFlood',
      title: '🌊 FLASH FLOOD',
      text:  'A wall of muddy water rolls through camp. You scramble for high ground.',
      resolve() {
        applyDelta('warmth', -15);
        gameState.inventory.rawWater += 3;
        const mats = ['wood', 'stick', 'rope', 'cloth'];
        const lost = mats[randInt(0, mats.length - 1)];
        if (gameState.inventory[lost] > 0) gameState.inventory[lost]--;
        addLog(`> Flash flood! [−15 Warmth, +3 Raw Water, lost ${lost} ×1]`, 'danger');
      },
    },
  ],
  desert: [
    {
      id: 'scorpionSting',
      title: '🦂 SCORPION STING',
      text:  'You disturb a scorpion hidden under a rock. It strikes before you can react.',
      resolve() {
        applyDelta('health', -20);
        applyDelta('energy', -20);
        addLog('> Scorpion sting! [−20 Health, −20 Energy]', 'danger');
      },
    },
  ],
  swamp: [
    {
      id: 'gatorSighting',
      title: '🐊 GATOR IN THE WATER',
      text:  "A pair of eyes glides across the surface near your water source. It's watching.",
      resolve() {
        gameState.gatorFlag = true;
        addLog('> Gator spotted. Water source is off-limits this phase.', 'warning');
      },
    },
  ],
};

function triggerRandomEvent() {
  const pool  = [...EVENT_POOL, ...(BIOME_EVENTS[biome] || [])];
  const event = pool[randInt(0, pool.length - 1)];

  if (Array.isArray(event.choices) && event.choices.length > 0) {
    showEventOverlay(event);
  } else {
    event.resolve();
    renderAll();
  }
}

function showEventOverlay(event) {
  document.getElementById('event-title').textContent = event.title;
  document.getElementById('event-text').textContent  = event.text;

  const choicesEl = document.getElementById('event-choices');
  choicesEl.innerHTML = '';

  event.choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.textContent = choice.label;
    Object.assign(btn.style, {
      fontFamily:    "'Press Start 2P', monospace",
      fontSize:      '0.42rem',
      background:    '#4ade80',
      color:         '#000',
      border:        '2px solid #000',
      padding:       '0.75rem 1.25rem',
      cursor:        'pointer',
      boxShadow:     '3px 3px 0 #000',
      borderRadius:  '0',
      letterSpacing: '0.05em',
      lineHeight:    '1.8',
    });
    btn.addEventListener('mouseenter', () => { btn.style.background = '#f97316'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#4ade80'; });
    btn.addEventListener('click', () => {
      choice.resolve();
      hideEventOverlay();
      renderAll();
    });
    choicesEl.appendChild(btn);
  });

  document.getElementById('event-overlay').style.display = 'flex';
}

function hideEventOverlay() {
  document.getElementById('event-overlay').style.display = 'none';
}

// ── FOOD PICKER ───────────────────────────────────────────────────────────────

function showFoodPicker(available) {
  const listEl = document.getElementById('food-choices');
  listEl.innerHTML = '';

  available.forEach(item => {
    const btn = document.createElement('button');
    btn.textContent = item.label;
    Object.assign(btn.style, {
      fontFamily:   "'VT323', monospace",
      fontSize:     '1.25rem',
      background:   '#1a1a2e',
      color:        '#e2e8f0',
      border:       '2px solid #4ade80',
      padding:      '0.5rem 1rem',
      cursor:       'pointer',
      boxShadow:    '3px 3px 0 #000',
      borderRadius: '0',
      textAlign:    'left',
      lineHeight:   '1.5',
      display:      'block',
      width:        '100%',
    });
    btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#f97316'; });
    btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#4ade80'; });
    btn.addEventListener('click', () => {
      hideFoodPicker();
      consumeFood(item.key);
    });
    listEl.appendChild(btn);
  });

  document.getElementById('food-picker').style.display = 'flex';
}

function hideFoodPicker() {
  document.getElementById('food-picker').style.display = 'none';
}

// ── DEATH & WIN ───────────────────────────────────────────────────────────────

function triggerDeath(cause) {
  const quip = DEATH_QUIPS[cause] || DEATH_QUIPS.health;

  document.getElementById('death-name').textContent  = survivorName.toUpperCase();
  document.getElementById('death-days').textContent  = gameState.day;
  document.getElementById('death-cause').textContent = cause.toUpperCase();
  document.getElementById('death-quip').textContent  = `"${quip}"`;

  if (gameState.day === 1) unlockAchievement('day_one');

  document.getElementById('death-screen').style.display = 'flex';
  console.log("[Gone Campin'] GAME OVER — Cause:", cause, '| Day:', gameState.day);
  clearSavedGame();
}

function triggerWin() {
  unlockAchievement('rescued');
  if (biome === 'tundra') unlockAchievement('tundra_win');
  if (biome === 'desert')  unlockAchievement('desert_win');

  document.getElementById('win-name').textContent  = survivorName.toUpperCase();
  document.getElementById('win-days').textContent  = gameState.day;
  document.getElementById('win-biome').textContent = (BIOME_NAMES[biome] || biome).toUpperCase();

  // Populate achievement grid with all earned achievements
  const grid   = document.getElementById('achievement-grid');
  const earned = loadAchievements();
  grid.innerHTML = '';
  earned.forEach(id => {
    const def = ACHIEVEMENTS[id];
    if (!def) return;
    const slot = document.createElement('div');
    slot.className = 'achievement-slot';
    slot.title     = `${def.name}: ${def.desc}`;
    Object.assign(slot.style, {
      display:       'flex',
      alignItems:    'center',
      justifyContent:'center',
      fontFamily:    "'Press Start 2P', monospace",
      fontSize:      '0.3rem',
      color:         '#4ade80',
      background:    '#1a1a2e',
      border:        '2px solid #4ade80',
      boxShadow:     '2px 2px 0 #000',
      padding:       '0.3rem',
      textAlign:     'center',
      lineHeight:    '1.5',
    });
    slot.textContent = def.name;
    grid.appendChild(slot);
  });

  document.getElementById('win-screen').style.display = 'flex';
  console.log("[Gone Campin'] WIN! Day:", gameState.day, '| Biome:', biome);
  clearSavedGame();
}

// ── ACHIEVEMENTS ─────────────────────────────────────────────────────────────

function loadAchievements() {
  try { return JSON.parse(localStorage.getItem('achievements') || '[]'); }
  catch { return []; }
}

function saveAchievements() {
  localStorage.setItem('achievements', JSON.stringify(gameState.achievements));
}

function unlockAchievement(id) {
  if (!ACHIEVEMENTS[id]) return;

  // Merge with persisted achievements (carry over from previous runs)
  const persisted = loadAchievements();
  if (!persisted.includes(id)) {
    persisted.push(id);
    localStorage.setItem('achievements', JSON.stringify(persisted));
  }
  if (!gameState.achievements.includes(id)) {
    gameState.achievements.push(id);
    showAchievementToast(id);
  }
}

function showAchievementToast(id) {
  const def = ACHIEVEMENTS[id];
  if (!def) return;

  document.getElementById('toast-title').textContent = def.name;
  document.getElementById('toast-desc').textContent  = def.desc;

  const toast = document.getElementById('achievement-toast');
  toast.classList.remove('toast-show');
  void toast.offsetWidth;              // force reflow so animation re-fires
  toast.classList.add('toast-show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('toast-show'), 4000);
}

// ── PERSISTENCE ───────────────────────────────────────────────────────────────

function clearSavedGame() {
  localStorage.removeItem('gameState');
}

// ── DOM INJECTIONS ────────────────────────────────────────────────────────────

function injectVignette() {
  const style = document.createElement('style');
  style.textContent = `
    body.vignette-danger::before {
      content: '';
      position: fixed;
      inset: 0;
      pointer-events: none;
      box-shadow: inset 0 0 80px 20px rgba(239,68,68,0.35);
      animation: vignettePulse 1.5s ease-in-out infinite alternate;
      z-index: 9998;
    }
    @keyframes vignettePulse {
      from { box-shadow: inset 0 0 80px 20px rgba(239,68,68,0.2); }
      to   { box-shadow: inset 0 0 80px 20px rgba(239,68,68,0.55); }
    }
  `;
  document.head.appendChild(style);
}

function injectEventOverlay() {
  const el = document.createElement('div');
  el.id = 'event-overlay';
  Object.assign(el.style, {
    display:        'none',
    position:       'fixed',
    inset:          '0',
    background:     'rgba(0,0,0,0.93)',
    zIndex:         '1500',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '1.5rem',
  });
  el.innerHTML = `
    <div style="
      background:#1a1a2e;border:2px solid #4ade80;
      box-shadow:6px 6px 0 #000;padding:2rem;
      max-width:520px;width:100%;
    ">
      <p id="event-title" style="
        font-family:'Press Start 2P',monospace;font-size:0.62rem;
        color:#4ade80;line-height:1.8;margin-bottom:1rem;letter-spacing:0.05em;
      "></p>
      <p id="event-text" style="
        font-family:'VT323',monospace;font-size:1.2rem;
        color:#94a3b8;line-height:1.65;margin-bottom:1.5rem;
      "></p>
      <div id="event-choices" style="display:flex;flex-wrap:wrap;gap:0.75rem;"></div>
    </div>`;
  document.body.appendChild(el);
}

function injectFoodPicker() {
  const el = document.createElement('div');
  el.id = 'food-picker';
  Object.assign(el.style, {
    display:        'none',
    position:       'fixed',
    inset:          '0',
    background:     'rgba(0,0,0,0.93)',
    zIndex:         '1500',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '1.5rem',
  });
  el.innerHTML = `
    <div style="
      background:#1a1a2e;border:2px solid #4ade80;
      box-shadow:6px 6px 0 #000;padding:1.5rem 1.75rem;
      max-width:360px;width:100%;
    ">
      <p style="
        font-family:'Press Start 2P',monospace;font-size:0.5rem;
        color:#4ade80;line-height:1.8;margin-bottom:1rem;letter-spacing:0.05em;
      ">[ EAT WHAT? ]</p>
      <div id="food-choices" style="display:flex;flex-direction:column;gap:0.5rem;"></div>
      <button id="food-cancel" style="
        font-family:'Press Start 2P',monospace;font-size:0.38rem;
        background:transparent;color:#ef4444;border:1px solid #ef4444;
        border-radius:0;padding:0.4rem 0.8rem;cursor:pointer;
        margin-top:0.85rem;letter-spacing:0.05em;line-height:1.8;
      ">CANCEL</button>
    </div>`;
  document.body.appendChild(el);
  document.getElementById('food-cancel').addEventListener('click', hideFoodPicker);
}

function injectEndPhaseButton() {
  const grid = document.querySelector('.actions-grid');
  if (!grid) return;

  const container = document.createElement('div');
  container.id = 'end-phase-container';
  container.style.cssText = 'grid-column:1 / -1; margin-top:0.3rem;';

  const btn = document.createElement('button');
  btn.id        = 'btn-end-phase';
  btn.className = 'action-btn';
  btn.setAttribute('aria-label', 'End current phase and advance time');
  btn.title = 'End this phase and advance to the next time of day.';
  Object.assign(btn.style, {
    width:          '100%',
    borderColor:    '#f97316',
    color:          '#f97316',
    justifyContent: 'center',
  });
  btn.innerHTML = `
    <span class="action-btn__icon" aria-hidden="true">⏭️</span>
    <span class="action-btn__label" style="
      font-family:'Press Start 2P',monospace;
      font-size:0.42rem;letter-spacing:0.06em;text-align:center;
    ">END PHASE</span>`;

  btn.addEventListener('click', () => {
    const critStat = Object.keys(gameState.stats).find(s => gameState.stats[s] <= 25);
    if (critStat) {
      showEndPhaseConfirmation(container, btn, critStat);
    } else {
      endPhase();
    }
  });

  container.appendChild(btn);
  grid.appendChild(container);
}

function showEndPhaseConfirmation(container, origBtn, stat) {
  const warning = document.createElement('div');
  Object.assign(warning.style, {
    background: '#1a1a2e',
    border:     '2px solid #f97316',
    boxShadow:  '3px 3px 0 #000',
    padding:    '0.65rem 0.75rem',
  });
  warning.innerHTML = `
    <p style="font-family:'Press Start 2P',monospace;font-size:0.38rem;
      color:#f97316;line-height:1.8;margin-bottom:0.45rem;letter-spacing:0.05em;">
      ⚠️ ${stat.toUpperCase()} IS CRITICAL
    </p>
    <p style="font-family:'VT323',monospace;font-size:1.05rem;
      color:#94a3b8;line-height:1.4;margin-bottom:0.65rem;">
      End phase anyway?
    </p>
    <div style="display:flex;gap:0.5rem;">
      <button id="end-phase-confirm" style="
        font-family:'Press Start 2P',monospace;font-size:0.34rem;
        background:#f97316;color:#000;border:2px solid #000;
        padding:0.45rem 0.65rem;cursor:pointer;box-shadow:2px 2px 0 #000;
        border-radius:0;letter-spacing:0.05em;line-height:1.8;">CONTINUE</button>
      <button id="end-phase-cancel" style="
        font-family:'Press Start 2P',monospace;font-size:0.34rem;
        background:#1a1a2e;color:#94a3b8;border:2px solid #475569;
        padding:0.45rem 0.65rem;cursor:pointer;box-shadow:2px 2px 0 #000;
        border-radius:0;letter-spacing:0.05em;line-height:1.8;">CANCEL</button>
    </div>`;

  container.innerHTML = '';
  container.appendChild(warning);

  document.getElementById('end-phase-confirm').addEventListener('click', endPhase);
  document.getElementById('end-phase-cancel').addEventListener('click', () => {
    container.innerHTML = '';
    container.appendChild(origBtn);
  });
}

function wireButtons() {
  const map = {
    'btn-gather-wood':    gatherWood,
    'btn-forage':         forage,
    'btn-fish':           fish,
    'btn-fetch-water':    fetchWater,
    'btn-repair-shelter': repairShelter,
    'btn-explore':        explore,
    'btn-rest':           rest,
    'btn-tend-fire':      tendFire,
    'btn-eat':            eatFood,
    'btn-drink':          drinkWater,
  };
  Object.entries(map).forEach(([id, fn]) => {
    document.getElementById(id)?.addEventListener('click', fn);
  });

  // Craft open button also refreshes recipe availability
  document.getElementById('craft-open-btn')?.addEventListener('click', renderCraftModal);

  // Wire each recipe's CRAFT button by position
  document.querySelectorAll('.recipe-craft-btn').forEach((btn, i) => {
    const id = RECIPE_ORDER[i];
    if (id) btn.addEventListener('click', () => craft(id));
  });
}

// ── BIOME STARTING CONDITIONS ─────────────────────────────────────────────────

function applyBiomeStart() {
  switch (biome) {
    case 'tundra':
      gameState.stats.warmth = 60;
      gameState.maxAp        = Math.max(1, gameState.maxAp - (biomeModifiers.apPenalty || 0));
      gameState.ap           = gameState.maxAp;
      addLog('> The tundra is merciless. Your warmth is already depleting.', 'warning');
      break;
    case 'desert':
      gameState.stats.thirst = 65;
      addLog('> The desert sun beats down. Find water soon.', 'warning');
      break;
    case 'swamp':
      gameState.stats.health = 75;
      addLog('> The swamp air is thick and sickly. Watch your health.', 'warning');
      break;
    case 'mountain':
      gameState.stats.warmth = 70;
      addLog('> The altitude is brutal. Cold will be your biggest enemy.', 'warning');
      break;
    case 'rainforest':
      addLog('> The forest is soaked. Starting a fire here will be difficult.', 'warning');
      break;
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────

function init() {
  // Read player setup from localStorage
  survivorName = localStorage.getItem('survivorName') || 'SURVIVOR';
  biome        = localStorage.getItem('biome')        || 'flatwoods';

  try {
    const raw = localStorage.getItem('biomeModifiers');
    if (raw) biomeModifiers = { ...biomeModifiers, ...JSON.parse(raw) };
  } catch { /* use defaults */ }

  // Load any achievements earned in previous runs
  const savedAchievements = loadAchievements();

  // Build fresh game state
  gameState = {
    day:        1,
    phase:      'morning',
    phaseIndex: 0,
    ap:         3,
    maxAp:      3,
    stats:      { health: 80, hunger: 80, thirst: 80, energy: 80, warmth: 80 },
    inventory: {
      wood: 3, rope: 0, cloth: 1, vine: 0, stone: 0, stick: 2,
      rawFish: 0, cookedFish: 0, berries: 0, mushroom: 0, badMushroom: 0,
      rawWater: 0,
      fishingRod: false, bandage: 0, purifiedWater: 0,
      improvedShelter: false, signalFire: false,
    },
    shelterLevel: 0,
    fireActive:   true,
    fireWentOut:  false,
    sickDaysLeft: 0,
    gatorFlag:    false,
    achievements: savedAchievements,
    log:          [],
    counters: {
      fishCaught:              0,
      exploreCount:            0,
      drinkCount:              0,
      craftedRecipes:          [],
      consecutiveFireNights:   0,
      wellFedDays:             0,
    },
  };

  // Opening log entries (addLog prepends, so write in reverse display order)
  addLog(`> Biome: ${BIOME_NAMES[biome] || biome}. Difficulty loaded.`, 'event');
  addLog(`> DAY 1 — MORNING. You wake up in the wilderness. Time to survive.`, 'info');

  // Apply biome-specific starting adjustments (will prepend their own log entries)
  applyBiomeStart();

  // Set scene banner to match chosen biome
  setBiomeScene(biome);

  // Inject dynamic DOM elements
  injectVignette();
  injectEventOverlay();
  injectFoodPicker();
  injectEndPhaseButton();

  // Wire all interactive buttons
  wireButtons();

  // Initial render
  renderAll();

  console.log('[Gone Campin\'] Init — player:', survivorName, '| biome:', biome, '| mods:', biomeModifiers);
}

// Boot once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
