import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { PreferencesStore } from './preferences-store';
import { defaultPreferences } from './preferences-model';
const Context = createContext<PreferencesStore | null>(null);
const empty = {
  values: defaultPreferences,
  status: 'saved' as const,
  error: null,
};
const emptySnapshot = () => empty;
const emptySubscribe = () => () => {};
export function PreferencesProvider({
  userID,
  children,
}: {
  userID?: string;
  children: ReactNode;
}) {
  const store = useMemo(
    () => (userID ? new PreferencesStore(userID) : null),
    [userID],
  );
  useEffect(() => store?.start(), [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function usePreferences() {
  const store = useContext(Context);
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? emptySubscribe,
    store?.getSnapshot ?? emptySnapshot,
  );
  return {
    ...snapshot,
    set: store?.set ?? (() => {}),
    refresh: store?.refresh,
    retry: store?.retry,
  };
}
