import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

export class RestartServer {
  private child?: ChildProcess;
  private exited?: Promise<void>;
  private logs = '';
  private dataName = 'data';
  private constructor(readonly directory: string, private binary: string) {}

  static async create() {
    // Refuse to use or terminate a process not started by this fixture.
    await new Promise<void>((resolve, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(3100, '127.0.0.1', () => probe.close(error => error ? reject(error) : resolve()));
    });
    const directory = await mkdtemp(join(tmpdir(), 'madoc-restart-'));
    const binary = join(directory, 'madoc');
    try {
      execFileSync('go', ['build', '-o', binary, '.'], { cwd: new URL('../..', import.meta.url), timeout: 120_000 });
      return new RestartServer(directory, binary);
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async start() {
    if (this.child) throw new Error('Server is already running');
    this.logs = '';
    const child = spawn(this.binary, [], {
      env: { ...process.env, MADOC_DATA: join(this.directory, this.dataName), MADOC_DB: join(this.directory, this.dataName, 'madoc.db'), MADOC_DEV: 'true', MADOC_ADDR: '127.0.0.1:3100' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    this.exited = new Promise<void>(resolve => child.once('close', () => resolve()));
    let failure: Error | undefined;
    child.once('error', error => { failure = error; });
    child.stdout?.on('data', data => { this.logs += String(data); });
    child.stderr?.on('data', data => { this.logs += String(data); });
    for (let i = 0; i < 200; i++) {
      if (failure) throw failure;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Server exited during startup: ${this.logs}`);
      const ready = await fetch('http://127.0.0.1:3100/healthz', { signal: AbortSignal.timeout(500) }).then(response => response.ok).catch(() => false);
      if (ready) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Server startup timed out: ${this.logs}`);
  }

  async stop(signal: NodeJS.Signals = 'SIGTERM') {
    const child = this.child;
    if (!child) return;
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    const timeout = setTimeout(() => child.kill('SIGKILL'), 10_000);
    try { await this.exited; } finally { clearTimeout(timeout); this.child = undefined; }
    if (signal === 'SIGTERM' && child.exitCode !== 0) throw new Error(`Graceful shutdown failed: ${this.logs}`);
  }

  async restoreIntoIndependentDirectory() {
    if (this.child) throw new Error('Stop the server before backup and restore');
    const environment = (name: string) => ({ ...process.env, MADOC_DATA: join(this.directory, name), MADOC_DB: join(this.directory, name, 'madoc.db') });
    execFileSync(this.binary, ['maintenance', 'backup'], { env: environment(this.dataName), timeout: 30_000 });
    const backups = join(this.directory, this.dataName, 'backups');
    const names = (await readdir(backups)).filter(name => name.startsWith('backup-'));
    if (names.length !== 1) throw new Error('Expected exactly one verified backup');
    // Restore preserves the target's current database before replacing it.
    this.dataName = 'restored';
    await this.start();
    await this.stop();
    execFileSync(this.binary, ['maintenance', 'restore', join(backups, names[0]), '--confirm'], { env: environment('restored'), timeout: 30_000 });
  }

  async dispose() {
    try { await this.stop(); } finally { await rm(this.directory, { recursive: true, force: true }); }
  }
}
