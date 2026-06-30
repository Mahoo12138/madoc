import { PackageList, type PackageName } from './yarn';

export const PackageToDistribution = new Map<
  PackageName,
  BUILD_CONFIG_TYPE['distribution']
>([
  ['@madoc/admin', 'admin'],
  ['@madoc/web', 'web'],
  ['@madoc/media-capture-playground', 'web'],
  ['@madoc/electron-renderer', 'desktop'],
  ['@madoc/electron', 'desktop'],
  ['@madoc/mobile', 'mobile'],
  ['@madoc/ios', 'ios'],
  ['@madoc/android', 'android'],
]);

export const AliasToPackage = new Map<string, PackageName>([
  ['admin', '@madoc/admin'],
  ['web', '@madoc/web'],
  ['electron', '@madoc/electron'],
  ['desktop', '@madoc/electron-renderer'],
  ['renderer', '@madoc/electron-renderer'],
  ['mobile', '@madoc/mobile'],
  ['ios', '@madoc/ios'],
  ['android', '@madoc/android'],
  ['server', '@madoc/server'],
  ['gql', '@madoc/graphql'],
  ...PackageList.map(
    pkg => [pkg.name.split('/').pop()!, pkg.name] as [string, PackageName]
  ),
]);
