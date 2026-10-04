import { expect, test } from '@playwright/test';
import { WhiteboardSettingsState } from '../src/features/whiteboard/whiteboard-settings-state';

test('pending element changes accept remote settings while pending local fields are retained', () => {
  const state = new WhiteboardSettingsState();
  const initial = { viewBackgroundColor: '#ffffff', gridModeEnabled: false };
  state.changed(
    initial,
    { ...initial, theme: 'dark', selectedElementIds: { rectangle: true } },
    'element-change',
  );
  expect(
    state.merge(
      { viewBackgroundColor: '#fff4e6', gridModeEnabled: true },
      initial,
    ),
  ).toEqual({ viewBackgroundColor: '#fff4e6', gridModeEnabled: true });

  const local = { ...initial, viewBackgroundColor: '#edf2ff' };
  state.changed(initial, local, 'background-change');
  expect(
    state.merge(
      { viewBackgroundColor: '#fff4e6', gridModeEnabled: true },
      local,
    ),
  ).toEqual({ viewBackgroundColor: '#edf2ff', gridModeEnabled: true });
});

test('an old ACK clears confirmed fields without clearing a newer background edit', () => {
  const state = new WhiteboardSettingsState();
  const initial = { viewBackgroundColor: '#ffffff', gridModeEnabled: false };
  const first = { viewBackgroundColor: '#edf2ff', gridModeEnabled: true };
  state.changed(initial, first, 'first');
  state.sending('first');
  const second = { ...first, viewBackgroundColor: '#fff4e6' };
  state.changed(first, second, 'second');
  state.sending('second');
  expect(state.acknowledge('first')).toBe(true);
  expect(
    state.merge(
      { viewBackgroundColor: '#ffffff', gridModeEnabled: false },
      second,
    ),
  ).toEqual({ viewBackgroundColor: '#fff4e6', gridModeEnabled: false });
  expect(state.acknowledge('first')).toBe(false);
  expect(state.acknowledge('unknown')).toBe(false);
  expect(state.acknowledge(undefined)).toBe(false);
  expect(state.acknowledge('second')).toBe(true);
  expect(state.merge(initial, second)).toEqual(initial);
});

test('a later element-only scene ACK confirms earlier setting changes and invalidates old batches', () => {
  const state = new WhiteboardSettingsState();
  const initial = { viewBackgroundColor: '#ffffff' };
  const local = { viewBackgroundColor: '#fff4e6' };
  state.changed(initial, local, 'background');
  state.sending('background');
  state.changed(local, local, 'element');
  state.sending('element');
  expect(state.acknowledge('element')).toBe(true);
  expect(state.acknowledge('background')).toBe(false);
  expect(state.merge(initial, local)).toEqual(initial);
});

test('retrying an old request cannot confirm newer edits and restored settings keep only their own differences', () => {
  const state = new WhiteboardSettingsState();
  const server = { viewBackgroundColor: '#ffffff', gridModeEnabled: false };
  const draft = { ...server, viewBackgroundColor: '#edf2ff', theme: 'dark' };
  state.changed(server, draft, 'recovered');
  state.sending('recovered');
  const newer = { ...draft, viewBackgroundColor: '#fff4e6' };
  state.changed(draft, newer, 'newer');
  state.sending('recovered');
  expect(state.acknowledge('recovered')).toBe(true);
  expect(
    state.merge(
      { viewBackgroundColor: '#ffffff', gridModeEnabled: true, theme: 'light' },
      newer,
    ),
  ).toEqual({ viewBackgroundColor: '#fff4e6', gridModeEnabled: true });
  state.sending('newer');
  expect(state.acknowledge('newer')).toBe(true);
  expect(state.merge(server, newer)).toEqual(server);
});
