const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const CORS_ORIGIN_RAW = process.env.CORS_ORIGIN;

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function parseConfiguredOrigins() {
  if (!CORS_ORIGIN_RAW || CORS_ORIGIN_RAW.trim() === '*') return [];
  return CORS_ORIGIN_RAW.split(',').map((origin) => origin.trim()).filter(Boolean);
}

function createCorsOptions() {
  const isProduction = NODE_ENV === 'production';
  const configuredOrigins = parseConfiguredOrigins();

  if (!isProduction) {
    return {
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (LOCALHOST_ORIGIN_RE.test(origin)) return callback(null, true);
        if (!CORS_ORIGIN_RAW || CORS_ORIGIN_RAW.trim() === '*') return callback(null, true);
        if (configuredOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`CORS blocked origin: ${origin}`));
      },
    };
  }

  if (!configuredOrigins.length) {
    console.warn(
      '[cors] NODE_ENV=production requires CORS_ORIGIN (comma-separated frontend URLs). Cross-origin browser requests will be blocked.'
    );
    return { origin: false };
  }

  return { origin: configuredOrigins };
}

app.use(cors(createCorsOptions()));
app.use(express.json());

/** @type {Record<string, { username: string, highScore: number, maxLayer: number, energy: number, isVip: boolean, lastEnergyRefillAt: string }>} */
let userDatabase = {};

const DEFAULT_ENERGY = 5;
const ENERGY_REFILL_MS = 24 * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function ensureUserFields(user) {
  let changed = false;

  if (!user.lastEnergyRefillAt || typeof user.lastEnergyRefillAt !== 'string') {
    user.lastEnergyRefillAt = nowIso();
    changed = true;
  }

  if (!Number.isFinite(user.maxLayer) || user.maxLayer < 0) {
    user.maxLayer = 0;
    changed = true;
  }

  return changed;
}

function applyEnergyRefillIfDue(user) {
  if (user.isVip) return false;

  const lastRefillMs = Date.parse(user.lastEnergyRefillAt);
  if (!Number.isFinite(lastRefillMs)) {
    user.lastEnergyRefillAt = nowIso();
    return true;
  }

  if (Date.now() - lastRefillMs >= ENERGY_REFILL_MS) {
    user.energy = DEFAULT_ENERGY;
    user.lastEnergyRefillAt = nowIso();
    return true;
  }

  return false;
}

function getEnergyStatus(user) {
  ensureUserFields(user);

  if (user.isVip) {
    return {
      energy: user.energy,
      isVip: true,
      nextRefillAt: null,
      msUntilRefill: 0,
    };
  }

  const lastRefillMs = Date.parse(user.lastEnergyRefillAt);
  const safeLastRefillMs = Number.isFinite(lastRefillMs) ? lastRefillMs : Date.now();
  const nextRefillMs = safeLastRefillMs + ENERGY_REFILL_MS;
  const msUntilRefill = Math.max(0, nextRefillMs - Date.now());

  return {
    energy: user.energy,
    isVip: false,
    nextRefillAt: new Date(nextRefillMs).toISOString(),
    msUntilRefill,
  };
}

function loadUsersFromDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        userDatabase = parsed;
        console.log(`[storage] Loaded ${Object.keys(userDatabase).length} user(s) from disk.`);
        return;
      }
    }
  } catch (err) {
    console.warn('[storage] Could not load users file, starting fresh:', err.message);
  }
  userDatabase = {};
  saveUsersToDisk();
}

function saveUsersToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const payload = JSON.stringify(userDatabase, null, 2);
    const tmpFile = path.join(DATA_DIR, `users.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(tmpFile, payload, 'utf8');
    fs.renameSync(tmpFile, USERS_FILE);
  } catch (err) {
    console.error('[storage] Failed to save users:', err.message);
  }
}

function getOrCreateUser(username) {
  const id = String(username).trim();
  if (!id) return null;

  if (!userDatabase[id]) {
    userDatabase[id] = {
      username: id,
      highScore: 0,
      maxLayer: 0,
      energy: DEFAULT_ENERGY,
      isVip: false,
      lastEnergyRefillAt: nowIso(),
    };
    saveUsersToDisk();
  }
  return userDatabase[id];
}

function publicProfile(user) {
  return {
    username: user.username,
    highScore: user.highScore,
    maxLayer: user.maxLayer ?? 0,
    energy: user.energy,
    isVip: user.isVip,
  };
}

function requireAdminSecret(req, res, next) {
  if (!ADMIN_SECRET) {
    return res.status(403).json({ error: 'Admin access is not configured.' });
  }

  const provided = req.get('X-Admin-Secret');
  if (!provided || provided !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  next();
}

loadUsersFromDisk();

app.post('/api/login', (req, res) => {
  const { username } = req.body || {};

  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Username is required.' });
  }

  const user = getOrCreateUser(username);
  if (!user) {
    return res.status(400).json({ error: 'Invalid username.' });
  }

  const migrated = ensureUserFields(user);
  const refilled = applyEnergyRefillIfDue(user);
  if (migrated || refilled) {
    saveUsersToDisk();
  }

  console.log(
    `[login] ${user.username} — energy: ${user.energy}, highScore: ${user.highScore}${refilled ? ' (energy refilled)' : ''}`
  );
  res.json({ success: true, user: publicProfile(user) });
});

app.post('/api/start-game', (req, res) => {
  const { username } = req.body || {};

  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Username is required.' });
  }

  const user = userDatabase[username.trim()];
  if (!user) {
    return res.status(404).json({ error: 'User not found. Please log in first.' });
  }

  if (user.isVip || user.energy > 0) {
    if (!user.isVip) {
      user.energy -= 1;
    }
    saveUsersToDisk();
    console.log(`[start-game] ${user.username} — allowed, energy left: ${user.energy}`);
    return res.json({
      allowed: true,
      message: user.isVip ? 'VIP — unlimited plays.' : 'Game started. Energy consumed.',
      user: publicProfile(user),
    });
  }

  console.log(`[start-game] ${user.username} — blocked (out of energy)`);
  res.json({
    allowed: false,
    message: 'Out of Energy. Rest and return later, or upgrade to VIP.',
    user: publicProfile(user),
  });
});

app.get('/api/energy-status', (req, res) => {
  const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';

  if (!username) {
    return res.status(400).json({ error: 'Username query parameter is required.' });
  }

  const user = userDatabase[username];
  if (!user) {
    return res.status(404).json({ error: 'User not found. Please log in first.' });
  }

  const migrated = ensureUserFields(user);
  const refilled = applyEnergyRefillIfDue(user);
  if (migrated || refilled) {
    saveUsersToDisk();
  }

  res.json(getEnergyStatus(user));
});

app.post('/api/save-score', (req, res) => {
  const { username, score, maxLayer } = req.body || {};

  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Username is required.' });
  }

  const parsedScore = Number(score);
  if (!Number.isFinite(parsedScore) || parsedScore < 0) {
    return res.status(400).json({ error: 'Valid score is required.' });
  }

  const parsedMaxLayer = Number(maxLayer);
  const hasMaxLayer =
    Number.isFinite(parsedMaxLayer) && parsedMaxLayer >= 1 && parsedMaxLayer <= 7;

  const user = userDatabase[username.trim()];
  if (!user) {
    return res.status(404).json({ error: 'User not found. Please log in first.' });
  }

  ensureUserFields(user);

  const isNewRecord = parsedScore > user.highScore;
  const isNewMaxLayer = hasMaxLayer && parsedMaxLayer > (user.maxLayer ?? 0);
  let saved = false;

  if (isNewRecord) {
    user.highScore = Math.floor(parsedScore);
    saved = true;
  }
  if (isNewMaxLayer) {
    user.maxLayer = Math.floor(parsedMaxLayer);
    saved = true;
  }
  if (saved) saveUsersToDisk();

  console.log(
    `[save-score] ${user.username} — score: ${parsedScore}, highScore: ${user.highScore}, maxLayer: ${user.maxLayer ?? 0}${isNewRecord ? ' (new score)' : ''}${isNewMaxLayer ? ' (new layer)' : ''}`
  );

  res.json({
    success: true,
    isNewRecord,
    user: publicProfile(user),
  });
});

app.post('/api/admin/set-vip', requireAdminSecret, (req, res) => {
  const { username, isVip } = req.body || {};

  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Username is required.' });
  }

  if (typeof isVip !== 'boolean') {
    return res.status(400).json({ error: 'isVip must be a boolean.' });
  }

  const user = userDatabase[username.trim()];
  if (!user) {
    return res.status(404).json({ error: 'User not found. Please log in first.' });
  }

  user.isVip = isVip;
  saveUsersToDisk();

  console.log(`[admin/set-vip] ${user.username} — isVip: ${user.isVip}`);
  res.json({ success: true, user: publicProfile(user) });
});

app.get('/api/leaderboard', (req, res) => {
  let limit = Number.parseInt(req.query.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 10;
  if (limit > 100) limit = 100;

  const entries = Object.values(userDatabase)
    .map((user) => ({
      username: user.username,
      highScore: user.highScore,
      maxLayer: user.maxLayer ?? 0,
    }))
    .sort((a, b) => b.highScore - a.highScore)
    .slice(0, limit);

  res.json({ entries });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', users: Object.keys(userDatabase).length });
});

app.listen(PORT, () => {
  const corsMode =
    NODE_ENV === 'production'
      ? `production — ${parseConfiguredOrigins().join(', ') || 'none (set CORS_ORIGIN)'}`
      : 'development — localhost + CORS_ORIGIN/*';
  console.log(`Meditation API listening on port ${PORT} (${NODE_ENV})`);
  console.log(`[cors] ${corsMode}`);
  console.log(`User data file: ${USERS_FILE}`);
});
