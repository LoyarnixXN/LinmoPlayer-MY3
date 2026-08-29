# Linmo Player

Linmo Player 是一个多端音乐播放器。设计优美，用户可以通过插件导入音源。

当前版本的目标是完成可持续演进的基础工程：

- 建立播放器、歌单、同步、插件边界的领域模型；
- 提供 Material 3 / Material You 风格的移动端 UI 基线；
- 为插件加载、生命周期、失败隔离、统一数据聚合预留接口；

当前播放器支持用户手动导入本地音频后进行基础播放，也支持通过插件导入音源；项目不提供音源内容、歌曲文件或音源服务。

## 技术路线

- `apps/mobile`：Expo + React Native 宿主应用，移动端优先；
- `apps/desktop`：Electron Windows 桌面壳，复用相同的领域边界；
- `packages/core`：纯 TypeScript 领域核心，可被移动端和未来桌面端复用；
- `docs/`：架构、插件契约、设计系统与路线图；
- `plugins-local/`：本地开发插件的预留目录，当前为空，不纳入主程序源码。

## 快速开始

```bash
npm install
npm run typecheck
```

Windows 开发与构建：

```bash
npm run start:windows
npm run build:windows
```

Android 调试与 APK 云构建说明见 [构建指南](./docs/build.md)。

移动端开发：

```bash
npm run start --workspace @linmo/mobile
```

详细约束见：

- [架构说明](./docs/architecture.md)
- [插件契约](./docs/plugin-contract.md)
- [Material 3 设计基线](./docs/ui-design-system.md)
- [路线图](./docs/roadmap.md)

## 合规边界

主程序仅提供播放器、数据模型、用户本地数据和插件扩展边界。音源由用户通过自行选择的插件导入，项目不提供任何音源。账号信息、Cookie、播放权限与服务条款由用户自行负责。项目仅用于个人学习研究，不用于商业或非法用途。
