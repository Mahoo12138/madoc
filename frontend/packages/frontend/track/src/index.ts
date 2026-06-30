export const track = (_event: string, _props?: Record<string, unknown>) => {};

export const enableAutoTrack = () => {};

export const sentry = undefined;

export const flushTelemetry = async () => {};

export const setTelemetryContext = (_ctx: Record<string, unknown>) => {};

export const setTelemetryTransport = (_transport: unknown) => {};

export const tracker = { track: (_event: string, _props?: Record<string, unknown>) => {} };

export type EventArgs = Record<string, unknown>;

export type Events = Record<string, unknown>;

export default track;
