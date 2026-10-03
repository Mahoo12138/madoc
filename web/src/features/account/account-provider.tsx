import { createContext, useContext, useState, type ReactNode } from 'react';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/api/hooks';
import { api } from '@/api/client';
import { PreferencesProvider } from './preferences-provider';
import { hasPendingChanges } from './pending-changes';

const AccountContext = createContext({ signOut: () => {} });
export const useAccount = () => useContext(AccountContext);

export function AccountProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  return (
    <PreferencesProvider userID={session.data?.user?.id}>
      <AccountUI>{children}</AccountUI>
    </PreferencesProvider>
  );
}

function AccountUI({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [logout, setLogout] = useState(false);
  const [error, setError] = useState('');

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.signOut();
      client.clear();
      location.assign('/sign-in');
    } catch {
      setError('退出失败，请检查网络后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountContext.Provider
      value={{
        signOut: () => {
          if (hasPendingChanges()) setLogout(true);
          else void signOut();
        },
      }}
    >
      {children}
      <Modal
        opened={logout || !!error}
        onClose={() => {
          if (!busy) {
            setLogout(false);
            setError('');
          }
        }}
        title="退出登录"
        closeOnEscape={!busy}
        closeOnClickOutside={!busy}
        withCloseButton={!busy}
      >
        <Stack>
          {error && (
            <Alert role="alert" color="red">
              {error}
            </Alert>
          )}
          <Text size="sm">
            还有未同步的文档修改或偏好。可以继续等待同步，或确认退出。
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={busy}
              onClick={() => {
                setLogout(false);
                setError('');
              }}
            >
              继续等待
            </Button>
            <Button color="red" loading={busy} onClick={() => void signOut()}>
              确认退出
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AccountContext.Provider>
  );
}
