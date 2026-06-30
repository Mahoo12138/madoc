import type { I18nString } from '@madoc/i18n';

export interface QuickSearchGroup {
  id: string;
  label: I18nString;
  score?: number;
}
