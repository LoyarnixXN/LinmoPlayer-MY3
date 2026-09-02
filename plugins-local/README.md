# Local plugin workspace

此目录保存声明式插件 ZIP 的本地示例；主程序不会扫描或执行其中的任意代码。

具体插件应遵循 `docs/plugin-contract.md`。当前包含：

- `linmo-multisource/`：GD Studio 多音源包。
- `netease-cloud-music/`：网易云音乐账号 provider 包。
- `theme-midnight/`：深色主题包。
- `font-inter/`：字体包示例（发布前替换占位字体文件）。

使用 `node tools/pack-plugin.mjs <目录>` 打包；宿主只根据 `plugin.json` 选择内置 provider 或读取主题/字体数据。
