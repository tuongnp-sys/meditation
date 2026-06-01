import {
  Background,
  LAYER_TRANSITION_DURATION,
  MAX_LAYER,
  MAX_DOWNGRADE_STRIKES,
  getLayerConfig,
  getLayerDuration,
  getLayerName,
  getLayerAscendMessage,
  getLayerDescendMessage,
} from './background.js';
import { Player } from './player.js';
import {
  WorldManager,
  clearTemptationsInShockwave,
  rectsOverlap,
} from './obstacle.js';
import {
  initAudio,
  playSfx,
  playLayerMusic,
  pauseLayerMusic,
  resumeLayerMusic,
  stopLayerMusic,
} from './audio.js';

/**
 * API base URL:
 * - Local: backend on :3001
 * - Production: set window.MEDITATION_API_URL in index.html, OR use Vercel /api proxy (same origin)
 */
const API_BASE =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3001'
    : window.MEDITATION_API_URL || window.location.origin;

const POINTS_PER_CLEAR = 12;
const HALO_SCRIPTURE_GAIN = 25;
const HALO_SHOCKWAVE_COST = 30;
/** Mario-style: halo is lost only when touching a temptation, not over time. */
const HALO_LOST_ON_TEMPTATION = 100;
const HALO_MAX = 100;
const HIT_FLASH_DURATION = 0.15;
const HIT_FLASH_MAX_ALPHA = 0.22;
const FLOATING_TEXT_MAX = 12;
const FLOATING_TEXT_DURATION = 0.8;
const FLOATING_TEXT_RISE = 48;
const PROTECTIVE_CHARGES_MAX = 2;
const SCORE_PER_LAYER_ASCEND = 50;

/** Layout reference — logical game coordinates scale with CSS size up to this width. */
const CANVAS_MAX_WIDTH = 900;
const CANVAS_ASPECT = 520 / 900;
const USERNAME_STORAGE_KEY = 'meditation_username';

const GameState = Object.freeze({
  IDLE: 'IDLE',
  START: 'START',
  PLAYING: 'PLAYING',
  GAMEOVER: 'GAMEOVER',
  VICTORY: 'VICTORY',
  SURRENDER: 'SURRENDER',
});

// --- DOM ---------------------------------------------------------------------

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let logicalWidth = CANVAS_MAX_WIDTH;
let logicalHeight = Math.round(CANVAS_MAX_WIDTH * CANVAS_ASPECT);
let resizeDebounceTimer = null;

const authPanel = document.getElementById('auth-panel');
const gameSection = document.getElementById('game-section');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username-input');
const rememberMeCheckbox = document.getElementById('remember-me');
const authError = document.getElementById('auth-error');

const hudUsername = document.getElementById('hud-username');
const hudHighscore = document.getElementById('hud-highscore');
const hudEnergy = document.getElementById('hud-energy');
const hudEnergyCountdown = document.getElementById('hud-energy-countdown');
const btnLogout = document.getElementById('btn-logout');

const leaderboardList = document.getElementById('leaderboard-list');
const leaderboardEmpty = document.getElementById('leaderboard-empty');
const leaderboardError = document.getElementById('leaderboard-error');
const vipBadge = document.getElementById('vip-badge');
const layerNameEl = document.getElementById('layer-name');
const gameAnnouncements = document.getElementById('game-announcements');

const overlayStart = document.getElementById('overlay-start');
const startError = document.getElementById('start-error');
const btnStartGame = document.getElementById('btn-start-game');
const overlayEnergy = document.getElementById('overlay-energy');
const energyCountdown = document.getElementById('energy-countdown');
const energyStatusError = document.getElementById('energy-status-error');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const surrenderOverlay = document.getElementById('surrenderOverlay');
const overlayLayer = document.getElementById('overlay-layer');
const victoryOverlay = document.getElementById('victoryOverlay');

const gameControls = document.getElementById('game-controls');
const btnPause = document.getElementById('btn-pause');
const btnResume = document.getElementById('btn-resume');
const btnStop = document.getElementById('btn-stop');

const touchControls = document.getElementById('touch-controls');
const touchLeft = document.getElementById('touch-left');
const touchRight = document.getElementById('touch-right');
const touchJump = document.getElementById('touch-jump');
const touchUp = document.getElementById('touch-up');
const touchDown = document.getElementById('touch-down');
const touchRowVertical = document.getElementById('touch-row-vertical');

const gameoverMessage = document.getElementById('gameover-message');
const finalScoreEl = document.getElementById('final-score');
const recordMessage = document.getElementById('record-message');
const surrenderMessage = document.getElementById('surrender-message');
const surrenderScoreEl = document.getElementById('surrender-score');
const surrenderRecordMessage = document.getElementById('surrender-record-message');
const layerTransitionTitle = document.getElementById('layer-transition-title');
const layerTransitionDesc = document.getElementById('layer-transition-desc');
const victoryScoreEl = document.getElementById('victory-score');
const victoryBestEl = document.getElementById('victory-best');
const victoryRecordMessage = document.getElementById('victory-record-message');

const MENU_OVERLAYS = [overlayStart, overlayEnergy];
const END_OVERLAYS = [victoryOverlay, gameOverOverlay, surrenderOverlay];
const ALL_OVERLAYS = [
  overlayStart,
  overlayEnergy,
  gameOverOverlay,
  surrenderOverlay,
  overlayLayer,
  victoryOverlay,
];

// --- Runtime state -----------------------------------------------------------

let currentUser = null;
let background = null;
let player = null;
let world = null;
let keys = {};

let gameState = GameState.IDLE;
let sessionToken = 0;
let isPaused = false;

let score = 0;
let currentLayer = 1;
let downgradeStrikes = 0;
let haloEnergy = 0;
let protectiveCharges = 0;
let layerElapsed = 0;
let layerDuration = 45;
let lastTime = 0;
let animFrameId = null;
let layerTransitionTimer = 0;
let layerTransitionAscending = false;
let pendingLayerUp = false;
let enlightenmentPulse = 0;
let hitFlashTimer = 0;
let suppressCanvasClickUntil = 0;
let energyCountdownTimer = null;
/** @type {{ energy: number, isVip: boolean, nextRefillAt: string | null, msUntilRefill: number } | null} */
let energyStatus = null;
let rememberUsername = true;

// --- Floating feedback text --------------------------------------------------

const floatingTexts = {
  items: [],

  reset() {
    this.items = [];
  },

  spawn(x, y, label, kind = 'default') {
    if (this.items.length >= FLOATING_TEXT_MAX) {
      this.items.shift();
    }
    this.items.push({ x, y, label, kind, elapsed: 0 });
  },

  update(dt) {
    for (const item of this.items) {
      item.elapsed += dt;
    }
    this.items = this.items.filter((item) => item.elapsed < FLOATING_TEXT_DURATION);
  },

  draw(ctx) {
    for (const item of this.items) {
      const t = item.elapsed / FLOATING_TEXT_DURATION;
      const alpha = 1 - t;
      const drawY = item.y - t * FLOATING_TEXT_RISE;

      ctx.save();
      ctx.font = '600 14px Outfit, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 2;

      if (item.kind === 'halo') {
        ctx.fillStyle = `rgba(255, 240, 160, ${alpha})`;
        ctx.strokeStyle = `rgba(212, 184, 150, ${alpha * 0.55})`;
      } else if (item.kind === 'score') {
        ctx.fillStyle = `rgba(126, 184, 154, ${alpha})`;
        ctx.strokeStyle = `rgba(90, 140, 115, ${alpha * 0.55})`;
      } else {
        ctx.fillStyle = `rgba(232, 238, 242, ${alpha})`;
        ctx.strokeStyle = `rgba(138, 155, 168, ${alpha * 0.55})`;
      }

      ctx.strokeText(item.label, item.x, drawY);
      ctx.fillText(item.label, item.x, drawY);
      ctx.restore();
    }
  },
};

// --- Overlay control ---------------------------------------------------------

function announceGame(message) {
  if (!gameAnnouncements || !message) return;
  gameAnnouncements.textContent = '';
  gameAnnouncements.textContent = message;
}

function hideOverlay(el) {
  if (!el) return;
  el.classList.remove('is-visible');
  el.classList.add('is-hidden');
  el.setAttribute('aria-hidden', 'true');
  el.style.display = 'none';
}

function showOverlay(el) {
  if (!el) return;
  el.classList.remove('is-hidden');
  el.classList.add('is-visible');
  el.setAttribute('aria-hidden', 'false');
  el.style.display = 'flex';
}

function hideAllOverlays() {
  for (const el of ALL_OVERLAYS) hideOverlay(el);
}

function hideEndOverlays() {
  for (const el of END_OVERLAYS) hideOverlay(el);
}

function showGameControls(visible) {
  if (!gameControls) return;
  if (visible) {
    gameControls.classList.remove('is-hidden');
    gameControls.setAttribute('aria-hidden', 'false');
  } else {
    gameControls.classList.add('is-hidden');
    gameControls.setAttribute('aria-hidden', 'true');
  }
  syncTouchControls(visible);
}

function shouldUseTouchControls() {
  return window.matchMedia('(max-width: 767px)').matches || 'ontouchstart' in window;
}

function clearTouchMovementKeys() {
  keys.ArrowLeft = false;
  keys.KeyA = false;
  keys.a = false;
  keys.ArrowRight = false;
  keys.KeyD = false;
  keys.d = false;
  keys.ArrowUp = false;
  keys.KeyW = false;
  keys.w = false;
  keys.ArrowDown = false;
  keys.KeyS = false;
  keys.s = false;
}

function syncTouchLayout() {
  const freeMove = currentLayer >= 2;
  const touchRowDown = document.getElementById('touch-row-down');
  if (touchRowVertical) {
    touchRowVertical.hidden = !freeMove;
    touchRowVertical.classList.toggle('is-hidden', !freeMove);
  }
  if (touchRowDown) {
    touchRowDown.hidden = !freeMove;
    touchRowDown.classList.toggle('is-hidden', !freeMove);
  }
  if (touchJump) {
    touchJump.hidden = freeMove;
    touchJump.classList.toggle('is-hidden', freeMove);
  }
  if (touchUp) touchUp.hidden = !freeMove;
  if (touchDown) touchDown.hidden = !freeMove;
}

function syncTouchControls(visible) {
  if (!touchControls) return;

  const show = visible && isPlaying() && shouldUseTouchControls();
  if (show) {
    touchControls.classList.remove('is-hidden');
    touchControls.classList.add('is-visible');
    touchControls.setAttribute('aria-hidden', 'false');
    syncTouchLayout();
  } else {
    touchControls.classList.add('is-hidden');
    touchControls.classList.remove('is-visible');
    touchControls.setAttribute('aria-hidden', 'true');
    clearTouchMovementKeys();
  }
}

function syncPauseButtons() {
  if (!btnPause || !btnResume) return;
  if (isPaused) {
    btnPause.classList.add('is-hidden');
    btnPause.hidden = true;
    btnResume.classList.remove('is-hidden');
    btnResume.hidden = false;
  } else {
    btnPause.classList.remove('is-hidden');
    btnPause.hidden = false;
    btnResume.classList.add('is-hidden');
    btnResume.hidden = true;
  }
}

function setPaused(paused) {
  if (!isPlaying()) return;
  isPaused = paused;
  syncPauseButtons();
  if (isPaused) pauseLayerMusic();
  else {
    lastTime = performance.now();
    resumeLayerMusic(currentLayer);
  }
}

/** Fit canvas backing store to CSS size × DPR; game logic uses logicalWidth/Height. */
function resizeCanvas() {
  const wrap = canvas?.parentElement;
  if (!wrap) return;

  const measured = Math.floor(wrap.clientWidth);
  const cssWidth = measured > 0
    ? Math.min(measured, CANVAS_MAX_WIDTH)
    : CANVAS_MAX_WIDTH;
  const cssHeight = Math.round(cssWidth * CANVAS_ASPECT);
  const dpr = window.devicePixelRatio || 1;

  logicalWidth = cssWidth;
  logicalHeight = cssHeight;

  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  player?.onCanvasResize(logicalWidth, logicalHeight);
  world?.setDimensions(logicalWidth, logicalHeight);
  background?.setDimensions(logicalWidth, logicalHeight);
}

function scheduleResizeCanvas() {
  if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
  resizeDebounceTimer = setTimeout(() => {
    resizeDebounceTimer = null;
    resizeCanvas();
    if (isPlaying()) syncTouchControls(true);
    else syncTouchControls(false);
  }, 150);
}

// --- State -------------------------------------------------------------------

function setGameState(next) {
  gameState = next;
}

function bumpSession() {
  sessionToken += 1;
  return sessionToken;
}

function isSessionActive(token) {
  return token === sessionToken;
}

function isPlaying() {
  return gameState === GameState.PLAYING;
}

function resetRunVariables() {
  score = 0;
  currentLayer = 1;
  downgradeStrikes = 0;
  haloEnergy = 0;
  protectiveCharges = 0;
  layerElapsed = 0;
  layerDuration = getLayerDuration(haloEnergy, HALO_MAX);
  pendingLayerUp = false;
  layerTransitionTimer = 0;
  layerTransitionAscending = false;
  enlightenmentPulse = 0;
  isPaused = false;
  hitFlashTimer = 0;
  floatingTexts.reset();
  world?.reset();
  background?.setVictoryGlow(0);
  player?.setProtectiveCharges(0);
}

function refreshLayerDuration() {
  layerDuration = getLayerDuration(haloEnergy, HALO_MAX);
}

function resetLayerTimer() {
  layerElapsed = 0;
  refreshLayerDuration();
}

function stopGameLoop() {
  if (animFrameId != null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

function startGameLoop() {
  stopGameLoop();
  lastTime = performance.now();
  animFrameId = requestAnimationFrame(gameLoop);
}

function clampHalo(value) {
  return Math.max(0, Math.min(HALO_MAX, value));
}

function addHalo(amount) {
  haloEnergy = clampHalo(haloEnergy + amount);
}

function loseHaloOnTemptationHit() {
  haloEnergy = clampHalo(haloEnergy - HALO_LOST_ON_TEMPTATION);
}

function grantProtectiveCharges() {
  const gained = 1 + Math.floor(Math.random() * 2);
  protectiveCharges = Math.min(PROTECTIVE_CHARGES_MAX, protectiveCharges + gained);
  player?.setProtectiveCharges(protectiveCharges);
  player?.triggerPickupFlash();
  return gained;
}

function getDisplayBestScore() {
  const saved = currentUser?.highScore ?? 0;
  return Math.max(saved, score);
}

// --- Canvas HUD --------------------------------------------------------------

function roundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
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

function drawCanvasHud() {
  const best = getDisplayBestScore();
  const panelW = 340;
  const panelH = 78;

  ctx.save();
  ctx.fillStyle = 'rgba(12, 18, 24, 0.82)';
  ctx.strokeStyle = 'rgba(126, 184, 154, 0.35)';
  ctx.lineWidth = 1;
  roundRect(ctx, 12, 12, panelW, panelH, 8);
  ctx.fill();
  ctx.stroke();

  ctx.font = '600 13px Outfit, system-ui, sans-serif';
  ctx.fillStyle = '#8a9ba8';
  ctx.fillText('Layer', 24, 34);
  ctx.fillText('Time', 24, 58);
  ctx.fillText('Score', 180, 34);
  ctx.fillText(`Halo: ${Math.round(haloEnergy)}%`, 180, 58);

  if (protectiveCharges > 0) {
    ctx.font = '600 12px Outfit, system-ui, sans-serif';
    ctx.fillStyle = '#ffe566';
    ctx.fillText(`Shield: ${protectiveCharges}/${PROTECTIVE_CHARGES_MAX}`, 260, 58);
  }

  const timeLeft = Math.max(0, Math.ceil(layerDuration - layerElapsed));
  ctx.font = '500 15px Outfit, system-ui, sans-serif';
  ctx.fillStyle = '#e8eef2';
  ctx.fillText(`${currentLayer} / ${MAX_LAYER}`, 72, 34);
  ctx.fillText(`${timeLeft}s`, 72, 58);
  ctx.fillText(String(score), 230, 34);
  ctx.fillText(String(best), 230, 58);

  const barX = 24;
  const barY = 68;
  const barW = panelW - 48;
  const barH = 8;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, barX, barY, barW, barH, 4);
  ctx.fill();

  const fillW = barW * (haloEnergy / HALO_MAX);
  if (fillW > 0) {
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, '#d4b896');
    grad.addColorStop(1, '#fff0a0');
    ctx.fillStyle = grad;
    roundRect(ctx, barX, barY, fillW, barH, 4);
    ctx.fill();
  }

  ctx.restore();
}

function drawDowngradeStrikeHud() {
  const panelW = 220;
  const panelH = 28;
  const panelX = 12;
  const panelY = 98;
  const strikeColors = ['#8a9ba8', '#d4a574', '#c97b7b'];
  const strikeColor = strikeColors[Math.min(downgradeStrikes, 2)];

  ctx.save();
  ctx.fillStyle = 'rgba(12, 18, 24, 0.82)';
  ctx.strokeStyle = 'rgba(201, 123, 123, 0.35)';
  ctx.lineWidth = 1;
  roundRect(ctx, panelX, panelY, panelW, panelH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.font = '600 13px Outfit, system-ui, sans-serif';
  ctx.fillStyle = strikeColor;
  ctx.fillText(`Downgrades: ${downgradeStrikes}/${MAX_DOWNGRADE_STRIKES}`, panelX + 12, panelY + 18);
  ctx.restore();
}

function drawHitFlash() {
  if (hitFlashTimer <= 0) return;

  const alpha = (hitFlashTimer / HIT_FLASH_DURATION) * HIT_FLASH_MAX_ALPHA;
  ctx.save();
  ctx.fillStyle = `rgba(201, 123, 123, ${alpha})`;
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);
  ctx.restore();
}

function drawPlayerHaloAura() {
  if (haloEnergy <= 0 || !player) return;
  const c = player.getCenter();
  const pulse = 0.85 + Math.sin(performance.now() * 0.004) * 0.15;
  const r = 24 + (haloEnergy / HALO_MAX) * 14;

  ctx.save();
  ctx.strokeStyle = `rgba(255, 220, 140, ${0.35 * pulse})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = `rgba(212, 184, 150, ${0.08 * pulse})`;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintFrame() {
  if (!background || !player || !world) return;
  ctx.clearRect(0, 0, logicalWidth, logicalHeight);
  background.draw();
  world.draw(ctx);
  drawPlayerHaloAura();
  player.draw(ctx);
  floatingTexts.draw(ctx);
  drawCanvasHud();
  drawDowngradeStrikeHud();
  drawHitFlash();
}

function updateDomHud() {
  if (!currentUser) return;
  hudUsername.textContent = currentUser.username;
  hudHighscore.textContent = String(getDisplayBestScore());
  hudEnergy.textContent = currentUser.isVip ? '∞' : String(currentUser.energy);
  syncHudEnergyStyle();
  vipBadge.hidden = !currentUser.isVip;
  layerNameEl.textContent = getLayerName(currentLayer);
  updateEnergyCountdownDisplay();
}

function syncHudEnergyStyle() {
  if (!hudEnergy || !currentUser) return;

  hudEnergy.classList.remove('hud-energy-high', 'hud-energy-mid', 'hud-energy-low', 'hud-energy-vip');

  if (currentUser.isVip) {
    hudEnergy.classList.add('hud-energy-vip');
    return;
  }

  const energy = currentUser.energy;
  if (energy > 2) {
    hudEnergy.classList.add('hud-energy-high');
  } else if (energy >= 1) {
    hudEnergy.classList.add('hud-energy-mid');
  } else {
    hudEnergy.classList.add('hud-energy-low');
  }
}

function getEnergyRefillCountdownText() {
  if (!energyStatus || currentUser?.isVip || energyStatus.msUntilRefill <= 0) {
    return null;
  }
  return `Energy refills in ${formatEnergyCountdown(energyStatus.msUntilRefill)}`;
}

// --- API ---------------------------------------------------------------------

const API_RETRY_ATTEMPTS = 3;
const API_RETRY_DELAY_MS = 2500;

function isLocalApi() {
  return (
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  );
}

function apiConnectionError() {
  if (isLocalApi()) {
    return 'Cannot connect to game server. Open a terminal, run: cd backend && npm start';
  }
  return 'Cannot reach the game server. The API may be waking up — wait a moment and try again.';
}

async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < API_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastError = err;
      if (attempt < API_RETRY_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, API_RETRY_DELAY_MS));
      }
    }
  }
  throw lastError;
}

async function apiPost(path, body) {
  let res;
  try {
    res = await fetchWithRetry(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(apiConnectionError());
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function apiGet(path) {
  let res;
  try {
    res = await fetchWithRetry(`${API_BASE}${path}`);
  } catch {
    throw new Error(apiConnectionError());
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function formatEnergyCountdown(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function stopEnergyCountdown() {
  if (energyCountdownTimer) {
    clearInterval(energyCountdownTimer);
    energyCountdownTimer = null;
  }
}

function showEnergyStatusError(visible) {
  if (!energyStatusError) return;
  energyStatusError.hidden = !visible;
}

function updateEnergyCountdownDisplay() {
  const countdownText = getEnergyRefillCountdownText();
  const showHudCountdown = Boolean(
    countdownText &&
    currentUser &&
    !currentUser.isVip &&
    currentUser.energy <= 0
  );

  if (energyCountdown) {
    if (countdownText) {
      energyCountdown.textContent = countdownText;
      energyCountdown.hidden = false;
    } else {
      energyCountdown.hidden = true;
    }
  }

  if (hudEnergyCountdown) {
    if (showHudCountdown) {
      hudEnergyCountdown.textContent = countdownText;
      hudEnergyCountdown.hidden = false;
    } else {
      hudEnergyCountdown.hidden = true;
    }
  }
}

function syncStartButtonState() {
  if (!btnStartGame) return;
  const outOfEnergy = Boolean(currentUser && !currentUser.isVip && currentUser.energy <= 0);
  btnStartGame.disabled = outOfEnergy;
  btnStartGame.classList.toggle('is-disabled', outOfEnergy);
  btnStartGame.setAttribute('aria-disabled', outOfEnergy ? 'true' : 'false');
}

function startEnergyCountdown() {
  if (!energyStatus || currentUser?.isVip || energyStatus.msUntilRefill <= 0) {
    stopEnergyCountdown();
    return;
  }

  stopEnergyCountdown();
  energyCountdownTimer = setInterval(() => {
    if (!energyStatus || currentUser?.isVip) {
      stopEnergyCountdown();
      return;
    }

    energyStatus.msUntilRefill = Math.max(0, energyStatus.msUntilRefill - 1000);
    updateEnergyCountdownDisplay();

    if (energyStatus.msUntilRefill === 0) {
      stopEnergyCountdown();
      fetchEnergyStatus().then(() => {
        updateDomHud();
        syncStartButtonState();
        updateEnergyCountdownDisplay();
      });
    }
  }, 1000);
}

async function fetchEnergyStatus() {
  if (!currentUser) return null;

  try {
    const data = await apiGet(
      `/api/energy-status?username=${encodeURIComponent(currentUser.username)}`
    );
    energyStatus = data;
    currentUser.energy = data.energy;
    currentUser.isVip = data.isVip;
    showEnergyStatusError(false);
    return data;
  } catch {
    energyStatus = null;
    if (energyCountdown) energyCountdown.hidden = true;
    if (hudEnergyCountdown) hudEnergyCountdown.hidden = true;
    showEnergyStatusError(true);
    return null;
  }
}

async function refreshEnergyUi() {
  await fetchEnergyStatus();
  updateDomHud();
  syncStartButtonState();
  updateEnergyCountdownDisplay();
  startEnergyCountdown();
}

async function fetchLeaderboard() {
  try {
    const data = await apiGet('/api/leaderboard?limit=10');
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return null;
  }
}

function renderLeaderboard(entries) {
  if (!leaderboardList || !leaderboardEmpty || !leaderboardError) return;

  leaderboardList.innerHTML = '';
  leaderboardError.hidden = true;

  if (entries === null) {
    leaderboardEmpty.hidden = true;
    leaderboardList.hidden = true;
    leaderboardError.hidden = false;
    return;
  }

  if (entries.length === 0) {
    leaderboardEmpty.hidden = false;
    leaderboardList.hidden = true;
    return;
  }

  leaderboardEmpty.hidden = true;
  leaderboardList.hidden = false;

  entries.forEach((entry, index) => {
    const li = document.createElement('li');
    li.className = 'leaderboard-entry';
    if (currentUser && entry.username === currentUser.username) {
      li.classList.add('is-current-user');
    }

    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = `${index + 1}.`;

    const name = document.createElement('span');
    name.className = 'leaderboard-name';
    name.textContent = entry.username;

    const score = document.createElement('span');
    score.className = 'leaderboard-score';
    score.textContent = String(entry.highScore);

    li.append(rank, name, score);
    leaderboardList.appendChild(li);
  });
}

async function refreshLeaderboard() {
  if (!currentUser) return;
  const entries = await fetchLeaderboard();
  renderLeaderboard(entries);
}

function showAuthError(message) {
  authError.textContent = message;
  authError.hidden = !message;
}

function showStartError(message) {
  if (!startError) return;
  startError.textContent = message;
  startError.hidden = !message;
}

function clearStartError() {
  showStartError('');
}

function saveRememberedUsername(username) {
  try {
    localStorage.setItem(USERNAME_STORAGE_KEY, username);
  } catch {
    /* storage blocked — ignore */
  }
}

function clearRememberedUsername() {
  try {
    localStorage.removeItem(USERNAME_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function getRememberedUsername() {
  try {
    return localStorage.getItem(USERNAME_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function initRememberUsername() {
  if (!usernameInput || !rememberMeCheckbox) return;

  const stored = getRememberedUsername();
  if (stored) {
    usernameInput.value = stored;
    rememberMeCheckbox.checked = true;
    rememberUsername = true;
  }
}

function persistUsernamePreference(username) {
  rememberUsername = Boolean(rememberMeCheckbox?.checked);
  if (rememberUsername) {
    saveRememberedUsername(username);
  } else {
    clearRememberedUsername();
  }
}

function handleLogout() {
  bumpSession();
  stopGameLoop();
  stopLayerMusic();
  stopEnergyCountdown();
  hideAllOverlays();
  hideEndOverlays();
  showGameControls(false);
  showEnergyStatusError(false);
  clearStartError();
  showAuthError('');

  if (!rememberUsername) {
    clearRememberedUsername();
    if (usernameInput) usernameInput.value = '';
  } else if (usernameInput) {
    usernameInput.value = getRememberedUsername();
  }

  if (rememberMeCheckbox) {
    rememberMeCheckbox.checked = rememberUsername;
  }

  currentUser = null;
  energyStatus = null;
  gameSection.hidden = true;
  authPanel.hidden = false;
  setGameState(GameState.IDLE);
}

function enterMenuAfterLogin() {
  resetRunVariables();
  hideAllOverlays();
  hideEndOverlays();
  showGameControls(false);
  clearStartError();
  showEnergyStatusError(false);
  setGameState(GameState.START);
  updateDomHud();
  showOverlay(overlayStart);
  refreshEnergyUi();
  refreshLeaderboard();
}

// --- Session flow ------------------------------------------------------------

function enterPlayingMode(token) {
  if (!isSessionActive(token)) return;

  resetRunVariables();
  hideAllOverlays();
  hideEndOverlays();

  if (!background) background = new Background(canvas);
  if (!player) player = new Player(canvas);
  if (!world) world = new WorldManager(logicalWidth, logicalHeight);
  else world.reset();

  resizeCanvas();
  player.resetPosition();
  background.setLayer(1);

  setGameState(GameState.PLAYING);
  isPaused = false;
  syncPauseButtons();
  showGameControls(true);
  stopEnergyCountdown();
  updateDomHud();
  startGameLoop();
  playLayerMusic(currentLayer);
  syncTouchLayout();
}

async function beginNewRun() {
  if (!currentUser) return;

  const token = bumpSession();
  stopGameLoop();
  stopLayerMusic();
  hideAllOverlays();
  hideEndOverlays();
  showGameControls(false);
  resetRunVariables();
  clearStartError();
  stopEnergyCountdown();
  setGameState(GameState.START);
  updateDomHud();

  try {
    const data = await apiPost('/api/start-game', { username: currentUser.username });
    if (!isSessionActive(token)) return;

    currentUser = data.user;
    updateDomHud();

    if (!data.allowed) {
      setGameState(GameState.START);
      showOverlay(overlayEnergy);
      refreshEnergyUi();
      return;
    }

    enterPlayingMode(token);
  } catch (err) {
    if (!isSessionActive(token)) return;
    setGameState(GameState.START);
    showOverlay(overlayStart);
    showStartError(err.message || 'Could not start game. Check the backend connection.');
  }
}

async function persistScoreAsync(token) {
  if (!currentUser || !isSessionActive(token)) return false;
  try {
    const data = await apiPost('/api/save-score', {
      username: currentUser.username,
      score,
    });
    if (!isSessionActive(token)) return false;
    currentUser = data.user;
    updateDomHud();
    return data.isNewRecord;
  } catch (err) {
    console.error('[Meditation] save-score failed:', err.message);
    return false;
  }
}

function showVictoryScreen() {
  hideAllOverlays();
  showGameControls(false);
  victoryScoreEl.textContent = String(score);
  victoryBestEl.textContent = String(getDisplayBestScore());
  showOverlay(victoryOverlay);
  announceGame(
    `Right fruition attained. Your halo shines beyond space. Final score: ${score}. Best score: ${getDisplayBestScore()}.`
  );
}

function showGameOverScreen() {
  hideAllOverlays();
  showGameControls(false);
  finalScoreEl.textContent = String(score);
  showOverlay(gameOverOverlay);
  announceGame(`Focus lost. ${gameoverMessage.textContent} Final score: ${score}.`);
}

function showSurrenderScreen() {
  hideAllOverlays();
  showGameControls(false);
  surrenderMessage.textContent = 'You actively stopped the meditation.';
  surrenderScoreEl.textContent = String(score);
  showOverlay(surrenderOverlay);
  announceGame(`Session ended. ${surrenderMessage.textContent} Final score: ${score}.`);
}

function finishRun({ victory = false, surrender = false, reason = '' } = {}) {
  const token = sessionToken;
  stopGameLoop();
  stopLayerMusic();
  isPaused = false;
  showGameControls(false);

  if (victory) {
    setGameState(GameState.VICTORY);
    gameoverMessage.textContent = reason;
    enlightenmentPulse = 1;
    background?.setVictoryGlow(1);
    player?.setEnlightenment(1);
    playSfx('victory');
    showVictoryScreen();
  } else if (surrender) {
    setGameState(GameState.SURRENDER);
    showSurrenderScreen();
  } else {
    setGameState(GameState.GAMEOVER);
    gameoverMessage.textContent = reason;
    playSfx('gameover');
    showGameOverScreen();
  }

  persistScoreAsync(token).then((isNew) => {
    if (!isSessionActive(token)) return;

    if (victory && victoryBestEl) {
      victoryBestEl.textContent = String(currentUser?.highScore ?? score);
    }

    const targets = surrender
      ? [recordMessage, surrenderRecordMessage]
      : victory
        ? [recordMessage, victoryRecordMessage]
        : [recordMessage];

    for (const el of targets) {
      if (!el) continue;
      if (isNew) {
        el.classList.remove('is-hidden');
        el.hidden = false;
      } else {
        el.classList.add('is-hidden');
        el.hidden = true;
      }
    }

    if (isNew) {
      announceGame('New personal best saved!');
      refreshLeaderboard();
    }
  });
}

function endGame(reason, { victory = false } = {}) {
  finishRun({ victory, reason });
}

function handleStopMeditation() {
  if (!isPlaying()) return;
  finishRun({ surrender: true });
}

// --- Shockwave & halo --------------------------------------------------------

function tryTriggerShockwave() {
  if (!isPlaying() || isPaused || !player) return;
  if (haloEnergy < HALO_SHOCKWAVE_COST) return;
  if (!player.triggerShockwave()) return;
  haloEnergy = clampHalo(haloEnergy - HALO_SHOCKWAVE_COST);
  playSfx('shockwave');
}

function processShockwaveClears() {
  const wave = player.getShockwaveCircle();
  if (!wave || !world) return;
  const clearedPositions = clearTemptationsInShockwave(world.temptations, wave);
  if (clearedPositions.length > 0) {
    score += clearedPositions.length * POINTS_PER_CLEAR;
    for (const pos of clearedPositions) {
      floatingTexts.spawn(pos.x, pos.y, `+${POINTS_PER_CLEAR}`, 'score');
    }
    updateDomHud();
  }
}

// --- Victory & layers (time-based) -------------------------------------------

function ascendLayer() {
  if (!isPlaying() || pendingLayerUp) return;

  if (currentLayer >= MAX_LAYER) {
    enlightenmentPulse = 1;
    background?.setVictoryGlow(1);
    endGame('You have attained right fruition — your halo shines beyond space.', { victory: true });
    return;
  }

  pendingLayerUp = true;
  score += SCORE_PER_LAYER_ASCEND;
  currentLayer += 1;
  background.setLayer(currentLayer);
  world?.reset();
  playLayerMusic(currentLayer);
  showLayerTransition(currentLayer);
  announceGame(`Layer ascended. ${getLayerName(currentLayer)}.`);
}

function checkLayerTimer(dt) {
  if (!isPlaying() || isPaused || pendingLayerUp || layerTransitionTimer > 0) return;

  layerElapsed += dt;
  refreshLayerDuration();

  if (layerElapsed >= layerDuration) {
    ascendLayer();
  }
}

function showLayerTransition(layer, descending = false) {
  const info = getLayerConfig(layer);
  const layerTitle = `Layer ${layer}: ${info?.name || 'Ascent'}`;
  const transitionText = descending
    ? getLayerDescendMessage(layer)
    : getLayerAscendMessage(layer);
  layerTransitionTitle.textContent = descending ? 'Stay Patient…' : 'Congratulations!';
  layerTransitionDesc.textContent = `${layerTitle}. ${transitionText}`;
  layerTransitionAscending = !descending;
  showOverlay(overlayLayer);
  layerTransitionTimer = LAYER_TRANSITION_DURATION;
  if (background) background.setAscentBorderPulse(0);
  if (!descending) playSfx('layer-up');
  updateDomHud();
  syncTouchLayout();
  announceGame(`${layerTitle}. ${transitionText}`);
}

function finishLayerTransition() {
  layerTransitionTimer = 0;
  pendingLayerUp = false;
  layerTransitionAscending = false;
  hideOverlay(overlayLayer);
  if (background) background.setAscentBorderPulse(0);
  if (isPlaying()) resetLayerTimer();
}

function updateLayerTransitionState(dt) {
  if (layerTransitionTimer <= 0) {
    if (background) background.setAscentBorderPulse(0);
    return false;
  }

  layerTransitionTimer -= dt;
  if (layerTransitionTimer <= 0) {
    finishLayerTransition();
    return false;
  }

  if (layerTransitionAscending && background) {
    const progress = 1 - layerTransitionTimer / LAYER_TRANSITION_DURATION;
    background.setAscentBorderPulse(Math.sin(progress * Math.PI));
  } else if (background) {
    background.setAscentBorderPulse(0);
  }

  return true;
}

function handleTemptationCollision() {
  if (!isPlaying() || isPaused) return;

  hitFlashTimer = HIT_FLASH_DURATION;
  player.invincible = 1.2;

  if (protectiveCharges > 0) {
    const lost = Math.min(protectiveCharges, 1 + Math.floor(Math.random() * 2));
    protectiveCharges = Math.max(0, protectiveCharges - lost);
    player.setProtectiveCharges(protectiveCharges);
    playSfx('duc');
    announceGame(
      protectiveCharges > 0
        ? `Protective halo weakened. ${protectiveCharges} shield layer${protectiveCharges > 1 ? 's' : ''} remain.`
        : 'Protective halo shattered. Stay mindful.'
    );
    return;
  }

  playSfx('duc');
  loseHaloOnTemptationHit();
  refreshLayerDuration();

  downgradeStrikes += 1;
  announceGame(`Tainted by negative thought. Downgrades: ${downgradeStrikes} of ${MAX_DOWNGRADE_STRIKES}.`);

  if (downgradeStrikes >= MAX_DOWNGRADE_STRIKES) {
    endGame('Three layer downgrades ended your ascent. Return to your breath and try again.');
    return;
  }

  if (currentLayer > 1) {
    currentLayer -= 1;
    background.setLayer(currentLayer);
    player.resetPosition();
    world?.reset();
    playLayerMusic(currentLayer);
    showLayerTransition(currentLayer, true);
  } else {
    layerElapsed = 0;
    world?.reset();
    announceGame(getLayerDescendMessage(1));
  }
}

// --- Main loop ---------------------------------------------------------------

function drawPausedBanner() {
  ctx.save();
  ctx.fillStyle = 'rgba(12, 18, 24, 0.55)';
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);
  ctx.font = '600 22px Outfit, system-ui, sans-serif';
  ctx.fillStyle = '#e8eef2';
  ctx.textAlign = 'center';
  ctx.fillText('Paused — Press Resume or Escape', logicalWidth / 2, logicalHeight / 2);
  ctx.textAlign = 'left';
  ctx.restore();
}

function gameLoop(timestamp) {
  if (!isPlaying()) {
    animFrameId = null;
    return;
  }

  animFrameId = requestAnimationFrame(gameLoop);

  if (isPaused) {
    paintFrame();
    drawPausedBanner();
    return;
  }

  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  if (hitFlashTimer > 0) {
    hitFlashTimer = Math.max(0, hitFlashTimer - dt);
  }

  // Layer overlay (~1.8s): player frozen; spawns paused; existing entities drift at 25% speed.
  const inLayerTransition = updateLayerTransitionState(dt);

  background.update(dt);

  if (!inLayerTransition) {
    player.update(dt, keys, { freeMove: currentLayer >= 2 });
    checkLayerTimer(dt);
  }

  const worldDt = inLayerTransition ? dt * 0.25 : dt;
  world.update(worldDt, currentLayer, {
    spawnPaused: inLayerTransition,
    layerElapsed,
    layerDuration,
  });
  floatingTexts.update(dt);

  if (!inLayerTransition) {
    const scripturePickups = world.collectScriptures(player.getBounds());
    if (scripturePickups.length > 0) {
      addHalo(scripturePickups.length * HALO_SCRIPTURE_GAIN);
      refreshLayerDuration();
      grantProtectiveCharges();
      playSfx('ten');
      for (const pos of scripturePickups) {
        floatingTexts.spawn(pos.x, pos.y, '+Shield', 'halo');
      }
      updateDomHud();
    }

    processShockwaveClears();

    for (const t of world.temptations) {
      if (t.cleared) continue;
      if (player.invincible <= 0 && rectsOverlap(player.getBounds(), t.getBounds())) {
        handleTemptationCollision();
        if (!isPlaying()) return;
        break;
      }
    }
  }

  paintFrame();
}

// --- Input -------------------------------------------------------------------

function onRestartClick(event) {
  event.preventDefault();
  event.stopPropagation();
  beginNewRun();
}

function bindRestartButtons() {
  document.querySelectorAll('.restart-btn').forEach((btn) => {
    btn.addEventListener('click', onRestartClick);
  });
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = usernameInput?.value.trim() || '';
  showAuthError('');

  if (!username) {
    showAuthError('Please enter a username.');
    return;
  }

  try {
    const data = await apiPost('/api/login', { username });
    currentUser = data.user;
    persistUsernamePreference(username);
    authPanel.hidden = true;
    gameSection.hidden = false;
    background = new Background(canvas);
    player = new Player(canvas);
    world = new WorldManager(logicalWidth, logicalHeight);
    resizeCanvas();
    enterMenuAfterLogin();
    console.log('[Meditation] Logged in:', currentUser.username);
  } catch (err) {
    showAuthError(err.message || 'Login failed. Is the backend running?');
  }
});

btnLogout?.addEventListener('click', (e) => {
  e.preventDefault();
  handleLogout();
});

document.getElementById('btn-energy-back')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  bumpSession();
  stopGameLoop();
  stopLayerMusic();
  showGameControls(false);
  hideEndOverlays();
  stopEnergyCountdown();
  showEnergyStatusError(false);
  setGameState(GameState.START);
  showOverlay(overlayStart);
  refreshEnergyUi();
});

document.getElementById('btn-surrender-back')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  bumpSession();
  stopGameLoop();
  stopLayerMusic();
  showGameControls(false);
  hideEndOverlays();
  setGameState(GameState.START);
  showOverlay(overlayStart);
});

btnPause?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (isPlaying() && !isPaused) setPaused(true);
});

btnResume?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (isPlaying() && isPaused) setPaused(false);
});

btnStop?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  handleStopMeditation();
});

bindRestartButtons();
bindTouchControls();

function bindTouchControls() {
  const setLeft = (pressed) => {
    keys.ArrowLeft = pressed;
    keys.KeyA = pressed;
    keys.a = pressed;
  };
  const setRight = (pressed) => {
    keys.ArrowRight = pressed;
    keys.KeyD = pressed;
    keys.d = pressed;
  };
  const setUp = (pressed) => {
    keys.ArrowUp = pressed;
    keys.KeyW = pressed;
    keys.w = pressed;
  };
  const setDown = (pressed) => {
    keys.ArrowDown = pressed;
    keys.KeyS = pressed;
    keys.s = pressed;
  };

  const bindHold = (el, onPress, onRelease) => {
    if (!el) return;

    const press = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isPlaying() || isPaused) return;
      onPress();
    };
    const release = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onRelease();
    };

    el.addEventListener('touchstart', press, { passive: false });
    el.addEventListener('touchend', release, { passive: false });
    el.addEventListener('touchcancel', release, { passive: false });
    el.addEventListener('mousedown', press);
    el.addEventListener('mouseup', release);
    el.addEventListener('mouseleave', release);
  };

  bindHold(touchLeft, () => setLeft(true), () => setLeft(false));
  bindHold(touchRight, () => setRight(true), () => setRight(false));
  bindHold(touchUp, () => setUp(true), () => setUp(false));
  bindHold(touchDown, () => setDown(true), () => setDown(false));

  const onJumpOrUp = () => {
    if (!isPlaying() || isPaused) return;
    if (currentLayer >= 2) setUp(true);
    else player?.jump();
  };
  const onJumpOrUpRelease = () => {
    if (currentLayer >= 2) setUp(false);
  };

  touchJump?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    suppressCanvasClickUntil = Date.now() + 400;
    onJumpOrUp();
  }, { passive: false });

  touchJump?.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onJumpOrUpRelease();
  }, { passive: false });

  touchJump?.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onJumpOrUp();
  });

  touchJump?.addEventListener('mouseup', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onJumpOrUpRelease();
  });

  touchUp?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    suppressCanvasClickUntil = Date.now() + 400;
    if (isPlaying() && !isPaused) setUp(true);
  }, { passive: false });

  touchUp?.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setUp(false);
  }, { passive: false });

  touchUp?.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPlaying() && !isPaused) setUp(true);
  });

  touchUp?.addEventListener('mouseup', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setUp(false);
  });
}

window.addEventListener('resize', scheduleResizeCanvas);

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  keys[e.key] = true;

  if (e.code === 'Space') {
    e.preventDefault();
    if (isPlaying() && !isPaused) {
      if (currentLayer >= 2) {
        keys.ArrowUp = true;
        keys.KeyW = true;
        keys.w = true;
      } else {
        player?.jump();
      }
    }
  }

  if (e.code === 'Escape' && isPlaying()) {
    e.preventDefault();
    setPaused(!isPaused);
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  keys[e.key] = false;
  if (e.code === 'Space' && currentLayer >= 2) {
    keys.ArrowUp = false;
    keys.KeyW = false;
    keys.w = false;
  }
});

canvas.addEventListener('click', (e) => {
  if (Date.now() < suppressCanvasClickUntil) return;
  e.preventDefault();
  if (isPlaying() && !isPaused) tryTriggerShockwave();
});

canvas.addEventListener('touchend', (e) => {
  if (!isPlaying() || isPaused) return;
  if (e.target !== canvas) return;
  if (e.changedTouches.length !== 1) return;
  e.preventDefault();
  suppressCanvasClickUntil = Date.now() + 400;
  tryTriggerShockwave();
}, { passive: false });

// --- Boot --------------------------------------------------------------------

initAudio();
initRememberUsername();
resizeCanvas();
hideAllOverlays();
hideEndOverlays();
showGameControls(false);
syncPauseButtons();
setGameState(GameState.IDLE);
console.log('[Meditation] Ready. API:', API_BASE);
