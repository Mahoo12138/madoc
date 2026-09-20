import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const dataDir = await mkdtemp(join(tmpdir(), 'madoc-e2e-'));
const child = spawn('go', ['run', '..'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, MADOC_DATA: dataDir, MADOC_DEV: 'true', MADOC_ADDR: '127.0.0.1:3100' },
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
