"use client"

/**
 * ===========================================================================
 *  SEND TO: STORELIB ANALYTICS IN THE STORE'S OTHER TOOLS
 * ===========================================================================
 * One button beside Export on Analytics, opening the /app dialog (the shared
 * bottom sheet on a phone), and the same list on Integrations › Send
 * analytics. Each tool is a row: its name and where it stands, in one line;
 * pressed, its fields or its status open under it, one at a time.
 *
 *   Google Analytics 4   measurement ID and API secret (Measurement Protocol)
 *   Meta                 pixel ID and Conversions API access token
 *   Google Ads           nothing to connect: GA4's conversions, imported
 *   PostHog              project API key and host
 *   Webhook              an https address; the signing secret shown once
 *   Analytics API        read only keys for GET /api/v1/analytics
 *
 * Connected, a row says when the last event went, what is waiting, the
 * recent errors in the tool's own words, and has Send test. The server
 * (app/api/analytics/destinations, lib/analytics/destinations) tries a key
 * before keeping it and never sends one back.
 */
import * as React from "react"
import { ChevronDown, Copy, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { formatRelative } from "@/lib/i18n/format"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { requestJson } from "@/lib/net/request"

type Provider = "ga4" | "meta" | "posthog" | "webhook"
type RowId = Provider | "google_ads" | "api"

interface DeliveryView {
  id: string
  event: string
  status: string
  at: string
  attempts: number
  code: number | null
  error: string | null
}
interface DestinationView {
  provider: Provider
  connected: boolean
  label: string | null
  hint: string | null
  testEventCode: string | null
  lastSentAt: string | null
  lastEvent: string | null
  waiting: number
  errors: { at: string; event: string; error: string }[]
  log: DeliveryView[]
}
interface Answer {
  ready: boolean
  canEdit?: boolean
  destinations: DestinationView[]
  signingSecret?: string | null
  error?: string
  field?: string | null
}
interface TokenView {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
}

const BUTTON_SECONDARY =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13.5px] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none hover:bg-[#f8f9fa] focus-visible:shadow-[0_0_0_2px_rgba(26,26,46,0.2)] active:bg-[#f1f2f4] disabled:cursor-default disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
const BUTTON_PRIMARY =
  "inline-flex h-9 cursor-pointer items-center justify-center rounded-lg bg-[#1a1a2e] px-3.5 text-[13.5px] font-medium text-white outline-none hover:bg-[#2b2b42] focus-visible:shadow-[0_0_0_2px_rgba(26,26,46,0.35)] active:bg-[#11111f] disabled:cursor-default disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
const BUTTON_QUIET = "inline-flex h-9 cursor-pointer items-center rounded-lg px-2 text-[13.5px] font-medium text-[#b42318] outline-none hover:bg-[#fef3f2] focus-visible:shadow-[0_0_0_2px_rgba(180,35,24,0.25)] disabled:opacity-50"
const INPUT = "h-10 w-full rounded-lg border border-[#e3e4e8] bg-white px-3 text-[14px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#1a1a2e]/40 focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[13.5px]"
const PICKER =
  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e3e4e8] bg-white px-2 text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.05)] transition-colors duration-100 hover:bg-[#f7f7f8] active:bg-[#f1f2f4] cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 focus-visible:ring-offset-1 sm:px-2.5"

const LOGO: Partial<Record<RowId, string>> = { ga4: "/integrations/google-analytics.svg", meta: "/integrations/meta.svg", google_ads: "/integrations/google-ads.svg" }
const ROWS: RowId[] = ["ga4", "meta", "google_ads", "posthog", "webhook", "api"]

function rowName(id: RowId): string {
  if (id === "ga4") return "Google Analytics 4" // i18n-ignore
  if (id === "meta") return "Meta"
  if (id === "google_ads") return "Google Ads" // i18n-ignore
  if (id === "posthog") return "PostHog"
  if (id === "webhook") return tt("Webhook")
  return tt("Analytics API")
}

function eventName(e: string | null): string {
  if (e === "page_view") return tt("page view")
  if (e === "view_item") return tt("product view")
  if (e === "purchase") return tt("purchase")
  if (e === "refund") return tt("refund")
  if (e === "lead") return tt("signup")
  if (e === "sign_up") return tt("membership")
  if (e === "test") return tt("test")
  return e ?? ""
}

function statusWord(s: string): string {
  if (s === "sent") return tt("Sent")
  if (s === "failed") return tt("Failed")
  if (s === "skipped") return tt("Skipped")
  return tt("Waiting")
}

/*
  Round 49: through lib/net/request requestJson, so a 503 "could not check
  your sign in" is asked again quietly (a read over about 10s, a change twice)
  behind the loading state, and every call has a deadline. It used to be a
  bare fetch that showed the first 503's words at once.
*/
async function call<T>(input: string, init?: RequestInit): Promise<{ ok: boolean; data: T }> {
  const r = await requestJson<Record<string, unknown>>(input, { cache: "no-store", credentials: "same-origin", ...init, headers: { "Content-Type": "application/json", ...((init?.headers as Record<string, string> | undefined) ?? {}) } })
  if (r.ok || r.status) return { ok: r.ok, data: r.data as T }
  return { ok: false, data: { error: tt("Storelib did not answer. Try again.") } as T }
}

function Mark({ id }: { id: RowId }) {
  const src = LOGO[id]
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" width={20} height={20} decoding="async" className="h-5 w-5 shrink-0 object-contain" />
  const letter = id === "posthog" ? "P" : id === "webhook" ? "W" : "A"
  return (
    <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] bg-[#1a1a2e] text-[11px] font-semibold text-white">
      {letter}
    </span>
  )
}

function CopyLine({ value, label }: { value: string; label: string }) {
  const [done, setDone] = React.useState(false)
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#e3e4e8] bg-[#f8f9fa] py-1 pl-3 pr-1">
      <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-[#1a1a2e]" aria-label={label}>
        {value}
      </code>
      <button
        type="button"
        className={cn(BUTTON_SECONDARY, "h-8 px-2.5")}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setDone(true)
            window.setTimeout(() => setDone(false), 1600)
          })
        }}
      >
        <Copy className="h-3.5 w-3.5" aria-hidden />
        {done ? tt("Copied") : tt("Copy")}
      </button>
    </div>
  )
}

/* ── one tool's fields ─────────────────────────────────────────────────── */

type Field = { key: string; label: string; placeholder: string; hint?: string; secret?: boolean; optional?: boolean }

function fieldsOf(p: Provider): Field[] {
  if (p === "ga4")
    return [
      { key: "measurementId", label: tt("Measurement ID"), placeholder: "G-XXXXXXXXXX" }, // i18n-ignore
      { key: "apiSecret", label: tt("API secret"), placeholder: "", hint: tt("Admin › Data streams › Measurement Protocol API secrets"), secret: true },
    ]
  if (p === "meta")
    return [
      { key: "pixelId", label: tt("Pixel ID"), placeholder: "123456789012345" },
      { key: "accessToken", label: tt("Conversions API access token"), placeholder: "", hint: tt("Events Manager › Settings › Generate access token"), secret: true },
      { key: "testEventCode", label: tt("Test event code"), placeholder: "TEST12345", optional: true },
    ]
  if (p === "posthog")
    return [
      { key: "projectKey", label: tt("Project API key"), placeholder: "phc_…", secret: true },
      { key: "host", label: tt("Host"), placeholder: "https://us.i.posthog.com", optional: true },
    ]
  return [{ key: "url", label: tt("Address"), placeholder: "https://example.com/storelib" }]
}

function sendsLine(p: Provider): string {
  if (p === "ga4") return tt("Page views, purchases with their items, refunds, signups and memberships, sent from Storelib's server.")
  if (p === "meta") return tt("Purchases, signups, memberships and product views, matched to your pixel's own events so each counts once.")
  if (p === "posthog") return tt("Page views, purchases, refunds, signups and memberships, as PostHog events.")
  return tt("Purchases, refunds, signups and memberships as signed JSON, retried for a day if your address does not answer.")
}

function DestinationBody({ view, canEdit, onAnswer }: { view: DestinationView; canEdit: boolean; onAnswer: (a: Answer) => void }) {
  const p = view.provider
  const [values, setValues] = React.useState<Record<string, string>>(() => ({
    measurementId: p === "ga4" ? view.label ?? "" : "",
    pixelId: p === "meta" ? view.label ?? "" : "",
    testEventCode: view.testEventCode ?? "",
    host: p === "posthog" && view.label ? `https://${view.label}` : "",
  }))
  const [busy, setBusy] = React.useState<null | "save" | "test" | "remove">(null)
  const [note, setNote] = React.useState<{ tone: "ok" | "bad"; text: string; field?: string | null } | null>(null)
  const [secret, setSecret] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState(!view.connected)

  const post = async (kind: "save" | "test" | "remove", body: Record<string, unknown>) => {
    setBusy(kind)
    setNote(null)
    const r = await call<Answer>("/api/analytics/destinations", { method: "POST", body: JSON.stringify({ provider: p, ...body }) })
    setBusy(null)
    if (r.data?.destinations) onAnswer(r.data)
    if (!r.ok) {
      setNote({ tone: "bad", text: r.data?.error || tt("That did not work. Try again."), field: r.data?.field })
      return
    }
    if (kind === "save") {
      setEditing(false)
      if (r.data.signingSecret) setSecret(r.data.signingSecret)
      setNote({ tone: "ok", text: tt("Connected. A test event went through.") })
    } else if (kind === "test") setNote({ tone: "ok", text: tt("Test event sent.") })
    else setNote(null)
  }

  return (
    <div className="space-y-3 px-3 pb-4 pt-1" data-destination-body={p}>
      <p className="text-[13px] leading-5 text-[#6b7280]">{sendsLine(p)}</p>

      {view.connected && !editing ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          <dt className="text-[#6b7280]">{p === "webhook" ? tt("Address") : p === "posthog" ? tt("Host") : p === "ga4" ? tt("Measurement ID") : tt("Pixel ID")}</dt>
          <dd className="min-w-0 truncate text-[#1a1a2e]">
            {view.label}
            {view.hint && p !== "webhook" ? <span className="text-[#9ca3af]"> · {tt("key ending {last}", { last: view.hint })}</span> : null}
          </dd>
          <dt className="text-[#6b7280]">{tt("Last event")}</dt>
          <dd className="text-[#1a1a2e]">{view.lastSentAt ? `${eventName(view.lastEvent)}, ${formatRelative(view.lastSentAt)}` : tt("None yet")}</dd>
          {view.waiting > 0 ? (
            <>
              <dt className="text-[#6b7280]">{tt("Waiting")}</dt>
              <dd className="tabular-nums text-[#1a1a2e]">{view.waiting}</dd>
            </>
          ) : null}
        </dl>
      ) : null}

      {secret ? (
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium text-[#1a1a2e]">{tt("Signing secret. Copy it now: it is not shown again.")}</p>
          <CopyLine value={secret} label={tt("Signing secret")} />
          <p className="text-[12.5px] leading-5 text-[#6b7280]">{tt("Each request carries X-Storelib-Signature: t=time,v1=HMAC-SHA256 of time, a dot and the body, with this secret.")}</p>
        </div>
      ) : null}

      {view.errors.length > 0 && !editing ? (
        <ul className="space-y-1" data-destination-errors="">
          {view.errors.map((e, i) => (
            <li key={i} className="text-[12.5px] leading-5 text-[#b42318]">
              {eventName(e.event)}, {formatRelative(e.at)}: {e.error}
            </li>
          ))}
        </ul>
      ) : null}

      {editing && canEdit ? (
        <form
          className="space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault()
            void post("save", { step: "connect", ...values })
          }}
        >
          {fieldsOf(p).map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-[12.5px] font-medium text-[#4b5563]">
                {f.label}
                {f.optional ? <span className="font-normal text-[#9ca3af]"> · {tt("optional")}</span> : null}
              </span>
              <input
                className={cn(INPUT, note?.field === f.key && "border-[#f04438]")}
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                spellCheck={false}
                value={values[f.key] ?? ""}
                placeholder={f.secret && view.connected ? tt("Kept as it is when left empty") : f.placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
              {f.hint ? <span className="mt-1 block text-[12px] leading-4 text-[#9ca3af]">{f.hint}</span> : null}
            </label>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <button type="submit" className={BUTTON_PRIMARY} disabled={busy !== null}>
              {busy === "save" ? tt("Checking…") : view.connected ? tt("Save") : tt("Connect")}
            </button>
            {view.connected ? (
              <button type="button" className={BUTTON_SECONDARY} onClick={() => setEditing(false)}>
                {tt("Cancel")}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {view.connected && !editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BUTTON_SECONDARY} disabled={busy !== null} onClick={() => void post("test", { step: "test" })} data-destination-test="">
            {busy === "test" ? tt("Sending…") : tt("Send test")}
          </button>
          {canEdit ? (
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setEditing(true)}>
              {tt("Change")}
            </button>
          ) : null}
          {canEdit ? (
            <button type="button" className={cn(BUTTON_QUIET, "ml-auto")} disabled={busy !== null} onClick={() => void post("remove", { disconnect: true })}>
              {busy === "remove" ? tt("Disconnecting…") : tt("Disconnect")}
            </button>
          ) : null}
        </div>
      ) : null}

      {!canEdit && !view.connected ? <p className="text-[13px] text-[#6b7280]">{tt("The store's owner connects this.")}</p> : null}

      {note ? (
        <p role="status" className={cn("text-[13px] leading-5", note.tone === "ok" ? "text-[#067647]" : "text-[#b42318]")}>
          {note.text}
        </p>
      ) : null}

      {view.connected && !editing && view.log.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer list-none text-[13px] font-medium text-[#1a1a2e] [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1">
              {tt("Recent deliveries")}
              <ChevronDown className="h-3.5 w-3.5 text-[#9ca3af] transition-transform group-open:rotate-180" aria-hidden />
            </span>
          </summary>
          <ul className="mt-2 divide-y divide-[#f1f2f4] rounded-lg border border-[#eef0f2]" data-destination-log="">
            {view.log.map((d) => (
              <li key={d.id} className="flex items-baseline gap-3 px-3 py-2 text-[12.5px]">
                <span className="w-24 shrink-0 text-[#1a1a2e]">{eventName(d.event)}</span>
                <span className={cn("w-16 shrink-0", d.status === "sent" ? "text-[#067647]" : d.status === "failed" ? "text-[#b42318]" : "text-[#6b7280]")}>{statusWord(d.status)}</span>
                <span className="min-w-0 flex-1 truncate text-[#6b7280]" title={d.error ?? undefined}>
                  {d.error ?? (d.code ? `HTTP ${d.code}` : "") /* i18n-ignore */}
                </span>
                <span className="shrink-0 tabular-nums text-[#9ca3af]">{formatRelative(d.at)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

/* ── Google Ads ─────────────────────────────────────────────────────────── */

function GoogleAdsBody({ gaConnected }: { gaConnected: boolean }) {
  const steps = [
    tt("Connect Google Analytics 4 above."),
    tt("In Google Analytics, open Admin › Product links › Google Ads links and link your Ads account."),
    tt("Mark purchase and generate_lead as key events in Admin › Events."),
    tt("In Google Ads, open Goals › Conversions › New conversion action › Import › Google Analytics 4 and pick them."),
  ]
  return (
    <div className="space-y-2 px-3 pb-4 pt-1" data-destination-body="google_ads">
      <p className="text-[13px] leading-5 text-[#6b7280]">{tt("Google Ads counts conversions from Google Analytics 4, so there is no key to add here.")}</p>
      <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-5 text-[#1a1a2e]">
        {steps.map((s, i) => (
          <li key={i} className={i === 0 && gaConnected ? "text-[#9ca3af] line-through" : undefined}>
            {s}
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ── the API keys ──────────────────────────────────────────────────────── */

function ApiBody({ canEdit }: { canEdit: boolean }) {
  const [tokens, setTokens] = React.useState<TokenView[] | null>(null)
  const [ready, setReady] = React.useState(true)
  const [name, setName] = React.useState("")
  const [fresh, setFresh] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!canEdit) return
    void call<{ ready: boolean; tokens: TokenView[] }>("/api/analytics/api-tokens").then((r) => {
      if (r.ok) {
        setTokens(r.data.tokens)
        setReady(r.data.ready)
      } else setError((r.data as { error?: string }).error ?? null)
    })
  }, [canEdit])
  const origin = typeof window === "undefined" ? "https://storelib.com" : window.location.origin
  const example = `curl -H "Authorization: Bearer sla_…" "${origin}/api/v1/analytics?from=2026-10-01&to=2026-10-28"` // i18n-ignore

  const make = async () => {
    setBusy(true)
    setError(null)
    const r = await call<{ tokens: TokenView[]; token?: string; error?: string }>("/api/analytics/api-tokens", { method: "POST", body: JSON.stringify({ name }) })
    setBusy(false)
    if (!r.ok) return setError(r.data.error ?? tt("That key could not be made. Try again."))
    setTokens(r.data.tokens)
    setFresh(r.data.token ?? null)
    setName("")
  }
  const revoke = async (id: string) => {
    const r = await call<{ tokens: TokenView[]; error?: string }>(`/api/analytics/api-tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    if (r.ok) setTokens(r.data.tokens)
    else setError(r.data.error ?? null)
  }

  return (
    <div className="space-y-3 px-3 pb-4 pt-1" data-destination-body="api">
      <p className="text-[13px] leading-5 text-[#6b7280]">{tt("Daily visitors, page views, orders and revenue, with your top products and pages, as JSON or CSV. Keys only read.")}</p>
      <CopyLine value={example} label={tt("Example request")} />
      {!canEdit ? <p className="text-[13px] text-[#6b7280]">{tt("The store's owner makes API keys.")}</p> : null}
      {canEdit && !ready ? <p className="text-[13px] text-[#b42318]">{tt("API keys need SQL part 338 run in Supabase first.")}</p> : null}
      {fresh ? (
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium text-[#1a1a2e]">{tt("Your new key. Copy it now: it is not shown again.")}</p>
          <CopyLine value={fresh} label={tt("API key")} />
        </div>
      ) : null}
      {canEdit && tokens && tokens.length > 0 ? (
        <ul className="divide-y divide-[#f1f2f4] rounded-lg border border-[#eef0f2]">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate text-[#1a1a2e]">{t.name}</span>
              <code className="shrink-0 font-mono text-[12px] text-[#6b7280]">{t.prefix}…</code>
              <span className="hidden shrink-0 text-[12px] text-[#9ca3af] sm:inline">{t.lastUsedAt ? tt("used {when}", { when: formatRelative(t.lastUsedAt) }) : tt("never used")}</span>
              <button type="button" className={cn(BUTTON_QUIET, "h-8")} onClick={() => void revoke(t.id)}>
                {tt("Revoke")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit && ready ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void make()
          }}
        >
          <input className={INPUT} value={name} maxLength={80} placeholder={tt("Name it, such as Google Sheets")} onChange={(e) => setName(e.target.value)} aria-label={tt("Key name")} />
          <button type="submit" className={cn(BUTTON_PRIMARY, "h-10 shrink-0")} disabled={busy}>
            {busy ? tt("Making…") : tt("Make key")}
          </button>
        </form>
      ) : null}
      {error ? <p className="text-[13px] text-[#b42318]">{error}</p> : null}
    </div>
  )
}

/* ── the list ──────────────────────────────────────────────────────────── */

function standing(id: RowId, views: Map<Provider, DestinationView>): { text: string; tone: "on" | "off" | "bad" } {
  if (id === "api") return { text: tt("Read only keys"), tone: "off" }
  if (id === "google_ads") return views.get("ga4")?.connected ? { text: tt("Through Google Analytics 4"), tone: "on" } : { text: tt("Needs Google Analytics 4"), tone: "off" }
  const v = views.get(id)
  if (!v?.connected) return { text: tt("Not connected"), tone: "off" }
  if (v.errors.length > 0) return { text: tt("Connected, with errors"), tone: "bad" }
  return { text: v.lastSentAt ? tt("Connected · last event {when}", { when: formatRelative(v.lastSentAt) }) : tt("Connected"), tone: "on" }
}

/** Every tool, with its status and its form. Used in the dialog and on Integrations › Send analytics. */
export function AnalyticsDestinationsPanel({ initialOpen = null, onConnectedChange }: { initialOpen?: RowId | null; onConnectedChange?: (connected: boolean) => void }) {
  const [answer, setAnswer] = React.useState<Answer | null>(null)
  const [open, setOpen] = React.useState<RowId | null>(initialOpen)
  const [failed, setFailed] = React.useState<string | null>(null)
  const take = React.useCallback(
    (a: Answer) => {
      setAnswer(a)
      onConnectedChange?.(a.destinations.some((d) => d.connected))
    },
    [onConnectedChange],
  )
  const [attempt, setAttempt] = React.useState(0)
  React.useEffect(() => {
    let live = true
    void call<Answer>("/api/analytics/destinations").then((r) => {
      if (!live) return
      if (r.ok && r.data.destinations) take(r.data)
      else setFailed(r.data?.error ?? tt("Storelib did not answer. Try again."))
    })
    return () => {
      live = false
    }
  }, [take, attempt])

  const views = new Map((answer?.destinations ?? []).map((d) => [d.provider, d]))
  const canEdit = answer?.canEdit !== false

  /* Only after the quiet tries: the words, calm, and a way to ask again. */
  if (failed)
    return (
      <div className="flex flex-wrap items-center gap-3 px-3 py-4" data-destinations-failed="">
        <p className="min-w-0 flex-1 text-[13.5px] text-[#6b7280]">{failed}</p>
        <button
          type="button"
          className={cn(BUTTON_SECONDARY, "h-8 shrink-0")}
          onClick={() => {
            setFailed(null)
            setAttempt((n) => n + 1)
          }}
        >
          {tt("Try again")}
        </button>
      </div>
    )
  if (!answer) return <div className="h-[280px]" aria-busy="true" data-destinations-loading="" />

  return (
    <div data-analytics-destinations="">
      {!answer.ready ? <p className="mx-3 mb-2 rounded-lg bg-[#fffaeb] px-3 py-2 text-[13px] text-[#93370d]">{tt("Sending analytics needs SQL part 338 run in Supabase first.")}</p> : null}
      <ul className="divide-y divide-[#f1f2f4]">
        {ROWS.map((id) => {
          const s = standing(id, views)
          const isOpen = open === id
          const view = id !== "google_ads" && id !== "api" ? views.get(id) : undefined
          return (
            <li key={id} data-destination-row={id}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : id)}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none transition-colors duration-100 hover:bg-[#f8f9fa] focus-visible:bg-[#f8f9fa] [-webkit-tap-highlight-color:transparent]"
              >
                <Mark id={id} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-[#1a1a2e]">{rowName(id)}</span>
                  <span className={cn("block truncate text-[12.5px]", s.tone === "on" ? "text-[#067647]" : s.tone === "bad" ? "text-[#b42318]" : "text-[#6b7280]")}>{s.text}</span>
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-150", isOpen && "rotate-180")} aria-hidden />
              </button>
              {isOpen ? (
                id === "google_ads" ? (
                  <GoogleAdsBody gaConnected={!!views.get("ga4")?.connected} />
                ) : id === "api" ? (
                  <ApiBody canEdit={canEdit} />
                ) : view ? (
                  <DestinationBody key={`${id}:${view.connected}`} view={view} canEdit={canEdit} onAnswer={take} />
                ) : null
              ) : null}
            </li>
          )
        })}
      </ul>
      <p className="px-3 pt-3 text-[12.5px] leading-5 text-[#6b7280]">{tt("A visitor's details are sent only when their cookie choice allows it. Emails and phone numbers go hashed. Test sales are never sent.")}</p>
    </div>
  )
}

/** Beside Export on Analytics: opens the list in the /app dialog, or the bottom sheet on a phone. */
export function SendAnalyticsButton({ className }: { className?: string }) {
  const phone = usePhoneWidth()
  const [open, setOpen] = React.useState(false)
  const body = open ? <AnalyticsDestinationsPanel /> : null
  return (
    <span className="relative inline-flex shrink-0 items-center">
      {/* In Analytics' control row it takes the row's pill look (app/globals.css, [data-analytics-controls]) like Export, and like Export it is a 36px circle on a phone. */}
      <button type="button" aria-haspopup="dialog" aria-label={tt("Send to")} onClick={() => setOpen(true)} data-analytics-send="" className={cn(PICKER, "max-sm:!w-9 max-sm:!justify-center max-sm:!p-0", className)}>
        <Send className="h-3.5 w-3.5 text-[#6b7280]" aria-hidden />
        <span className="hidden sm:inline">{tt("Send to")}</span>
      </button>
      {phone ? (
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={tt("Send analytics")} aboveKeyboard>
          <div className="px-1 pb-[max(16px,env(safe-area-inset-bottom))]" data-send-sheet="">
            {body}
          </div>
        </BottomSheet>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            showCloseButton={false}
            aria-describedby={undefined}
            data-send-dialog=""
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              ;(e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true })
            }}
            className="w-[calc(100%-32px)] max-w-[520px] gap-0 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-0 shadow-[0_24px_64px_-12px_rgba(17,24,39,0.28),0_2px_8px_rgba(17,24,39,0.06)]"
          >
            <div className="flex items-center justify-between border-b border-[#eef0f2] px-5 py-4">
              <DialogTitle className="text-[16px] font-semibold text-[#1a1a2e]">{tt("Send analytics")}</DialogTitle>
              <button type="button" className={cn(BUTTON_SECONDARY, "h-8")} onClick={() => setOpen(false)}>
                {tt("Done")}
              </button>
            </div>
            <div className="max-h-[min(72vh,640px)] overflow-y-auto px-2 py-2">{body}</div>
          </DialogContent>
        </Dialog>
      )}
    </span>
  )
}
