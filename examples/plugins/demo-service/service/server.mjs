import { createServer } from 'node:http';

const port = Number(process.env.PORT || 18765);

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', `http://127.0.0.1:${port}`);
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (url.pathname === '/health') {
    response.end(JSON.stringify({ ok: true, service: 'demo-service' }));
    return;
  }
  if (url.pathname.startsWith('/search')) {
    const query = url.searchParams.get('q') || '';
    response.end(
      JSON.stringify({
        result: {
          songs: query ? [{ id: 'demo-1', name: query, artist: 'Demo' }] : [],
        },
      }),
    );
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ ok: false, error: 'not found' }));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[demo-service] listening on http://127.0.0.1:${port}`);
});
