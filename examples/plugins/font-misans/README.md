# MiSans 字体插件模板

MiSans **不是**自由可分发字体：官方仅允许在小米设备/官方渠道使用，无法合法地随仓库自动下载或分发。

使用步骤：

1. 从小米官方渠道获取授权的 MiSans 文件（如 `MiSans-Regular.woff2`）。
2. 将文件放入本目录（与 `plugin.json` 同级）。
3. 确认 `plugin.json` 中 `font.file` 指向实际文件名。
4. 打包并导入：

```bash
node tools/pack-plugin.mjs examples/plugins/font-misans
```

5. 在插件中心启用该字体插件。

也可以将文件直接放到 `apps/desktop/renderer/fonts/`，应用启动时会通过 `@font-face` 自动加载（见 `apps/desktop/renderer/fonts/README.md`）。
