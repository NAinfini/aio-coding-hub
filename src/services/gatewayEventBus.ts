import { logToConsole } from "./consoleLog";
import { hasTauriRuntime } from "./tauriInvoke";

export const gatewayEventNames = {
  status: "gateway:status",
  requestStart: "gateway:request_start",
  attempt: "gateway:attempt",
  request: "gateway:request",
  log: "gateway:log",
  circuit: "gateway:circuit",
} as const;

export type GatewayEventName = (typeof gatewayEventNames)[keyof typeof gatewayEventNames];

export type GatewayEventSubscription = {
  ready: Promise<void>;
  unsubscribe: () => void;
};

type Handler = (payload: unknown) => void;

type Entry = {
  handlers: Set<Handler>;
  init: Promise<void> | null;
  unlisten: (() => void) | null;
  disposed: boolean;
};

const entries = new Map<GatewayEventName, Entry>();
let eventApiPromise: Promise<typeof import("@tauri-apps/api/event")> | null = null;

function loadEventApi() {
  if (eventApiPromise) return eventApiPromise;
  eventApiPromise = import("@tauri-apps/api/event");
  return eventApiPromise;
}

function dispatchHandlers(handlers: Set<Handler>, payload: unknown) {
  for (const handler of handlers) handler(payload);
}

function getOrCreateEntry(event: GatewayEventName): Entry {
  const existing = entries.get(event);
  if (existing) return existing;

  const created: Entry = {
    handlers: new Set(),
    init: null,
    unlisten: null,
    disposed: false,
  };
  entries.set(event, created);
  return created;
}

function disposeEntry(event: GatewayEventName, entry: Entry) {
  entry.disposed = true;
  if (entry.unlisten) entry.unlisten();
  entry.unlisten = null;
  entries.delete(event);
}

function ensureListening(event: GatewayEventName, entry: Entry): Promise<void> {
  if (entry.init) return entry.init;

  entry.init = loadEventApi()
    .then(({ listen }) =>
      listen(event, (evt) => {
        dispatchHandlers(entry.handlers, evt.payload);
      })
    )
    .then((unlisten) => {
      entry.unlisten = unlisten;
      if (entry.disposed || entry.handlers.size === 0) disposeEntry(event, entry);
    })
    .catch((error) => {
      logToConsole(
        "error",
        "网关事件监听初始化失败",
        { event, error: String(error) },
        "gateway:event_bus"
      );
    });

  return entry.init;
}

export function subscribeGatewayEvent<TPayload>(
  event: GatewayEventName,
  handler: (payload: TPayload) => void
): GatewayEventSubscription {
  if (!hasTauriRuntime()) {
    return { ready: Promise.resolve(), unsubscribe: () => {} };
  }

  const entry = getOrCreateEntry(event);
  const wrapped: Handler = (payload) => {
    handler(payload as TPayload);
  };

  entry.handlers.add(wrapped);
  const ready = ensureListening(event, entry);

  return {
    ready,
    unsubscribe: () => {
      entry.handlers.delete(wrapped);
      if (entry.handlers.size !== 0) return;
      if (entry.unlisten) {
        disposeEntry(event, entry);
        return;
      }
      if (entry.init) entry.disposed = true;
      else disposeEntry(event, entry);
    },
  };
}
