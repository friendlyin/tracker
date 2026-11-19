import { registerSW } from "virtual:pwa-register";

// App updates. Every deploy builds new hashed chunks and the new service worker deletes the old ones,
// so a page still running the previous build fails when it lazy-loads a screen it has not opened yet
// (the server answers the missing chunk with index.html: "'text/html' is not a valid JavaScript MIME
// type"). Two guards:
// 1. Reload as soon as a new service worker takes over (autoUpdate), and look for one whenever the
//    app comes to the foreground, so updates land on open rather than mid-use. Queued writes live in
//    IndexedDB and survive the reload.
// 2. If a chunk still fails to load, reload once. TanStack Router has its own reload for this, but
//    it does not recognise Safari's MIME-type message.

const RELOAD_FLAG = "chunk.reloaded";

export function setupUpdates() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    },
  });

  window.addEventListener("vite:preloadError", () => {
    try {
      if (sessionStorage.getItem(RELOAD_FLAG)) return;
      sessionStorage.setItem(RELOAD_FLAG, "1");
    } catch {
      return;
    }
    window.location.reload();
  });
  // Allow another reload later in the session once this page has loaded fine.
  setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      // ignore
    }
  }, 10_000);
}
