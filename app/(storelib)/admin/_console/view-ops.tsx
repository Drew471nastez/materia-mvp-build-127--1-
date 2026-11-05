"use client"

/**
 * The console's Operations view: every module's state, the alerts that need
 * somebody, and the errors of the last day, read from lib/admin/views/ops.ts
 * and read again every 30 seconds while the tab is visible (console.tsx).
 */
import type { OpsModule, OpsPayload, OpsState } from "@/lib/admin/views/ops"
import { ViewHeader } from "./shell"
import { C, Panel, ReadNotes } from "./ui"

const STATE: Record<OpsState, { label: string; colour: string }> = {
  ok: { label: "Running", colour: C.good },
  degraded: { label: "Needs a look", colour: C.wait },
  down: { label: "Down", colour: C.bad },
  off: { label: "Off", colour: C.faint },
  unknown: { label: "Unknown", colour: C.faint },
}

function Dot({ state }: { state: OpsState }) {
  return <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATE[state].colour }} />
}

function ModuleCard({ m }: { m: OpsModule }) {
  const body = (
    <div className="flex h-full min-w-0 flex-col gap-1.5 rounded-[10px] border border-white/[0.08] bg-[#111116] px-4 py-3 transition-colors hover:border-white/[0.16]" data-ops-module={m.id} data-ops-state={m.state}>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-[14px] font-medium text-[#ededf0]">{m.name}</span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-[#c9c9d1]">
          <Dot state={m.state} />
          {STATE[m.state].label}
        </span>
      </div>
      <p className="text-[12.5px] leading-[18px] text-[#9b9ba6]">{m.detail}</p>
    </div>
  )
  return m.href ? (
    <a href={m.href} className="block min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/50 rounded-[10px]">
      {body}
    </a>
  ) : (
    body
  )
}

export function OpsView({ data }: { data: OpsPayload & { problems?: never[]; notices?: string[] } }) {
  const groups = [...new Set(data.modules.map((m) => m.group))]
  const down = data.modules.filter((m) => m.state === "down").length
  const degraded = data.modules.filter((m) => m.state === "degraded").length
  const meta = down ? `${down} down, ${degraded} need a look` : degraded ? `${degraded} need a look` : "Everything checked is running"
  return (
    <div className="space-y-4" data-ops-view="">
      <ViewHeader title="Operations" meta={`${meta}. Checked ${new Date(data.checkedAt).toLocaleTimeString()}, again every 30 seconds.`} />
      <ReadNotes problems={data.problems} notices={data.notices} />

      <Panel title="Alerts" meta={data.alerts.length ? `${data.alerts.length} open` : "None"}>
        {data.alerts.length ? (
          <ul className="divide-y divide-white/[0.06]">
            {data.alerts.map((a) => (
              <li key={`${a.module}-${a.title}`} className="flex min-w-0 items-start gap-3 px-4 py-3" data-ops-alert={a.severity}>
                <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: a.severity === "critical" ? C.bad : C.wait }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium text-[#ededf0]">{a.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-[#9b9ba6]">{a.action}</p>
                </div>
                {a.href ? (
                  <a href={a.href} className="shrink-0 rounded-[7px] px-2 py-1 text-[12.5px] text-[#c9c9d1] hover:bg-white/[0.05] hover:text-[#ededf0]">
                    Open
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-[13px] text-[#9b9ba6]">Nothing needs anyone right now.</p>
        )}
      </Panel>

      {groups.map((g) => (
        <Panel key={g} title={g}>
          <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.modules.filter((m) => m.group === g).map((m) => (
              <ModuleCard key={m.id} m={m} />
            ))}
          </div>
        </Panel>
      ))}

      <Panel title="Errors in the last 24 hours" meta={data.errors24h.count === null ? "Could not be read" : `${data.errors24h.count} kinds`}>
        {data.errors24h.top.length ? (
          <ul className="divide-y divide-white/[0.06]">
            {data.errors24h.top.map((e) => (
              <li key={`${e.where}-${e.message}`} className="flex min-w-0 items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-[#ededf0]">{e.message}</p>
                  <p className="truncate text-[12px] text-[#6b6b76]">{e.where}</p>
                </div>
                <span className="shrink-0 text-[12.5px] tabular-nums text-[#c9c9d1]">{e.count}×</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-[13px] text-[#9b9ba6]">No errors recorded.</p>
        )}
      </Panel>
    </div>
  )
}
