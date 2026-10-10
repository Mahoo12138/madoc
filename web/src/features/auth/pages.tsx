import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Anchor, Button, Center, Loader, PasswordInput, Stack, Text, TextInput, Title, type MantineColor } from '@mantine/core';
import { useForm } from '@mantine/form';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { AlertCircle as IconAlertCircle, ArrowRight as IconArrowRight } from 'lucide-react';
import { api } from '@/api/client';
import { queryClient } from '@/api/query-client';
import { useSession, useSiteInfo } from '@/api/hooks';
import { APIError, type InvitePreview, type SiteInfo } from '@/api/types';
import * as styles from './pages.css';

function Brand() {
  return (
    <div className={styles.brand}>
      <img src="/logo.svg" alt="" aria-hidden className={styles.mark} />
      <Text className={styles.wordmark}>Madoc</Text>
    </div>
  );
}

function ErrorAlert({ error, color = 'red' }: { error: string; color?: MantineColor }) {
  return error ? (
    <Alert color={color} variant="light" radius="sm" icon={<IconAlertCircle size={16} />}>
      {error}
    </Alert>
  ) : null;
}

/**
 * §10.5：登录页只陈述准入事实。`publicRegistrationAvailable` 为真时由公开注册
 * 入口承担说明；`open` 但没有可用入口时不臆造文案。
 */
function registrationNote(info: SiteInfo | undefined): string {
  if (!info || info.publicRegistrationAvailable) return '';
  if (info.registrationMode === 'closed') return '此站点未开放自助注册。';
  if (info.registrationMode === 'invite_only') return '请通过邀请链接加入。';
  return '';
}

/** 服务端以邮箱匹配账号：大小写与首尾空白不构成两个账号。 */
function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
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
  // 说明文案不承载流程：`/api/site` 加载中或失败时静默不显示这一行。
  const siteInfo = useSiteInfo();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const form = useForm({ initialValues: { email: '', password: '' } });
  const submit = form.onSubmit(async (values) => {
    setLoading(true); setError('');
    try { await api.signIn(values); await queryClient.invalidateQueries(); await navigate({ to: '/workspaces' }); }
    catch (e) { setError(e instanceof Error ? e.message : '登录失败'); }
    finally { setLoading(false); }
  });
  const note = registrationNote(siteInfo.data);
  return (
    <AuthShell
      title="欢迎回来"
      lead={<>登录你的 Madoc workspace。{note && <span className={styles.hint}>{note}</span>}</>}
    >
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
  const [info, setInfo] = useState<InvitePreview | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const form = useForm({ initialValues: { name: '', password: '' } });
  useEffect(() => {
    api.inspectInvite(token).then(setInfo).catch(() => setInvalid(true));
  }, [token]);

  const user = session.data?.user ?? null;
  // 会话未定型前不判定「能不能建号」，避免把加载中的空会话当成匿名者。
  const sessionSettled = !session.isPending;
  const mismatch = !!user && !!info && !sameEmail(user.email, info.invite.email);
  const canCreate = sessionSettled && !user && info?.canCreateAccount === true;
  const creationBlocked = sessionSettled && !user && !!info && info.canCreateAccount !== true;

  const accept = form.onSubmit(async (values) => {
    if (mismatch || creationBlocked) return;
    setLoading(true); setError('');
    try { const result = await api.acceptInvite(token, user ? { name: '', password: '' } : values); await queryClient.invalidateQueries(); await navigate({ to: '/workspace/$workspaceId', params: { workspaceId: result.workspace.id } }); }
    catch (e) { setError(e instanceof APIError ? e.message : '无法接受邀请'); }
    finally { setLoading(false); }
  });
  return (
    <AuthShell
      title="加入工作区"
      lead={info ? <>你受邀以 <b>{info.invite.email}</b> 加入「{info.workspaceName}」。</> : !invalid ? <Loader size="sm" /> : null}
    >
      {invalid && <ErrorAlert error="邀请已失效或已被撤销。" />}
      {!invalid && (
        <>
          <ErrorAlert error={mismatch ? '当前登录的账号与邀请的邮箱不一致，请切换账号后重试。' : ''} />
          <ErrorAlert color="gray" error={creationBlocked ? '当前不允许创建新账号，请联系邀请你加入工作区的人或站点管理员。' : ''} />
          <ErrorAlert error={error} />
          <form onSubmit={accept}>
            <Stack gap="md">
              {canCreate && (
                <>
                  <TextInput label="姓名" autoComplete="name" {...form.getInputProps('name')} />
                  <PasswordInput label="设置密码" description="至少 8 个字符" autoComplete="new-password" {...form.getInputProps('password')} />
                </>
              )}
              {/* 不能建号且未登录时不提供任何提交动作：不给点了必然失败的按钮。 */}
              {!creationBlocked && (
                <Button type="submit" fullWidth size="md" loading={loading} disabled={!info || mismatch}>接受邀请</Button>
              )}
            </Stack>
          </form>
          {!user && (
            <Text size="sm" c="dimmed" ta="center">
              已有账号？ <Anchor component={Link} to="/sign-in">先登录</Anchor>
            </Text>
          )}
        </>
      )}
    </AuthShell>
  );
}
