import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Anchor, Button, Center, Loader, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { AlertCircle as IconAlertCircle, ArrowRight as IconArrowRight } from 'lucide-react';
import { api } from '@/api/client';
import { queryClient } from '@/api/query-client';
import { useSession } from '@/api/hooks';
import { APIError } from '@/api/types';
import * as styles from './pages.css';

function Brand() {
  return (
    <div className={styles.brand}>
      <img src="/logo.svg" alt="" aria-hidden className={styles.mark} />
      <Text className={styles.wordmark}>Madoc</Text>
    </div>
  );
}

function ErrorAlert({ error }: { error: string }) {
  return error ? (
    <Alert color="red" variant="light" radius="sm" icon={<IconAlertCircle size={16} />}>
      {error}
    </Alert>
  ) : null;
}

// Shared frame for every auth screen: drifting paper-blue backdrop, centered
// brand and a white card whose header carries title + lead before the form.
function AuthShell({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
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

export function StartPage() {
  const navigate = useNavigate();
  const session = useSession();
  useEffect(() => {
    Promise.all([api.setupStatus(), session.refetch()]).then(([status, current]) => {
      void navigate({ to: !status.initialized ? '/setup' : current.data?.user ? '/workspaces' : '/sign-in', replace: true });
    });
  }, []);
  return <Center mih="100vh"><Loader /></Center>;
}

export function SetupPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const form = useForm({ initialValues: { name: '', email: '', password: '' }, validate: { name: (v) => v.trim() ? null : '请输入姓名', email: (v) => /^\S+@\S+$/.test(v) ? null : '请输入有效邮箱', password: (v) => v.length >= 8 ? null : '至少 8 个字符' } });
  const submit = form.onSubmit(async (values) => {
    setLoading(true); setError('');
    try { await api.setupAdmin(values); await queryClient.invalidateQueries(); await navigate({ to: '/workspaces' }); }
    catch (e) { setError(e instanceof Error ? e.message : '初始化失败'); }
    finally { setLoading(false); }
  });
  return (
    <AuthShell title="创建管理员" lead="首次启动只需完成一次。数据会保存在当前 Madoc 实例中。">
      <ErrorAlert error={error} />
      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput label="姓名" placeholder="你的名字" autoComplete="name" {...form.getInputProps('name')} />
          <TextInput label="邮箱" placeholder="you@example.com" autoComplete="email" {...form.getInputProps('email')} />
          <PasswordInput label="密码" placeholder="至少 8 个字符" autoComplete="new-password" {...form.getInputProps('password')} />
          <Button type="submit" fullWidth size="md" loading={loading} rightSection={<IconArrowRight size={16} />}>创建并进入</Button>
        </Stack>
      </form>
    </AuthShell>
  );
}

export function SignInPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const form = useForm({ initialValues: { email: '', password: '' } });
  const submit = form.onSubmit(async (values) => {
    setLoading(true); setError('');
    try { await api.signIn(values); await queryClient.invalidateQueries(); await navigate({ to: '/workspaces' }); }
    catch (e) { setError(e instanceof Error ? e.message : '登录失败'); }
    finally { setLoading(false); }
  });
  return (
    <AuthShell title="欢迎回来" lead="登录你的 Madoc workspace。">
      <ErrorAlert error={error} />
      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput label="邮箱" autoComplete="email" {...form.getInputProps('email')} />
          <PasswordInput label="密码" autoComplete="current-password" {...form.getInputProps('password')} />
          <Button type="submit" fullWidth size="md" loading={loading}>登录</Button>
        </Stack>
      </form>
    </AuthShell>
  );
}

export function InvitePage() {
  const { token } = useParams({ from: '/invite/$token' });
  const navigate = useNavigate();
  const session = useSession();
  const [info, setInfo] = useState<{ workspaceName: string; email: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const form = useForm({ initialValues: { name: '', password: '' } });
  useEffect(() => { api.inspectInvite(token).then((v) => setInfo({ workspaceName: v.workspaceName, email: v.invite.email })).catch((e) => setError(e.message)); }, [token]);
  const accept = form.onSubmit(async (values) => {
    setLoading(true); setError('');
    try { const result = await api.acceptInvite(token, session.data?.user ? { name: '', password: '' } : values); await queryClient.invalidateQueries(); await navigate({ to: '/workspace/$workspaceId', params: { workspaceId: result.workspace.id } }); }
    catch (e) { setError(e instanceof APIError ? e.message : '无法接受邀请'); }
    finally { setLoading(false); }
  });
  return (
    <AuthShell
      title="加入工作区"
      lead={info ? <>你受邀以 <b>{info.email}</b> 加入「{info.workspaceName}」。</> : !error ? <Loader size="sm" /> : null}
    >
      <ErrorAlert error={error} />
      <form onSubmit={accept}>
        <Stack gap="md">
          {!session.data?.user && (
            <>
              <TextInput label="姓名" autoComplete="name" {...form.getInputProps('name')} />
              <PasswordInput label="设置密码" description="至少 8 个字符" autoComplete="new-password" {...form.getInputProps('password')} />
            </>
          )}
          <Button type="submit" fullWidth size="md" loading={loading} disabled={!info}>接受邀请</Button>
        </Stack>
      </form>
      {!session.data?.user && (
        <Text size="sm" c="dimmed" ta="center">
          已有账号？ <Anchor component={Link} to="/sign-in">先登录</Anchor>
        </Text>
      )}
    </AuthShell>
  );
}
