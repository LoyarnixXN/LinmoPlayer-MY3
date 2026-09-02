# 插件契约草案（v1）

本文件定义宿主与插件 ZIP 之间的 v1 声明式边界。宿主只执行内置 provider，绝不加载 ZIP 内的 JavaScript。

## ZIP 结构

根目录必须有 `plugin.json`。音源包声明内置引擎：

```json
{
  "packageVersion": 1,
  "id": "linmo.multisource",
  "name": "Linmo 多音源",
  "version": "1.0.0",
  "hostApiVersion": "1",
  "kind": "music-source",
  "provider": "gdstudio",
  "config": { "sources": ["netease", "kuwo"] },
  "capabilities": ["search", "playback", "lyrics"]
}
```

主题包使用 `kind: "theme"` 与 `theme.entry` 指向 JSON；字体包使用 `kind: "font"` 与
`font: { "family", "file" }` 指向字体文件。当前支持的 provider 是 `gdstudio` 和 `netease-api`。

## 宿主必须保证

- 插件失败不影响宿主和其他插件；
- 插件返回数据统一转换为 `UnifiedSong` / `UnifiedPlaylist`；
- 插件的启用状态、版本和诊断状态可被 UI 查询；
- 插件不能直接写宿主 UI、播放器状态或数据库；
- 账号凭据与 Cookie 由宿主提供受限存储端口，插件不得自行持久化到任意路径。

## 旧版 TypeScript 形状（仅供迁移参考）

```ts
import type { MusicPlugin } from '@linmo/core';

const plugin: MusicPlugin = {
  manifest: {
    id: 'example.source',
    name: 'Example Source',
    version: '0.1.0',
    hostApiVersion: '1',
    capabilities: ['search', 'playback', 'playlists'],
  },
  async initialize(context) {
    // 未来由具体插件实现。当前仓库不提供任何平台插件。
  },
  async search(request) {
    return { items: [], total: 0, page: request.page, pageSize: request.pageSize };
  },
};

export default plugin;
```

## 能力清单

| capability        | 允许提供的能力               |
| ----------------- | ---------------------------- |
| `search`          | 搜索歌曲、专辑、歌手或歌单   |
| `playback`        | 将来源歌曲解析为可播放流信息 |
| `lyrics`          | 获取歌词和翻译歌词           |
| `playlists`       | 获取用户歌单及歌单歌曲       |
| `account`         | 查询登录态和基础用户信息     |
| `recommendations` | 获取推荐内容                 |

插件只能调用自己声明过的能力。没有对应能力时，宿主 UI 应显示“不支持”，而不是尝试猜测调用。

账户插件可以实现可选的 `login(request)`、`logout()` 和 `isAuthenticated()` 方法。登录请求由宿主发起，插件只能通过 `PluginStorage` 保存服务端返回的会话材料，不得把密码写入日志或任意文件。

## 版本与兼容性

- `hostApiVersion` 使用主版本兼容策略；
- 插件版本遵循 SemVer；
- 契约变更先增加可选字段，再在下一个主版本移除字段；
- 插件必须声明来源 `id`，并为每个远端实体返回字符串 `remoteId`；
- 统一对象的 `pluginId` 由宿主写入，插件不能伪造其他插件身份。

## 运行时隔离要求

插件以 ZIP 包作为分发和导入格式。宿主在安装前校验路径、入口、能力、provider 和包大小；不信任 ZIP 内的任意文件名或代码。

当前只提供 `PluginRegistry` 和 `PluginRuntime` 抽象，不提供动态 `require`、网络下载或远程安装。未来启用运行时 JavaScript 前，需要补齐：

1. manifest 签名和来源校验；
2. 权限清单和最小能力上下文；
3. 移动端 JS 沙箱与超时机制；
4. 包完整性校验和回滚；
5. 插件日志脱敏与用户可见诊断。

## 开发边界

具体音源插件应位于独立仓库或 `plugins-local/` 外部目录，不得把第三方平台地址、签名逻辑、解析代码提交到主程序。
