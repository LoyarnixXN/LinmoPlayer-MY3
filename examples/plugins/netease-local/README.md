# 网易云本地服务插件示例

- 声明 `service.entry=service/server.mjs`、`service.port=3000`
- 权限：`network` + `secure-storage`
- provider：`netease-api`（映射宿主内置网易云引擎）

## 两种使用方式

1. **捆绑服务**：导入插件 ZIP 并启用后，宿主会启动包内 `service/server.mjs`（开发/测试用最小代理桩）。
2. **外部 API**：本机运行官方 [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi)，在插件卡片中把服务地址覆盖为 `http://127.0.0.1:3000`（或其它端口）。

打包：

```bash
node tools/pack-plugin.mjs examples/plugins/netease-local
```

说明：捆绑 `server.mjs` 是可自托管的最小桩，用于验证服务生命周期与端口探测；完整网易云接口请使用官方 API 服务。
