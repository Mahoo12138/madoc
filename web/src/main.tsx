import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import '@/styles/global.css';
import { queryClient } from '@/api/query-client';
import { router } from '@/app/router';
import { AccountProvider } from '@/features/account/account-provider';
import { theme } from '@/app/theme';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="bottom-right" />
      <QueryClientProvider client={queryClient}>
        <AccountProvider>
          <RouterProvider router={router} />
        </AccountProvider>
      </QueryClientProvider>
    </MantineProvider>
  </React.StrictMode>,
);
