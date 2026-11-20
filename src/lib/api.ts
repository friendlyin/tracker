import { del, get, set } from "idb-keyval";
import { useSyncExternalStore } from "react";
import { uuidv7 } from "../../shared/id";
import { createOutbox, type Op } from "./outbox";
import { queryClient } from "./queryClient";

// The client's only way to the API. Reads (`api`) go straight to the server; writes (`queueWrite`) go
// through the outbox so they survive having no signal. Every request carries a timezone (the server
// keeps the latest one, so "today" follows the user while travelling); a queued write carries the one
// from when it was made.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const RELOAD_FLAG = "auth.reloaded";

/**
 * The Access session expired: a full reload goes through the Cloudflare Access login. Only once per
 * session, so a misconfiguration does not cause a reload loop.
 */
function reloadForLogin() {
  if (import.meta.env.DEV) return;
  try {
    if (!sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();
    }
  } catch {
    // ignore
  }
}

function loggedIn() {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // ignore
  }
}

/** The API never redirects; a redirect is Access sending an expired session to its login page. */
const needsLogin = (res: Response) => res.status === 401 || res.type === "opaqueredirect";

function request(path: string, method: string, tz: string, body?: unknown, signal?: AbortSignal) {
  return fetch(`/api${path}`, {
    method,
    headers: {
      "x-timezone": tz,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    redirect: "manual",
    signal,
  });
}

const OUTBOX_KEY = "tracker.outbox";

export const outbox = createOutbox({
  load: () => get<Op[]>(OUTBOX_KEY),
  save: (ops) => (ops.length ? set(OUTBOX_KEY, ops) : del(OUTBOX_KEY)),
  async send(op) {
    // Weak signal can leave a request hanging; give up and retry later.
    const res = await request(op.path, op.method, op.tz, op.body, AbortSignal.timeout(20_000));
    if (needsLogin(res)) return 401;
    if (res.ok) loggedIn();
    return res.status;
  },
  onDrained: () => void queryClient.invalidateQueries(),
  onAuth: reloadForLogin,
  newId: () => uuidv7(),
  timeZone: deviceTimeZone,
});

/** Starts syncing queued writes, now and whenever the app regains network or comes to the front. */
export function startOutbox() {
  void outbox.flush();
  window.addEventListener("online", () => void outbox.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void outbox.flush();
  });
}

export const useOutbox = () => useSyncExternalStore(outbox.subscribe, outbox.getState);

/** Reads. Queued writes are sent first, so the answer includes them. */
export async function api<T>(path: string): Promise<T> {
  await outbox.flush();
  const res = await request(path, "GET", deviceTimeZone());
  if (needsLogin(res)) reloadForLogin();
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status || 401, text || res.statusText);
  }
  loggedIn();
  return (await res.json()) as T;
}

/**
 * Writes. Queued and sent in order, so it resolves without the server's answer: callers update the
 * cache optimistically, and the queries refetch once the outbox has emptied. Every write must be safe
 * to replay late: ids and times are set by the caller, never left to the server.
 */
export function queueWrite(path: string, opts: { method?: string; body?: unknown } = {}) {
  return outbox.enqueue({ method: opts.method ?? "POST", path, body: opts.body });
}

/**
 * A write that needs the server now and is not data (registering this device for push). Not queued:
 * it fails without a connection, and the caller shows that.
 */
export async function apiNow<T = unknown>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T | null> {
  const res = await request(path, method, deviceTimeZone(), body);
  if (needsLogin(res)) reloadForLogin();
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status || 401, text || res.statusText);
  }
  return res.status === 204 ? null : ((await res.json()) as T);
}
