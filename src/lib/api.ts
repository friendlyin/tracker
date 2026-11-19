// Thin fetch wrapper for /api. Sends the device timezone on every call (the server keeps the latest
// one, so "today" follows the user while travelling).

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

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: {
      "x-timezone": deviceTimeZone(),
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    credentials: "same-origin",
  });

  if (res.status === 401 && !import.meta.env.DEV) {
    // Access session expired: a full reload goes through the Cloudflare Access login. Only once per
    // session, so a misconfiguration does not cause a reload loop.
    try {
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, "1");
        window.location.reload();
      }
    } catch {
      // ignore
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || res.statusText);
  }
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // ignore
  }
  return (await res.json()) as T;
}
