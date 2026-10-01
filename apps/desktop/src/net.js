/**
 * Renderer network boundary.
 *
 * The renderer page runs from a file:// origin, so cross-origin fetch() calls
 * would be blocked by CORS. All http(s) requests are routed through the main
 * process `net` proxy instead; blob/data/file URLs keep using the native fetch.
 *
 * AbortSignal is honoured locally: the IPC channel itself cannot be aborted,
 * so an aborted request rejects here while the IPC result (if any) is dropped.
 * Without this, a hung proxy connection would stall callers that rely on
 * AbortController timeouts.
 */

const nativeFetch = window.fetch.bind(window);

/** Connection-level failures that are safe to retry for idempotent requests. */
const RETRYABLE_PATTERN = /ERR_CONNECTION|ERR_SOCKET|ERR_EMPTY|ERR_TIMED_OUT|ERR_NETWORK/i;

function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function decodeResponse(response) {
  return new Response(base64ToArrayBuffer(response.body), {
    status: response.status,
    headers: response.headers,
  });
}

function isGet(init) {
  return !init?.method || init.method.toUpperCase() === 'GET';
}

/**
 * Local self-hosted proxies often close idle keep-alive sockets right when
 * Chromium tries to reuse them, surfacing as spurious ERR_CONNECTION_REFUSED.
 * GET requests are idempotent, so retry once after a short beat.
 */
window.fetch = async function proxiedFetch(input, init = {}) {
  try {
    return await proxiedRequest(input, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isGet(init) && RETRYABLE_PATTERN.test(message)) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return proxiedRequest(input, init);
    }
    throw error;
  }
};

async function proxiedRequest(input, init = {}) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url || !/^https?:\/\//i.test(url)) return nativeFetch(input, init);
  const desktop = window.linmoDesktop;
  if (!desktop?.net?.fetch) return nativeFetch(input, init);
  const headers = {};
  const source =
    init.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined);
  if (source) new Headers(source).forEach((value, key) => (headers[key] = value));
  const request = desktop.net.fetch({
    url,
    ...(init.method ? { method: init.method } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(init.body ? { body: init.body } : {}),
  });
  const signal = init.signal;
  if (!signal) {
    return request.then((response) => decodeResponse(response));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new DOMException('The request was aborted.', 'AbortError'));
    };
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort);
    request.then(
      (response) => {
        cleanup();
        resolve(decodeResponse(response));
      },
      (error) => {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
