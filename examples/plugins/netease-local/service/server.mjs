import { createServer } from 'node:http';

/**
 * Minimal bundled Netease-compatible proxy stub for offline/dev testing.
 * For real NetEase Cloud Music API behavior, run the official
 * NeteaseCloudMusicApi project and point the plugin baseUrl at it.
 */

const port = Number(process.env.PORT || 3000);

const ok = (response, payload) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({ code: 200, ...payload }));
};

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', `http://127.0.0.1:${port}`);
  if (url.pathname === '/health') return ok(response, { ok: true, service: 'netease-local' });
  if (url.pathname === '/search') {
    const keywords = url.searchParams.get('keywords') || '';
    return ok(response, {
      result: {
        songs: keywords
          ? [{ id: 0, name: keywords, ar: [{ name: '网易云' }], al: { name: '本地服务' } }]
          : [],
      },
    });
  }
  if (url.pathname === '/lyric') return ok(response, { lrc: { lyric: '[00:00.00]stub' } });
  if (url.pathname === '/user/account') return ok(response, { data: { profile: null } });
  response.statusCode = 404;
  ok(response, { code: 404, msg: 'not found' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[netease-local] listening on http://127.0.0.1:${port}`);
});
