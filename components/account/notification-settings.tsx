"use client"

/**
 * ===========================================================================
 *  SETTINGS, NOTIFICATIONS
 * ===========================================================================
 * What reaches the person's phone, in three short parts, read once from
 * GET /api/me/push:
 *
 *   PUSH            the one switch for all of it (components/account/push-
 *                   switch-row.tsx), and in the Storelib app the phone's own
 *                   permission under it: asked for only when the person
 *                   turns push on or taps Allow (lib/native-push.ts), the
 *                   answer said in a line, and a "no" explained with where
 *                   to change it in the phone's settings. Nothing about the
 *                   phone is drawn or asked in a browser.
 *   WHAT TO PUSH    one switch per kind (lib/notifications/push-kinds.ts),
 *                   live only while the main switch is on. Each saves on the
 *                   press, one save at a time, so two quick taps never undo
 *                   each other on the server.
 *   EMAIL           the daily report summary, only for someone who reviews
 *                   reports in a community.
 *
 * Everything still lands in the bell; this is only what interrupts. Each
 * community keeps its own level too, which the last line says.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Check } from "lucide-react"
import { PrivacyRow, Saved, Switch } from "@/components/app/settings/account-panels"
import { PUSH_ROUTE, PushSwitchRow } from "@/components/account/push-switch-row"
import { pushStateFrom } from "@/lib/account/push-state"
import { askPushPermission, inNativeApp, nativePlatform, phoneSettingsPath, readPushPermission, type PushPermission } from "@/lib/native-push"
import { PUSH_KINDS, type PushKindKey } from "@/lib/notifications/push-kinds"
import { cn } from "@/lib/utils"

const CARD = "bg-white rounded-2xl app-card-x py-4 sm:py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e7eb]/60"
const CARD_TITLE = "text-[15px] font-semibold text-[#1a1a2e]"
const INK =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-medium text-white " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(15,23,42,0.18)] transition-colors hover:bg-[#2a2a40] active:bg-[#111122] disabled:cursor-not-allowed disabled:opacity-50 sm:text-[13px]"
const QUIET =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[#f3f4f6] px-4 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#e5e7eb] disabled:opacity-60"

interface Loaded {
  enabled: boolean | "not_yet"
  devices: number
  kinds: Record<PushKindKey, boolean>
  reportEmail: boolean
  moderates: boolean
}

function loadedFrom(status: number, body: unknown): Loaded | null {
  const enabled = pushStateFrom(status, body)
  if (enabled === null) return null
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const raw = (b.kinds && typeof b.kinds === "object" ? b.kinds : {}) as Record<string, unknown>
  const kinds = Object.fromEntries(PUSH_KINDS.map((k) => [k.key, raw[k.key] !== false])) as Record<PushKindKey, boolean>
  const emails = (b.emails && typeof b.emails === "object" ? b.emails : {}) as Record<string, unknown>
  return { enabled, devices: typeof b.devices === "number" ? b.devices : 0, kinds, reportEmail: emails.report_digest !== false, moderates: b.moderates === true }
}

/* One save at a time for the kinds, in the order they were pressed. */
let chain: Promise<unknown> = Promise.resolve()
async function saveKinds(body: Record<string, unknown>): Promise<void> {
  const run = chain.then(async () => {
    let res: Response
    try {
      res = await fetch(PUSH_ROUTE, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    } catch {
      throw new Error("Could not reach Storelib. Check your connection and try again.")
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error((data && typeof data.error === "string" && data.error) || "That did not save. Try again.")
    }
  })
  chain = run.catch(() => undefined)
  return run
}

export function NotificationSettings() {
  const [state, setState] = useState<Loaded | "loading" | "none">("loading")
  useEffect(() => {
    let live = true
    fetch(PUSH_ROUTE, { credentials: "include", cache: "no-store" })
      .then(async (res) => loadedFrom(res.status, await res.json().catch(() => null)))
      .catch(() => null)
      .then((v) => {
        if (live) setState(v ?? "none")
      })
    return () => {
      live = false
    }
  }, [])

  if (state === "loading") return <NotificationsSkeleton />
  if (state === "none") {
    return (
      <section className={CARD} aria-labelledby="account-notifications" data-account-card="notifications">
        <h2 id="account-notifications" className={cn(CARD_TITLE, "mb-1")}>
          Notifications
        </h2>
        <p className="text-[13px] leading-[1.45] text-[#6b7280]">Your notification settings could not be read. Check your connection and open this again.</p>
      </section>
    )
  }
  return <NotificationCards initial={state} />
}

function NotificationCards({ initial }: { initial: Loaded }) {
  const [on, setOn] = useState(initial.enabled === true)
  const onValue = useCallback((v: boolean) => setOn(v), [])
  const phone = usePhonePermission()

  return (
    <>
      <section className={CARD} aria-labelledby="account-notifications" data-account-card="notifications">
        <h2 id="account-notifications" className={cn(CARD_TITLE, "mb-3")}>
          Push notifications
        </h2>
        <div className="divide-y divide-[#f0f1f3]">
          <PushSwitchRow initial={initial.enabled} onValue={onValue} onTurnedOn={phone.askIfNeeded} />
          {phone.inApp ? <PhoneRow phone={phone} on={on} /> : initial.devices === 0 ? <NoDeviceLine /> : null}
        </div>
      </section>

      <section className={CARD} aria-labelledby="account-push-kinds" data-account-card="push-kinds">
        <h2 id="account-push-kinds" className={cn(CARD_TITLE, "mb-1")}>
          What to push
        </h2>
        <p className="mb-4 text-[13px] leading-[1.45] text-[#6b7280]">Everything still arrives in your notifications. These choose what also reaches your phone.</p>
        <div className={cn("divide-y divide-[#f0f1f3] transition-opacity duration-200 motion-reduce:transition-none", !on && "opacity-55")} data-push-kinds={on ? "live" : "off"}>
          {PUSH_KINDS.map((k) => (
            <KindRow key={k.key} kind={k.key} label={k.label} detail={k.detail} initial={initial.kinds[k.key]} live={on} />
          ))}
        </div>
        <p className="mt-3 border-t border-[#f0f1f3] pt-3 text-[12px] leading-[1.5] text-[#6b7280]">
          Each community has its own level too, from Everything to Nothing, under Notifications in that community.
        </p>
      </section>

      {initial.moderates ? (
        <section className={CARD} aria-labelledby="account-notify-email" data-account-card="notify-email">
          <h2 id="account-notify-email" className={cn(CARD_TITLE, "mb-3")}>
            Email
          </h2>
          <EmailRow initial={initial.reportEmail} />
        </section>
      ) : null}
    </>
  )
}

/* ── The switches ──────────────────────────────────────────────────────── */

function useQueuedSwitch(initial: boolean, body: (v: boolean) => Record<string, unknown>) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState(0)
  const saved = useRef(initial)
  const change = useCallback(
    (v: boolean) => {
      setValue(v)
      setError(null)
      saveKinds(body(v)).then(
        () => {
          saved.current = v
          setSavedAt(Date.now())
        },
        (e: unknown) => {
          setValue(saved.current)
          setError(e instanceof Error ? e.message : "That did not save. Try again.")
        },
      )
    },
    [body],
  )
  return { value, error, savedAt, change }
}

function KindRow({ kind, label, detail, initial, live }: { kind: PushKindKey; label: string; detail: string; initial: boolean; live: boolean }) {
  const s = useQueuedSwitch(initial, useCallback((v: boolean) => ({ push: { [kind]: v } }), [kind]))
  return (
    <PrivacyRow
      id={`push-${kind}`}
      title={
        <>
          {label}
          <Saved at={s.savedAt} />
        </>
      }
      detail={
        <>
          {detail}
          {s.error && <span className="mt-1 block text-red-600">{s.error}</span>}
        </>
      }
      control={<Switch id={`push-kind-${kind}`} label={label} checked={live && s.value} disabled={!live} onChange={s.change} />}
    />
  )
}

function EmailRow({ initial }: { initial: boolean }) {
  const s = useQueuedSwitch(initial, useCallback((v: boolean) => ({ email: { report_digest: v } }), []))
  return (
    <PrivacyRow
      id="report-digest"
      title={
        <>
          Daily report summary
          <Saved at={s.savedAt} />
        </>
      }
      detail={
        <>
          One email a day at most, when members report something in a community you moderate. Each report also shows in your notifications right away.
          {s.error && <span className="mt-1 block text-red-600">{s.error}</span>}
        </>
      }
      control={<Switch id="report-digest-switch" label="Daily report summary" checked={s.value} onChange={s.change} />}
    />
  )
}

/* ── The phone (the Storelib app only) ─────────────────────────────────── */

interface Phone {
  inApp: boolean
  permission: PushPermission | null
  asking: boolean
  /** What the last ask answered, said once under the row. */
  answered: PushPermission | null
  ask: () => void
  askIfNeeded: () => void
  recheck: () => void
}

function usePhonePermission(): Phone {
  const [inApp] = useState(() => inNativeApp())
  const [permission, setPermission] = useState<PushPermission | null>(null)
  const [asking, setAsking] = useState(false)
  const [answered, setAnswered] = useState<PushPermission | null>(null)
  const current = useRef<PushPermission | null>(null)

  const recheck = useCallback(() => {
    if (!inApp) return
    void readPushPermission().then((p) => {
      current.current = p
      setPermission(p)
    })
  }, [inApp])

  /* Read without asking, and again when the person comes back from the phone's settings. */
  useEffect(() => {
    if (!inApp) return
    recheck()
    const back = () => {
      if (document.visibilityState === "visible") recheck()
    }
    document.addEventListener("visibilitychange", back)
    return () => document.removeEventListener("visibilitychange", back)
  }, [inApp, recheck])

  const ask = useCallback(() => {
    if (!inApp || asking) return
    setAsking(true)
    void askPushPermission()
      .then((p) => {
        current.current = p
        setPermission(p)
        setAnswered(p)
      })
      .finally(() => setAsking(false))
  }, [inApp, asking])

  const askIfNeeded = useCallback(() => {
    if (current.current === "prompt") ask()
  }, [ask])

  return { inApp, permission, asking, answered, ask, askIfNeeded, recheck }
}

function PhoneRow({ phone, on }: { phone: Phone; on: boolean }) {
  const platform = nativePlatform()
  if (phone.permission === null || phone.permission === "unsupported") return null
  if (phone.permission === "granted") {
    if (phone.answered !== "granted") return null
    return (
      <div className="flex items-center gap-2 py-3 text-[13px] text-[#374151]" data-phone-permission="granted" role="status">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#ecfdf3] text-[#15803d]">
          <Check className="h-3 w-3" aria-hidden="true" />
        </span>
        Notifications are allowed on this phone.
      </div>
    )
  }
  if (phone.permission === "denied") {
    return (
      <div className="pt-3" data-phone-permission="denied" role="status">
        <div className="rounded-xl bg-[#f8f9fa] px-3.5 py-3 shadow-[inset_0_0_0_1px_rgba(229,231,235,0.8)]">
          <p className="text-[14px] font-medium leading-[1.4] text-[#1a1a2e]">Notifications are off for Storelib on this phone</p>
          <p className="mt-1 text-[13px] leading-[1.5] text-[#6b7280]">
            To get them, open {phoneSettingsPath(platform)} on your {platform === "android" ? "phone" : "iPhone"} and turn on {platform === "android" ? "notifications" : "Allow Notifications"}. Then come back here.
          </p>
          <button type="button" onClick={phone.recheck} className={cn(QUIET, "mt-3 bg-white shadow-[0_0_0_1px_#e5e7eb,0_1px_2px_rgba(15,23,42,0.05)] hover:bg-[#f9fafb]")} data-phone-recheck="">
            Check again
          </button>
        </div>
      </div>
    )
  }
  /* "prompt": not asked yet. Only offered while push is on; turning push on asks by itself. */
  if (!on) return null
  return (
    <PrivacyRow
      id="phone"
      title="This phone"
      detail="Allow notifications so they can reach you here."
      control={
        <button type="button" onClick={phone.ask} disabled={phone.asking} className={INK} data-phone-allow="">
          {phone.asking ? "Asking" : "Allow"}
        </button>
      }
    />
  )
}

function NoDeviceLine() {
  return (
    <p className="py-3 text-[13px] leading-[1.45] text-[#6b7280]" data-push-no-device="">
      No phone gets them yet. Sign in to the Storelib app and they will reach you there.
    </p>
  )
}

/* ── While the route answers ───────────────────────────────────────────── */

function NotificationsSkeleton() {
  const bar = "rounded-md bg-[#f0f1f3]"
  return (
    <section className={CARD} aria-busy="true" aria-label="Notifications" data-account-card="notifications-loading">
      <div className={cn(bar, "mb-4 h-4 w-28")} />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0 flex-1">
            <div className={cn(bar, "h-3.5 w-40")} />
            <div className={cn(bar, "mt-2 h-3 w-full max-w-[320px]")} />
          </div>
          <div className="h-6 w-10 shrink-0 rounded-full bg-[#f0f1f3]" />
        </div>
      ))}
    </section>
  )
}
