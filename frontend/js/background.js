/** Layer themes for Meditation: 7 Layers of Ascent */

/** Movement patterns per layer (see obstacle.js for speed multipliers). */
export const MOVEMENT_VERTICAL = 'vertical-down';
export const MOVEMENT_HORIZONTAL = 'horizontal';
export const MOVEMENT_COMBINED = 'combined';

export const LAYER_INFO = [
  {
    id: 1,
    name: 'Earth Ground',
    movement: MOVEMENT_VERTICAL,
    verticalMult: 1,
    horizontalMult: 0,
    music: 'layer-1',
  },
  {
    id: 2,
    name: 'Sky',
    movement: MOVEMENT_HORIZONTAL,
    verticalMult: 0,
    horizontalMult: 1,
    music: 'layer-2',
  },
  {
    id: 3,
    name: 'Stratosphere',
    movement: MOVEMENT_VERTICAL,
    verticalMult: 1.2,
    horizontalMult: 0,
    music: 'layer-3',
  },
  {
    id: 4,
    name: 'Low Earth Orbit',
    movement: MOVEMENT_HORIZONTAL,
    verticalMult: 0,
    horizontalMult: 1.2,
    music: 'layer-4',
  },
  {
    id: 5,
    name: 'Moon Orbit',
    movement: MOVEMENT_VERTICAL,
    verticalMult: 1.44,
    horizontalMult: 0,
    music: 'layer-5',
  },
  {
    id: 6,
    name: 'Mars Orbit',
    movement: MOVEMENT_COMBINED,
    verticalMult: 1,
    horizontalMult: 1,
    music: 'layer-6',
  },
  {
    id: 7,
    name: 'Outside Solar System',
    movement: MOVEMENT_COMBINED,
    verticalMult: 1.2,
    horizontalMult: 1.2,
    music: 'layer-7',
  },
];

/** Layer duration bounds (seconds) — scales with mindfulness (halo). */
export const LAYER_DURATION_MIN = 45;
export const LAYER_DURATION_MAX = 90;

/** Layer overlay duration — keep in sync with main.js `layerTransitionTimer`. */
export const LAYER_TRANSITION_DURATION = 2.2;

export const MAX_LAYER = 7;
export const MAX_DOWNGRADE_STRIKES = 3;

/** Score needed within the current layer to ascend (layer 7 uses victory flow). */
export const LAYER_SCORE_TARGETS = {
  1: 180,
  2: 200,
  3: 220,
  4: 240,
  5: 260,
  6: 280,
  7: 0,
};

/** Soft time cap per layer (seconds) — ascend when reached even if score goal unmet. */
export const LAYER_TIME_CAP_MAX = 120;
export const LAYER_TIME_CAP_MIN = 90;

/** In-layer day cycle length (seconds) for gradient tint on lower layers. */
export const DAY_CYCLE_SEC = 90;

const LAYER_THEMES = {
  1: ['#1e3328', '#2d4a3e', '#4a7a5a'],
  2: ['#3a5a8a', '#5a8ab8', '#9ec8f0'],
  3: ['#1a2848', '#3a5088', '#88b0e8'],
  4: ['#080c18', '#141c38', '#2a3868'],
  5: ['#12121a', '#282838', '#585878'],
  6: ['#281018', '#482820', '#885838'],
  7: ['#040208', '#0c0820', '#281050'],
};

const LAYER_THEMES_NIGHT = {
  1: ['#0e1812', '#162820', '#2a4038'],
  2: ['#1a2848', '#2a3868', '#4a6090'],
  3: ['#0a1020', '#1a2848', '#3a5088'],
};

export function getLayerScoreTarget(layerId) {
  return LAYER_SCORE_TARGETS[layerId] ?? 200;
}

/** Time cap shrinks slightly with higher halo (mindfulness). */
export function getLayerTimeCap(haloEnergy, haloMax = 100) {
  const t = Math.max(0, Math.min(1, haloEnergy / haloMax));
  return LAYER_TIME_CAP_MAX - t * (LAYER_TIME_CAP_MAX - LAYER_TIME_CAP_MIN);
}

function parseHex(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function lerpChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

export function lerpHexColor(a, b, t) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const r = lerpChannel(ca.r, cb.r, t);
  const g = lerpChannel(ca.g, cb.g, t);
  const bl = lerpChannel(ca.b, cb.b, t);
  return `rgb(${r},${g},${bl})`;
}

function getThemeColors(layer, cyclePhase = 0) {
  const base = LAYER_THEMES[layer] || LAYER_THEMES[1];
  if (layer > 3 || cyclePhase <= 0) return [...base];
  const night = LAYER_THEMES_NIGHT[layer];
  if (!night) return [...base];
  const duskStart = 0.55;
  if (cyclePhase < duskStart) return [...base];
  const t = (cyclePhase - duskStart) / (1 - duskStart);
  return [
    lerpHexColor(base[0], night[0], t),
    lerpHexColor(base[1], night[1], t),
    lerpHexColor(base[2], night[2], t),
  ];
}

export function getLayerConfig(layerId) {
  return LAYER_INFO.find((l) => l.id === layerId) || LAYER_INFO[0];
}

/** Duration for current layer: 45–90s from accumulated mindfulness (halo 0–100). */
export function getLayerDuration(haloEnergy, haloMax = 100) {
  const t = Math.max(0, Math.min(1, haloEnergy / haloMax));
  return LAYER_DURATION_MIN + t * (LAYER_DURATION_MAX - LAYER_DURATION_MIN);
}

export function getLayerName(layerId) {
  const info = getLayerConfig(layerId);
  return `Layer ${info.id}: ${info.name}`;
}

export function getLayerMindfulnessQuote(layerId) {
  const quotes = {
    1: 'Root yourself in the present moment.',
    2: 'Let thoughts drift like clouds.',
    3: 'Rise above distraction with gentle breath.',
    4: 'Observe without attachment.',
    5: 'Illuminate the path with inner light.',
    6: 'Release what no longer serves you.',
    7: 'Rest in boundless awareness.',
  };
  return quotes[layerId] || 'Breathe. Focus. Ascend.';
}

/** Congratulatory message when ascending to a layer. */
export function getLayerAscendMessage(layerId) {
  const messages = {
    1: 'Welcome to Earth Ground — root your breath and begin.',
    2: 'Congratulations! You rise into the Sky — move freely in all directions.',
    3: 'Well done! The Stratosphere welcomes your steady focus.',
    4: 'Splendid ascent! Low Earth Orbit shines beneath your calm.',
    5: 'Brilliant! Moon Orbit reflects your growing light.',
    6: 'Outstanding! Mars Orbit cannot shake your patience.',
    7: 'Magnificent! You stand at the edge of the cosmos.',
  };
  return messages[layerId] || 'Your ascent continues — breathe and rejoice.';
}

/** Encouragement when descending a layer. */
export function getLayerDescendMessage(layerId) {
  const messages = {
    1: 'Stay patient on Earth Ground. Each breath is a new beginning.',
    2: 'The Sky waits for you. Be gentle — return when you are ready.',
    3: 'Stratosphere calls again. Persist with kindness toward yourself.',
    4: 'Orbit is within reach. Slow down, breathe, and try once more.',
    5: 'The Moon still glows for you. Patience is your path back.',
    6: 'Mars Orbit is not lost forever. Center yourself and ascend again.',
    7: 'Even here, at the cosmos edge, patience opens the way forward.',
  };
  return messages[layerId] || 'Be patient. Mindfulness will carry you upward again.';
}

export class Background {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layer = 1;
    this.time = 0;
    this.ascentBorderPulse = 0;
    this.victoryGlow = 0;
    this.logicalWidth = 900;
    this.logicalHeight = 520;
    this.stars = [];
    this.clouds = [];
    this.sparkles = [];
    this.layerElapsed = 0;
    this.transitionBlend = 1;
    this.transitionFrom = null;
    this.transitionTo = null;
    this._initParticles();
  }

  _initParticles() {
    const w = this.logicalWidth;
    const h = this.logicalHeight;
    const starCount = 80 + this.layer * 25;
    this.stars = Array.from({ length: starCount }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.8 + 0.2,
      speed: Math.random() * 0.4 + 0.08,
      alpha: Math.random() * 0.6 + 0.2,
      hue: 200 + Math.random() * 80,
    }));
    this.clouds = Array.from({ length: 8 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h * 0.5,
      w: 60 + Math.random() * 80,
      speed: 0.2 + Math.random() * 0.4,
      alpha: 0.12 + Math.random() * 0.18,
    }));
    this.sparkles = Array.from({ length: 40 + this.layer * 12 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      phase: Math.random() * Math.PI * 2,
      size: Math.random() * 2 + 0.5,
    }));
  }

  setLayer(layer) {
    const next = Math.max(1, Math.min(MAX_LAYER, layer));
    if (next !== this.layer) {
      this.beginLayerTransition(this.layer, next);
      this.layer = next;
      this._initParticles();
    } else {
      this.layer = next;
    }
  }

  beginLayerTransition(fromLayer, toLayer) {
    this.transitionFrom = getThemeColors(fromLayer, 0);
    this.transitionTo = getThemeColors(toLayer, 0);
    this.transitionBlend = 0;
  }

  setLayerElapsed(seconds) {
    this.layerElapsed = Math.max(0, seconds);
  }

  setAscentBorderPulse(value) {
    this.ascentBorderPulse = Math.max(0, Math.min(1, value));
  }

  setVictoryGlow(value) {
    this.victoryGlow = Math.max(0, Math.min(1, value));
  }

  setDimensions(width, height) {
    if (width <= 0 || height <= 0) return;
    if (width === this.logicalWidth && height === this.logicalHeight) return;
    this.logicalWidth = width;
    this.logicalHeight = height;
    this._initParticles();
  }

  update(dt) {
    this.time += dt;
    if (this.transitionBlend < 1) {
      this.transitionBlend = Math.min(1, this.transitionBlend + dt * 1.4);
    }
    const w = this.logicalWidth;
    const h = this.logicalHeight;
    const starSpeed = 0.4 + this.layer * 0.35;

    for (const s of this.stars) {
      s.y += s.speed * starSpeed * dt * 60;
      s.alpha = 0.25 + Math.sin(this.time * 2 + s.x) * 0.2 + this.layer * 0.04;
      if (s.y > h) {
        s.y = 0;
        s.x = Math.random() * w;
      }
    }

    for (const c of this.clouds) {
      c.x -= c.speed * 40 * dt;
      if (c.x + c.w < 0) {
        c.x = w + 20;
        c.y = Math.random() * h * 0.4;
      }
    }

    for (const sp of this.sparkles) {
      sp.phase += dt * (1.5 + this.layer * 0.3);
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.logicalWidth;
    const h = this.logicalHeight;
    const L = this.layer;

    const cyclePhase =
      L <= 3 && DAY_CYCLE_SEC > 0
        ? (this.layerElapsed % DAY_CYCLE_SEC) / DAY_CYCLE_SEC
        : 0;
    let colors = getThemeColors(L, cyclePhase);

    if (this.transitionFrom && this.transitionTo && this.transitionBlend < 1) {
      const t = this.transitionBlend;
      colors = colors.map((c, i) =>
        lerpHexColor(this.transitionFrom[i] || c, this.transitionTo[i] || c, t)
      );
    }

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, colors[2]);
    grad.addColorStop(0.45, colors[1]);
    grad.addColorStop(1, colors[0]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    if (this.transitionBlend < 0.35) {
      ctx.save();
      ctx.fillStyle = `rgba(255, 240, 180, ${(1 - this.transitionBlend / 0.35) * 0.12})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    if (L >= 2 && L <= 3) this._drawClouds(ctx);
    if (L >= 3) this._drawStars(ctx);
    if (L >= 5) this._drawSparkles(ctx);
    if (L === 1) this._drawGround(ctx, w, h);
    if (L === 5) this._drawMoon(ctx, w, h);
    if (L >= 6) this._drawNebula(ctx, w, h);
    if (L === 7) this._drawCosmicRings(ctx, w, h);

    this._drawAmbientGlow(ctx, w, h);

    if (this.victoryGlow > 0) {
      this._drawVictoryRadiance(ctx, w, h);
    }

    if (this.ascentBorderPulse > 0) {
      this._drawAscentBorderPulse(ctx, w, h);
    }
  }

  _drawGround(ctx, w, h) {
    ctx.fillStyle = '#1e3328';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 40) {
      const y = h - 40 - Math.sin(x * 0.02 + this.time) * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }

  _drawClouds(ctx) {
    for (const c of this.clouds) {
      ctx.fillStyle = `rgba(255,255,255,${c.alpha})`;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.w * 0.5, c.w * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawStars(ctx) {
    for (const s of this.stars) {
      const a = Math.min(1, s.alpha);
      if (this.layer >= 6) {
        ctx.fillStyle = `hsla(${s.hue}, 70%, 85%, ${a})`;
      } else {
        ctx.fillStyle = `rgba(255,255,255,${a})`;
      }
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawSparkles(ctx) {
    for (const sp of this.sparkles) {
      const a = 0.2 + Math.sin(sp.phase) * 0.35;
      ctx.fillStyle = `rgba(255, 220, 160, ${a * (this.layer / 7)})`;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawMoon(ctx, w, h) {
    const mx = w * 0.75;
    const my = h * 0.2;
    const glow = ctx.createRadialGradient(mx, my, 0, mx, my, 90);
    glow.addColorStop(0, 'rgba(220,220,255,0.5)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(mx - 90, my - 90, 180, 180);

    ctx.fillStyle = '#d8d8f0';
    ctx.beginPath();
    ctx.arc(mx, my, 36, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawNebula(ctx, w, h) {
    const pulse = 0.35 + Math.sin(this.time * 0.5) * 0.12;
    const g = ctx.createRadialGradient(w * 0.3, h * 0.35, 0, w * 0.3, h * 0.35, w * 0.55);
    g.addColorStop(0, `rgba(160,100,220,${pulse})`);
    g.addColorStop(0.45, `rgba(80,50,140,${pulse * 0.5})`);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const g2 = ctx.createRadialGradient(w * 0.8, h * 0.6, 0, w * 0.8, h * 0.6, w * 0.4);
    g2.addColorStop(0, `rgba(255,180,100,${pulse * 0.35})`);
    g2.addColorStop(1, 'transparent');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);
  }

  _drawCosmicRings(ctx, w, h) {
    const cx = w * 0.5;
    const cy = h * 0.45;
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < 3; i++) {
      const r = 80 + i * 55 + Math.sin(this.time * 0.3 + i) * 8;
      ctx.strokeStyle = `rgba(180, 140, 255, ${0.08 + i * 0.04})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.35, this.time * 0.1 + i * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawAmbientGlow(ctx, w, h) {
    const sage = 0.06 + this.layer * 0.02;
    const glow = ctx.createRadialGradient(w * 0.5, h * 0.85, 0, w * 0.5, h, h * 0.65);
    glow.addColorStop(0, `rgba(126,184,154,${sage})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    if (this.layer >= 5) {
      const topGlow = ctx.createRadialGradient(w * 0.5, 0, 0, w * 0.5, h * 0.3, h * 0.5);
      topGlow.addColorStop(0, `rgba(200, 160, 255, ${0.06 + this.layer * 0.015})`);
      topGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = topGlow;
      ctx.fillRect(0, 0, w, h);
    }
  }

  _drawVictoryRadiance(ctx, w, h) {
    const pulse = 0.5 + Math.sin(this.time * 1.2) * 0.25;
    const a = this.victoryGlow * pulse;
    const g = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.65);
    g.addColorStop(0, `rgba(255, 240, 180, ${a * 0.45})`);
    g.addColorStop(0.4, `rgba(255, 200, 120, ${a * 0.2})`);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  _drawAscentBorderPulse(ctx, w, h) {
    const flicker = 0.65 + Math.sin(this.time * 10) * 0.35;
    const alpha = this.ascentBorderPulse * flicker * 0.55;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 220, 140, ${alpha})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.restore();
  }
}
