import { api, apiNow } from "./api";

// Push notifications on this device. iOS offers push only to the app added to the Home Screen
// (16.4+), and permission must be asked from a tap. Each device subscribes on its own.

export type PushStatus = "unsupported" | "not-installed" | "denied" | "off" | "on";

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const installed = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true;

const supported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function pushStatus(): Promise<PushStatus> {
  if (!supported()) return isIos() && !installed() ? "not-installed" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  return (await currentSubscription()) ? "on" : "off";
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b = atob(
    b64url
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(b64url.length / 4) * 4, "="),
  );
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

/** Call from a tap. Returns the new status (denied when the user refuses). */
export async function enablePush(): Promise<PushStatus> {
  if (!supported()) return pushStatus();
  if ((await Notification.requestPermission()) !== "granted") return pushStatus();
  const { publicKey } = await api<{ publicKey: string | null }>("/push/key");
  if (!publicKey) throw new Error("Notifications are not set up on the server");
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  await apiNow("/push/subscriptions", "POST", sub.toJSON());
  return "on";
}

export async function disablePush(): Promise<PushStatus> {
  const sub = await currentSubscription();
  if (sub) {
    await apiNow("/push/unsubscribe", "POST", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
  return pushStatus();
}

export const sendTestPush = () => apiNow<{ devices: number }>("/push/test", "POST");
