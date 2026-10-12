"use client"

/**
 * ===========================================================================
 *  SETTINGS › INTEGRATIONS › GOOGLE ANALYTICS: PASTE, CHECKED, RECEIVING
 * ===========================================================================
 * One field. Paste the Measurement ID, or the whole tag Google shows: the
 * G- ID is found in it and anything else is named (lib/store/ga.ts). Saving
 * runs the check at once: a hidden frame loads Google's tag with the ID and
 * sends one event, storelib_connected, and the browser is watched for the
 * hit leaving (app/api/store/ga-check). Then one line says where it stands:
 *
 *   Receiving data        a visitor's page sent Google a hit with this ID,
 *                         with the time of the last one
 *   Connected             the check's hit left; no visitor yet
 *   Checking              the check is running
 *   Not loading           the tag did not load: the ID, or a blocker here
 *
 * Under it, the two things Google itself says differently: Realtime shows
 * hits within a minute, the "Data collection isn't active" notice can take
 * up to 48 hours to go. Nothing of this is ever on the live website.
 */
import * as React from "react"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Field, Notice, TextInput, api } from "@/components/physical/ui"
import { readGaInput } from "@/lib/store/ga"
import type { Tracking } from "@/lib/store/tracking"
import { cn } from "@/lib/utils"

export interface GaStatusView {
  id: string | null
  seenAt: string | null
  checkedAt: string | null
  ready: boolean
}

type Check = { state: "idle" } | { state: "running" } | { state: "passed"; sent: boolean } | { state: "failed"; reason: "tag" | "no_hit" | "timeout" }

/** "just now", "4 min ago", "3 h ago", or the date. */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return ""
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/** Receiving: a visitor's hit in the last two days. */
export function gaStanding(ga: GaStatusView | null, check: Check["state"] = "idle"): { tone: "green" | "amber" | "gray" | "red"; label: string } {
  if (check === "running") return { tone: "gray", label: "Checking" }
  if (check === "failed") return { tone: "red", label: "Not loading" }
  if (ga?.seenAt && Date.now() - Date.parse(ga.seenAt) < 48 * 3600_000) return { tone: "green", label: "Receiving data" }
  if (ga?.checkedAt || check === "passed") return { tone: "green", label: "Connected" }
  return { tone: "amber", label: "Waiting for data" }
}

const DOT = { green: "bg-[#16a34a]", amber: "bg-[#d97706]", gray: "bg-[#9ca3af]", red: "bg-[#dc2626]" } as const

/** Runs Google's tag in a hidden frame of this page and answers what the browser saw. */
function runCheck(id: string): Promise<{ ok: true; sent: boolean } | { ok: false; reason: "tag" | "no_hit" | "timeout" }> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe")
    frame.title = "Google Analytics check"
    frame.setAttribute("aria-hidden", "true")
    frame.tabIndex = -1
    frame.style.cssText = "position:fixed;width:1px;height:1px;left:-10px;top:-10px;opacity:0;pointer-events:none;border:0"
    let settled = false
    const finish = (r: { ok: true; sent: boolean } | { ok: false; reason: "tag" | "no_hit" | "timeout" }) => {
      if (settled) return
      settled = true
      window.removeEventListener("message", onMessage)
      window.clearTimeout(timer)
      frame.remove()
      resolve(r)
    }
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.contentWindow) return
      const d = e.data as { type?: string; id?: string; ok?: boolean; sent?: boolean; reason?: string }
      if (d?.type !== "storelib-ga-check" || d.id !== id) return
      finish(d.ok ? { ok: true, sent: d.sent !== false } : { ok: false, reason: d.reason === "tag" ? "tag" : d.reason === "no_hit" ? "no_hit" : "timeout" })
    }
    const timer = window.setTimeout(() => finish({ ok: false, reason: "timeout" }), 20_000)
    window.addEventListener("message", onMessage)
    frame.src = `/api/store/ga-check?id=${encodeURIComponent(id)}&embedded=1`
    document.body.appendChild(frame)
  })
}

export function GaConnect({ value, ready, onSaved }: { value: string | null; ready: boolean; onSaved: (t: Tracking) => void }) {
  const [typed, setTyped] = React.useState(value ?? "")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [ga, setGa] = React.useState<GaStatusView | null>(null)
  const [check, setCheck] = React.useState<Check>({ state: "idle" })
  const [, tick] = React.useState(0)
  React.useEffect(() => setTyped(value ?? ""), [value])

  const load = React.useCallback(async () => {
    const r = await api<{ ga: GaStatusView | null }>("/api/store/integrations")
    if (r.ok) setGa(r.data.ga)
  }, [])
  React.useEffect(() => {
    if (!value) return
    void load()
    /* "Last event 2 min ago" stays true while the page is open, and a new visit shows up. */
    const t = window.setInterval(() => {
      tick((n) => n + 1)
      if (document.visibilityState === "visible") void load()
    }, 30_000)
    return () => window.clearInterval(t)
  }, [value, load])

  const verify = React.useCallback(
    async (id: string) => {
      setCheck({ state: "running" })
      const r = await runCheck(id)
      if (!r.ok) return setCheck({ state: "failed", reason: r.reason })
      setCheck({ state: "passed", sent: r.sent })
      const kept = await api<{ ga: GaStatusView }>("/api/store/ga-check", { method: "POST", body: { id } })
      if (kept.ok) setGa(kept.data.ga)
    },
    [],
  )

  const save = async (next: string | null) => {
    setError(null)
    let id: string | null = null
    if (next !== null) {
      const found = readGaInput(next)
      if (!found.ok) return setError(found.error)
      id = found.id
      setTyped(id)
    }
    setBusy(true)
    const r = await api<{ tracking: Tracking }>("/api/store/integrations", { method: "PUT", body: { id: "ga4", value: id } })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onSaved(r.data.tracking)
    setGa(id ? { id, seenAt: null, checkedAt: null, ready: ga?.ready ?? true } : null)
    setCheck({ state: "idle" })
    if (id) void verify(id)
  }

  if (!ready) return <Notice tone="amber">Analytics and pixels need their database update (SQL part 112). Until it runs, nothing here is kept.</Notice>
  const standing = gaStanding(ga, check.state)
  const typedId = readGaInput(typed)
  const changed = typed.trim() !== "" && (!typedId.ok || typedId.id !== value)

  return (
    <div className="space-y-4" data-tracker-install="ga4" data-ga-connect="">
      <Field label="Measurement ID" htmlFor="tracker-ga4" hint="Admin › Data streams › your web stream. Pasting Google's whole tag works too.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <TextInput
            id="tracker-ga4"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && changed && !busy) void save(typed)
            }}
            placeholder="G-1A2B3C4D5E"
            autoComplete="off"
            spellCheck={false}
            className="font-mono sm:flex-1"
          />
          {changed || !value ? (
            <button type="button" className={cn(BTN_PRIMARY, "shrink-0")} disabled={busy || !typed.trim()} onClick={() => void save(typed)} data-ga-save="">
              {busy ? "Connecting" : value ? "Save" : "Connect"}
            </button>
          ) : null}
        </div>
      </Field>
      {error ? <Notice>{error}</Notice> : null}

      {value ? (
        <div className="rounded-xl border border-[#eceef1] px-3.5 py-3" data-ga-status={standing.label.toLowerCase().replace(/\s+/g, "-")} aria-live="polite">
          <p className="flex items-center gap-2 text-[14px] font-medium text-[#1a1a2e]">
            <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", DOT[standing.tone], check.state === "running" && "animate-pulse")} />
            {standing.label === "Receiving data" ? "Connected, receiving data" : standing.label}
          </p>
          <p className="mt-0.5 text-[13px] leading-[19px] text-[#6b7280]" data-ga-line="">
            {check.state === "running"
              ? "Loading Google's tag with this ID and sending one test event."
              : check.state === "failed"
                ? check.reason === "tag"
                  ? "Google's tag didn't load for this ID. Check it on your web stream, or pause an ad blocker in this browser and check again."
                  : "The tag loaded but no hit left this browser. An ad blocker or a privacy setting here can stop it: check again with it paused."
                : ga?.seenAt
                  ? `Last event ${ago(ga.seenAt)}, from a visit to your website.`
                  : ga?.checkedAt || check.state === "passed"
                    ? `Google took Storelib's test event${ga?.checkedAt ? ` ${ago(ga.checkedAt)}` : ""}. Open your website once and the first visit shows here.`
                    : "Saved. Run the check, or open your website once."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={BTN_SECONDARY} disabled={busy || check.state === "running"} onClick={() => void verify(value)} data-ga-check="">
              Check again
            </button>
            <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => void save(null)}>
              Remove
            </button>
          </div>
        </div>
      ) : null}

      <ul className="space-y-1.5 text-[12.5px] leading-[18px] text-[#6b7280]" data-ga-notes="">
        <li>In Google Analytics, Reports › Realtime shows a visit within a minute. The &ldquo;Data collection isn&apos;t active&rdquo; notice on your stream can take up to 48 hours to go away.</li>
        <li>On every page: your website, your storelib.com page and products, your OnePage, checkout and the thank you page, with product views, add to cart, checkout and purchases.</li>
        <li>Visitors in the EU, the UK and Switzerland are counted in full once they accept cookies; before that Google gets a cookieless ping.</li>
      </ul>
    </div>
  )
}
