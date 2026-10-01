# MiSans local fonts

MiSans is **not** freely redistributable. This directory is a local-load placeholder:

1. Obtain licensed MiSans files from official Xiaomi channels.
2. Place files here as `MiSans-Regular.woff2` / `MiSans-Medium.woff2` / `MiSans-Semibold.woff2` / `MiSans-Bold.woff2` (or `.otf`).
3. Restart Linmo Player. `styles.css` `@font-face` rules load these files when present; otherwise the app falls back to `Microsoft YaHei UI` / `PingFang SC` / system UI fonts.

MiSans remains first in `--app-font` / `DEFAULT_FONT_STACK` so the font is used as soon as files are available.

Alternative: import a font plugin ZIP from `examples/plugins/font-misans/` after filling in your licensed files.
