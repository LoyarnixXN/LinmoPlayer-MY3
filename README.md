# Linmo Player

Linmo Player 是一个移动端优先的多端音乐播放器，支持本地音频播放，并通过统一的声明式插件契约接入外部音源、主题和字体。

项目不提供歌曲文件、音源服务或第三方账号服务。外部服务地址、账号和使用权限由用户自行配置并负责。

## 当前能力

- 移动端：Expo + React Native + `expo-audio`
- 桌面端：Electron Windows 壳，支持本地文件播放
- 核心层：共享的 TypeScript 模型、插件契约、插件注册表和多源补全聚合器
- 本地音乐：导入、播放、歌曲列表和设备存储持久化
- 声明式插件：GD Studio 多音源、NeteaseCloudMusicApi 账号代理、主题和字体
- 安全边界：插件 ZIP 不执行任意代码，只允许宿主选择内置 provider 或读取数据文件

## 开始使用

```bash
npm install
npm run typecheck
```

启动移动端开发环境：

```bash
npm run start:android
```

启动桌面端：

```bash
npm run start:windows
```

桌面端 core bundle 构建：

```bash
npm run build:core --workspace @linmo/desktop
```

Android 调试、原生构建和 APK 云构建说明见[构建指南](./docs/build.md)。

## 插件

插件是包含 `plugin.json` 的 ZIP 文件。音源插件使用宿主内置 provider：

- `gdstudio`：GD Studio 多音源搜索、播放和歌词
- `netease-api`：NeteaseCloudMusicApi 登录、歌单、搜索、播放和歌词

打包本地示例：

```bash
node tools/pack-plugin.mjs plugins-local/linmo-multisource
node tools/pack-plugin.mjs plugins-local/netease-cloud-music
node tools/pack-plugin.mjs plugins-local/theme-midnight
```

生成的 ZIP 位于对应插件目录的 `dist/` 下，然后在应用的“插件中心”导入。网易云插件默认连接 `http://127.0.0.1:3000`，可在 `plugin.json` 的 `config.baseUrl` 中改为自己的代理地址。

完整字段、能力列表和校验规则见[插件契约](./docs/plugin-contract.md)。

## 项目结构

```text
apps/mobile       Expo 移动端宿主
apps/desktop      Electron 桌面端宿主
packages/core     跨端共享核心包
plugins-local     声明式插件示例
tools              插件打包工具
docs               架构、契约、设计和路线图
```

## 开发校验

```bash
npm run typecheck
npx prettier --check .
```

相关文档：

- [架构说明](./docs/architecture.md)
- [插件契约](./docs/plugin-contract.md)
- [Material 3 设计基线](./docs/ui-design-system.md)
- [路线图](./docs/roadmap.md)

## 合规边界

Linmo Player 仅提供播放器、数据模型、本地数据管理和插件扩展边界。用户应遵守所使用音乐服务的法律法规、服务条款和版权要求。本项目仅用于个人学习与研究，不提供任何规避访问控制或获取未授权内容的功能。
