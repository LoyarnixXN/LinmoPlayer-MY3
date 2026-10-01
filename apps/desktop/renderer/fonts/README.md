# Local fonts

## MiSans (UI text)

MiSans is **not** freely redistributable. Place licensed files here as `MiSans-Regular.woff2` / `MiSans-Medium.woff2` / `MiSans-Semibold.woff2` / `MiSans-Bold.woff2` (or `.otf`). Missing files are ignored; the app falls back to system Chinese UI fonts.

## Material Symbols Rounded (icons)

`MaterialSymbolsRounded.woff2` is the full icon set (all ligatures), instanced at **FILL=0 / wght=400** for a consistent visual weight. Source: Google `material-symbols` package (Apache-2.0). Runtime loads it locally via `styles.css` `@font-face` — no CDN.

Icons are generated only through `icon()` in `apps/desktop/src/icons.js` (ligature spans). Do not mix Lucide/Tabler/custom SVG.
