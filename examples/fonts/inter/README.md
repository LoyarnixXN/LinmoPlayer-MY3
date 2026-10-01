# Inter 字体插件示例

本目录包含 Inter 字体（OFL-1.1 许可证）及可导入 Linmo 桌面端的 `plugin.json`。

- 许可证：SIL Open Font License 1.1
- 来源：[fontsource/inter](https://github.com/rsms/inter)（jsDelivr 镜像）

打包：

```bash
node tools/pack-plugin.mjs examples/fonts/inter
```

导入生成的 `examples/fonts/inter/dist/font-inter-1.0.0.zip` 即可在插件中心启用。

## MiSans

小米 MiSans **不是**自由可分发字体：官方仅允许在小米设备/官方渠道使用，无法合法地随仓库自动下载。若需要 MiSans，请从小米官方渠道获取授权文件后自行放置到 `examples/fonts/misans/` 并修改 `plugin.json` 中的 `font.file` 字段。
