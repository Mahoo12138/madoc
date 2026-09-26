import { Alert, Button, Group, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { APIError } from '@/api/types';

/** Keep failed reads distinct from a successful empty result. */
export function WorkspaceLoadNotice({
  resource,
  error,
  unavailable = false,
  cached,
  pending,
  onRetry,
  showReturn = true,
}: {
  resource: '工作区' | '内容目录' | '工作区列表';
  error: Error | null;
  unavailable?: boolean;
  cached: boolean;
  pending: boolean;
  onRetry: () => void;
  showReturn?: boolean;
}) {
  const status = error instanceof APIError ? error.status : undefined;
  const feedback = describeReadFailure(status, resource, unavailable);
  return (
    <Alert
      color="red.9"
      title={feedback.title}
      role="alert"
      styles={{
        title: {
          color:
            'light-dark(var(--mantine-color-red-9), var(--mantine-color-red-3))',
        },
      }}
    >
      <Text size="sm">{feedback.message}</Text>
      {cached && (
        <Text size="sm" mt="xs">
          {feedback.denied
            ? '已停止保存，请先保留编辑器中的本地副本，再离开此页面。'
            : '已保留当前已加载的内容；重试不会清空正在编辑的正文。'}
        </Text>
      )}
      <Group mt="sm" gap="xs">
        {!feedback.denied && (
          <Button
            variant="filled"
            color="red.9"
            loading={pending}
            onClick={onRetry}
          >
            重试加载
          </Button>
        )}
        {feedback.login ? (
          <Button component={Link} to="/sign-in" variant="default">
            重新登录
          </Button>
        ) : (
          showReturn && (
            <Button component={Link} to="/workspaces" variant="default">
              返回工作区列表
            </Button>
          )
        )}
      </Group>
    </Alert>
  );
}

function describeReadFailure(
  status: number | undefined,
  resource: string,
  unavailable: boolean,
) {
  // An explicit HTTP result takes precedence over the realtime fallback.
  switch (status) {
    case 401:
      return {
        title: '登录已过期',
        message: '请重新登录后继续。',
        denied: true,
        login: true,
      };
    case 403:
      return {
        title: '无法访问此工作区',
        message: '当前账号已无法访问此工作区，请联系工作区所有者。',
        denied: true,
        login: false,
      };
    case 404:
      return {
        title: '工作区不可用',
        message:
          '工作区可能已删除，或当前账号没有访问权限。请返回列表选择其他空间。',
        denied: true,
        login: false,
      };
  }
  if (unavailable)
    return {
      title: '工作区访问权限已变更',
      message: '当前账号已无法访问此工作区，请联系工作区所有者。',
      denied: true,
      login: false,
    };
  return {
    title: `${resource}加载失败`,
    message:
      status === 429
        ? '请求过于频繁，请稍后重试。'
        : '暂时无法获取最新数据，请检查网络连接后重试。',
    denied: false,
    login: false,
  };
}
