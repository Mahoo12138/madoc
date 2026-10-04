import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { Button, Combobox, useCombobox } from '@mantine/core';
import { Check, ChevronDown, Search } from 'lucide-react';
import {
  codeLanguagePickerStore,
  filterCodeLanguages,
  selectedCodeLanguage,
  type CodeLanguagePicker,
} from './markdown-code-language-store';
import * as styles from './markdown-code-language-picker.css';

function CodeLanguagePickerControl({ picker }: { picker: CodeLanguagePicker }) {
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (triggerRef.current) picker.restoreFocus(triggerRef.current);
  }, [picker.restoreFocus]);
  const combobox = useCombobox({
    onDropdownOpen: () => {
      setSearch('');
      combobox.focusSearchInput();
    },
    onDropdownClose: (source) => {
      setSearch('');
      combobox.resetSelectedOption();
      if (source === 'keyboard') combobox.focusTarget();
    },
  });
  useEffect(() => {
    if (!picker.editable) combobox.closeDropdown();
  }, [picker.editable, combobox]);
  const selected = selectedCodeLanguage(picker.language, picker.languages);
  const filtered = filterCodeLanguages(search, picker.languages);
  const customLanguage =
    !selected && picker.language ? picker.language : undefined;
  const showPlainText =
    !search.trim() || /^(text|plain|纯文本)$/i.test(search.trim());
  const showCustomLanguage = customLanguage
    ?.toLowerCase()
    .includes(search.trim().toLowerCase());

  return (
    <Combobox
      store={combobox}
      position="bottom-end"
      width={248}
      offset={6}
      withinPortal
      keepMounted={false}
      shadow="md"
      transitionProps={{ duration: 100 }}
      onOptionSubmit={(value) => {
        if (picker.editable) picker.setLanguage(value);
        combobox.closeDropdown();
        combobox.focusTarget();
      }}
    >
      <Combobox.Target targetType="button">
        <Button
          ref={triggerRef}
          className="language-button"
          variant="default"
          size="compact-xs"
          disabled={!picker.editable}
          aria-label={`代码语言：${selected?.name ?? (picker.language || '纯文本')}`}
          data-expanded={combobox.dropdownOpened}
          rightSection={<ChevronDown size={12} aria-hidden />}
          onClick={() => combobox.toggleDropdown()}
        >
          <span className={styles.languageLabel}>
            {selected?.name ?? (picker.language || '纯文本')}
          </span>
        </Button>
      </Combobox.Target>
      <Combobox.Dropdown className={styles.dropdown} aria-label="选择代码语言">
        <Combobox.Search
          classNames={{ input: styles.search }}
          value={search}
          placeholder="搜索语言"
          aria-label="搜索代码语言"
          leftSection={<Search size={14} aria-hidden />}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            combobox.resetSelectedOption();
          }}
        />
        <Combobox.Options className={styles.options} aria-label="代码语言">
          {showPlainText && (
            <Combobox.Option
              value=""
              className={styles.option}
              active={!picker.language}
              data-checked={!picker.language || undefined}
              data-language=""
            >
              纯文本
              {!picker.language && (
                <Check size={14} className={styles.check} aria-hidden />
              )}
            </Combobox.Option>
          )}
          {showCustomLanguage && customLanguage && (
            <Combobox.Option
              value={customLanguage}
              className={styles.option}
              active
              data-checked
              data-language={customLanguage}
            >
              <span className={styles.languageLabel}>{customLanguage}</span>
              <Check size={14} className={styles.check} aria-hidden />
            </Combobox.Option>
          )}
          {filtered.map((language) => (
            <Combobox.Option
              key={language.name}
              value={language.name}
              className={styles.option}
              active={language === selected}
              data-checked={language === selected || undefined}
              data-language={language.name}
            >
              <span className={styles.languageLabel}>{language.name}</span>
              {language === selected && (
                <Check size={14} className={styles.check} aria-hidden />
              )}
            </Combobox.Option>
          ))}
          {!showPlainText && !showCustomLanguage && filtered.length === 0 && (
            <Combobox.Empty>没有匹配的语言</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

/** Portals inherit the application's Mantine theme and keep editor state separate. */
export function MarkdownCodeLanguagePickers({
  root,
}: {
  root: HTMLElement | null;
}) {
  const store = codeLanguagePickerStore(root);
  const pickers = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return pickers.map((picker) =>
    createPortal(
      <CodeLanguagePickerControl picker={picker} />,
      picker.host,
      picker.host.id,
    ),
  );
}
