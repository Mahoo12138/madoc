import { useEffect, useState } from 'react';
import { Alert, Anchor, Button, Center, Loader, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { AlertCircle as IconAlertCircle, ArrowRight as IconArrowRight } from 'lucide-react';
import { api } from '@/api/client';
import { queryClient } from '@/api/query-client';
import { useSession } from '@/api/hooks';
import { APIError } from '@/api/types';
import * as styles from './pages.css';

function Brand() {
  return <div className={styles.brand}><div className={styles.mark}>m</div><Text fw={700} size="lg">madoc</Text></div>;
}

function ErrorAlert({ error }: { error: string }) {
  return error ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert> : null;
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
  return <main className={styles.page}><section className={styles.panel}><Brand /><Paper withBorder shadow="xs" radius="lg" p="xl"><Stack gap="lg"><div><Title order={2}>创建管理员</Title><Text c="dimmed" mt={6}>首次启动只需完成一次。数据会保存在当前 madoc 实例中。</Text></div><ErrorAlert error={error} /><form onSubmit={submit}><Stack><TextInput label="姓名" placeholder="你的名字" {...form.getInputProps('name')} /><TextInput label="邮箱" placeholder="you@example.com" {...form.getInputProps('email')} /><PasswordInput label="密码" placeholder="至少 8 个字符" {...form.getInputProps('password')} /><Button type="submit" loading={loading} rightSection={<IconArrowRight size={16} />}>创建并进入</Button></Stack></form></Stack></Paper></section></main>;
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
  return <main className={styles.page}><section className={styles.panel}><Brand /><Paper withBorder shadow="xs" radius="lg" p="xl"><Stack gap="lg"><div><Title order={2}>欢迎回来</Title><Text c="dimmed" mt={6}>登录你的 madoc workspace。</Text></div><ErrorAlert error={error} /><form onSubmit={submit}><Stack><TextInput label="邮箱" autoComplete="email" {...form.getInputProps('email')} /><PasswordInput label="密码" autoComplete="current-password" {...form.getInputProps('password')} /><Button type="submit" loading={loading}>登录</Button></Stack></form></Stack></Paper></section></main>;
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
  return <main className={styles.page}><section className={styles.panel}><Brand /><Paper withBorder radius="lg" p="xl"><Stack><Title order={2}>加入 Workspace</Title>{info ? <Text>你受邀以 <b>{info.email}</b> 加入「{info.workspaceName}」。</Text> : !error && <Loader size="sm" />}<ErrorAlert error={error} /><form onSubmit={accept}><Stack>{!session.data?.user && <><TextInput label="姓名" {...form.getInputProps('name')} /><PasswordInput label="设置密码" description="至少 8 个字符" {...form.getInputProps('password')} /></>}<Button type="submit" loading={loading} disabled={!info}>接受邀请</Button></Stack></form>{!session.data?.user && <Text size="sm" c="dimmed">已有账号？ <Anchor component={Link} to="/sign-in">先登录</Anchor></Text>}</Stack></Paper></section></main>;
}
