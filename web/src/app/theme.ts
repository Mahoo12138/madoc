import { createTheme, type CSSVariablesResolver } from '@mantine/core';

export const cssVariablesResolver: CSSVariablesResolver = (theme) => ({
  variables: {},
  light: {
    '--mantine-color-text': theme.colors.gray[9],
    '--mantine-color-dimmed': theme.colors.gray[6],
    '--mantine-color-placeholder': theme.colors.gray[6],
  },
  dark: {
    '--mantine-color-dimmed': theme.colors.gray[4],
    '--mantine-color-placeholder': theme.colors.gray[4],
  },
});

export const theme = createTheme({
  primaryColor: 'blue',
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: 'sm',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  fontFamilyMonospace:
    '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  headings: {
    fontFamily: 'var(--mantine-font-family)',
    fontWeight: '600',
  },
  radius: { xs: '4px', sm: '6px', md: '8px', lg: '8px' },
  colors: {
    gray: [
      '#f7f8fa',
      '#f0f2f5',
      '#e5e8ed',
      '#d4d9e1',
      '#b2bac6',
      '#8993a2',
      '#626d7d',
      '#505a69',
      '#394352',
      '#252e3b',
    ],
    blue: [
      '#f0f5fc',
      '#e2ecfa',
      '#c7d9f2',
      '#a8c2e9',
      '#81a4d9',
      '#5c86c6',
      '#3869ad',
      '#305b98',
      '#294e82',
      '#23416b',
    ],
  },
  components: {
    Button: { defaultProps: { size: 'sm' } },
    ActionIcon: { defaultProps: { variant: 'subtle', color: 'gray' } },
    Modal: {
      defaultProps: {
        centered: true,
        radius: 'md',
        closeButtonProps: { 'aria-label': '关闭' },
      },
    },
    Drawer: { defaultProps: { closeButtonProps: { 'aria-label': '关闭' } } },
  },
});
