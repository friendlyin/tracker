import { useEffect, useState } from "react";
import { disablePush, enablePush, type PushStatus, pushStatus, sendTestPush } from "../lib/push";
import { Row, SectionLabel } from "../ui/Row";
import { Toggle } from "../ui/Toggle";
import { useNotifySettings, useUpdateNotifySettings } from "./notify";

// This device's push subscription, and the settings that belong to no feature. Water and focus
// reminders are switched in their own settings.

const NOTE: Partial<Record<PushStatus, string>> = {
  "not-installed": "Add to Home Screen first",
  denied: "Allow in iOS Settings",
  unsupported: "Not supported here",
};

export function NotificationsSection() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);
  const settings = useNotifySettings();
  const update = useUpdateNotifySettings();

  useEffect(() => {
    void pushStatus().then(setStatus);
  }, []);

  const toggle = async (on: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await (on ? enablePush() : disablePush()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const note = status ? NOTE[status] : undefined;
  return (
    <>
      <SectionLabel>Notifications</SectionLabel>
      <Row>
        <span className="flex-1 text-[17px]">This device</span>
        {note ? (
          <span className="text-[15px] text-ink-2">{note}</span>
        ) : (
          status && (
            <Toggle
              checked={status === "on"}
              onChange={(v) => !busy && void toggle(v)}
              label="Notifications on this device"
            />
          )
        )}
      </Row>
      {error && <div className="mt-1 text-[13px] text-warn">{error}</div>}
      <Row>
        <span className="flex-1 text-[17px]">Timer ends</span>
        <Toggle
          checked={settings.data?.timers ?? true}
          onChange={(timers) => update.mutate({ timers })}
          label="Notify when a timer ends"
        />
      </Row>
      {status === "on" && (
        <Row>
          <button
            type="button"
            className="text-[17px] active:opacity-60"
            onClick={() =>
              sendTestPush()
                .then((r) => setTest(r ? `Sent to ${r.devices}` : "Sent"))
                .catch(() => setTest("Failed"))
            }
          >
            Send test
          </button>
          {test && <span className="ml-auto text-[15px] text-ink-2">{test}</span>}
        </Row>
      )}
    </>
  );
}
