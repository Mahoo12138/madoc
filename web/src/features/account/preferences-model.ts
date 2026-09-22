export const defaultPreferences = {
  fontSize: 16,
  lineHeight: 1.75,
  contentWidth: 760,
  codeLineNumbers: true,
  autoPair: true,
  focusMode: false,
  typewriterMode: false,
};
export type Preferences = typeof defaultPreferences;
export type PreferenceKey = keyof Preferences;
export const preferenceKeys = Object.keys(
  defaultPreferences,
) as PreferenceKey[];
export type PreferencesState = {
  preferences: Preferences;
  initialized: boolean;
  revision: number;
};
export function validPreference(key: PreferenceKey, value: unknown): boolean {
  if (key === 'fontSize')
    return (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 14 &&
      value <= 22
    );
  if (key === 'lineHeight') return [1.5, 1.75, 2].includes(value as number);
  if (key === 'contentWidth') return [640, 760, 960].includes(value as number);
  return typeof value === 'boolean';
}
