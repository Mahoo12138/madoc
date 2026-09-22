// Excalidraw onChange also reports selection, tools, pointers and renders.
// Only these app settings are part of the persisted document.
const appStateKeys = ['viewBackgroundColor', 'gridSize', 'gridStep', 'gridModeEnabled', 'objectsSnapModeEnabled', 'theme', 'name'];

export function durableBoardScene(elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) {
  return {
    elements,
    appState: Object.fromEntries(appStateKeys.filter(key => key in appState).map(key => [key, appState[key]])),
    files,
  };
}
