# Demo Service 插件示例

演示插件捆绑 Node 服务：

- `plugin.json` 声明 `service.entry` 与 `service.port`
- 启用插件时，桌面宿主以 `ELECTRON_RUN_AS_NODE` 启动 `service/server.mjs`
- 未显式配置 `config.baseUrl` 时，宿主自动使用 `http://127.0.0.1:<port>` 作为代理地址
- 停用/卸载/退出应用时自动停止服务进程

打包：

```bash
node tools/pack-plugin.mjs examples/plugins/demo-service
```

端到端验证：

```bash
node tools/e2e-plugin-service.mjs
```
