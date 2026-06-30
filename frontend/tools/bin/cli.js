#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const runnerPath = resolve(__dirname, 'runner.js');

spawnSync(process.execPath, [runnerPath, 'affine.ts', ...process.argv.slice(2)], {
  stdio: 'inherit',
});
