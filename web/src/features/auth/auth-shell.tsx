import type { ReactNode } from 'react';
import { Alert, Stack, Text, Title, type MantineColor } from '@mantine/core';
import { AlertCircle as IconAlertCircle } from 'lucide-react';
import * as styles from './pages.css';

function Brand() {
  return (
    <div className={styles.brand}>
      <img src="/logo.svg" alt="" aria-hidden className={styles.mark} />
      <Text className={styles.wordmark}>Madoc</Text>
    </div>
  );
}

export function ErrorAlert({ error, color = 'red' }: { error: string; color?: MantineColor }) {
  return error ? (
    <Alert color={color} variant="light" radius="sm" icon={<IconAlertCircle size={16} />}>
      {error}
    </Alert>
  ) : null;
}

/**
 * Shared frame for every auth screen: drifting paper-blue backdrop, centered
 * brand and a white card whose header carries title + lead before the form.
 * Login, invitation, admin activation and public sign-up all enter through it,
 * so those pages never grow a second, competing entry frame.
 */
export function AuthShell({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.decor} aria-hidden>
        <div className={styles.glowA} />
        <div className={styles.glowB} />
      </div>
      <section className={styles.panel}>
        <Brand />
        <div className={styles.card}>
          <Stack gap="lg">
            <div>
              <Title order={1} className={styles.heading}>
                {title}
              </Title>
              {lead ? <Text className={styles.lead}>{lead}</Text> : null}
            </div>
            {children}
          </Stack>
        </div>
      </section>
    </main>
  );
}
