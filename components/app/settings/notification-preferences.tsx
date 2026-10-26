"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { Saved, Switch } from "@/components/app/settings/account-panels"
import { secondaryDepth } from "@/components/ui/depth-button"
import {
  CATEGORY_INFO,
  REQUIRED_WHY,
  preferencesView,
  type CategoryView,
  type PreferenceChannel,
} from "@/lib/notify/preference-view"
import type { PreferenceCategory } from "@/lib/notify/types"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

/**
 * ===========================================================================
 *  EMAIL AND NOTIFICATIONS: A ROW PER CATEGORY, EMAIL AND IN APP
 * ===========================================================================
 * Settings' Notifications tab (/app/settings?tab=notifications, the address
 * every engine email's settings link opens; an older ?tab=privacy#notifications
 * link lands here too). Reads and writes /api/notifications/preferences
 * (lib/notify/preferences.ts behind it).
 *
 *   A ROW       the category, one line on what it covers, then two switches
 *               (the app's own Switch from account-panels.tsx): Email and In
 *               app, under their column names. 48px or taller.
 *   REQUIRED    payouts and payments, account, security: no row of their
 *               own (round 22, "too many options"): a row with nothing to
 *               choose is a row to read for nothing. One line at the foot of
 *               the card says they are always sent.
 *   TOGETHER    tips and onboarding reminders are one row, "Tips and
 *               reminders": each switch sets both categories, which stay two
 *               for the server and the emails' unsubscribe links.
 *   SALES       its email is a switch like the rest: on is an email for
 *               every sale, the one preference a sales email reads.
 *   SAVING      a change shows at once and saves behind it. If the save
 *               fails that one control goes back to what was saved and the
 *               row says so. Several presses on one control end on the last
 *               one; an older answer arriving late changes nothing.
 *
 * The card has id="notifications", so a link with that hash scrolls to it.
 */

const CARD = "bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]"
/* The two columns, the same width in every row so the switches line up. */
const EMAIL_COL = "flex w-[92px] shrink-0 items-center justify-center"
const APP_COL = "flex w-14 shrink-0 items-center justify-center"

type Cell = `${PreferenceCategory}:${PreferenceChannel}`
const cellOf = (category: PreferenceCategory, channel: PreferenceChannel): Cell => `${category}:${channel}`

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; rows: CategoryView[] }

/** A row Settings shows: one category, or two that are set together. */
interface ShownRow {
  key: string
  label: string
  detail: string
  categories: PreferenceCategory[]
}

/** The categories a person can choose, in CATEGORY_INFO's order, with onboarding reminders folded into tips. */
function shownRows(): ShownRow[] {
  const rows: ShownRow[] = []
  for (const c of CATEGORY_INFO) {
    if (c.required || c.category === "lifecycle") continue
    if (c.category === "tips") {
      rows.push({ key: "tips", label: tt("Tips and reminders"), detail: tt("Ideas from other creators, and a nudge when your setup is not done yet."), categories: ["tips", "lifecycle"] })
      continue
    }
    rows.push({ key: c.category, label: c.label, detail: c.detail, categories: [c.category] })
  }
  return rows
}

export function NotificationPreferencesPanel() {
  const [load, setLoad] = useState<Load>({ state: "loading" })
  const [errors, setErrors] = useState<Partial<Record<PreferenceCategory, string>>>({})
  const [savedAt, setSavedAt] = useState(0)
  /** What the server last confirmed, per control, to go back to. */
  const confirmed = useRef(new Map<Cell, boolean>())
  /** The newest request per control, so a late answer to an older one is ignored. */
  const latest = useRef(new Map<Cell, number>())
  const seq = useRef(0)
  const cardRef = useRef<HTMLElement>(null)

  const read = useCallback(async () => {
    setLoad({ state: "loading" })
    try {
      const res = await fetch("/api/notifications/preferences", { cache: "no-store" })
      const data = res.ok ? await res.json() : null
      if (!data || !Array.isArray(data.categories)) throw new Error("unreadable")
      /* Only the categories this build knows, in its order, whatever came back. */
      const rows = preferencesView(
        (data.categories as CategoryView[]).flatMap((c) =>
          (["email", "in_app"] as const).map((channel) => ({
            category: c.category,
            channel,
            enabled: c.channels?.[channel]?.enabled === true,
            updatedAt: c.channels?.[channel]?.updatedAt ?? null,
          })),
        ),
      )
      confirmed.current = new Map(rows.flatMap((r) => (["email", "in_app"] as const).map((ch) => [cellOf(r.category, ch), r.channels[ch].enabled] as const)))
      setLoad({ state: "ready", rows })
    } catch {
      setLoad({ state: "error" })
    }
  }, [])

  useEffect(() => {
    void read()
  }, [read])

  /* Opened from an email's settings link: brought into view once it has its rows. */
  const scrolled = useRef(false)
  useEffect(() => {
    if (load.state !== "ready" || scrolled.current) return
    scrolled.current = true
    try {
      if (window.location.hash === "#notifications") cardRef.current?.scrollIntoView({ block: "start" })
    } catch {
      /* Nothing to scroll to. */
    }
  }, [load.state])

  const show = (category: PreferenceCategory, channel: PreferenceChannel, enabled: boolean) =>
    setLoad((l) =>
      l.state !== "ready"
        ? l
        : {
            state: "ready",
            rows: l.rows.map((r) => (r.category === category ? { ...r, channels: { ...r.channels, [channel]: { ...r.channels[channel], enabled } } } : r)),
          },
    )

  const change = async (category: PreferenceCategory, channel: PreferenceChannel, enabled: boolean) => {
    const cell = cellOf(category, channel)
    const id = ++seq.current
    latest.current.set(cell, id)
    show(category, channel, enabled)
    setErrors((e) => ({ ...e, [category]: undefined }))
    let ok = false
    let message = tt("That did not save. Try again.")
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, channel, enabled }),
      })
      ok = res.ok
      if (!ok) {
        const data = await res.json().catch(() => null)
        if (data && typeof data.error === "string" && data.error) message = data.error
      }
    } catch {
      message = "Could not reach Storelib. Check your connection and try again."
    }
    if (ok) confirmed.current.set(cell, enabled)
    if (latest.current.get(cell) !== id) return
    if (ok) {
      setSavedAt(Date.now())
    } else {
      show(category, channel, confirmed.current.get(cell) ?? !enabled)
      setErrors((e) => ({ ...e, [category]: message }))
    }
  }

  return (
    <section ref={cardRef} id="notifications" className={cn(CARD, "scroll-mt-24")} aria-labelledby="notifications-heading" data-account-panel="notifications">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 id="notifications-heading" className="text-[15px] font-semibold text-[#1a1a2e]">
            {tt("Email and notifications")}
            <Saved at={savedAt} />
          </h3>
          <p className="mt-0.5 text-[13px] leading-[1.45] text-[#6b7280]">{tt("What Storelib tells you about, and where.")}</p>
        </div>
      </div>

      <div aria-hidden="true" className="mt-3 flex justify-end border-b border-[#f0f1f3] pb-2 text-[12px] font-medium text-[#6b7280]">
        <span className={EMAIL_COL}>{tt("Email")}</span>
        <span className={APP_COL}>{tt("In app")}</span>
      </div>

      {load.state === "error" ? (
        <div className="flex min-h-[120px] flex-col items-start justify-center gap-3 py-4" data-notification-prefs-error="">
          <p className="text-[13px] leading-[1.45] text-[#6b7280]">{tt("Your notification settings did not load.")}</p>
          <button type="button" onClick={() => void read()} className={cn(secondaryDepth, "h-10 rounded-xl px-4 text-[13px]")}>
            {tt("Try again")}
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-[#f0f1f3]" aria-busy={load.state === "loading" || undefined}>
          {shownRows().map((shown) => {
            /*
              THE REAL ROWS WHILE THEY LOAD. The names and the lines under
              them never come from the server, so they are drawn at once and
              only the switches wait: the card does not grow when they land.
            */
            if (load.state !== "ready") {
              return (
                <li key={shown.key} className="flex min-h-12 items-center justify-between gap-3 py-3" data-notification-pref-loading={shown.key}>
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium leading-[1.4] text-[#1a1a2e]">{shown.label}</p>
                    <p className="mt-0.5 text-[13px] leading-[1.45] text-[#6b7280]">{shown.detail}</p>
                  </div>
                  <div className="flex shrink-0 items-center" aria-hidden="true">
                    <span className={EMAIL_COL}>
                      <span className="h-[22px] w-10 rounded-full bg-[#f1f2f4]" />
                    </span>
                    <span className={APP_COL}>
                      <span className="h-[22px] w-10 rounded-full bg-[#f1f2f4]" />
                    </span>
                  </div>
                </li>
              )
            }
            const views = shown.categories.map((c) => load.rows.find((r) => r.category === c)).filter((r): r is CategoryView => !!r)
            if (!views.length) return null
            return (
              <PreferenceRow
                key={shown.key}
                shown={shown}
                on={(channel) => views.some((v) => v.channels[channel].enabled)}
                error={shown.categories.map((c) => errors[c]).find(Boolean)}
                onChange={(channel, enabled) => {
                  for (const c of shown.categories) void change(c, channel, enabled)
                }}
              />
            )
          })}
        </ul>
      )}

      <p className="mt-3 border-t border-[#f0f1f3] pt-3 text-[12.5px] leading-[1.45] text-[#6b7280]" data-required-why="">
        {tt(REQUIRED_WHY)}
      </p>
    </section>
  )
}

function PreferenceRow({
  shown,
  on,
  error,
  onChange,
}: {
  shown: ShownRow
  on: (channel: PreferenceChannel) => boolean
  error?: string
  onChange: (channel: PreferenceChannel, enabled: boolean) => void
}) {
  return (
    <li className="flex min-h-12 items-center justify-between gap-3 py-3" data-notification-pref={shown.key}>
      <div className="min-w-0">
        <p className="text-[14px] font-medium leading-[1.4] text-[#1a1a2e]">{shown.label}</p>
        <p className="mt-0.5 text-[13px] leading-[1.45] text-[#6b7280]">{shown.detail}</p>
        {error ? (
          <p role="alert" className="mt-1 text-[13px] leading-[1.45] text-red-600">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">
        <span className={EMAIL_COL}>
          {/* Sales too: its email was a small "Every sale" menu wider than the column, which ran into the In app switch. On is every sale. */}
          <Switch label={tt("{label} by email", { label: shown.label })} checked={on("email")} onChange={(v) => onChange("email", v)} />
        </span>
        <span className={APP_COL}>
          <Switch label={tt("{label} in app", { label: shown.label })} checked={on("in_app")} onChange={(v) => onChange("in_app", v)} />
        </span>
      </div>
    </li>
  )
}
