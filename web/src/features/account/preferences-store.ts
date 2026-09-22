import { request } from '@/api/client';
import { APIError } from '@/api/types';
import {
  defaultPreferences,
  preferenceKeys,
  validPreference,
  type PreferenceKey,
  type Preferences,
  type PreferencesState,
} from './preferences-model';
import { setPendingChanges } from './pending-changes';

type RecordValue = {
  value: number | boolean;
  id: string;
  pending: boolean;
  revision: number;
};
type Snapshot = {
  values: Preferences;
  status: 'saved' | 'saving' | 'pending';
  error: string | null;
};

function syncErrorMessage(error: unknown): string {
  if (error instanceof APIError && error.status === 404)
    return '当前服务尚未提供偏好同步，请更新并重启服务后重试。当前设置已保留。';
  if (error instanceof APIError && error.status === 401)
    return '登录已失效，请重新登录后重试。当前设置已保留。';
  return '暂时无法同步，当前设置已保留。请检查网络后重试。';
}

/** One record per field prevents unrelated tab edits from replacing each other. */
export class PreferencesStore {
  private records = new Map<PreferenceKey, RecordValue>();
  private listeners = new Set<() => void>();
  private timer?: number;
  private running = false;
  private active = false;
  private failure: string | null = null;
  private refreshRequest?: Promise<void>;
  private snapshot: Snapshot;
  private prefix: string;
  constructor(readonly userID: string) {
    this.prefix = `madoc.preferences.v1.${userID}.`;
    for (const key of preferenceKeys) this.read(key);
    this.snapshot = this.buildSnapshot();
  }
  private read(key: PreferenceKey) {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      if (!raw) return this.records.get(key);
      const record = JSON.parse(raw) as RecordValue;
      if (
        validPreference(key, record.value) &&
        typeof record.id === 'string' &&
        typeof record.pending === 'boolean' &&
        Number.isSafeInteger(record.revision)
      ) {
        this.records.set(key, record);
        return record;
      }
    } catch {
      /* Local preferences are still usable without browser storage. */
    }
    return this.records.get(key);
  }
  private write(key: PreferenceKey, record: RecordValue) {
    this.records.set(key, record);
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(record));
    } catch {
      /* Keep in memory. */
    }
  }
  private buildSnapshot(): Snapshot {
    const values = { ...defaultPreferences };
    let pending = false;
    for (const key of preferenceKeys) {
      const record = this.read(key);
      if (record) {
        Object.assign(values, { [key]: record.value });
        pending ||= record.pending;
      }
    }
    return {
      values,
      status: this.running ? 'saving' : pending ? 'pending' : 'saved',
      error: this.failure,
    };
  }
  private emit() {
    this.snapshot = this.buildSnapshot();
    setPendingChanges(
      `preferences:${this.userID}`,
      this.snapshot.status !== 'saved',
    );
    for (const listener of this.listeners) listener();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.snapshot;
  set = (patch: Partial<Preferences>) => {
    for (const key of preferenceKeys) {
      const value = patch[key];
      if (value === undefined || !validPreference(key, value)) continue;
      const old = this.read(key);
      this.write(key, {
        value,
        id: crypto.randomUUID(),
        pending: true,
        revision: old?.revision ?? 0,
      });
    }
    this.failure = null;
    this.emit();
    this.schedule();
  };
  private schedule() {
    window.clearTimeout(this.timer);
    if (this.active)
      this.timer = window.setTimeout(() => void this.flush(), 350);
  }
  private accept(
    state: PreferencesState,
    sent?: Map<PreferenceKey, RecordValue>,
  ) {
    for (const key of preferenceKeys) {
      const current = this.read(key);
      if (current && current.revision > state.revision) continue;
      if (current?.pending && current.id !== sent?.get(key)?.id) continue;
      this.write(key, {
        value: state.preferences[key],
        id: current?.id ?? crypto.randomUUID(),
        pending: false,
        revision: state.revision,
      });
    }
  }
  refresh = () => {
    if (this.refreshRequest) return this.refreshRequest;
    this.refreshRequest = this.load().finally(() => {
      this.refreshRequest = undefined;
    });
    return this.refreshRequest;
  };
  private async load() {
    try {
      let state = await request<PreferencesState>('/me/preferences');
      if (!state.initialized) {
        const legacy: Partial<Preferences> = {};
        try {
          if (!localStorage.getItem('madoc.preferences.legacy-consumed'))
            for (const [key, storage] of [
              ['focusMode', 'madoc.editor.focus-mode'],
              ['typewriterMode', 'madoc.editor.typewriter-mode'],
            ] as const) {
              const value = localStorage.getItem(storage);
              if (value === 'true' || value === 'false')
                legacy[key] = value === 'true';
            }
        } catch {
          /* Optional migration. */
        }
        try {
          state = await request<PreferencesState>('/me/preferences', {
            method: 'PATCH',
            headers: { 'If-None-Match': '*' },
            body: JSON.stringify(legacy),
          });
        } catch (error) {
          if (error instanceof APIError && error.status === 409)
            state = await request<PreferencesState>('/me/preferences');
          else throw error;
        }
      }
      // Legacy settings were global; consume once so another account cannot inherit them.
      try {
        localStorage.setItem('madoc.preferences.legacy-consumed', this.userID);
        localStorage.removeItem('madoc.editor.focus-mode');
        localStorage.removeItem('madoc.editor.typewriter-mode');
      } catch {
        /* Storage may be unavailable. */
      }
      if (!this.active) return;
      this.accept(state);
      this.failure = null;
      this.emit();
      this.schedule();
    } catch (error) {
      if (this.active) {
        this.failure = syncErrorMessage(error);
        this.emit();
      }
    }
  }
  retry = () => {
    this.failure = null;
    this.emit();
    void this.refresh().then(() => this.flush());
  };
  async flush() {
    if (!this.active || this.running) return;
    const sent = new Map<PreferenceKey, RecordValue>();
    const patch: Partial<Preferences> = {};
    for (const key of preferenceKeys) {
      const record = this.read(key);
      if (record?.pending) {
        sent.set(key, record);
        Object.assign(patch, { [key]: record.value });
      }
    }
    if (!sent.size) return;
    this.running = true;
    this.emit();
    try {
      const state = await request<PreferencesState>('/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      this.accept(state, sent);
      this.failure = null;
    } catch (error) {
      this.failure = syncErrorMessage(error);
    } finally {
      this.running = false;
      if (this.active) {
        this.emit();
        if (!this.failure && this.snapshot.status === 'pending')
          this.schedule();
      }
    }
  }
  start() {
    this.active = true;
    this.emit();
    void this.refresh();
    const storage = (event: StorageEvent) => {
      if (event.key?.startsWith(this.prefix)) {
        this.emit();
        this.schedule();
      }
    };
    const focus = () => {
      void this.refresh();
    };
    window.addEventListener('storage', storage);
    window.addEventListener('focus', focus);
    window.addEventListener('online', focus);
    return () => {
      this.active = false;
      window.clearTimeout(this.timer);
      window.removeEventListener('storage', storage);
      window.removeEventListener('focus', focus);
      window.removeEventListener('online', focus);
      setPendingChanges(`preferences:${this.userID}`, false);
    };
  }
}
