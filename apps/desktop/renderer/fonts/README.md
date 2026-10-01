# Local fonts

## MiSans (UI text)

Official Xiaomi MiSans woff2 weights (free commercial use) are committed here:

- `MiSans-Regular.woff2`
- `MiSans-Medium.woff2`
- `MiSans-Semibold.woff2`
- `MiSans-Bold.woff2`

`styles.css` registers them via `@font-face`; `--app-font` / `DEFAULT_FONT_STACK` list MiSans first. When no font plugin is selected, settings show **MiSans** as the active font. Font plugins still override `--app-font` at runtime when applied.

## Material Symbols Rounded (icons)

`MaterialSymbolsRounded.woff2` is the full icon set (all ligatures), instanced at **FILL=0 / wght=400** for a consistent visual weight. Source: Google `material-symbols` package (Apache-2.0). Runtime loads it locally via `styles.css` `@font-face` — no CDN.

Icons are generated only through `icon()` in `apps/desktop/src/icons.js` (ligature spans). Do not mix Lucide/Tabler/custom SVG.
