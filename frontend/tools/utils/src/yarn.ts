import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { once } from 'lodash-es';

import { Logger } from './logger';
import { ProjectRoot } from './path';
import type { YarnWorkspaceItem } from './types';
import type { PackageName } from './workspace.gen';

async function loadPackageList() {
  try {
    const packageList = await import('./workspace.gen');
    return packageList.PackageList;
  } catch (e) {
    console.log(e);
    new Logger('yarn').error('Failed to load package list');
    return [];
  }
}

export const PackageList = await loadPackageList();
export type { PackageName };

export const yarnList = once((): YarnWorkspaceItem[] => {
  const rootDir = ProjectRoot.value;
  const yamlPath = resolve(rootDir, 'pnpm-workspace.yaml');

  const yamlContent = readFileSync(yamlPath, 'utf-8');

  // Parse pnpm-workspace.yaml to extract package glob patterns
  const globs: string[] = [];
  let inPackages = false;
  for (const line of yamlContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === 'packages:') {
      inPackages = true;
      continue;
    }
    if (inPackages && trimmed.startsWith('- ')) {
      globs.push(trimmed.slice(2).trim().replace(/['"]/g, ''));
    } else if (inPackages && trimmed !== '' && !trimmed.startsWith('#')) {
      break;
    }
  }

  // Resolve globs to package directories
  const pkgDirs: string[] = [];
  for (const glob of globs) {
    if (glob === '*' || glob === '**') continue;
    if (glob.endsWith('/*')) {
      const baseDir = resolve(rootDir, glob.replace('/*', ''));
      if (existsSync(baseDir)) {
        for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
          if (entry.isDirectory() && existsSync(resolve(baseDir, entry.name, 'package.json'))) {
            pkgDirs.push(resolve(baseDir, entry.name));
          }
        }
      }
    } else if (glob.endsWith('/**')) {
      // Recursive glob (depth-first)
      const baseDir = resolve(rootDir, glob.replace('/**', ''));
      const walk = (dir: string) => {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const fullPath = resolve(dir, entry.name);
            if (existsSync(resolve(fullPath, 'package.json'))) {
              pkgDirs.push(fullPath);
            }
            walk(fullPath);
          }
        }
      };
      if (existsSync(baseDir) && existsSync(resolve(baseDir, 'package.json'))) {
        pkgDirs.push(baseDir);
      }
      walk(baseDir);
    } else {
      const pkgDir = resolve(rootDir, glob);
      if (existsSync(resolve(pkgDir, 'package.json'))) {
        pkgDirs.push(pkgDir);
      }
    }
  }

  const rootDirNormalized = rootDir.replace(/\\/g, '/');

  // First pass: collect name → location
  const nameToLocation = new Map<string, string>();
  for (const pkgDir of pkgDirs) {
    try {
      const pkgJson = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf-8'));
      if (pkgJson.name) {
        const location = pkgDir.replace(/\\/g, '/').replace(rootDirNormalized + '/', '');
        nameToLocation.set(pkgJson.name, location);
      }
    } catch { /* skip invalid packages */ }
  }

  // Second pass: build items with workspace dependencies
  const items: YarnWorkspaceItem[] = [];
  for (const pkgDir of pkgDirs) {
    try {
      const pkgJson = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf-8'));
      if (!pkgJson.name) continue;

      const location = pkgDir.replace(/\\/g, '/').replace(rootDirNormalized + '/', '');

      const workspaceDependencies: string[] = [];
      const allDeps: Record<string, string> = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
      for (const depName of Object.keys(allDeps)) {
        const depLocation = nameToLocation.get(depName);
        if (depLocation && depLocation !== location) {
          workspaceDependencies.push(depLocation);
        }
      }

      items.push({ name: pkgJson.name, location, workspaceDependencies });
    } catch { /* skip invalid packages */ }
  }

  return items;
});
