import { expect, test } from '@playwright/test';
import {
  durableBoardAppState,
  durableBoardScene,
} from '../src/features/whiteboard/whiteboard-scene';

test('local theme, search, selection and pointer changes leave durable scenes unchanged', () => {
  const elements = [{ id: 'retained', version: 3, isDeleted: true }];
  const files = { image: { dataURL: 'data:image/png;base64,AQ==' } };
  const original = durableBoardScene(
    elements,
    { viewBackgroundColor: '#ffffff', theme: 'light' },
    files,
  );
  const localChanges = durableBoardScene(
    elements,
    {
      viewBackgroundColor: '#ffffff',
      theme: 'dark',
      openDialog: { name: 'help' },
      openSidebar: { name: 'default', tab: 'search' },
      selectedElementIds: { retained: true },
      collaborators: new Map([['peer', { pointer: { x: 20, y: 80 } }]]),
    },
    files,
  );
  expect(localChanges).toEqual(original);
  expect(localChanges.elements).toEqual(elements);
  expect(localChanges.files).toEqual(files);
});

test('background changes remain durable while old remote theme and library state are filtered', () => {
  const incoming = {
    viewBackgroundColor: '#fff4e6',
    theme: 'dark',
    gridModeEnabled: true,
    libraryItems: [{ id: 'local-library' }],
    openDialog: { name: 'imageExport' },
  };
  const remoteSettings = durableBoardAppState(incoming);
  expect(remoteSettings.viewBackgroundColor).toBe('#fff4e6');
  expect(remoteSettings.gridModeEnabled).toBe(true);
  expect(remoteSettings).not.toHaveProperty('theme');
  expect(remoteSettings).not.toHaveProperty('libraryItems');
  expect(remoteSettings).not.toHaveProperty('openDialog');
  expect(incoming.theme).toBe('dark');
  expect(durableBoardScene([], remoteSettings, {})).not.toEqual(
    durableBoardScene(
      [],
      { ...remoteSettings, viewBackgroundColor: '#ffffff' },
      {},
    ),
  );
});
