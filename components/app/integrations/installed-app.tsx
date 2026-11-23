"use client"

/**
 * ===========================================================================
 *  AN INSTALLED APP'S PAGE: ONE TEMPLATE FOR EVERY INTEGRATION (round 58)
 * ===========================================================================
 * Once an integration is installed its page is about running it, not about
 * selling it. Under the page's header (integration-detail.tsx: the mark,
 * the name, where it stands, Settings and Disconnect) every installed one
 * has the same body, in the same order:
 *
 *   STATUS          the connection's facts (account, key's last four, last
 *                   sync, the last problem), read off the store
 *   WHAT IS SYNCED  what goes out and what comes back, in a few lines
 *   ACTIVITY        recent activity and errors: only what the API returns
 *                   (lib/integrations/listing activityOf), never a filler row
 *   SETTINGS        the integration's own panel, the one it always had
 *   DISCONNECT      at the foot, with its consequence and a confirm
 *
 * From 1024px Status, What is synced and Activity sit in a column beside
 * Settings; on a phone they stack, Status first. Storelib Reviews keeps its
 * own tabs (Overview, Reviews, Requests...) and puts the same sections
 * under Settings (components/reviews/manage/integration-view.tsx).
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { dateTime } from "@/components/physical/ui"
import type { ActivityRow } from "@/lib/integrations/listing"

const CARD = "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
const H3 = "text-[15px] font-semibold text-[#1a1a2e]"
const DOT: Record<ActivityRow["tone"], string> = { gray: "bg-[#9ca3af]", green: "bg-[#12b76a]", red: "bg-[#f04438]" }

export function SyncedCard({ rows }: { rows: string[] }) {
  if (!rows.length) return null
  return (
    <section className={cn(CARD, "app-card-x py-4 sm:px-5")} aria-labelledby="installed-synced" data-installed-synced="">
      <h3 id="installed-synced" className={H3}>
        {tt("What is synced")}
      </h3>
      <ul className="mt-2 divide-y divide-[#f1f2f4]">
        {rows.map((r) => {
          const at = r.indexOf(": ")
          return (
            <li key={r} className="flex min-h-11 flex-col justify-center gap-0.5 py-2 sm:min-h-0">
              {at > 0 ? (
                <>
                  <span className="text-[12.5px] text-[#6b7280]">{tt(r.slice(0, at))}</span>
                  <span className="text-[13.5px] font-medium leading-5 text-[#1a1a2e]">{r.slice(at + 2)}</span>
                </>
              ) : (
                <span className="text-[13.5px] font-medium leading-5 text-[#1a1a2e]">{r}</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function ActivityCard({ rows }: { rows: ActivityRow[] }) {
  return (
    <section className={cn(CARD, "app-card-x py-4 sm:px-5")} aria-labelledby="installed-activity" data-installed-activity={rows.length}>
      <h3 id="installed-activity" className={H3}>
        {tt("Activity and errors")}
      </h3>
      {rows.length ? (
        <ol className="mt-2 divide-y divide-[#f1f2f4]">
          {rows.map((r, i) => (
            <li key={`${r.text}-${i}`} className="flex gap-2.5 py-2.5">
              <span aria-hidden className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", DOT[r.tone])} />
              <div className="min-w-0">
                <p className={cn("text-[13.5px] leading-5", r.tone === "red" ? "font-medium text-[#b42318]" : "text-[#1a1a2e]")}>{r.text}</p>
                {r.at ? <p className="text-[12.5px] tabular-nums text-[#6b7280]">{dateTime(r.at)}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-[13.5px] leading-5 text-[#6b7280]">{tt("Nothing yet. Orders, syncs and problems show here as they happen.")}</p>
      )}
    </section>
  )
}

/**
 * The template's body. `settings` is the integration's own panel card;
 * `status`, `synced` and `activity` the column beside it; `danger` the foot.
 */
export function InstalledApp({ status, synced, activity, settings, danger, extra }: { status: React.ReactNode | null; synced: React.ReactNode | null; activity: React.ReactNode | null; settings: React.ReactNode; danger: React.ReactNode | null; extra?: React.ReactNode }) {
  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start" data-installed-app="">
      <div className="min-w-0 space-y-4 sm:space-y-5 lg:order-2" data-installed-side="">
        {status}
        {synced}
        {activity}
      </div>
      <div className="min-w-0 space-y-4 sm:space-y-5 lg:order-1" data-installed-main="">
        {settings}
        {extra}
        {danger}
      </div>
    </div>
  )
}
