/** Temptations (tạp niệm) & Holy Scriptures (chánh niệm) per layer */

import {
  getLayerConfig,
  MOVEMENT_VERTICAL,
  MOVEMENT_HORIZONTAL,
  MOVEMENT_COMBINED,
} from './background.js';

/** Base fall speed — Layer 1 vertical reference. */
const BASE_VERTICAL_SPEED = 100;
/** Base horizontal speed — Layer 2 reference. */
const BASE_HORIZONTAL_SPEED = 120;

/**
 * Within-layer difficulty ramps over time spent on the layer.
 * Playtest note: Layer 1 should still feel fair for new players.
 */
const WITHIN_LAYER_TIME_STEP = 15;
const SPAWN_INTERVAL_REDUCTION_PER_STEP = 0.05;
const SPAWN_INTERVAL_MIN_FACTOR = 0.5;
const SPEED_BONUS_PER_STEP = 0.05;
const SPEED_BONUS_MAX = 0.3;

const TEMPTATION_COLORS = [
  '#6a4a5a', '#5a5068', '#704858', '#586070', '#684050', '#505862',
];

const LAYER_TEMPLATIONS = {
  1: ['building', 'tree', 'demon'],
  2: ['plane', 'cloud', 'fake-scroll'],
  3: ['meteor', 'balloon', 'demon'],
  4: ['satellite', 'debris', 'fake-scroll'],
  5: ['asteroid', 'rover', 'demon'],
  6: ['probe', 'dust', 'fake-scroll'],
  7: ['blackhole', 'comet', 'demon'],
};

let nextId = 0;

function getTimeWithinLayer(layerElapsed, layerDuration) {
  return Math.max(0, Math.min(layerElapsed, layerDuration));
}

function getSpawnIntervalFactor(layerElapsed, layerDuration, layer = 1) {
  const within = getTimeWithinLayer(layerElapsed, layerDuration);
  const steps = within / WITHIN_LAYER_TIME_STEP;
  let reduction = steps * SPAWN_INTERVAL_REDUCTION_PER_STEP;
  if (layer >= 5) reduction *= 0.65;
  return Math.max(SPAWN_INTERVAL_MIN_FACTOR, 1 - reduction);
}

function getSpeedMultiplier(layerElapsed, layerDuration, layer = 1) {
  const within = getTimeWithinLayer(layerElapsed, layerDuration);
  const steps = within / WITHIN_LAYER_TIME_STEP;
  let cap = SPEED_BONUS_MAX;
  if (layer >= 5) cap *= 0.55;
  if (layer >= 6) cap *= 0.85;
  const bonus = Math.min(steps * SPEED_BONUS_PER_STEP, cap);
  return 1 + bonus;
}

function getMovementSpeeds(layerConfig, speedMultiplier) {
  const vy =
    BASE_VERTICAL_SPEED * (layerConfig.verticalMult || 0) * speedMultiplier;
  const vx =
    BASE_HORIZONTAL_SPEED * (layerConfig.horizontalMult || 0) * speedMultiplier;
  return { vx, vy };
}

function initEntityMotion(entity, layerConfig, canvasWidth, canvasHeight) {
  const pattern = layerConfig.movement;
  const margin = 24;
  const h = canvasHeight;
  const w = canvasWidth;

  if (pattern === MOVEMENT_VERTICAL) {
    entity.x = margin + Math.random() * Math.max(40, w - entity.width - margin * 2);
    entity.y = -entity.height - Math.random() * 50;
    entity.vx = 0;
    entity.vy = entity.speedY;
  } else if (pattern === MOVEMENT_HORIZONTAL) {
    entity.y = 48 + Math.random() * Math.max(40, h - 96 - entity.height);
    if (Math.random() < 0.5) {
      entity.x = -entity.width - 10;
      entity.vx = Math.abs(entity.speedX);
    } else {
      entity.x = w + 10;
      entity.vx = -Math.abs(entity.speedX);
    }
    entity.vy = 0;
  } else {
    entity.x = margin + Math.random() * Math.max(40, w - entity.width - margin * 2);
    entity.y = -entity.height - Math.random() * 40;
    entity.vx = (Math.random() < 0.5 ? 1 : -1) * Math.abs(entity.speedX);
    entity.vy = entity.speedY;
  }
}

/** Negative thought / tạp niệm — non-yellow palette */
export class Temptation {
  constructor(layer, canvasWidth, canvasHeight, layerConfig, speedMultiplier = 1) {
    this.id = nextId++;
    this.kind = 'temptation';
    this.layer = layer;
    const types = LAYER_TEMPLATIONS[layer] || LAYER_TEMPLATIONS[1];
    this.type = types[Math.floor(Math.random() * types.length)];

    this.width = 36 + Math.random() * 28;
    this.height = 32 + Math.random() * 24;
    this.cleared = false;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 2;
    this.fillColor = TEMPTATION_COLORS[Math.floor(Math.random() * TEMPTATION_COLORS.length)];

    const { vx, vy } = getMovementSpeeds(layerConfig, speedMultiplier);
    this.speedX = vx + (Math.random() - 0.5) * 20;
    this.speedY = vy + (Math.random() - 0.5) * 15;
    initEntityMotion(this, layerConfig, canvasWidth, canvasHeight);
  }

  update(dt, canvasWidth, canvasHeight) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.rotSpeed * dt;
    this._canvasW = canvasWidth;
    this._canvasH = canvasHeight;
  }

  isOffScreen() {
    const w = this._canvasW || 900;
    const h = this._canvasH || 520;
    const pad = 40;
    return (
      this.x + this.width < -pad ||
      this.x > w + pad ||
      this.y + this.height < -pad ||
      this.y > h + pad
    );
  }

  getBounds() {
    return {
      x: this.x + 4,
      y: this.y + 4,
      w: this.width - 8,
      h: this.height - 8,
    };
  }

  draw(ctx) {
    if (this.cleared) return;

    ctx.save();
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
    ctx.rotate(this.rotation);

    const drawFns = {
      building: () => this._drawBuilding(ctx),
      tree: () => this._drawTree(ctx),
      demon: () => this._drawDemon(ctx),
      plane: () => this._drawPlane(ctx),
      cloud: () => this._drawCloud(ctx),
      'fake-scroll': () => this._drawFakeScroll(ctx),
      meteor: () => this._drawMeteor(ctx),
      balloon: () => this._drawBalloon(ctx),
      satellite: () => this._drawSatellite(ctx),
      debris: () => this._drawDebris(ctx),
      asteroid: () => this._drawAsteroid(ctx),
      rover: () => this._drawRover(ctx),
      probe: () => this._drawProbe(ctx),
      dust: () => this._drawDust(ctx),
      blackhole: () => this._drawBlackHole(ctx),
      comet: () => this._drawComet(ctx),
    };

    (drawFns[this.type] || drawFns.building)();
    ctx.restore();
  }

  _drawWithColor(ctx, drawFn) {
    const prev = ctx.fillStyle;
    ctx.fillStyle = this.fillColor;
    drawFn();
    ctx.fillStyle = prev;
  }

  _drawBuilding(ctx) {
    const w = this.width;
    const h = this.height;
    this._drawWithColor(ctx, () => ctx.fillRect(-w / 2, -h / 2, w, h));
  }

  _drawTree(ctx) {
    this._drawWithColor(ctx, () => {
      ctx.fillRect(-4, 0, 8, this.height / 2);
      ctx.beginPath();
      ctx.moveTo(0, -this.height / 2);
      ctx.lineTo(-this.width / 2, this.height / 4);
      ctx.lineTo(this.width / 2, this.height / 4);
      ctx.closePath();
      ctx.fill();
    });
  }

  _drawDemon(ctx) {
    this._drawWithColor(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(0, -this.height / 2);
      ctx.lineTo(-this.width / 2, this.height / 3);
      ctx.lineTo(this.width / 2, this.height / 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-6, -this.height / 2 - 6, 12, 10);
    });
  }

  _drawFakeScroll(ctx) {
    this._drawWithColor(ctx, () => {
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
      ctx.fillStyle = 'rgba(120,100,90,0.6)';
      ctx.fillRect(-this.width / 2 + 4, -this.height / 2 + 6, this.width - 8, 4);
    });
  }

  _drawPlane(ctx) {
    this._drawWithColor(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(0, 0, this.width / 2, this.height / 4, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  _drawCloud(ctx) {
    ctx.fillStyle = this.fillColor;
    ctx.beginPath();
    ctx.arc(-12, 0, 14, 0, Math.PI * 2);
    ctx.arc(0, -4, 18, 0, Math.PI * 2);
    ctx.arc(14, 0, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawMeteor(ctx) {
    this._drawWithColor(ctx, () => {
      ctx.beginPath();
      ctx.arc(0, 0, this.width / 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  _drawBalloon(ctx) {
    this._drawWithColor(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(0, -8, 14, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  _drawSatellite(ctx) {
    this._drawWithColor(ctx, () => ctx.fillRect(-8, -6, 16, 12));
  }

  _drawDebris(ctx) {
    this._drawWithColor(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(-10, -8);
      ctx.lineTo(12, -4);
      ctx.lineTo(8, 10);
      ctx.lineTo(-14, 6);
      ctx.closePath();
      ctx.fill();
    });
  }

  _drawAsteroid(ctx) {
    this._drawWithColor(ctx, () => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = this.width / 2.2 + (i % 2) * 4;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    });
  }

  _drawRover(ctx) {
    this._drawWithColor(ctx, () => ctx.fillRect(-14, -6, 28, 12));
  }

  _drawProbe(ctx) {
    this._drawWithColor(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(0, -this.height / 2);
      ctx.lineTo(-10, this.height / 2);
      ctx.lineTo(10, this.height / 2);
      ctx.closePath();
      ctx.fill();
    });
  }

  _drawDust(ctx) {
    ctx.fillStyle = this.fillColor;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(-16 + i * 8, (i % 2) * 6 - 3, 6 + i * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawBlackHole(ctx) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, this.width / 2);
    g.addColorStop(0, '#180818');
    g.addColorStop(0.6, this.fillColor);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, this.width / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawComet(ctx) {
    this._drawWithColor(ctx, () => {
      ctx.beginPath();
      ctx.arc(8, 0, 10, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

/** Chánh niệm — bright golden yellow only */
export class HolyScripture {
  constructor(canvasWidth, canvasHeight, layerConfig, speedMultiplier = 1) {
    this.id = nextId++;
    this.kind = 'scripture';
    this.width = 28;
    this.height = 32;
    this.collected = false;
    this.glowPhase = Math.random() * Math.PI * 2;
    this.bobOffset = 0;

    const { vx, vy } = getMovementSpeeds(layerConfig, speedMultiplier * 0.85);
    this.speedX = vx;
    this.speedY = vy;
    initEntityMotion(this, layerConfig, canvasWidth, canvasHeight);
  }

  update(dt, canvasWidth, canvasHeight) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.glowPhase += dt * 4;
    this.bobOffset = Math.sin(this.glowPhase * 1.2) * 4;
    this._canvasW = canvasWidth;
    this._canvasH = canvasHeight;
  }

  isOffScreen() {
    const w = this._canvasW || 900;
    const h = this._canvasH || 520;
    const pad = 40;
    return (
      this.x + this.width < -pad ||
      this.x > w + pad ||
      this.y + this.height < -pad ||
      this.y > h + pad
    );
  }

  getBounds() {
    return {
      x: this.x + 2,
      y: this.y + 2,
      w: this.width - 4,
      h: this.height - 4,
    };
  }

  draw(ctx) {
    if (this.collected) return;

    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2 + this.bobOffset;
    const pulse = 0.6 + Math.sin(this.glowPhase) * 0.3;

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 32);
    glow.addColorStop(0, `rgba(255,235,80,${0.7 * pulse})`);
    glow.addColorStop(0.5, `rgba(255,220,60,${0.35 * pulse})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFE566';
    ctx.strokeStyle = '#FFF9C0';
    ctx.lineWidth = 2;
    ctx.fillRect(this.x, this.y + 4, this.width, this.height - 8);
    ctx.strokeRect(this.x, this.y + 4, this.width, this.height - 8);

    ctx.fillStyle = '#FFFDE8';
    ctx.fillRect(this.x + 6, this.y + 10, this.width - 12, 3);
    ctx.fillRect(this.x + 6, this.y + 17, this.width - 12, 3);
    ctx.fillRect(this.x + 6, this.y + 24, this.width - 16, 3);
  }
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function circleIntersectsRect(cx, cy, radius, rect) {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dist = Math.hypot(cx - closestX, cy - closestY);
  return dist <= radius;
}

export function clearTemptationsInShockwave(temptations, shockwave) {
  if (!shockwave || shockwave.r <= 0) return [];
  const clearedPositions = [];
  for (const t of temptations) {
    if (t.cleared) continue;
    if (circleIntersectsRect(shockwave.cx, shockwave.cy, shockwave.r, t.getBounds())) {
      t.cleared = true;
      clearedPositions.push({
        x: t.x + t.width / 2,
        y: t.y + t.height / 2,
      });
    }
  }
  return clearedPositions;
}

export class WorldManager {
  constructor(canvasWidth, canvasHeight) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.temptations = [];
    this.scriptures = [];
    this.temptationTimer = 0.8;
    this.scriptureTimer = 2.2;
  }

  reset() {
    this.temptations = [];
    this.scriptures = [];
    this.temptationTimer = 0.8;
    this.scriptureTimer = 2.2;
  }

  setDimensions(width, height) {
    if (width <= 0 || height <= 0) return;
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  update(dt, layer, options = {}) {
    const {
      spawnPaused = false,
      layerElapsed = 0,
      layerDuration = 90,
      speedFactor = 1,
    } = options;

    const layerConfig = getLayerConfig(layer);
    const spawnIntervalFactor = getSpawnIntervalFactor(layerElapsed, layerDuration, layer);
    const speedMultiplier = getSpeedMultiplier(layerElapsed, layerDuration, layer) * speedFactor;
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    if (!spawnPaused) {
      this.temptationTimer -= dt;
      this.scriptureTimer -= dt;

      const baseTemptationRate = Math.max(0.45, 1.35 - layer * 0.08);
      if (this.temptationTimer <= 0) {
        this.temptations.push(
          new Temptation(layer, w, h, layerConfig, speedMultiplier)
        );
        this.temptationTimer = (baseTemptationRate + Math.random() * 0.5) * spawnIntervalFactor;
      }

      if (this.scriptureTimer <= 0) {
        this.scriptures.push(new HolyScripture(w, h, layerConfig, speedMultiplier));
        this.scriptureTimer = 2.5 + Math.random() * 2;
      }
    }

    for (const t of this.temptations) t.update(dt, w, h);
    for (const s of this.scriptures) s.update(dt, w, h);

    this.temptations = this.temptations.filter((t) => !t.isOffScreen() && !t.cleared);
    this.scriptures = this.scriptures.filter((s) => !s.isOffScreen() && !s.collected);
  }

  draw(ctx) {
    for (const s of this.scriptures) s.draw(ctx);
    for (const t of this.temptations) t.draw(ctx);
  }

  collectScriptures(playerBounds) {
    const pickups = [];
    for (const s of this.scriptures) {
      if (s.collected) continue;
      if (rectsOverlap(playerBounds, s.getBounds())) {
        s.collected = true;
        pickups.push({
          x: s.x + s.width / 2,
          y: s.y + s.height / 2 + s.bobOffset,
        });
      }
    }
    this.scriptures = this.scriptures.filter((s) => !s.collected);
    return pickups;
  }
}
