import { useState } from 'react';
import { Anchor, Button, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowRight as IconArrowRight, MailCheck as IconMailCheck } from 'lucide-react';
import { queryClient } from '@/api/query-client';
import { useCompleteSignUp, useRequestSignUp, useSiteInfo } from '@/api/hooks';
import { APIError } from '@/api/types';
import { AuthShell, ErrorAlert } from './auth-shell';
import * as styles from './pages.css';

/**
 * 公开注册（§11.2）。两条页面各只做一件事：
 *
 * - `/sign-up` 只收邮箱，把统一受理响应原样讲成人话。它**不能**、也无从判断邮箱
 *   是否已注册——服务端对「可以注册 / 已有账号 / 当前不可注册」返回逐字节相同的
 *   202，任何据响应分叉的文案都是账号枚举（§9.7）。
 * - `/sign-up/$token` 由邮件链接直达，不发任何读取请求：GET 不消费令牌，避免邮件
 *   客户端的链接预取把验证机会提前用掉。令牌失效只在提交时以统一文案出现。
 */

/**
 * 申请页三种情况共用的受理文案：对「可以注册」与「邮箱已有账号」逐字相同。
 *
 * 它是唯一被允许的提交结果呈现方式。服务端响应体里的 `message` 同样对三种情况
 * 一致，但前端**不渲染它**：让这句文案只有这一处来源，页面就不可能因为某次响应
 * 带上了别的话而泄露邮箱状态。
 */
const ACCEPTED_COPY = '如果该邮箱可以注册，我们已经发了一封邮件，请查收。';

/**
 * 令牌失效的统一文案。服务端对「不存在 / 已撤销 / 已过期 / 已用过」一律返回
 * 404，前端也不替它区分原因——能区分的差异就是可被枚举的差异。
 */
const TOKEN_INVALID_COPY =
  '这个注册链接无效或已失效；它可能已被撤销、已经使用过，或者已经过期。请回到注册页重新申请，或联系站点管理员。';

/**
 * 站点不接受公开注册时的状态。`registrationMode` 是公开事实，SMTP 是否就绪不是
 * ——匿名访客没有理由知道部署方的邮件配置，所以这里只给结论，不给原因。
 */
function registrationClosedCopy(registrationMode: string | undefined): string {
  if (registrationMode === 'invite_only') return '此站点仅接受邀请加入，未开放自助注册。';
  return '此站点未开放自助注册。';
}

/** 直达每一条注册路由都带着同一个出口，不让访客停在一张没有下文的卡片上。 */
function SignInHint() {
  return (
    <Text size="sm" c="dimmed" ta="center">
      已有账号？ <Anchor component={Link} to="/sign-in">直接登录</Anchor>
    </Text>
  );
}

function requestErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    if (error.code === 'CSRF_INVALID') return '会话校验已失效，请刷新页面后重试。';
    if (error.code === 'RATE_LIMITED' || error.status === 429)
      return '提交过于频繁，已被限流。请稍后再试，不要反复提交。';
    // 403 只有两种来源：同源校验失败（上面已判）与站点不接受公开注册。
    if (error.code === 'REGISTRATION_CLOSED' || error.code === 'REGISTRATION_NOT_READY' || error.status === 403 || error.status === 422)
      return '此站点当前不接受公开注册，请联系站点管理员。';
    if (error.code === 'INVALID_REQUEST' || error.status === 400)
      return '请输入有效的邮箱地址。';
    if (error.code === 'INTERNAL' || error.status === 500)
      return '验证邮件发送失败，请稍后重试。';
  }
  return '请求未能完成，请检查网络后重试。';
}

function completeErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    // 404 在四种失效原因下逐字节相同：前端只输出这一句，不替服务端区分。
    if (error.status === 404) return TOKEN_INVALID_COPY;
    if (error.code === 'EMAIL_ALREADY_REGISTERED' || error.status === 409)
      return '该邮箱已有账号，请直接使用已有账号登录，或联系站点管理员调整。';
    if (error.code === 'REGISTRATION_CLOSED' || error.code === 'REGISTRATION_NOT_READY' || error.status === 422)
      return '站点已关闭公开注册，这个链接不能再创建账号。';
    if (error.code === 'RATE_LIMITED' || error.status === 429)
      return '尝试过于频繁，已被限流。请稍后重试，不要反复提交。';
    if (error.code === 'INVALID_REQUEST' || error.status === 400)
      return '姓名或密码不符合要求：姓名不能为空，密码至少 8 个字符。';
    if (error.code === 'CSRF_INVALID' || error.status === 403)
      return '会话校验已失效，请刷新页面后重试。';
  }
  return '账号未能创建，请稍后重试。';
}

export function SignUpRequestPage() {
  const siteInfo = useSiteInfo();
  const request = useRequestSignUp();
  const [error, setError] = useState('');
  /** 受理后进入的终态。它只有「已受理」一种，不携带任何邮箱状态。 */
  const [accepted, setAccepted] = useState(false);
  const form = useForm({
    initialValues: { email: '' },
    validate: { email: (v) => (/^\S+@\S+$/.test(v.trim()) ? null : '请输入有效邮箱') },
  });

  // 首次提交与「重新发送」是同一个动作：同样的字段、同样的路径、同样的受理文案。
  // 它也是受理之后**唯一**允许的动作——不给访客换邮箱再来一次的入口，否则这个
  // 页面就成了账号枚举器。
  const submit = form.onSubmit(async (values) => {
    setError('');
    try {
      await request.mutateAsync({ email: values.email.trim() });
      setAccepted(true);
    } catch (e) {
      setError(requestErrorMessage(e));
    }
  });

  // 直达被关闭的注册路由也要有明确状态，不能只靠登录页藏起入口（§10.5）。
  if (siteInfo.isPending)
    return (
      <AuthShell
        title="创建账号"
        lead={<span className={styles.hint} role="status">正在读取站点的注册状态…</span>}
      >
        <SignInHint />
      </AuthShell>
    );

  if (siteInfo.error)
    return (
      <AuthShell title="创建账号" lead="无法确认本站点是否开放自助注册。">
        <ErrorAlert error="暂时无法读取站点的注册状态，请稍后重试或直接登录已有账号。" />
        <Button
          variant="default"
          fullWidth
          size="md"
          loading={siteInfo.isFetching}
          onClick={() => void siteInfo.refetch()}
        >
          重试
        </Button>
        <SignInHint />
      </AuthShell>
    );

  if (!siteInfo.data?.publicRegistrationAvailable)
    return (
      <AuthShell
        title="创建账号"
        lead={registrationClosedCopy(siteInfo.data?.registrationMode)}
      >
        <SignInHint />
      </AuthShell>
    );

  return (
    <AuthShell title="创建账号" lead="填写邮箱，我们会把注册链接发到这个邮箱。链接只能使用一次。">
      <ErrorAlert error={error} />
      {accepted ? (
        <>
          {/* 受理态只有解释，没有第二个分支：文案与「是否真的发信」无关。 */}
          <div className={styles.accepted}>
            <IconMailCheck size={16} aria-hidden />
            <p className={styles.acceptedText}>{ACCEPTED_COPY}</p>
          </div>
          <p className={styles.hint}>
            邮件可能需要几分钟到达。若始终没有收到，可以重新发送一次，或先确认该邮箱能正常收信。
          </p>
          <Button
            variant="default"
            fullWidth
            size="md"
            loading={request.isPending}
            onClick={() => void submit()}
          >
            重新发送
          </Button>
        </>
      ) : (
        <form onSubmit={submit}>
          <Stack gap="md">
            <TextInput
              label="邮箱"
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              {...form.getInputProps('email')}
            />
            <Button
              type="submit"
              fullWidth
              size="md"
              loading={request.isPending}
              rightSection={<IconArrowRight size={16} />}
            >
              发送注册链接
            </Button>
          </Stack>
        </form>
      )}
      <SignInHint />
    </AuthShell>
  );
}

export function SignUpCompletePage() {
  const { token } = useParams({ from: '/sign-up/$token' });
  const navigate = useNavigate();
  const complete = useCompleteSignUp();
  const [error, setError] = useState('');
  // 内存中持有表单值：失败时保留姓名草稿，密码不落 localStorage（§10.5）。
  const form = useForm({
    initialValues: { name: '', password: '' },
    validate: {
      name: (v) => (v.trim() ? null : '请输入姓名'),
      password: (v) => (v.length >= 8 ? null : '至少 8 个字符'),
    },
  });
  const submit = form.onSubmit(async (values) => {
    setError('');
    try {
      await complete.mutateAsync({
        token,
        name: values.name.trim(),
        password: values.password,
      });
      await queryClient.invalidateQueries();
      await navigate({ to: '/workspaces' });
    } catch (e) {
      setError(completeErrorMessage(e));
    }
  });
  return (
    <AuthShell
      title="完成注册"
      lead={
        <>
          设置姓名与密码即可完成注册。注册后你是本站的普通用户；能否创建工作区由站点管理员的设置决定。
          <span className={styles.hint}>这个链接来自我们发到该邮箱的注册邮件，只能使用一次。</span>
        </>
      }
    >
      <ErrorAlert error={error} />
      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput label="姓名" autoComplete="name" autoFocus {...form.getInputProps('name')} />
          <PasswordInput
            label="设置密码"
            description="至少 8 个字符"
            autoComplete="new-password"
            {...form.getInputProps('password')}
          />
          <Button
            type="submit"
            fullWidth
            size="md"
            loading={complete.isPending}
            rightSection={<IconArrowRight size={16} />}
          >
            完成注册
          </Button>
        </Stack>
      </form>
      <SignInHint />
    </AuthShell>
  );
}
