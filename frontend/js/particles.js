/**
 * Lightweight canvas particle bursts for game juice.
 */

const PRESETS = {
  dust: { count: 12, speed: 105, life: 0.55, gravity: 300, colors: ['#6a8a7a', '#4a6a5a', '#8ab89a'] },
  gold: { count: 20, speed: 130, life: 0.85, gravity: -30, colors: ['#ffe566', '#fff0a0', '#d4b896'] },
  dull: { count: 18, speed: 150, life: 0.68, gravity: 70, colors: ['#8a6a7a', '#6a4a5a', '#5a5068'] },
  shieldPop: { count: 16, speed: 110, life: 0.72, gravity: -10, colors: ['#fff0a0', '#ffe566'] },
  ripple: { count: 24, speed: 175, life: 0.58, gravity: 0, colors: ['#c4a0ff', '#e8d4ff', '#fff0a0'] },
  ascend: { count: 34, speed: 120, life: 1.35, gravity: -30, colors: ['#fff0a0', '#7eb89a', '#c4b8e8'] },
};

export class ParticleSystem {
  constructor(max = 220) {
    this.max = max;
    this.items = [];
  }

  reset() {
    this.items = [];
  }

  spawnBurst(x, y, presetName, options = {}) {
    const preset = PRESETS[presetName] || PRESETS.gold;
    const count = options.count ?? preset.count;
    const angleBias = options.angle ?? null;

    for (let i = 0; i < count; i++) {
      if (this.items.length >= this.max) this.items.shift();
      const angle =
        angleBias != null
          ? angleBias + (Math.random() - 0.5) * 1.2
          : Math.random() * Math.PI * 2;
      const speed = preset.speed * (0.5 + Math.random() * 0.7);
      const color = preset.colors[Math.floor(Math.random() * preset.colors.length)];
      this.items.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: preset.life * (0.7 + Math.random() * 0.5),
        maxLife: preset.life,
        gravity: preset.gravity,
        size: 2 + Math.random() * 3,
        color,
      });
    }
  }

  update(dt) {
    for (const p of this.items) {
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.items = this.items.filter((p) => p.life > 0);
  }

  draw(ctx) {
    for (const p of this.items) {
      const t = Math.max(0, p.life / p.maxLife);
      const alpha = t * 0.85;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
