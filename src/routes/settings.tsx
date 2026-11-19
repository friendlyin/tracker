import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { resetVariants, setDevMode, useDevState } from "../dev/variants";
import { useMe, useUpdateMe } from "../features/profile";
import { deviceTimeZone } from "../lib/api";
import { Row, SectionLabel } from "../ui/Row";
import { Screen } from "../ui/Screen";
import { Toggle } from "../ui/Toggle";

export const Route = createFileRoute("/settings")({ component: Settings });

function Settings() {
  const me = useMe();
  const update = useUpdateMe();
  const dev = useDevState();
  const [name, setName] = useState("");
  useEffect(() => setName(me.data?.name ?? ""), [me.data?.name]);

  const input = "min-w-0 flex-1 bg-transparent text-right text-[17px] outline-none";

  return (
    <Screen back="/" title="Settings">
      <SectionLabel>Profile</SectionLabel>
      <Row>
        <span className="text-[17px]">Name</span>
        <input
          className={input}
          value={name}
          placeholder="–"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== (me.data?.name ?? "") && update.mutate({ name: name || null })}
        />
      </Row>
      <Row>
        <span className="text-[17px]">Email</span>
        <span className="min-w-0 flex-1 truncate text-right text-ink-2">{me.data?.email}</span>
      </Row>
      <Row>
        <span className="text-[17px]">Timezone</span>
        <span className="flex-1 text-right text-ink-2">
          {me.data?.timezone ?? deviceTimeZone()}
        </span>
      </Row>

      <SectionLabel>Day</SectionLabel>
      <Row>
        <span className="text-[17px]">Wake</span>
        <input
          type="time"
          className="ml-auto bg-transparent text-[17px] outline-none"
          value={me.data?.wakeTime ?? "07:00"}
          onChange={(e) => e.target.value && update.mutate({ wakeTime: e.target.value })}
        />
      </Row>
      <Row>
        <span className="text-[17px]">Sleep</span>
        <input
          type="time"
          className="ml-auto bg-transparent text-[17px] outline-none"
          value={me.data?.sleepTime ?? "23:00"}
          onChange={(e) => e.target.value && update.mutate({ sleepTime: e.target.value })}
        />
      </Row>

      <SectionLabel>Development</SectionLabel>
      <Row>
        <span className="flex-1 text-[17px]">Design variants</span>
        <Toggle checked={dev.devMode} onChange={setDevMode} label="Design variants" />
      </Row>
      {dev.devMode && (
        <Row>
          <button type="button" className="text-[17px] text-warn" onClick={resetVariants}>
            Reset choices
          </button>
        </Row>
      )}
    </Screen>
  );
}
