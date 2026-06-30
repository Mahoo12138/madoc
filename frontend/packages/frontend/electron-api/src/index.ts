export const appInfo: Record<string, unknown> | null = null;

export const apis: Record<string, unknown> | undefined = undefined;

export const events: Record<string, unknown> | undefined = undefined;

export const sharedStorage: Record<string, unknown> | undefined = undefined;

export type ClientHandler = Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;

export type ClientEvents = Record<string, unknown>;

export type AppInfo = Record<string, unknown>;

export type SharedStorage = Record<string, unknown>;

export type SpellCheckStateSchema = Record<string, unknown>;

export type TabViewsMetaSchema = Record<string, unknown>;

export type WorkbenchMeta = Record<string, unknown>;

export type WorkbenchViewMeta = Record<string, unknown>;

export type WorkbenchViewModule = Record<string, unknown>;

export type UpdateMeta = {
  version?: string;
  allowPrerelease?: boolean;
};

export type AddTabOption = Record<string, unknown>;

export type TabAction = Record<string, unknown>;
