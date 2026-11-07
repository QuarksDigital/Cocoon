# Cocoon - website

Next.js 16 (App Router) + Three.js + GSAP ScrollTrigger + Lenis on the front, Express 5 + MongoDB Atlas behind it.

## Run it

```bash
npm install
npm --prefix server install
cp server/.env.example server/.env   # add your Atlas MONGODB_URI
npm run seed                         # loads data/products.json into Atlas (once)
npm run dev:all                      # web on :3000, api on :5000
```

Next proxies `/api/*` to the Express server (`API_URL`, default `http://localhost:5000`), so the browser never needs CORS in dev. In production, set `API_URL` on the Next host and `CORS_ORIGIN` on the API host.

Without a `MONGODB_URI`, the API still serves the bundled catalogue. The enquiry form returns a friendly "call us" message instead of saving.

## Where things live

| Path | What |
| --- | --- |
| `components/hero/scene/DrainScene.ts` | The 3D hero: room, LED glow, drain, water physics, camera dive |
| `components/hero/scene/geometry.ts` | Procedural wave-cut grate, frame, puddles, leaves |
| `components/hero/scene/textures.ts` | Procedural tile, brushed steel, marble, glow textures |
| `components/hero/Hero.tsx` | Scroll timeline that drives the scene + black curtain reveal |
| `components/sections/*` | Collection index, Material, Sizes, Range, Contact, Footer |
| `data/products.json` | Catalogue: frontend fallback **and** API seed source |
| `server/src` | Express API: `GET /api/products`, `GET /api/products/:slug`, `POST /api/enquiries` |

## Hero timeline (scroll progress 0 → 1)

| Progress | What happens |
| --- | --- |
| 0.00-0.32 | Drain rises out of the floor |
| 0.30-0.52 | Grate swings open on its hinge |
| 0.48-0.86 | Camera dives into the channel and down the outlet |
| 0.72-0.86 | Fade to black |
| 0.86-1.00 | Black curtain slides down to reveal the intro |

Clicking or tapping the drain plays the whole sequence. If you stop scrolling partway through the dive, it finishes in whichever direction you were scrolling.

## Adding new product lines

`category` and `line` are free-form strings in the Mongo schema. Towel rails, grab bars and so on need no schema change: add documents and a filter label in `lib/products.ts`.

Product photos in `public/products/` were cropped from the catalogue posters. Swap in proper studio shots on white when you have them.
