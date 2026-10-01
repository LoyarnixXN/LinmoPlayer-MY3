# 在线账号音源本地服务插件示例

本目录提供一个可导入 Linmo 桌面端的声明式音源插件模板（provider：`netease-api`，映射宿主内置账号代理引擎）。

- 插件启用时随捆绑服务启动本地代理（`service.port`）。
- 若你已自行运行兼容 API 代理，可在插件中心覆盖 `baseUrl`。
- 完整接口能力取决于你使用的代理服务；本目录的 `server.mjs` 是可自托管的最小桩，用于验证服务生命周期与端口探测。

打包：

```bash
node tools/pack-plugin.mjs examples/plugins/netease-local
```

导入生成的 `dist/*.zip` 后，在插件中心启用。**应用不再自动预置账号插件**：需要账号能力时请手动导入并启用。
