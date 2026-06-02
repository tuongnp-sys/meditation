# Deploy Meditation — GitHub + Render + Vercel

## Quick links (update after deploy)

| Service | URL |
|---------|-----|
| GitHub | `https://github.com/YOUR_USER/meditation` |
| Vercel (frontend) | `https://YOUR_PROJECT.vercel.app` |
| Render (API) | `https://meditation-api.onrender.com` |

---

## 1. Push to GitHub (overwrite remote)

```powershell
cd d:\meditation
gh auth login
.\scripts\push-github.ps1 -RepoUrl "https://github.com/YOUR_USER/meditation.git"
```

Or manually:

```powershell
git remote add origin https://github.com/YOUR_USER/meditation.git
git push -u origin main --force
```

---

## 2. Render (backend)

1. [render.com](https://render.com) → **New** → **Blueprint** (or Web Service from repo).
2. Connect repo `meditation`; use root `render.yaml` or:
   - **Root directory:** `backend`
   - **Build:** `npm install`
   - **Start:** `npm start`
3. **Environment variables:**

   | Key | Value |
   |-----|--------|
   | `NODE_ENV` | `production` |
   | `CORS_ORIGIN` | Your Vercel URL, e.g. `https://meditation.vercel.app` |
   | `ADMIN_SECRET` | (optional) strong secret |

4. **Disk (recommended):** mount `backend/data` so `users.json` persists.
5. Copy the public URL (e.g. `https://meditation-api.onrender.com`).
6. Test: `https://YOUR-API.onrender.com/api/health` → `{"status":"ok"}`

---

## 3. Vercel (frontend)

1. [vercel.com](https://vercel.com) → Import `meditation` repo.
2. **Root Directory:** `frontend`
3. **Framework:** Other (no build command).
4. Edit `frontend/vercel.json` → set `rewrites[].destination` to your Render API:

   ```json
   "destination": "https://YOUR-API.onrender.com/api/:path*"
   ```

5. Deploy. The game calls `/api/*` on the same origin (no CORS issues).

**Optional:** set explicit API URL in `frontend/index.html`:

```html
<script>window.MEDITATION_API_URL = 'https://YOUR-API.onrender.com';</script>
```

Then set Render `CORS_ORIGIN` to your Vercel URL.

---

## 4. Post-deploy checklist

- [ ] Render health OK
- [ ] Vercel site loads
- [ ] Login works (no CORS errors in DevTools)
- [ ] Start game, play, save score, leaderboard
- [ ] **Mobile:** portrait + landscape — Energy bar, Halo bar, Pulse, touch controls visible (see README §10)

---

## Local run

```powershell
# Terminal 1
cd backend
npm install
npm start

# Terminal 2
cd frontend
npx serve .
```
