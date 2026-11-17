# Projects Gateway

PIN-gated launchpad for personal projects, hosted on Cloudflare Workers (free tier).

## Layout

- `src/` — Worker code
- `public/` — gateway UI and hosted project files
- `public/projects/` — hosted projects (served at `/p/<slug>`)
- `seed/config.json` — initial KV registry (groups, projects, icons, paths)

## Local development

```sh
cp .dev.vars.example .dev.vars
npx wrangler dev --port 8080
```

Open http://127.0.0.1:8080/. The local KV namespace is emulated by Wrangler; replace the placeholder namespace ID in `wrangler.toml` with a real one before deploying.

## PIN

- Change: `npx wrangler secret put ADMIN_PIN`
- Disable: set `AUTH_ENABLED=false` in Cloudflare dashboard (or `.dev.vars` locally)
- Per-project `public: true` makes that project's `/p/<slug>` URL open without a PIN. The gateway itself is always gated.
