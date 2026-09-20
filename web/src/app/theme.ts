import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'blue',
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: 'md',
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', fontWeight: '650' },
  colors: {
    blue: ['#eef6ff', '#d9eaff', '#bad8ff', '#8fc0ff', '#5da2ff', '#3182f6', '#1f6feb', '#1b5dcc', '#1b4fa5', '#193f7f'],
  },
  components: {
    Button: { defaultProps: { size: 'sm' } },
    ActionIcon: { defaultProps: { variant: 'subtle', color: 'gray' } },
    Modal: { defaultProps: { centered: true, radius: 'lg' } },
  },
});
