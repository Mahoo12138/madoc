import { createIdentifier, type Memento } from '@madoc/infra';

export interface AppSidebarState extends Memento {}

export const AppSidebarState =
  createIdentifier<AppSidebarState>('AppSidebarState');
