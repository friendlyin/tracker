import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKOFF, createOutbox, type Op, type OutboxDeps } from "./outbox";

type Reply = number | "offline";

/** An outbox over in-memory storage; `replies` answers sends in order (then 200). */
function setup(opts: { stored?: Op[]; replies?: Reply[] } = {}) {
  let saved: Op[] | undefined = opts.stored;
  const replies = [...(opts.replies ?? [])];
  const sent: Op[] = [];
  let n = 0;
  let tz = "Europe/Berlin";
  const deps: OutboxDeps = {
    load: async () => saved,
    save: async (ops) => {
      saved = ops;
    },
    send: async (op) => {
      sent.push(op);
      const r = replies.shift() ?? 200;
      if (r === "offline") throw new TypeError("Failed to fetch");
      return r;
    },
    onDrained: vi.fn(),
    onAuth: vi.fn(),
    newId: () => `op${++n}`,
    timeZone: () => tz,
    now: () => 1_000,
  };
  const box = createOutbox(deps);
  return {
    box,
    deps,
    sent,
    paths: () => sent.map((o) => o.path),
    saved: () => saved ?? [],
    setTz: (v: string) => {
      tz = v;
    },
  };
}

const write = (path: string) => ({ method: "POST", path, body: { path } });

describe("outbox", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends writes in the order they were made, then empties", async () => {
    const t = setup();
    await t.box.enqueue(write("/a"));
    await t.box.enqueue(write("/b"));
    await t.box.enqueue(write("/c"));
    await t.box.flush();
    expect(t.paths()).toEqual(["/a", "/b", "/c"]);
    expect(t.saved()).toEqual([]);
    expect(t.box.getState()).toMatchObject({ pending: 0, failing: false, rejected: 0 });
    expect(t.deps.onDrained).toHaveBeenCalled();
  });

  it("keeps the timezone from when the write was made", async () => {
    const t = setup({ replies: ["offline"] });
    await t.box.enqueue(write("/a"));
    await t.box.flush();
    t.setTz("America/New_York");
    await t.box.flush();
    expect(t.sent.map((o) => o.tz)).toEqual(["Europe/Berlin", "Europe/Berlin"]);
  });

  it("keeps writes while offline and sends them on the next flush", async () => {
    // Each new write also tries to send at once.
    const t = setup({ replies: ["offline", "offline"] });
    await t.box.enqueue(write("/a"));
    await t.box.enqueue(write("/b"));
    await t.box.flush();
    expect(t.box.getState()).toMatchObject({ pending: 2, failing: true });
    expect(t.saved().map((o) => o.path)).toEqual(["/a", "/b"]);
    await t.box.flush();
    expect(t.paths()).toEqual(["/a", "/a", "/a", "/b"]);
    expect(t.box.getState()).toMatchObject({ pending: 0, failing: false });
  });

  it("retries after server errors with growing delays", async () => {
    const t = setup({ replies: [503, 500] });
    await t.box.enqueue(write("/a"));
    await t.box.flush();
    expect(t.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(BACKOFF[0] as number);
    expect(t.sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(BACKOFF[0] as number);
    expect(t.sent).toHaveLength(2); // second delay is longer
    await vi.advanceTimersByTimeAsync((BACKOFF[1] as number) - (BACKOFF[0] as number));
    expect(t.sent).toHaveLength(3);
    expect(t.box.getState().pending).toBe(0);
  });

  it("drops a write whose target is gone without flagging it", async () => {
    const t = setup({ replies: [404] });
    await t.box.enqueue(write("/a"));
    await t.box.enqueue(write("/b"));
    await t.box.flush();
    expect(t.paths()).toEqual(["/a", "/b"]);
    expect(t.box.getState()).toMatchObject({ pending: 0, rejected: 0 });
  });

  it("drops a refused write, moves on and counts it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = setup({ replies: [400] });
    await t.box.enqueue(write("/a"));
    await t.box.enqueue(write("/b"));
    await t.box.flush();
    expect(t.paths()).toEqual(["/a", "/b"]);
    expect(t.box.getState()).toMatchObject({ pending: 0, rejected: 1 });
    t.box.clearRejected();
    expect(t.box.getState().rejected).toBe(0);
  });

  it("keeps the write and asks for login on 401", async () => {
    const t = setup({ replies: [401] });
    await t.box.enqueue(write("/a"));
    await t.box.flush();
    expect(t.deps.onAuth).toHaveBeenCalledOnce();
    expect(t.box.getState()).toMatchObject({ pending: 1, failing: true });
    await t.box.flush();
    expect(t.box.getState().pending).toBe(0);
  });

  it("sends each write once when flushes overlap", async () => {
    const t = setup();
    await t.box.enqueue(write("/a"));
    await Promise.all([t.box.flush(), t.box.flush(), t.box.flush()]);
    expect(t.paths()).toEqual(["/a"]);
  });

  it("sends a write queued during a flush in the same run", async () => {
    const t = setup();
    await t.box.enqueue(write("/a"));
    const run = t.box.flush();
    await t.box.enqueue(write("/b"));
    await run;
    await t.box.flush();
    expect(t.paths()).toEqual(["/a", "/b"]);
  });

  it("picks up writes stored by an earlier session", async () => {
    const stored: Op[] = [{ id: "x", method: "DELETE", path: "/old", tz: "UTC", at: 1 }];
    const t = setup({ stored });
    await t.box.enqueue(write("/new"));
    await t.box.flush();
    expect(t.paths()).toEqual(["/old", "/new"]);
  });
});
