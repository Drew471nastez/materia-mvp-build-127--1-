"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"

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
 *   REQUIRED    payouts and payments, account, security: "Always on" in
 *               muted type where the switches would be, and one line at the
 *               foot of the card says why.
 *   SALES       its email is a small menu, "Every sale" or "Off": the one
 *               preference a sales email reads.
 *   SAVING      a change shows at once and saves behind it. If the save
 *               fails that one control goes back to what was saved and the
 *               row says so. Several presses on one control end on the last
 *               one; an older answer arriving late changes nothing.
 *
 * The card has id="notifications", so a link with that hash scrolls to it.
 */

const CARD = "bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]"
/* The two columns, the same width in every row so the switches line up. */
const EMAIL_COL = "flex w-[92px] shrink-0 items-center justify-center"
const APP_COL = "flex w-14 shrink-0 items-center justify-center"

type Cell = `${PreferenceCategory}:${PreferenceChannel}`
const cellOf = (category: PreferenceCategory, channel: PreferenceChannel): Cell => `${category}:${channel}`

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; rows: CategoryView[] }

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
    let message = "That did not save. Try again."
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
            Email and notifications
            <Saved at={savedAt} />
          </h3>
          <p className="mt-0.5 text-[13px] leading-[1.45] text-[#6b7280]">What Storelib tells you about, and where.</p>
        </div>
      </div>

      <div aria-hidden="true" className="mt-3 flex justify-end border-b border-[#f0f1f3] pb-2 text-[12px] font-medium text-[#6b7280]">
        <span className={EMAIL_COL}>Email</span>
        <span className={APP_COL}>In app</span>
      </div>

      {load.state === "error" ? (
        <div className="flex min-h-[120px] flex-col items-start justify-center gap-3 py-4" data-notification-prefs-error="">
          <p className="text-[13px] leading-[1.45] text-[#6b7280]">Your notification settings did not load.</p>
          <button type="button" onClick={() => void read()} className={cn(secondaryDepth, "h-10 rounded-xl px-4 text-[13px]")}>
            Try again
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-[#f0f1f3]" aria-busy={load.state === "loading" || undefined}>
          {(load.state === "ready" ? load.rows : null)?.map((row) => (
            <PreferenceRow key={row.category} row={row} error={errors[row.category]} onChange={change} />
          )) ??
            CATEGORY_INFO.map((c) => (
              /* The same rows' height while they load, so nothing moves when they land. */
              <li key={c.category} className="flex min-h-12 items-center justify-between gap-3 py-3">
                <span className="h-3.5 w-32 rounded bg-[#f1f2f4]" />
                <span className="h-[22px] w-[120px] rounded-full bg-[#f6f7f8]" />
              </li>
            ))}
        </ul>
      )}

      <p className="mt-3 border-t border-[#f0f1f3] pt-3 text-[12.5px] leading-[1.45] text-[#6b7280]" data-required-why="">
        {REQUIRED_WHY}
      </p>
    </section>
  )
}

function PreferenceRow({
  row,
  error,
  onChange,
}: {
  row: CategoryView
  error?: string
  onChange: (category: PreferenceCategory, channel: PreferenceChannel, enabled: boolean) => void
}) {
  return (
    <li className="flex min-h-12 items-center justify-between gap-3 py-3" data-notification-pref={row.category}>
      <div className="min-w-0">
        <p className="text-[14px] font-medium leading-[1.4] text-[#1a1a2e]">{row.label}</p>
        <p className="mt-0.5 text-[13px] leading-[1.45] text-[#6b7280]">{row.detail}</p>
        {error ? (
          <p role="alert" className="mt-1 text-[13px] leading-[1.45] text-red-600">
            {error}
          </p>
        ) : null}
      </div>
      {row.required ? (
        <span className="flex w-[148px] shrink-0 justify-center text-[13px] text-[#9ca3af]" data-always-on="">
          Always on
        </span>
      ) : (
        <div className="flex shrink-0 items-center">
          <span className={EMAIL_COL}>
            {row.category === "sales" ? (
              <SaleEmails value={row.channels.email.enabled} onChange={(v) => onChange(row.category, "email", v)} />
            ) : (
              <Switch label={`${row.label} by email`} checked={row.channels.email.enabled} onChange={(v) => onChange(row.category, "email", v)} />
            )}
          </span>
          <span className={APP_COL}>
            <Switch label={`${row.label} in app`} checked={row.channels.in_app.enabled} onChange={(v) => onChange(row.category, "in_app", v)} />
          </span>
        </div>
      )}
    </li>
  )
}

/** New sale emails: every sale, or off. A native menu, so a phone shows its own picker. */
function SaleEmails({ value, onChange }: { value: boolean; onChange: (on: boolean) => void }) {
  return (
    <span className="relative inline-flex">
      <select
        aria-label="New sale emails"
        value={value ? "every" : "off"}
        onChange={(e) => onChange(e.target.value === "every")}
        data-sale-emails=""
        className="h-9 cursor-pointer appearance-none rounded-lg border border-[#e5e7eb] bg-white pl-2.5 pr-7 text-[13px] font-medium text-[#1a1a2e] outline-none transition-colors hover:border-[#d1d5db] focus-visible:ring-2 focus-visible:ring-[#111113]/25"
      >
        <option value="every">Every sale</option>
        <option value="off">Off</option>
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b7280]" strokeWidth={2} />
    </span>
  )
}
