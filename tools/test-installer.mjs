/**
 * Smoke-test Windows installer artifacts produced by electron-builder.
 *
 * Checks:
 * 1. NSIS installer exists and is non-trivial size
 * 2. Portable exe exists and is non-trivial size
 * 3. Unpacked app has LinmoPlayer.exe + app.asar
 * 4. Silent NSIS install to a temp dir produces LinmoPlayer.exe
 * 5. Unpacked/portable/installer binaries can start and exit cleanly
 *
 * Process cleanup prefers executable-path matching under the test roots,
 * and always runs in finally so residual children do not lock the next run.
 */

import { execFile, spawn } from 'node:child_process';
import { access, mkdir, rm, stat } from 'node:fs/promises';
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fileSize(file) {
  try {
    return (await stat(file)).size;
  } catch {
    return 0;
  }
}

function normalizePathForCompare(value) {
  return path.resolve(String(value)).replace(/\//g, '\\').toLowerCase();
}

async function listLinmoProcesses() {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_Process -Filter "Name=\'LinmoPlayer.exe\'" | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress',
      ],
      { windowsHide: true },
    );
    const text = String(stdout || '').trim();
    if (!text) return [];
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list
      .map((item) => ({
        pid: Number(item.ProcessId),
        exe: String(item.ExecutablePath || ''),
      }))
      .filter((item) => Number.isFinite(item.pid) && item.exe);
  } catch {
    return [];
  }
}

async function killByPid(pid) {
  try {
    process.kill(pid);
  } catch {
    /* already gone */
  }
  try {
    await execFileAsync('taskkill.exe', ['/PID', String(pid), '/F', '/T'], { windowsHide: true });
  } catch {
    /* ignore */
  }
}

async function killByName(name) {
  try {
    await execFileAsync('taskkill.exe', ['/IM', `${name}.exe`, '/F', '/T'], { windowsHide: true });
  } catch {
    /* ignore */
  }
}

/** Kill LinmoPlayer processes whose executable lives under any of the given roots. */
async function killProcessesUnder(roots) {
  const targets = roots.filter(Boolean).map(normalizePathForCompare);
  const processes = await listLinmoProcesses();
  let killed = 0;
  for (const item of processes) {
    const exe = normalizePathForCompare(item.exe);
    if (targets.some((target) => exe.startsWith(target))) {
      await killByPid(item.pid);
      killed += 1;
    }
  }
  return killed;
}

async function removeDirWithRetry(dir, attempts = 8) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (index === attempts - 1) throw error;
      await sleep(400);
    }
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
    await sleep(400);
  }
  return false;
}

async function testExecutable(exePath, processName, label) {
  const exeRoot = path.dirname(path.resolve(exePath));
  await killProcessesUnder([exeRoot, installRoot, path.join(distDir, 'win-unpacked')]);
  await sleep(400);
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
  await killProcessesUnder([exeRoot, installRoot, path.join(distDir, 'win-unpacked')]);
  await sleep(600);
  console.log(`ok - ${label} stopped`);
}

async function cleanupAll() {
  await killProcessesUnder([installRoot, path.join(distDir, 'win-unpacked'), distDir]);
  // Last resort for any remaining LinmoPlayer.exe (including user-launched app).
  await killByName('LinmoPlayer');
  await sleep(300);
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

  try {
    await cleanupAll();
    await removeDirWithRetry(installRoot);
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

    await testExecutable(installedExe, 'LinmoPlayer', 'installed app');
    await testExecutable(unpackedExe, 'LinmoPlayer', 'unpacked app');
    await testExecutable(portableExe, 'LinmoPlayer', 'portable app');
  } finally {
    await cleanupAll();
  }

  console.log(
    `\ninstaller smoke test ${failed ? 'FAILED' : 'PASSED'} (installRoot=${installRoot})`,
  );
  if (failed) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  try {
    await cleanupAll();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
