# Meditation: 7 Layers of Ascent - Technical Specification



## 1. Project Architecture

This is a Fullstack Web Game named "Meditation" designed for a global audience.

- **Frontend**: Vanilla HTML5 Canvas + JavaScript. Hosted on Vercel/GitHub Pages.

- **Backend**: Node.js + Express.js REST API. Hosted on Render.

- **Database**: In-Memory Storage (temporary server array for development).



## 2. Localization

- All Game UI, texts, alerts, and instructions MUST be in English.



## 3. Database Schema (Monetization & Progression Ready)

Each user document contains:

- `username` (string, unique ID)

- `highScore` (number, default: 0)

- `energy` (number, default: 5) - *Ready for Paywall system*

- `isVip` (boolean, default: false) - *Ready for Premium Subscription*

- `lastEnergyRefillAt` (ISO 8601 string, default: account creation time) - *Timestamp of last energy refill; non-VIP users refill to 5 energy every 24 hours on login*



## 4. Game Progression & Layer Mechanics (7 Layers of Focus)

Player starts as a human on Layer 1 and clears obstacles to score points. Reaching score thresholds triggers transition to the next layer.

- **Layer 1: Earth Ground** (Obstacles: Buildings/Trees)

- **Layer 2: Sky** (Obstacles: Planes/Clouds)

- **Layer 3: Stratosphere** (Obstacles: Meteors/Weather Balloons)

- **Layer 4: Low Earth Orbit** (Obstacles: Satellites/Space Debris)

- **Layer 5: Moon Orbit** (Obstacles: Asteroids/Lunar Rovers)

- **Layer 6: Mars Orbit** (Obstacles: Alien Probes/Dust Storms)

- **Layer 7: Outside Solar System** (Obstacles: Black Holes/Comets)



## 5. Collision & Energy Rules

- If `currentLayer > 1`: Collision downgrades player by 1 Layer and resets position.

- If `currentLayer == 1`: Collision increments a `consecutiveHits` counter. 

- **GameOver Condition**: 3 consecutive hits on Layer 1 = GameOver.

- **Energy Check**: Every time a new game starts from Layer 1, Frontend requests Backend to check if `energy > 0` or `isVip == true`. If allowed, game decrements 1 energy (if not VIP) and starts. If `energy == 0`, block game loop and show "Out of Energy" overlay.

- **Energy Refill**: Non-VIP users receive a full refill to 5 energy when `POST /api/login` runs and 24+ hours have passed since `lastEnergyRefillAt`. VIP users are unaffected.



## 6. REST API Endpoints



### POST `/api/login`

Register or retrieve a user profile.



**Request body:** `{ "username": "string" }`



**Response:** `{ "success": true, "user": { username, highScore, energy, isVip } }`



### GET `/api/energy-status`

Return energy countdown info for the frontend (also applies a pending 24h refill if due).



**Query:** `?username=string`



**Response:** `{ "energy": number, "isVip": boolean, "nextRefillAt": string | null, "msUntilRefill": number }`



- `nextRefillAt` — ISO timestamp when the next refill occurs (`null` for VIP)

- `msUntilRefill` — milliseconds until refill (`0` if refill is due now or user is VIP)



### POST `/api/start-game`

Check energy before starting a new run from Layer 1. Decrements energy by 1 if not VIP.



**Request body:** `{ "username": "string" }`



**Response:** `{ "allowed": boolean, "message": string, "user": { ... } }`



### POST `/api/save-score`

Save the player's score if it beats their high score.



**Request body:** `{ "username": "string", "score": number }`



**Response:** `{ "success": true, "isNewRecord": boolean, "user": { ... } }`



### GET `/api/leaderboard`

Return top players ranked by `highScore` (public fields only — no energy).



**Query:** `?limit=10` (optional, default `10`, max `100`)



**Response:** `{ "entries": [{ "username": string, "highScore": number }, ...] }`



### POST `/api/admin/set-vip` *(dev/admin only)*

Toggle VIP status for a user. **Not exposed in the game UI.** Requires the `X-Admin-Secret` header matching the server `ADMIN_SECRET` environment variable. Returns `403` if the header is missing, wrong, or `ADMIN_SECRET` is not configured.



**Request body:** `{ "username": "string", "isVip": true | false }`



**Headers:** `X-Admin-Secret: your-admin-secret`



**Response:** `{ "success": true, "user": { username, highScore, energy, isVip } }`



**Example (local dev):**

```bash
# Set ADMIN_SECRET when starting the backend, e.g. ADMIN_SECRET=change-me npm start

curl -X POST http://localhost:3001/api/admin/set-vip \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: change-me" \
  -d "{\"username\":\"testplayer\",\"isVip\":true}"
```



## 7. Environment Variables

Copy `.env.example` to `.env` for local backend runs, or set the same keys in your host dashboard (Render, etc.).

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `development` | Set to `production` on Render to enforce strict CORS |
| `PORT` | `3001` | HTTP listen port (Render sets this automatically) |
| `CORS_ORIGIN` | *(dev: permissive)* | Comma-separated frontend URLs, e.g. `https://your-app.vercel.app` |
| `ADMIN_SECRET` | *(unset)* | Secret for `POST /api/admin/set-vip`; endpoint disabled if unset |

**CORS behavior**

- **Development** (`NODE_ENV` not `production`): always allows `http://localhost:*` and `http://127.0.0.1:*`. Also allows `CORS_ORIGIN` entries, or all origins if `CORS_ORIGIN` is `*` / unset.
- **Production** (`NODE_ENV=production`): only origins listed in `CORS_ORIGIN` (no wildcard). Set this to your deployed frontend URL(s).



## 8. Running Locally



```bash

# Terminal 1 — Backend

cd backend

npm install

npm start



# Terminal 2 — Frontend (static server)

cd frontend

npx serve .

# Open http://localhost:3000 (or the port shown)

```



On localhost, the frontend automatically uses `http://localhost:3001` — no extra config needed.



## 9. Deploy

### Backend — [Render](https://render.com)

1. Create a **Web Service** connected to this repo.
2. **Root directory:** `backend`
3. **Build command:** `npm install`
4. **Start command:** `npm start`
5. **Environment variables:**

| Key | Example value |
|-----|----------------|
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `https://your-app.vercel.app` |
| `ADMIN_SECRET` | *(strong secret, optional)* |

6. Add a **persistent disk** (optional) mounted at `backend/data` if you want `users.json` to survive redeploys.
7. Note the public URL, e.g. `https://meditation-api.onrender.com`.

### Frontend — Vercel (recommended)

1. Import the repo in [Vercel](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. Framework preset: **Other** (static site — no build command).
4. **Output directory:** `.` (project root = `frontend` folder).
5. `frontend/vercel.json` is included for static hosting defaults.
6. Set the production API URL **before** `js/main.js` loads. In `frontend/index.html`, uncomment and edit:

```html
<script>window.MEDITATION_API_URL = 'https://your-meditation-api.onrender.com';</script>
<script type="module" src="js/main.js"></script>
```

Or inject the same line via your host’s “Environment” / head snippet if supported.

7. Deploy, then set backend `CORS_ORIGIN` to your Vercel URL (e.g. `https://meditation.vercel.app`).

### Frontend — GitHub Pages (alternative)

1. Enable Pages for the repo; publish from the `/frontend` folder (or push `frontend` contents to `gh-pages` branch).
2. Add the `MEDITATION_API_URL` script to `index.html` as shown above (use your Render API URL).
3. Set backend `CORS_ORIGIN` to your Pages URL, e.g. `https://<user>.github.io` (include path if using project pages).

### Post-deploy checklist

- [ ] `GET https://<api>/api/health` returns `{ "status": "ok" }`
- [ ] Frontend login works from the deployed origin (browser devtools → no CORS errors)
- [ ] `CORS_ORIGIN` on Render matches the exact frontend origin (scheme + host + port)

### Frontend API URL reference

`main.js` resolves the API base as:

1. `http://localhost:3001` when opened on `localhost` / `127.0.0.1`
2. Otherwise `window.MEDITATION_API_URL` (required in production)
3. Falls back to `http://localhost:3001` if unset (only useful for local testing)



## 10. Audio Assets

Place optional audio files under `frontend/assets/audio/`. The game runs silently if any file is missing.

| File | Purpose |
|------|---------|
| `bg-music.mp3` | Looping background music (referenced in `index.html`) |
| `sfx-collect.mp3` | Holy Scripture pickup |
| `sfx-hit.mp3` | Temptation collision |
| `sfx-shockwave.mp3` | Mindfulness Shockwave trigger |
| `sfx-layer-up.mp3` | Layer ascent transition |
| `sfx-victory.mp3` | Run completed (Transcendence) |
| `sfx-gameover.mp3` | Focus Lost (game over) |

SFX are loaded and played via `frontend/js/audio.js` (`initAudio()`, `playSfx(name)`).

