"use client"

/**
 * ===========================================================================
 *  CALENDLY AND CAL.COM, CONNECTED SO THEIR BOOKINGS SHOW IN BOOKINGS
 * ===========================================================================
 * The rows and the sheet a creator connects them with (lib/bookings/external,
 * /api/bookings/external), drawn in two places:
 *
 *   the OnePage editor   Settings › Integrations, under the signup tools,
 *                        beside the Booking block that links or embeds them
 *                        (components/onepage/settings-integrations)
 *   Settings             Settings › Integrations › Calendly or Cal.com
 *                        (components/app/settings/integration-detail)
 *
 * The sheet says what happens and asks for one thing. Calendly: a personal
 * access token, and Storelib adds the webhook. Cal.com: an API key, and
 * Storelib adds it; or no key, and the sheet gives the address and secret to
 * paste in Cal.com, the secret shown once. A token or key never comes back.
 * Rows are always Calendly then Cal.com, whatever is connected, so nothing
 * moves when the read arrives.
 */

import * as React from "react"
import { Check, ChevronRight, Copy, ExternalLink, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { IntegrationMark } from "@/components/onepage/brand-icons"
import { EXTERNAL_PROVIDERS, EXTERNAL_PROVIDER_NAME, type ExternalProvider } from "@/lib/bookings/external/names"
import type { ConnectionView, ConnectionsAnswer } from "@/lib/bookings/external/server"

const PATH = "/api/bookings/external"

/* One read for every row on the screen, kept a little and shared, as the signup tools' rows are (./page-integrations). */
let cached: ConnectionsAnswer | null = null
let readAt = 0
let reading: Promise<ConnectionsAnswer | null> | null = null
const listeners = new Set<(a: ConnectionsAnswer | null) => void>()
const publish = (a: ConnectionsAnswer | null) => {
  if (a) {
    cached = a
    readAt = Date.now()
  }
  for (const l of listeners) l(a)
}

export function reloadExternalConnections(): Promise<ConnectionsAnswer | null> {
  reading ??= fetch(PATH, { cache: "no-store" })
    .then(async (r) => (r.ok ? ((await r.json()) as ConnectionsAnswer) : null))
    .catch(() => null)
    .then((a) => {
      reading = null
      publish(a)
      return a
    })
  return reading
}

/** undefined while reading, null when it could not be read. */
export function useExternalConnections(): ConnectionsAnswer | null | undefined {
  const [value, setValue] = React.useState<ConnectionsAnswer | null | undefined>(() => cached ?? undefined)
  React.useEffect(() => {
    listeners.add(setValue)
    if (!cached || Date.now() - readAt > 30_000) void reloadExternalConnections()
    return () => {
      listeners.delete(setValue)
    }
  }, [])
  return value
}

type PostAnswer = ConnectionsAnswer & { webhookUrl?: string | null; secret?: string | null; remoteRemoved?: boolean; manual?: boolean }

async function post(body: Record<string, unknown>): Promise<{ ok: true; data: PostAnswer } | { ok: false; error: string }> {
  try {
    const r = await fetch(PATH, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    const d = (await r.json().catch(() => null)) as (PostAnswer & { error?: string }) | null
    if (!r.ok || !d) return { ok: false, error: d?.error || tt("That did not work. Try again.") }
    publish(d)
    return { ok: true, data: d }
  } catch {
    return { ok: false, error: tt("That did not work. Try again.") }
  }
}

const when = (iso: string) => new Intl.DateTimeFormat(appLocale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))

export function connectionLine(v: ConnectionView | undefined): { text: string; on: boolean; bad: boolean } {
  if (!v?.connected) return { text: tt("Not connected"), on: false, bad: false }
  if (v.lastError) return { text: v.lastError, on: true, bad: true }
  if (v.waiting) return { text: tt("Waiting for the first booking"), on: false, bad: true }
  if (v.lastEventAt) return { text: tt("Last booking {date}", { date: when(v.lastEventAt) }), on: true, bad: false }
  return { text: v.account ? tt("Connected, {value}", { value: v.account }) : tt("Connected"), on: true, bad: false }
}

function purpose(p: ExternalProvider): string {
  return p === "calendly"
    ? tt("Bookings made on your Calendly show in Bookings, and you get a notification when one is made, moved or cancelled.")
    : tt("Bookings made on your Cal.com show in Bookings, and you get a notification when one is made, moved or cancelled.")
}

const field = "h-11 w-full rounded-xl border border-[#e3e4e8] bg-white px-3.5 text-[16px] text-[#111113] outline-none transition-[border-color,box-shadow] focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[14px]"
const primary = "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-medium text-white transition-opacity disabled:opacity-50"
const secondary = "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#e3e4e8] bg-white px-3.5 text-[13.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8] disabled:opacity-50"
const listBox = "divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#e8e8ec] bg-white"

const DOCS: Record<ExternalProvider, string> = {
  calendly: "https://developer.calendly.com/docs/authentication/how-to-authenticate-with-personal-access-tokens",
  calcom: "https://cal.com/docs/developing/guides/automation/webhooks",
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = React.useState(false)
  return (
    <div className="space-y-1">
      <p className="text-[12.5px] font-medium text-[#4b5563]">{label}</p>
      <div className="flex items-center gap-2 rounded-xl bg-[#f6f6f7] py-1.5 pl-3 pr-1.5">
        <code className="min-w-0 flex-1 break-all text-[12.5px] text-[#111113]">{value}</code>
        <button
          type="button"
          aria-label={tt("Copy {what}", { what: label })}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[#1a1a2e] transition-colors hover:bg-[#ececef]"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setDone(true)
              window.setTimeout(() => setDone(false), 1500)
            } catch {
              /* The clipboard refused: the text is there to select. */
            }
          }}
        >
          {done ? <Check aria-hidden className="h-4 w-4 text-[#15803d]" /> : <Copy aria-hidden className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)")
    const sync = () => setPhone(m.matches)
    sync()
    m.addEventListener("change", sync)
    return () => m.removeEventListener("change", sync)
  }, [])
  return phone
}

/** What a provider's connection does and the one thing to connect it with; drawn in a sheet, or straight in a page (Settings). */
export function ExternalBookingPanel({ provider, onChanged }: { provider: ExternalProvider; onChanged?: (connected: boolean) => void }) {
  const all = useExternalConnections()
  const view = all?.connections.find((c) => c.provider === provider)
  const name = EXTERNAL_PROVIDER_NAME[provider]
  const [credential, setCredential] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const [pasted, setPasted] = React.useState<{ url: string; secret: string } | null>(null)

  const run = async (label: string, body: Record<string, unknown>) => {
    setBusy(label)
    setError(null)
    setNote(null)
    const r = await post({ provider, ...body })
    setBusy(null)
    if (r.ok === false) {
      setError(r.error)
      return null
    }
    onChanged?.(!!r.data.connections.find((c) => c.provider === provider)?.connected)
    return r.data
  }

  const connect = async () => {
    const d = await run("connect", provider === "calendly" ? { token: credential.trim() } : { apiKey: credential.trim() })
    if (!d) return
    setCredential("")
    setNote(tt("Connected. New bookings show in Bookings."))
  }
  const connectManual = async () => {
    const d = await run("manual", { manual: true })
    if (d?.webhookUrl && d.secret) setPasted({ url: d.webhookUrl, secret: d.secret })
  }
  const disconnect = async () => {
    const d = await run("disconnect", { disconnect: true })
    if (!d) return
    setPasted(null)
    setNote(
      d.manual
        ? tt("Disconnected. Delete the webhook in Cal.com too, under Settings, Developer, Webhooks.")
        : d.remoteRemoved
          ? tt("Disconnected. Bookings already here stay.")
          : tt("Disconnected here, but {name} did not remove its webhook. Remove it in {name}.", { name }),
    )
  }

  const s = all === null ? { text: tt("Could not be checked"), on: false, bad: false } : connectionLine(view)

  return (
    <div className="flex flex-col gap-4" data-external-booking-panel={provider}>
      <p className="text-[13.5px] leading-snug text-[#4b5563]">{purpose(provider)}</p>
      {all && all.ready === false ? <p className="rounded-xl bg-[#fff7ed] p-3 text-[13px] text-[#9a3412]">{tt("Connecting needs SQL part 475 run in Supabase first.")}</p> : null}

      {all === undefined ? (
        <div aria-hidden className="h-[96px] animate-pulse rounded-xl bg-[#f4f4f6] motion-reduce:animate-none" />
      ) : all === null ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="rounded-xl bg-[#fff7ed] p-3 text-[13px] leading-relaxed text-[#9a3412]">{tt("Could not check what is connected. Try again in a moment.")}</p>
          <button type="button" className={primary} disabled={!!busy} onClick={() => void reloadExternalConnections()}>
            {tt("Try again")}
          </button>
        </div>
      ) : pasted ? (
        <div className="flex flex-col gap-3" data-external-booking-paste="">
          <p className="text-[13.5px] leading-snug text-[#1a1a2e]">{tt("In Cal.com, open Settings, Developer, Webhooks and add a webhook with this address and secret. Tick Booking created, Booking cancelled and Booking rescheduled.")}</p>
          <CopyRow label={tt("Subscriber URL")} value={pasted.url} />
          <CopyRow label={tt("Secret, shown once")} value={pasted.secret} />
          <p className="text-[12.5px] text-[#6b7280]">{tt("The row says Connected once Cal.com sends its first booking.")}</p>
        </div>
      ) : view?.connected ? (
        <div className="space-y-3">
          <dl className="divide-y divide-[#f1f2f4] rounded-xl border border-[#e8e8ec] text-[13.5px]">
            <div className="flex justify-between gap-3 px-3.5 py-2.5">
              <dt className="text-[#6b7280]">{tt("Status")}</dt>
              <dd className={cn("truncate font-medium", s.bad ? "text-[#9a3412]" : "text-[#1a1a2e]")}>{s.text}</dd>
            </div>
            {view.account ? (
              <div className="flex justify-between gap-3 px-3.5 py-2.5">
                <dt className="text-[#6b7280]">{tt("Account")}</dt>
                <dd className="truncate font-medium text-[#1a1a2e]">{view.account}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 px-3.5 py-2.5">
              <dt className="text-[#6b7280]">{tt("Webhook")}</dt>
              <dd className="truncate font-medium text-[#1a1a2e]">{view.mode === "manual" ? tt("Added by you in Cal.com") : tt("Added by Storelib")}</dd>
            </div>
          </dl>
          {view.mode === "manual" && view.webhookUrl ? <CopyRow label={tt("Subscriber URL")} value={view.webhookUrl} /> : null}
          <div className="flex flex-wrap gap-2">
            <a href="/app/bookings" className={secondary}>
              {tt("Open Bookings")}
            </a>
            <button type="button" className={cn(secondary, "text-[#b42318]")} disabled={!!busy} onClick={disconnect}>
              {busy === "disconnect" ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
              {tt("Disconnect")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <input
            className={field}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            placeholder={provider === "calendly" ? tt("Personal access token") : tt("API key")}
            aria-label={provider === "calendly" ? tt("Personal access token") : tt("API key")}
          />
          <button type="button" className={primary} disabled={!credential.trim() || !!busy} onClick={connect}>
            {busy === "connect" ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
            {tt("Connect")}
          </button>
          <p className="text-[12.5px] leading-snug text-[#6b7280]">
            {provider === "calendly"
              ? tt("In Calendly, open the Profile menu, then Developer, then Personal access tokens. Make a token with the users:read, scheduled_events:read and webhooks:write scopes.")
              : tt("In Cal.com, open Settings, Security, API keys and make a key. Storelib adds the webhook with it and removes it when you disconnect.")}{" "}
            <a href={DOCS[provider]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-[#1a1a2e] underline underline-offset-2">
              {tt("{name} help", { name })}
              <ExternalLink aria-hidden className="h-3 w-3" />
            </a>
          </p>
          {provider === "calcom" ? (
            <button type="button" className={cn(secondary, "w-full")} disabled={!!busy} onClick={connectManual} data-external-booking-manual="">
              {busy === "manual" ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
              {tt("Add the webhook myself instead")}
            </button>
          ) : null}
        </div>
      )}

      {view?.lastError && !error ? <p className="rounded-xl bg-[#fff7ed] p-3 text-[13px] leading-relaxed text-[#9a3412]">{view.lastError}</p> : null}
      {error ? <p role="alert" className="text-[13px] leading-relaxed text-[#b42318]">{error}</p> : null}
      {note ? (
        <p role="status" className="flex items-start gap-1.5 text-[13px] text-[#15803d]">
          <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          {note}
        </p>
      ) : null}
    </div>
  )
}

function ExternalBookingSheet({ provider, open, onClose }: { provider: ExternalProvider; open: boolean; onClose: () => void }) {
  const phone = usePhone()
  const name = EXTERNAL_PROVIDER_NAME[provider]
  return (
    <SheetDialog open={open} onClose={onClose} phone={phone} label={name} onOpenAutoFocus={(e) => e.preventDefault()} className="flex flex-col gap-0 overflow-hidden rounded-[20px] border-[#ececf1] bg-white p-0 sm:max-w-[440px]">
      <div data-external-booking-sheet={provider} className="flex max-h-[80vh] flex-col gap-4 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pb-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-white shadow-[inset_0_0_0_1px_rgba(16,24,40,0.08)]">
            <IntegrationMark id={provider} size={21} />
          </span>
          <SheetDialogTitle className="text-[18px] font-semibold text-[#111113]">{name}</SheetDialogTitle>
        </div>
        <ExternalBookingPanel provider={provider} />
      </div>
    </SheetDialog>
  )
}

/** The OnePage editor's Settings › Integrations: Calendly and Cal.com, each a row that opens its sheet. */
export function ExternalBookingsSection() {
  const all = useExternalConnections()
  const [open, setOpen] = React.useState<ExternalProvider | null>(null)
  return (
    <section className="space-y-2" aria-label={tt("Bookings")} data-external-bookings="">
      <p className="text-[13px] font-medium text-[#374151]">{tt("Bookings")}</p>
      <div className={listBox} aria-busy={all === undefined}>
        {EXTERNAL_PROVIDERS.map((p) => {
          const view = all?.connections.find((c) => c.provider === p)
          const s = all === null ? { text: tt("Could not be checked"), on: false, bad: false } : connectionLine(view)
          return (
            <button key={p} type="button" data-external-booking-row={p} data-on={s.on ? "" : undefined} onClick={() => setOpen(p)} className="flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors [@media(hover:hover)]:hover:bg-[#fafafb]">
              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white shadow-[inset_0_0_0_1px_rgba(16,24,40,0.08)]">
                <IntegrationMark id={p} size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{EXTERNAL_PROVIDER_NAME[p]}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-[#6b7280]">
                  {all === undefined ? (
                    <span aria-hidden className="h-[9px] w-24 rounded-full bg-[#f0f1f3]" />
                  ) : (
                    <>
                      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.bad ? "bg-[#d97706]" : s.on ? "bg-[#16a34a]" : "bg-[#d1d5db]")} />
                      <span className="truncate">{s.text}</span>
                    </>
                  )}
                </span>
              </span>
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
            </button>
          )
        })}
      </div>
      {open ? <ExternalBookingSheet provider={open} open={!!open} onClose={() => setOpen(null)} /> : null}
    </section>
  )
}
