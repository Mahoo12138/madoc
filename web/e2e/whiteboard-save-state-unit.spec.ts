import { expect, test } from '@playwright/test';
import { WhiteboardSaveState } from '../src/features/whiteboard/whiteboard-save-state';

test('scene ACKs match sent IDs and retries retain the current ID', () => {
  const state = new WhiteboardSaveState();
  expect(state.pending).toBe(false);
  state.changed();
  const first = state.requestId!;
  expect(state.acknowledge(first)).toBe(false);
  state.sending(first);
  state.sending(first);
  expect(state.requestId).toBe(first);
  state.changed();
  const second = state.requestId!;
  state.sending(second);
  expect(state.acknowledge('unknown')).toBe(false);
  expect(state.acknowledge(first)).toBe(true);
  expect(state.pending).toBe(true);
  expect(state.acknowledge(first)).toBe(false);
  expect(state.acknowledge(undefined)).toBe(false);
  expect(state.acknowledge(second)).toBe(true);
  expect(state.pending).toBe(false);
  expect(state.requestId).toBeUndefined();
});

test('a newer complete-scene ACK supersedes older sent versions', () => {
  const state = new WhiteboardSaveState();
  state.changed();
  const first = state.requestId!;
  state.sending(first);
  state.changed();
  const second = state.requestId!;
  state.sending(second);
  expect(state.acknowledge(second)).toBe(true);
  expect(state.pending).toBe(false);
  expect(state.acknowledge(first)).toBe(false);
  state.changed();
  expect(state.pending).toBe(true);
  expect(state.acknowledge(second)).toBe(false);
  expect(state.pending).toBe(true);
});
