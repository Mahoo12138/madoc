import { DesktopApiService } from '@madoc/core/modules/desktop-api';
import {
  CacheStorage,
  GlobalCache,
  GlobalState,
} from '@madoc/core/modules/storage';
import {
  ElectronGlobalCache,
  ElectronGlobalState,
} from '@madoc/core/modules/storage/impls/electron';
import { IDBGlobalState } from '@madoc/core/modules/storage/impls/storage';
import type { Framework } from '@madoc/infra';

export function configureElectronStateStorageImpls(framework: Framework) {
  framework.impl(GlobalCache, ElectronGlobalCache, [DesktopApiService]);
  framework.impl(GlobalState, ElectronGlobalState, [DesktopApiService]);
  framework.impl(CacheStorage, IDBGlobalState);
}
