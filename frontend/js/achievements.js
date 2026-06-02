const STORAGE_KEY = 'meditation_achievements_v1';

const DEFINITIONS = [
  { id: 'first_flight', label: 'First Flight', test: (s) => s.maxLayer >= 2 },
  { id: 'sky_walker', label: 'Sky Walker', test: (s) => s.maxLayer >= 3 },
  { id: 'orbit_mind', label: 'Orbital Mind', test: (s) => s.maxLayer >= 5 },
  { id: 'enlightened', label: 'Right Fruition', test: (s) => s.victory },
  { id: 'scripture_10', label: 'Ten Scriptures', test: (s) => s.scripturesCollected >= 10 },
  { id: 'combo_5', label: 'Flow State', test: (s) => s.maxCombo >= 5 },
  { id: 'score_500', label: 'Focused Ascent', test: (s) => s.score >= 500 },
  { id: 'clean_run', label: 'Steady Breath', test: (s) => s.victory && s.downgradeStrikes === 0 },
];

function loadUnlocked() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveUnlocked(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** @returns {string[]} newly unlocked achievement ids */
export function evaluateAchievements(runStats) {
  const unlocked = loadUnlocked();
  const newly = [];

  for (const def of DEFINITIONS) {
    if (unlocked[def.id]) continue;
    if (!def.test(runStats)) continue;
    unlocked[def.id] = Date.now();
    newly.push(def.id);
  }

  if (newly.length > 0) saveUnlocked(unlocked);
  return newly;
}

export function getAchievementLabel(id) {
  return DEFINITIONS.find((d) => d.id === id)?.label ?? id;
}

export function getAllUnlockedLabels() {
  const unlocked = loadUnlocked();
  return DEFINITIONS.filter((d) => unlocked[d.id]).map((d) => d.label);
}
