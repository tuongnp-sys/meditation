/** Centralized SFX and per-layer music for Meditation. */

const SFX_BASE_PATH = 'assets/audio/sfx-';
const MUSIC_BASE_PATH = 'assets/audio/bg-';
const SFX_VOLUME = 0.5;
const MUSIC_VOLUME = 0.45;

const KNOWN_SFX = ['collect', 'hit', 'shockwave', 'layer-up', 'victory', 'gameover', 'ten', 'duc'];

/** @type {Map<string, HTMLAudioElement>} */
const sfxCache = new Map();
const unavailableSfx = new Set();

/** @type {Map<string, HTMLAudioElement>} */
const musicCache = new Map();
const unavailableMusic = new Set();

let currentMusicLayer = null;
let musicFadeRaf = null;
/** Bumped on stop — ignores stale play/fade callbacks. */
let musicEpoch = 0;

function createSfxElement(name) {
  const audio = new Audio(`${SFX_BASE_PATH}${name}.mp3`);
  audio.preload = 'auto';
  audio.volume = SFX_VOLUME;
  return audio;
}

function createMusicElement(trackKey) {
  const audio = new Audio(`${MUSIC_BASE_PATH}${trackKey}.mp3`);
  audio.preload = 'auto';
  audio.loop = true;
  audio.volume = 0;
  return audio;
}

function markUnavailableSfx(name) {
  unavailableSfx.add(name);
  sfxCache.delete(name);
}

function markUnavailableMusic(trackKey) {
  unavailableMusic.add(trackKey);
  musicCache.delete(trackKey);
}

function bindSfxLoadHandlers(name, audio) {
  audio.addEventListener('error', () => markUnavailableSfx(name), { once: true });
}

function bindMusicLoadHandlers(trackKey, audio) {
  audio.addEventListener('error', () => markUnavailableMusic(trackKey), { once: true });
}

function preloadSfx(name) {
  if (unavailableSfx.has(name) || sfxCache.has(name)) return;
  const audio = createSfxElement(name);
  bindSfxLoadHandlers(name, audio);
  audio.addEventListener(
    'canplaythrough',
    () => {
      if (!unavailableSfx.has(name)) sfxCache.set(name, audio);
    },
    { once: true }
  );
  try {
    audio.load();
  } catch {
    markUnavailableSfx(name);
  }
}

function preloadMusic(trackKey) {
  if (unavailableMusic.has(trackKey) || musicCache.has(trackKey)) return;
  const audio = createMusicElement(trackKey);
  bindMusicLoadHandlers(trackKey, audio);
  audio.addEventListener(
    'canplaythrough',
    () => {
      if (!unavailableMusic.has(trackKey)) musicCache.set(trackKey, audio);
    },
    { once: true }
  );
  try {
    audio.load();
  } catch {
    markUnavailableMusic(trackKey);
  }
}

export function initAudio() {
  for (const name of KNOWN_SFX) preloadSfx(name);
  for (let i = 1; i <= 7; i++) preloadMusic(`layer-${i}`);
  preloadMusic('music');
}

export function playSfx(name) {
  if (!name || unavailableSfx.has(name)) return;

  let audio = sfxCache.get(name);
  if (!audio) {
    audio = createSfxElement(name);
    bindSfxLoadHandlers(name, audio);
    sfxCache.set(name, audio);
  }

  try {
    audio.currentTime = 0;
    const p = audio.play();
    if (p?.catch) p.catch(() => {});
  } catch {
    markUnavailableSfx(name);
  }
}

function fadeAudioVolume(audio, targetVolume, durationMs, onDone) {
  if (!audio) {
    onDone?.();
    return;
  }
  if (musicFadeRaf) cancelAnimationFrame(musicFadeRaf);

  const start = audio.volume;
  const startTime = performance.now();

  const step = (now) => {
    const t = Math.min(1, (now - startTime) / durationMs);
    audio.volume = start + (targetVolume - start) * t;
    if (t < 1) musicFadeRaf = requestAnimationFrame(step);
    else {
      musicFadeRaf = null;
      onDone?.();
    }
  };
  musicFadeRaf = requestAnimationFrame(step);
}

function getMusicForLayer(layerId) {
  const key = `layer-${layerId}`;
  if (!unavailableMusic.has(key)) return key;
  return unavailableMusic.has('music') ? null : 'music';
}

function getOrCreateMusic(trackKey) {
  if (!trackKey || unavailableMusic.has(trackKey)) return null;

  let audio = musicCache.get(trackKey);
  if (!audio) {
    audio = createMusicElement(trackKey);
    bindMusicLoadHandlers(trackKey, audio);
    musicCache.set(trackKey, audio);
  }
  return audio;
}

/**
 * Play looping background music for a layer (falls back to bg-music.mp3).
 * @param {number} layerId 1–7
 * @param {boolean} [fadeIn=true]
 */
export function playLayerMusic(layerId, fadeIn = true) {
  const trackKey = getMusicForLayer(layerId);
  if (!trackKey) return;

  const next = getOrCreateMusic(trackKey);
  if (!next) return;

  const epoch = musicEpoch;
  const prevKey = currentMusicLayer;
  const prev = prevKey ? musicCache.get(prevKey) : null;

  if (prev && prev !== next) {
    fadeAudioVolume(prev, 0, 500, () => {
      if (epoch !== musicEpoch) return;
      try {
        prev.pause();
        prev.currentTime = 0;
      } catch { /* ignore */ }
    });
  }

  currentMusicLayer = trackKey;
  next.volume = fadeIn ? 0 : MUSIC_VOLUME;

  const p = next.play();
  const onPlaying = () => {
    if (epoch !== musicEpoch) {
      try {
        next.pause();
        next.currentTime = 0;
        next.volume = 0;
      } catch { /* ignore */ }
      return;
    }
    if (fadeIn) fadeAudioVolume(next, MUSIC_VOLUME, 900);
    else next.volume = MUSIC_VOLUME;
  };

  if (p?.then) p.then(onPlaying).catch(() => {});
  else onPlaying();
}

export function pauseLayerMusic() {
  if (musicFadeRaf) {
    cancelAnimationFrame(musicFadeRaf);
    musicFadeRaf = null;
  }
  const audio = currentMusicLayer ? musicCache.get(currentMusicLayer) : null;
  if (audio) {
    try {
      audio.pause();
    } catch { /* ignore */ }
  }
}

export function resumeLayerMusic(layerId) {
  playLayerMusic(layerId, false);
}

export function stopLayerMusic() {
  musicEpoch += 1;
  if (musicFadeRaf) {
    cancelAnimationFrame(musicFadeRaf);
    musicFadeRaf = null;
  }
  for (const audio of musicCache.values()) {
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 0;
    } catch { /* ignore */ }
  }
  currentMusicLayer = null;
}

/** Stop layer music and any playing SFX (logout, victory, end screens). */
export function stopGameAudio() {
  stopLayerMusic();
  for (const audio of sfxCache.values()) {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch { /* ignore */ }
  }
}
