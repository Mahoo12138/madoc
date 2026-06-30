// Auto generated content
// DO NOT MODIFY THIS FILE MANUALLY
export const PackageList = [
  {
    location: 'packages/common',
    name: '@madoc/debug',
    workspaceDependencies: [],
  },
  {
    location: 'packages/common/env',
    name: '@madoc/env',
    workspaceDependencies: [],
  },
  {
    location: 'packages/common/error',
    name: '@madoc/error',
    workspaceDependencies: [],
  },
  {
    location: 'packages/common/graphql',
    name: '@madoc/graphql',
    workspaceDependencies: ['packages/common', 'packages/common/error'],
  },
  {
    location: 'packages/common/infra',
    name: '@madoc/infra',
    workspaceDependencies: [
      'packages/common',
      'packages/common/env',
      'packages/common/error',
      'packages/frontend/templates',
    ],
  },
  {
    location: 'packages/common/nbstore',
    name: '@madoc/nbstore',
    workspaceDependencies: [
      'packages/common/reader',
      'packages/common/realtime',
      'packages/common/infra',
      'packages/common/error',
      'packages/common/graphql',
    ],
  },
  {
    location: 'packages/common/reader',
    name: '@madoc/reader',
    workspaceDependencies: [],
  },
  {
    location: 'packages/common/realtime',
    name: '@madoc/realtime',
    workspaceDependencies: ['packages/common/graphql'],
  },
  {
    location: 'packages/common/s3-compat',
    name: '@madoc/s3-compat',
    workspaceDependencies: [],
  },
  {
    location: '.',
    name: '@madoc/web',
    workspaceDependencies: [
      'packages/frontend/component',
      'packages/frontend/core',
      'packages/common/env',
      'packages/common/nbstore',
      'packages/frontend/track',
      'packages/common/infra',
    ],
  },
  {
    location: 'packages/frontend/component',
    name: '@madoc/component',
    workspaceDependencies: [
      'packages/common',
      'packages/common/error',
      'packages/common/graphql',
      'packages/frontend/i18n',
      'tools/utils',
    ],
  },
  {
    location: 'packages/frontend/core',
    name: '@madoc/core',
    workspaceDependencies: [
      'packages/frontend/component',
      'packages/common',
      'packages/frontend/electron-api',
      'packages/common/env',
      'packages/common/error',
      'packages/common/graphql',
      'packages/frontend/i18n',
      'packages/common/nbstore',
      'packages/common/reader',
      'packages/frontend/templates',
      'packages/frontend/track',
      'packages/common/infra',
    ],
  },
  {
    location: 'packages/frontend/electron-api',
    name: '@madoc/electron-api',
    workspaceDependencies: [],
  },
  {
    location: 'packages/frontend/i18n',
    name: '@madoc/i18n',
    workspaceDependencies: ['packages/common', 'tools', 'tools/utils'],
  },
  {
    location: 'packages/frontend/routes',
    name: '@madoc/routes',
    workspaceDependencies: ['tools', 'tools/utils'],
  },
  {
    location: 'packages/frontend/templates',
    name: '@madoc/templates',
    workspaceDependencies: [],
  },
  {
    location: 'packages/frontend/track',
    name: '@madoc/track',
    workspaceDependencies: ['packages/common'],
  },
  {
    location: 'tools',
    name: '@madoc-tools/cli',
    workspaceDependencies: ['tools/utils', 'packages/common/s3-compat'],
  },
  {
    location: 'tools/utils',
    name: '@madoc-tools/utils',
    workspaceDependencies: [],
  },
];

export type PackageName =
  | '@madoc/debug'
  | '@madoc/env'
  | '@madoc/error'
  | '@madoc/graphql'
  | '@madoc/infra'
  | '@madoc/nbstore'
  | '@madoc/reader'
  | '@madoc/realtime'
  | '@madoc/s3-compat'
  | '@madoc/web'
  | '@madoc/component'
  | '@madoc/core'
  | '@madoc/electron-api'
  | '@madoc/i18n'
  | '@madoc/routes'
  | '@madoc/templates'
  | '@madoc/track'
  | '@madoc-tools/cli'
  | '@madoc-tools/utils';
