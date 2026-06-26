// Auto generated content
// DO NOT MODIFY THIS FILE MANUALLY
export const PackageList = [
  {
    location: 'packages/common',
    name: '@affine/debug',
    workspaceDependencies: [],
  },
  {
    location: 'packages/common/env',
    name: '@affine/env',
    workspaceDependencies: [],
  },
  {
    location: 'packages/common/error',
    name: '@affine/error',
    workspaceDependencies: [],
  },
  {
    location: 'packages/common/graphql',
    name: '@affine/graphql',
    workspaceDependencies: ['packages/common', 'packages/common/error'],
  },
  {
    location: 'packages/common/infra',
    name: '@toeverything/infra',
    workspaceDependencies: [
      'packages/common',
      'packages/common/env',
      'packages/common/error',
      'packages/frontend/templates',
    ],
  },
  {
    location: 'packages/common/nbstore',
    name: '@affine/nbstore',
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
    name: '@affine/reader',
    workspaceDependencies: [],
  },
  {
    location: 'packages/common/realtime',
    name: '@affine/realtime',
    workspaceDependencies: ['packages/common/graphql'],
  },
  {
    location: 'packages/common/s3-compat',
    name: '@affine/s3-compat',
    workspaceDependencies: [],
  },
  {
    location: 'packages/frontend/apps/web',
    name: '@affine/web',
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
    name: '@affine/component',
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
    name: '@affine/core',
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
    name: '@affine/electron-api',
    workspaceDependencies: [],
  },
  {
    location: 'packages/frontend/i18n',
    name: '@affine/i18n',
    workspaceDependencies: ['packages/common', 'tools', 'tools/utils'],
  },
  {
    location: 'packages/frontend/routes',
    name: '@affine/routes',
    workspaceDependencies: ['tools', 'tools/utils'],
  },
  {
    location: 'packages/frontend/templates',
    name: '@affine/templates',
    workspaceDependencies: [],
  },
  {
    location: 'packages/frontend/track',
    name: '@affine/track',
    workspaceDependencies: ['packages/common'],
  },
  {
    location: 'tools',
    name: '@affine-tools/cli',
    workspaceDependencies: ['tools/utils', 'packages/common/s3-compat'],
  },
  {
    location: 'tools/utils',
    name: '@affine-tools/utils',
    workspaceDependencies: [],
  },
];

export type PackageName =
  | '@affine/debug'
  | '@affine/env'
  | '@affine/error'
  | '@affine/graphql'
  | '@toeverything/infra'
  | '@affine/nbstore'
  | '@affine/reader'
  | '@affine/realtime'
  | '@affine/s3-compat'
  | '@affine/web'
  | '@affine/component'
  | '@affine/core'
  | '@affine/electron-api'
  | '@affine/i18n'
  | '@affine/routes'
  | '@affine/templates'
  | '@affine/track'
  | '@affine-tools/cli'
  | '@affine-tools/utils';
