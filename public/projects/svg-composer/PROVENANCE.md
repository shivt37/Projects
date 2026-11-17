# Provenance and pinned dependencies

Canonical deployable source: `site/` (pushed to GitHub as `SVG Composer/`).
Product version: `0.6.103`. Engine version: `5.1`.

## Pin decisions

| Component | Pinned | Decision |
|---|---|---|
| JSZip | 3.10.2 | Upgraded from 3.10.1; official dist bytes from jsdelivr/unpkg, SHA-256 `7F839B2D4688B845C105EBF5D2F9803075F91EA0FE72BDAAC176C3A04DD3D2C1`. No known CVE in either version; patch fixes cross-realm type detection and Node 18 Blob support. |
| Javascript Clipper | 6.4.2 / 6.4.2.2 | Kept pinned. Clipper2 is not backward compatible (API and numeric model) and would break the geometry engine. SHA-256 `8ACE53F8707FAF797086EC95BD4BE4FA4D7161F72D1CBFF85B52CDF3DC09AE3D`. |
| OpenType.js | 2.0.0 | Kept pinned. Advisory AIKIDO-2026-10697 affects 0.7.0–1.3.4, fixed in 1.3.5; 2.0.0 is outside the affected range. |
| SVG.js | 3.2.8 | Kept pinned. CVE-2026-15697 / AIKIDO-2026-841274 affect versions up to 3.2.6, fixed in 3.2.7. |
| SVGO | 4.1.0 | Kept pinned; patched release for CVE-2026-84369/84370. The app never enables `removeScripts` and keeps its own `sanitizeSvg()` boundary. SVGO is an optimizer, not a sanitizer. |
| HarfBuzz.js | 1.6.4 | Vendored locally with `harfbuzz.js` and `harfbuzz.wasm`. |
| bidi-js | 1.1.0 | Vendored locally. |
| Paper.js | 0.17.0 | Vendored locally. |

## SHA-256 of vendored files

- `paper-core.min.js` — `5858C1946E0674C49CC933A8857D547C44DA83E403C90945A25996F7A80E1BAF`
- `opentype.min.js` — `B39D7BF9661481CEC5C118A0D92B02951171D99C30D4D11252A72ECB0285439E`
- `svg.esm.js` — `78F543AF06123A55CD8665CD8C34CA622C8B31F68B379D77FA0CD046C3E0129D`
- `svgo.browser.js` — `76A415BE3EAD7A8B0E109C77B7B20CEC478C46FE8A09A1B1AD42A80ECD91B0EE`
- `bidi-js.esm.js` — `94A5061CBF93BF4F995814E082DD086E883C7202145BB7F9C387B4A3FABBF303`
- `harfbuzz/index.mjs` — `16016989059A6600A1B82B42F61B494C776DB02DEC49BF645AF65B8A5E599BF9`
- `harfbuzz/harfbuzz.js` — `28392846CE6ACCB53E34BDCE197B8AA00721E84846FF4B2C0CCFAD5137A0E699`
- `harfbuzz/harfbuzz.wasm` — `6EEED8E1BC9AD7773038E48FF8F9E07E0AD228572C594B45E5357E9C2F7A0B2E`

## SRI (classic CDN fallbacks only)

- Paper.js: `sha384-gEmegBKRT6L+DIqjFe+6tIxhQ7JBbgggu3FMFb3mCDohcT6VmOXNW41bs+JB/Tv/`
- OpenType.js: `sha384-rZipYyCodoDMAXvm3BS6DXnn3CAyORo9RZ+7OSlLIj1y1YP4KeMFwgKVkO+9W3nB`

## Fonts

Embedded latin-subset TTFs in `fonts-core.js` (SHA-256 of decoded bytes):

- Inter — `691B48F86FF57EBD69473B5DE53913117AC87EA80B185F0AEE13EEB4CF654960`
- JetBrains Mono — `C9163B323DDA09B46C4555474A531834EDBE2C2840EE4D286B4CFE6B056FDA57`
- Instrument Serif — `F6CD827C0EC1A5535B3D30C7429641C3355E1E2B8DACC256E9CF5479C6B97BB0`

Upstream font version numbers are not recorded in the embedded blob; preserve the bytes exactly.

## Version markers

`index.html` declares `application-version = 0.6.103` and title `Glyph Studio Pro 0.6.103 – Thickness Engine 5.1 (exact stem matching)`. Export manifests (`export-settings.json`) also declare version `0.6.103`. Older `0.6.26/0.6.30/0.6.40` strings in source comments are historical change annotations, not competing current versions.
