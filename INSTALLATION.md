# Installation

How to get Tempest running locally — for development and for a production build.
For gameplay, controls, and architecture, see **[README.md](README.md)**.

---

## Prerequisites

- **Node.js 20.19+** (or 22.12+) — required by Vite 8. A current LTS release is
  recommended. (Developed on Node 25.9.)
- **npm 10+** — ships with Node. (Developed on npm 11.12.)
- A modern browser with HTML5 Canvas 2D support (any current Chrome, Firefox,
  Safari, or Edge).

Check your versions:

```bash
node --version
npm --version
```

---

## 1. Get the code

```bash
git clone <repository-url> tempest
cd tempest
```

If you already have the repository, just `cd` into it.

---

## 2. Install dependencies

```bash
npm install
```

This installs the dev dependencies (TypeScript, Vite, Vitest). There are no
runtime dependencies — the game is plain TypeScript and the Canvas 2D API.

---

## 3. Run the dev server

```bash
npm run dev
```

Open **http://localhost:5273**. The server uses Vite's hot module replacement,
so edits to `src/` refresh the game automatically.

> The port is pinned to **5273** with `strictPort`, so it fails loudly on a
> collision instead of silently wandering to another port. See
> [Troubleshooting](#troubleshooting) if the port is busy.

---

## 4. Run the tests

```bash
npm test          # run the full Vitest suite once
npm run test:watch  # re-run on change
```

Run a single file or pattern:

```bash
npm test -- geometry
```

---

## 5. Build for production

```bash
npm run build
```

This type-checks the project (`tsc --noEmit`) and emits an optimized bundle to
`dist/`. The build **fails on any type error**, so a green build means the types
are clean too.

Preview the production build locally:

```bash
npm run preview
```

This serves `dist/` on **http://localhost:5273**.

### Deploying

`dist/` is a fully static site (HTML, JS, and assets). Drop it on any static host
— GitHub Pages, Netlify, Vercel, S3, or a plain web server. No backend or
environment configuration is required; high scores are stored in the browser's
`localStorage`.

---

## Troubleshooting

| Symptom | Cause & fix |
|---------|-------------|
| `Port 5273 is already in use` | `strictPort` is intentional. Stop whatever holds the port (`lsof -i :5273`), or change `port` in [vite.config.ts](vite.config.ts). |
| `npm install` fails on an engine/syntax error | Your Node is too old. Upgrade to Node 20.19+ (or 22.12+) — see [Prerequisites](#prerequisites). |
| Blank black screen, no tube | Open the browser devtools console for errors, and confirm the dev server compiled without TypeScript errors. |
| Mousewheel scrolls the page instead of spinning | Click the canvas once to give it focus, then use the wheel. |
| High scores don't persist | The game uses `localStorage`. Private/incognito windows and "block all cookies" settings can disable it. |

---

## Project scripts reference

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run dev` | Vite dev server (port 5273) |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Serve the production build (port 5273) |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |
