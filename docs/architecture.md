# Linmo Player 架构说明

## 1. 目标与非目标

### 目标

1. 桌面端优先（Electron Windows），核心层保持平台无关，后续可以增加其他壳而不重写领域逻辑。
2. 音频播放、歌单、本地存储和插件边界彼此解耦。
3. 外部音源通过声明式插件契约接入，统一映射为宿主数据模型。
4. 单个插件异常只能影响自身，不得拖垮播放器和其他插件。
5. 所有敏感信息默认留在本地存储，不经过主程序之外的业务服务器。

### 当前非目标

- 不在宿主内绑定任何具体平台音源；
- 不实现第三方平台 API、签名、解析或登录流程（由自托管代理与内置 provider 承担）；
- 不做插件市场、远程安装和自动更新；
- 不执行插件包内的任何 JavaScript。

## 2. 分层

```text
┌──────────────────────────────────────┐
│ apps/desktop                          │  UI、导航、交互状态（Electron 渲染进程）
│  main.cjs：窗口、网络代理、插件文件边界  │
└───────────────────┬──────────────────┘
                    │ use cases / view models
┌───────────────────▼──────────────────┐
│ packages/core（esbuild vendor bundle）│  播放队列、搜索聚合、插件注册表
│  models · ports · services             │
└───────────────┬───────────┬──────────┘
                │           │
        ┌───────▼──────┐ ┌──▼─────────────┐
        │ Storage port │ │ Audio port     │  平台适配器
        └──────────────┘ └────────────────┘

当前：
  desktop storage = localStorage / userData 目录
  desktop audio   = HTML Audio（本地 file:// 与远端流 URL）
  plugin adapter  = 声明式清单 → 内置 provider 实例
```

## 3. 关键模块

### 播放核心

播放核心只接收 `UnifiedSong` 与 `AudioEngine`，不关心歌曲来自哪个平台。它负责队列、播放/暂停、跳转、音质偏好和播放状态；真实音频实现通过端口注入。本地歌曲直接使用 `mediaUri` 播放；远端歌曲经 `SourceAggregator` 解析播放地址，失败时按标题/艺术家匹配多源补全。

### 统一数据模型

歌曲和歌单必须携带 `pluginId`、`sourceId` 与稳定的来源键。宿主使用 `sourceId + remoteId` 识别跨平台数据，不能仅使用远端数字 ID。

### 插件注册表

注册表负责发现、校验、启用、禁用和卸载插件。插件调用全部经过 capability 检查和异常边界；插件不可以直接修改 UI、数据库或播放状态。

### 歌单聚合

聚合器以插件为数据源，将插件返回的数据映射到统一模型，再写入本地仓储。同步采用“按需 + 可配置定时”的策略，并保留 `lastSyncedAt` 与 `contentHash` 以支持后续增量同步。

## 4. 数据流

```text
插件清单（plugin.json）
  ↓ contract validation（core）
PluginRegistry（声明式 provider 实例）
  ↓ guarded invocation
SourceAggregator ──→ PlaybackResource（多源补全）
  ↓ UnifiedSong
Library UI ──→ PlayerQueue ──→ AudioEngine
```

## 5. 安全与故障隔离

- 插件只能通过宿主注入的受限上下文访问能力；
- 插件返回值必须运行时校验，不能直接信任 `any`；
- 每次插件调用都要捕获异常，并记录可展示的诊断状态；
- 插件超时、返回畸形数据或初始化失败时，标记为 `error`，继续加载其他插件；
- Cookie、令牌和本地账号数据不得写入日志；
- 渲染进程的对外 HTTP 请求统一经由主进程 `net` 代理，插件包文件只在 `userData/plugins` 边界内读写；
- 真正执行不可信 JS 前，必须完成独立沙箱、权限清单和签名校验设计（当前契约不执行包内代码）。

## 6. 当前决策

桌面端选用 Electron 作为宿主，核心包保持平台无关并通过 esbuild 打包为 vendor bundle。插件中心已完成清单导入、能力展示、启用/停用和卸载管理；声明式 provider 在宿主内实例化，插件包与动态执行仍通过插件契约和隔离边界接入，避免将平台实现直接锁定在宿主内。
