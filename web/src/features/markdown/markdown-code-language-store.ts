export type CodeLanguage = { name: string; alias: readonly string[] };

export type CodeLanguagePicker = {
  host: HTMLElement;
  language: string;
  languages: readonly CodeLanguage[];
  editable: boolean;
  setLanguage: (language: string) => void;
  restoreFocus: (target: HTMLButtonElement) => void;
};

/** A bridge for React portals; editor nodes and their language remain canonical. */
function createStore() {
  const listeners = new Set<() => void>();
  let pickers: readonly CodeLanguagePicker[] = [];
  const publish = () => listeners.forEach((listener) => listener());
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => pickers,
    put: (picker: CodeLanguagePicker) => {
      const previous = pickers.find((entry) => entry.host === picker.host);
      if (
        previous?.language === picker.language &&
        previous.editable === picker.editable
      )
        return;
      pickers = [
        ...pickers.filter((entry) => entry.host !== picker.host),
        picker,
      ];
      publish();
    },
    remove: (host: HTMLElement) => {
      if (!pickers.some((entry) => entry.host === host)) return;
      pickers = pickers.filter((entry) => entry.host !== host);
      publish();
    },
  };
}

const stores = new WeakMap<HTMLElement, ReturnType<typeof createStore>>();
const emptyStore = createStore();

export function codeLanguagePickerStore(root: HTMLElement | null) {
  if (!root) return emptyStore;
  let store = stores.get(root);
  if (!store) {
    store = createStore();
    stores.set(root, store);
  }
  return store;
}

export function selectedCodeLanguage(
  language: string,
  languages: readonly CodeLanguage[],
) {
  const value = language.toLowerCase();
  return languages.find(
    (entry) =>
      entry.name.toLowerCase() === value ||
      entry.alias.some((alias) => alias.toLowerCase() === value),
  );
}

export function filterCodeLanguages(
  search: string,
  languages: readonly CodeLanguage[],
) {
  const value = search.trim().toLowerCase();
  return languages.filter(
    (entry) =>
      entry.name.toLowerCase().includes(value) ||
      entry.alias.some((alias) => alias.toLowerCase().includes(value)),
  );
}
