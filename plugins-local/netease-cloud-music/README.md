# 网易云音乐插件

这是 Linmo Player 的本地插件构建目录。插件通过用户自行部署的、兼容
`NeteaseCloudMusicApi` 路由的 HTTP 代理访问网易云音乐，不在插件或宿主内保存明文密码。

插件包入口为根目录的 `plugin.json`，使用 `scripts/build-package.ps1` 可生成 ZIP：

```powershell
./scripts/build-package.ps1
```

当前构建包携带 TypeScript 源码入口，供开发阶段的受控运行时使用；生产接入前应由宿主构建为经过签名和校验的 JavaScript 产物。

## 能力

- 手机号/邮箱密码登录、退出登录、登录态检测和当前用户信息
- 歌曲搜索
- 按 `standard`、`higher`、`lossless`、`hires` 解析播放资源
- 获取用户歌单及歌单歌曲

## 使用

```ts
import { createNeteaseCloudMusicPlugin } from './src/index';

const plugin = createNeteaseCloudMusicPlugin({
  apiBaseUrl: 'http://127.0.0.1:3000',
});
```

代理地址必须由宿主或用户配置。默认地址为本机 `http://127.0.0.1:3000`，适合桌面端本地代理；移动端应配置局域网中用户自己部署的 HTTPS 代理地址。

登录凭据只在登录请求期间传递给代理，插件只通过宿主注入的 `PluginStorage` 持久化代理返回的 Cookie。请遵守网易云音乐服务条款、当地法律和版权要求；本项目不提供代理服务、账号或音源。

## 构建检查

在仓库根目录执行：

```powershell
npx tsc -p plugins-local/netease-cloud-music/tsconfig.json --noEmit
```

宿主当前仍不会自动扫描或执行 `plugins-local`；正式接入前需要完成项目文档中要求的沙箱、权限、签名和动态加载设计。
