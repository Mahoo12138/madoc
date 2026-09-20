import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const source = join(root, '..', 'node_modules', '@excalidraw', 'excalidraw', 'dist', 'prod', 'fonts');
const target = join(root, '..', 'public', 'excalidraw-assets', 'fonts');
await rm(target, { recursive: true, force: true });
await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true });
