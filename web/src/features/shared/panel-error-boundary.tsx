import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert, Button, Stack, Text } from '@mantine/core';

/**
 * A lazily loaded panel can fail for reasons the panel itself cannot report: the
 * chunk request fails on a flaky connection, a deploy replaces the build while
 * the tab is open, or a render throws on unexpected server data. Without a
 * boundary React unmounts the whole tree and the user gets a blank page instead
 * of a way forward.
 */
export class PanelErrorBoundary extends Component<
  { children: ReactNode; label?: string; onRetry?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the detail in the console; the surface only states the recovery.
    console.error('[madoc] panel failed to render', error, info.componentStack);
  }

  componentDidUpdate(previous: { children: ReactNode }) {
    // A new child identity means the panel was retried; clear the latch so a
    // later failure can be reported again instead of staying stuck.
    if (this.state.failed && previous.children !== this.props.children) {
      this.setState({ failed: false });
    }
  }

  private retry = () => {
    this.setState({ failed: false });
    if (this.props.onRetry) this.props.onRetry();
    else window.location.reload();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Alert
        color="red"
        role="alert"
        title={`${this.props.label ?? '此区域'}无法显示`}
      >
        <Stack gap="sm">
          <Text size="sm">
            {this.props.label ?? '此区域'}没有加载完成，其他部分仍可正常使用。
            重试会重新载入页面，未保存的正文请先自行保留。
          </Text>
          <div>
            <Button variant="default" onClick={this.retry}>
              重新载入
            </Button>
          </div>
        </Stack>
      </Alert>
    );
  }
}