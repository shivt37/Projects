# Projects Gateway

PIN-gated launchpad for personal projects, hosted on Cloudflare Workers (free tier).

## Layout

- `src/` — Worker code (auth, config store, API, project routing)
- `public/` — gateway UI and hosted project files
- `public/projects/` — hosted projects, served at `/p/<slug>`
- `seed/config.json` — reference copy of the initial KV registry
- `testing/e2e.ps1` — local end-to-end smoke test

## Local development

```sh
cp .dev.vars.example .dev.vars
npx wrangler dev --port 8080
```

Open http://127.0.0.1:8080/. Wrangler emulates KV locally under `.wrangler/state`. Replace the placeholder namespace ID in `wrangler.toml` with a real one before deploying.

Run the smoke test (it starts its own Worker on port 8080 and resets local KV state):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\testing\e2e.ps1
```

## How it works

- The gateway (`/` and `/api/*`) always requires the PIN.
- Groups and projects live in one KV key, `config`. Edits in the UI are saved with `POST /api/config`; no redeploy needed.
- Each hosted project has a `slug`, an `assetPath` relative to `public/`, and a `public` flag.
  - `/p/<slug>` serves that project's entry file (`index.html` by default for folders, or a direct `.html` file).
  - Subpaths such as `/p/<slug>/css/styles.css` are mapped to the same folder, so CSS/JS/images keep working.
  - A `<base href="/p/<slug>/">` tag is injected into folder-based entry pages so relative asset references resolve correctly.
  - `public: true` lets anyone with the URL open the project without a PIN. The gateway itself stays gated.
- External-link projects use their own URL and ignore `slug`/`assetPath`.
- Icons can be uploaded as SVG, linked by URL, pasted as SVG code, or generated once with the Iconify API. The result is stored in KV.

## PIN and dashboard changes

- Change PIN: `npx wrangler secret put ADMIN_PIN`, or edit the secret in the Cloudflare dashboard.
- Disable PIN: set the `AUTH_ENABLED` variable to `false` in the Cloudflare dashboard (or in `.dev.vars` locally). When unset it defaults to `true` in code.
- `wrangler.toml` declares **no** `[vars]` and no secrets. It has `keep_vars = true`, so dashboard variables are preserved on deploy, and deploys never delete secrets. Editing a secret or `AUTH_ENABLED` in the dashboard will therefore survive future pushes.
- Rotating `ADMIN_PIN` invalidates existing sessions.

## Deploy

Connect the repo to Cloudflare Workers Builds (free plan) for push-to-deploy, or run `npx wrangler deploy`.
