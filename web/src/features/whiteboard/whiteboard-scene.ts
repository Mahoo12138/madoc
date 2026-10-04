// Excalidraw onChange also reports selection, tools, pointers and renders.
// Only these app settings are part of the persisted document.
const appStateKeys = [
  'viewBackgroundColor',
  'gridSize',
  'gridStep',
  'gridModeEnabled',
  'objectsSnapModeEnabled',
  'name',
];

export function durableBoardAppState(appState: object) {
  const state = appState as Record<string, unknown>;
  return Object.fromEntries(
    appStateKeys.filter((key) => key in state).map((key) => [key, state[key]]),
  );
}

export function durableBoardScene(
  elements: readonly unknown[],
  appState: object,
  files: Record<string, unknown>,
) {
  return {
    elements,
    appState: durableBoardAppState(appState),
    files,
  };
}
