/**
 * E2E for bundled plugin services without launching Electron.
 *
 * Verifies:
 * 1. demo-service package validates (service spec)
 * 2. ZIP pack works
 * 3. service script starts and answers /health on the declared port
 * 4. process exits cleanly on stop (same lifecycle as desktop host)
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = path.join(root, 'examples', 'plugins', 'demo-service');
const port = 18765;

function probePort(targetPort) {
  return new Promise((resolve) => {
    const socket = net.connect(targetPort, '127.0.0.1');
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    setTimeout(() => done(false), 500);
  });
}

async function waitForPort(targetPort, deadlineMs = 8000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (await probePort(targetPort)) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
  console.log(`ok - ${message}`);
}

// 1) manifest validation via core (node strip-types)
const { validatePluginPackageManifest } = await import(
  pathToFileUrl(path.join(root, 'packages', 'core', 'src', 'plugin-package.ts'))
);
const manifest = JSON.parse(await readFile(path.join(pluginDir, 'plugin.json'), 'utf8'));
const validated = validatePluginPackageManifest(manifest);
assert(validated.service?.entry === 'service/server.mjs', 'service.entry validated');
assert(validated.service?.port === port, 'service.port validated');

// 2) pack
const zipPath = path.join(pluginDir, 'dist', `${manifest.id}-${manifest.version}.zip`);
execFileSync(
  process.execPath,
  [path.join(root, 'tools', 'pack-plugin.mjs'), 'examples/plugins/demo-service'],
  {
    cwd: root,
    stdio: 'inherit',
  },
);

// 3) start service like the host does (spawn the packaged script)
const child = spawn(process.execPath, [path.join(pluginDir, 'service', 'server.mjs')], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', () => undefined);
child.stderr.on('data', (chunk) => process.stderr.write(chunk));

const ready = await waitForPort(port);
assert(ready, `service listening on 127.0.0.1:${port}`);

const health = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json());
assert(health.ok === true && health.service === 'demo-service', 'health endpoint responds');

// 4) stop
child.kill();
await new Promise((resolve) => {
  child.once('exit', resolve);
  setTimeout(resolve, 2000);
});
const stillUp = await probePort(port);
assert(!stillUp, 'service process stopped');

console.log(`e2e-plugin-service passed (zip=${zipPath})`);

function pathToFileUrl(filePath) {
  let resolved = path.resolve(filePath);
  resolved = resolved.replace(/\\/g, '/');
  if (!resolved.startsWith('/')) resolved = `/${resolved}`;
  return `file://${resolved}`;
}
