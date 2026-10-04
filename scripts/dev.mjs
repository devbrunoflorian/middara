/** Start both workspace dev servers concurrently, including on Windows. */
import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Start the project with npm run dev.');

const windows = process.platform === 'win32';
const services = [];
let stopping = false;

async function stop(code) {
  if (stopping) return;
  stopping = true;
  await Promise.all(services.map(({ child }) => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    if (windows) {
      // npm and Next spawn descendants. Kill only this launcher's own trees.
      return new Promise(resolve => {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
        killer.once('error', resolve);
        killer.once('close', resolve);
      });
    }
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) {
      if (error.code !== 'ESRCH') console.error(error.message);
    }
  }));
  process.exitCode = code;
}

process.once('SIGINT', () => { void stop(130); });
process.once('SIGTERM', () => { void stop(143); });

for (const name of ['dev:api', 'dev:web']) {
  const child = spawn(process.execPath, [npmCli, 'run', name], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
    detached: !windows,
  });
  services.push({ name, child });
  child.once('error', error => {
    console.error(`${name}: ${error.message}`);
    void stop(1);
  });
  child.once('close', (code, signal) => {
    if (stopping) return;
    console.error(`${name} exited (${code ?? signal}); stopping the other service.`);
    void stop(code || 1);
  });
}
