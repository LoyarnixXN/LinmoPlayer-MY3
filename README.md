# Linmo Player

Linmo Player 是一个桌面端音乐播放器（Electron Windows），支持本地音频播放，并通过统一的声明式插件契约接入外部音源、主题和字体。

## 当前能力

- 桌面端：Electron Windows 壳，Material 3 / Material You 界面与动效
- 核心层：共享的 TypeScript 模型、插件契约、插件注册表和多源补全聚合器
- 本地音乐：导入文件或文件夹、播放、专辑/歌手分组和本地持久化
- 在线搜索与播放：多插件聚合搜索，播放地址解析失败时自动多源补全
- 歌词：Now Playing 同步歌词（LRC）与翻译行展示
- 声明式插件：GD Studio 多音源、账号音源（可选导入）、主题和字体
- 账号与歌单：扫码/密码登录（需启用账号类插件）、远程歌单同步与播放、每日推荐
- 安全边界：插件 ZIP 不执行任意代码，只允许宿主选择内置 provider 或读取数据文件

## 开始使用

```bash
npm install
npm run typecheck
```

启动桌面端开发环境：

```bash
npm run start:windows
```

renderer 应用包构建（core 源码变更后需要重新执行）：

```bash
npm run build:renderer --workspace @linmo/desktop
```

桌面端安装包构建：

```bash
npm run build:windows
```

## 插件

插件是包含 `plugin.json` 的 ZIP 文件，在应用的“插件中心”导入。音源插件使用宿主内置 provider：

- `gdstudio`：GD Studio 多音源搜索、播放和歌词
- `netease-api`：NeteaseCloudMusicApi 登录（扫码/密码）、歌单、搜索、播放、歌词和每日推荐

插件包不随本仓库分发，请自行打包或获取；`tools/pack-plugin.mjs` 可将任意插件目录压成 ZIP。

完整字段、能力列表和校验规则见[插件契约](./docs/plugin-contract.md)。

## 项目结构

```text
apps/desktop      Electron 桌面端宿主
packages/core     共享核心包
tools             插件打包工具
tools             插件打包工具
docs              架构、契约、设计和路线图
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
