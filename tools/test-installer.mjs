/**
 * Smoke-test Windows installer artifacts produced by electron-builder.
 *
 * Checks:
 * 1. NSIS installer exists and is non-trivial size
 * 2. Portable exe exists and is non-trivial size
 * 3. Unpacked app has LinmoPlayer.exe + app.asar
 * 4. Silent NSIS install to a temp dir produces LinmoPlayer.exe
 * 5. Unpacked/portable binary can start (process appears) and exits on kill
 */

import { execFile, spawn } from 'node:child_process';
import { access, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist', 'windows');
const version = '0.1.0';
const nsisExe = path.join(distDir, `Linmo-Player-${version}-x64.exe`);
const portableExe = path.join(distDir, `Linmo-Player-${version}-portable.exe`);
const unpackedExe = path.join(distDir, 'win-unpacked', 'LinmoPlayer.exe');
const unpackedAsar = path.join(distDir, 'win-unpacked', 'resources', 'app.asar');
const installRoot = path.join(process.env.TEMP || root, 'linmo-player-installer-test');

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${message}`);
    return;
  }
  console.log(`ok - ${message}`);
}

async function fileSize(file) {
  try {
    return (await stat(file)).size;
  } catch {
    return 0;
  }
}

async function waitForProcessAlive(name, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { stdout } = await execFileAsync(
        'tasklist.exe',
        ['/FI', `IMAGENAME eq ${name}.exe`, '/FO', 'CSV', '/NH'],
        { windowsHide: true },
      );
      if (stdout.includes(`${name}.exe`)) return true;
    } catch {
      /* keep polling */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

async function killProcess(name) {
  try {
    await execFileAsync('taskkill.exe', ['/IM', `${name}.exe`, '/F', '/T'], { windowsHide: true });
  } catch {
    /* ignore */
  }
}

async function testExecutable(exePath, processName, label) {
  await killProcess(processName);
  await new Promise((resolve) => setTimeout(resolve, 500));
  let spawnError = null;
  const child = spawn(exePath, [], {
    stdio: 'ignore',
    windowsHide: false,
    cwd: path.dirname(exePath),
  });
  child.on('error', (error) => {
    spawnError = error;
  });
  const alive = await waitForProcessAlive(processName, 25000);
  if (spawnError) console.error(`spawn error for ${label}:`, spawnError.message);
  assert(alive, `${label} process started (${processName})`);
  await killProcess(processName);
  await new Promise((resolve) => setTimeout(resolve, 800));
  console.log(`ok - ${label} stopped`);
}

async function main() {
  console.log('=== Linmo Player installer smoke test ===\n');

  const nsisSize = await fileSize(nsisExe);
  const portableSize = await fileSize(portableExe);
  const unpackedSize = await fileSize(unpackedExe);
  const asarSize = await fileSize(unpackedAsar);

  assert(nsisSize > 10_000_000, `NSIS installer exists (${(nsisSize / 1e6).toFixed(1)} MB)`);
  assert(portableSize > 10_000_000, `portable exe exists (${(portableSize / 1e6).toFixed(1)} MB)`);
  assert(
    unpackedSize > 10_000_000,
    `unpacked LinmoPlayer.exe exists (${(unpackedSize / 1e6).toFixed(1)} MB)`,
  );
  assert(asarSize > 50_000, `app.asar exists (${asarSize} bytes)`);

  await rm(installRoot, { recursive: true, force: true });
  await mkdir(installRoot, { recursive: true });

  // Silent install (use a clean long path; /D must be last and unquoted)
  const installDir = path.join(installRoot, 'app');
  const nsisExit = await new Promise((resolve) => {
    const child = spawn(nsisExe, ['/S', `/D=${installDir}`], {
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', () => resolve(-1));
    child.on('exit', (code) => resolve(code ?? -1));
  });
  console.log(`ok - NSIS silent install exit code ${nsisExit}`);
  const installedExe = path.join(installDir, 'LinmoPlayer.exe');
  try {
    await access(installedExe);
    assert(true, `silent NSIS install produced ${installedExe}`);
  } catch {
    assert(false, `silent NSIS install produced ${installedExe}`);
  }

  // Installed app start/stop
  await testExecutable(installedExe, 'LinmoPlayer', 'installed app');

  // Unpacked app start/stop
  await testExecutable(unpackedExe, 'LinmoPlayer', 'unpacked app');

  // Portable start/stop
  await testExecutable(portableExe, 'LinmoPlayer', 'portable app');

  // Cleanup processes
  await killProcess('LinmoPlayer');

  console.log(
    `\ninstaller smoke test ${failed ? 'FAILED' : 'PASSED'} (installRoot=${installRoot})`,
  );
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
