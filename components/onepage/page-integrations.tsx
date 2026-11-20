"use client"

/**
 * ===========================================================================
 *  THE TOOLS A ONEPAGE'S SIGNUPS GO TO, CONNECTED FROM THE PAGE ITSELF
 * ===========================================================================
 * Mailchimp, Kit, beehiiv, MailerLite, Brevo and Flodesk by key; Zapier,
 * Make, Google Sheets and any address of the creator's own by webhook. Each
 * signup on the page is sent to each connected one as it happens
 * (lib/onepage/integrations/deliver-server), and the row says how many went
 * and the last thing that went wrong, in the provider's words.
 *
 * LESS TO READ (round 41, the owner: "only what's necessary; put details in
 * modals"). A tool's sheet is its mark, its name, where it stands, one line
 * of what it does and the one thing to do. How to find a key, the Apps
 * Script and the signing rules are a tap away on the sheet's second view
 * (Setup), which slides in over the first and back.
 *
 * Drawn in the editor's Settings › Integrations (./settings-integrations)
 * and under an email signup's settings (./creator-blocks SignupDestination).
 * Rows are always in PAGE_INTEGRATIONS' order, whatever is connected, so
 * nothing moves when the read arrives. Keys are typed here and sent once to
 * /api/onepage/integrations; they never come back, only their last four
 * characters.
 */

import * as React from "react"
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { IntegrationMark } from "@/components/onepage/brand-icons"
import {
  PAGE_INTEGRATIONS,
  PAGE_INTEGRATION_DOCS,
  PAGE_INTEGRATION_LIST,
  PAGE_INTEGRATION_NAME,
  isWebhookIntegration,
  needsList,
  offersDoubleOptin,
  type KeyIntegration,
  type PageIntegration,
} from "@/lib/onepage/integrations/catalog"
import type { ProviderList } from "@/lib/onepage/integrations/providers"
import type { PageIntegrationView } from "@/lib/onepage/integrations/connect-server"

type Answer = { integrations: PageIntegrationView[]; ready: boolean }

/*
  One read for every row on the screen. It used to be kept for the whole
  visit and read only when nothing was kept: a tool disconnected in another
  tab, or a key the provider revoked (its lastError), still read Connected
  until a reload. A row that mounts now shows what is kept at once and asks
  again when it is older than FRESH_MS, one request for all the rows.
*/
const FRESH_MS = 30_000
let cached: Answer | null = null
let readAt = 0
let reading: Promise<Answer | null> | null = null
const listeners = new Set<(a: Answer | null) => void>()
function publish(a: Answer | null) {
  cached = a
  readAt = a ? Date.now() : 0
  listeners.forEach((l) => l(a))
}
/** Asks again; rows already asking share the one request. */
export function reloadPageIntegrations(): Promise<Answer | null> {
  if (!reading) reading = reload().finally(() => { reading = null })
  return reading
}
async function reload(): Promise<Answer | null> {
  try {
    const r = await fetch("/api/onepage/integrations", { cache: "no-store" })
    /* Only an answer of the shape the rows read: anything else (an error body, a proxy's page) is no answer, never a crash in Settings. */
    const raw = r.ok ? ((await r.json().catch(() => null)) as Partial<Answer> | null) : null
    const d = raw && Array.isArray(raw.integrations) ? { integrations: raw.integrations, ready: raw.ready !== false } : null
    publish(d)
    return d
  } catch {
    publish(null)
    return null
  }
}

/**
 * undefined while the first read is on its way, null when it could not be
 * read. Null is NOT "nothing connected": the rows say they could not check,
 * and a sheet offers no Connect over a connection it could not see.
 */
export function usePageIntegrations(): Answer | null | undefined {
  const [value, setValue] = React.useState<Answer | null | undefined>(cached ?? undefined)
  React.useEffect(() => {
    const l = (a: Answer | null) => setValue(a)
    listeners.add(l)
    if (!cached || Date.now() - readAt > FRESH_MS) void reloadPageIntegrations()
    return () => {
      listeners.delete(l)
    }
  }, [])
  return value
}

async function post(body: Record<string, unknown>): Promise<{ ok: true; data: Answer & { lists?: ProviderList[] | null; tags?: ProviderList[] | null; signingSecret?: string | null } } | { ok: false; error: string }> {
  try {
    const r = await fetch("/api/onepage/integrations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: typeof d?.error === "string" ? d.error : tt("That did not work. Try again.") }
    if (Array.isArray(d?.integrations)) publish({ integrations: d.integrations, ready: d.ready !== false })
    return { ok: true, data: d }
  } catch {
    return { ok: false, error: tt("That did not work. Try again.") }
  }
}

/* i18n-ignore-start: a script the creator pastes into Google Apps Script, not words. */
export const SHEETS_SCRIPT = `function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var d = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.appendRow(["When", "Email", "Name", "Form", "Lead magnet", "Detail", "Page"]);
    if (d.event === "onepage.signup") sheet.appendRow([d.created_at, d.email, d.name || "", d.form, d.lead_magnet || "", d.detail || "", d.page_url || ""]);
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput("ok");
}`
/* i18n-ignore-end */

/** One line: what the tool does with a signup. */
function purpose(p: PageIntegration): string {
  switch (p) {
    case "mailchimp":
      return tt("Adds each signup to a Mailchimp audience.")
    case "kit":
      return tt("Adds each signup to Kit, on a form or tag.")
    case "beehiiv":
      return tt("Subscribes each signup to a beehiiv publication.")
    case "mailerlite":
      return tt("Adds each signup to MailerLite, in a group.")
    case "brevo":
      return tt("Adds each signup to a Brevo list.")
    case "flodesk":
      return tt("Adds each signup to Flodesk, in a segment.")
    case "zapier":
      return tt("Starts a Zap with each signup.")
    case "make":
      return tt("Starts a Make scenario with each signup.")
    case "sheets":
      return tt("Adds a row to your sheet for each signup.")
    default:
      return tt("Sends each signup to your own address, signed.")
  }
}

/** The setup, step by step, for the sheet's second view. */
function steps(p: PageIntegration): string[] {
  switch (p) {
    case "mailchimp":
      return [tt("In Mailchimp, open Profile, Extras, API keys."), tt("Create a key and copy it."), tt("Paste it here and choose an audience.")]
    case "kit":
      return [tt("In Kit, open Settings, Developer."), tt("Add a v4 API key and copy it."), tt("Paste it here. Choose a form or tag if you want one.")]
    case "beehiiv":
      return [tt("In beehiiv, open Settings, API."), tt("Create an API key and copy it."), tt("Paste it here and choose a publication.")]
    case "mailerlite":
      return [tt("In MailerLite, open Integrations, API."), tt("Generate a new token and copy it."), tt("Paste it here. Choose a group if you want one.")]
    case "brevo":
      return [tt("In Brevo, open SMTP and API, API keys."), tt("Generate a key that starts with xkeysib- and copy it."), tt("Paste it here and choose a list.")]
    case "flodesk":
      return [tt("In Flodesk, open Account settings, Integrations, API keys."), tt("Create a key and copy it."), tt("Paste it here. Choose a segment if you want one.")]
    case "zapier":
      return [tt("In Zapier, start a Zap with Webhooks by Zapier, Catch Hook."), tt("Copy the hook's address."), tt("Paste it here. A test event is sent to it.")]
    case "make":
      return [tt("In Make, add a Webhooks module, Custom webhook."), tt("Copy its address."), tt("Paste it here. A test event is sent to it.")]
    case "sheets":
      return [tt("In your sheet, open Extensions, Apps Script."), tt("Replace the code with this script and save."), tt("Deploy as a web app that anyone can access, and copy the address ending in /exec."), tt("Paste it here.")]
    default:
      return [tt("Each signup is sent as JSON to your address."), tt("X-Storelib-Signature is the HMAC SHA-256 of the body with your signing secret."), tt("X-Storelib-Delivery stays the same on a retry, so a repeat can be dropped.")]
  }
}

function listWord(p: KeyIntegration): string {
  switch (PAGE_INTEGRATION_LIST[p]) {
    case "audience":
      return tt("Audience")
    case "form":
      return tt("Form")
    case "publication":
      return tt("Publication")
    case "group":
      return tt("Group")
    case "segment":
      return tt("Segment")
    default:
      return tt("List")
  }
}

export function statusLine(v: PageIntegrationView | undefined): { text: string; on: boolean; bad: boolean } {
  if (!v?.connected) return { text: tt("Not connected"), on: false, bad: false }
  if (v.lastError) return { text: v.lastError, on: true, bad: true }
  const where = v.listName || v.hint
  if (v.sent > 0) return { text: where ? tt("{count, plural, one {# signup sent} other {# signups sent}} to {value}", { count: v.sent, value: where }) : tt("{count, plural, one {# signup sent} other {# signups sent}}", { count: v.sent }), on: true, bad: false }
  return { text: where ? tt("Connected, {value}", { value: where }) : tt("Connected"), on: true, bad: false }
}

export function IntegrationRow({ provider, view, onOpen, loading = false, unread = false }: { provider: PageIntegration; view: PageIntegrationView | undefined; onOpen: () => void; loading?: boolean; unread?: boolean }) {
  /* The read failed: what is connected is not known, so the row never says "Not connected" about it. */
  const s = unread ? { text: tt("Could not be checked"), on: false, bad: false } : statusLine(view)
  return (
    <button type="button" data-page-integration={provider} data-on={s.on ? "" : undefined} onClick={onOpen} className="flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors [@media(hover:hover)]:hover:bg-[#fafafb]">
      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white shadow-[inset_0_0_0_1px_rgba(16,24,40,0.08)]">
        <IntegrationMark id={provider} size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{PAGE_INTEGRATION_NAME[provider]}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-[#6b7280]">
          {/* While the read is on its way: a quiet bar where the status goes, never "Not connected" that then changes. */}
          {loading ? <span aria-hidden className="h-[9px] w-24 rounded-full bg-[#f0f1f3]" /> : <><span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.bad ? "bg-[#d97706]" : s.on ? "bg-[#16a34a]" : "bg-[#d1d5db]")} /><span className="truncate">{s.text}</span></>}
        </span>
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
    </button>
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

const field = "h-11 w-full rounded-xl border border-[#e3e4e8] bg-white px-3.5 text-[16px] text-[#111113] outline-none transition-[border-color,box-shadow] focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[14px]"
const primary = "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-medium text-white transition-opacity disabled:opacity-50"
const secondary = "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#e3e4e8] bg-white px-3.5 text-[13.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8] disabled:opacity-50"
const quiet = "inline-flex h-9 items-center gap-1 self-start rounded-lg px-1 text-[13px] font-medium text-[#4b5563] underline-offset-2 transition-colors hover:text-[#1a1a2e] hover:underline"

function ListPick({ label, lists, value, onChange, optional }: { label: string; lists: ProviderList[]; value: string | null; onChange: (id: string | null) => void; optional?: boolean }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[12.5px] font-medium text-[#374151]">{label}</p>
      {lists.length === 0 ? (
        <p className="rounded-xl bg-[#f6f6f7] p-3 text-[12.5px] text-[#6b7280]">{tt("There is none on this account yet.")}</p>
      ) : (
        <div role="listbox" aria-label={label} className="max-h-[200px] space-y-0.5 overflow-y-auto rounded-xl border border-[#e3e4e8] p-1">
          {optional ? (
            <button type="button" role="option" aria-selected={!value} onClick={() => onChange(null)} className={cn("flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13.5px]", !value ? "bg-[#f2f2f4] text-[#1a1a2e]" : "text-[#6b7280] hover:bg-[#f7f7f8]")}>
              {tt("None")}
              {!value ? <Check aria-hidden className="h-4 w-4" /> : null}
            </button>
          ) : null}
          {lists.map((l) => (
            <button key={l.id} type="button" role="option" aria-selected={value === l.id} onClick={() => onChange(l.id)} className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13.5px]", value === l.id ? "bg-[#f2f2f4] font-medium text-[#1a1a2e]" : "text-[#374151] hover:bg-[#f7f7f8]")}>
              <span className="truncate">{l.name}</span>
              {value === l.id ? <Check aria-hidden className="h-4 w-4 shrink-0" /> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** The sheet's second view: the steps, the script for Sheets, the provider's own help. */
function SetupView({ provider, onBack }: { provider: PageIntegration; onBack: () => void }) {
  const [copied, setCopied] = React.useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SHEETS_SCRIPT)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* the script is selectable too */
    }
  }
  return (
    <div className="flex flex-col gap-4" data-integration-setup={provider}>
      <button type="button" onClick={onBack} className="-ml-1.5 inline-flex h-9 items-center gap-1 self-start rounded-full pl-1 pr-3 text-[13.5px] font-medium text-[#4b5563] transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e]">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        {tt("Back")}
      </button>
      <ol className="space-y-2.5">
        {steps(provider).map((s, i) => (
          <li key={s} className="flex gap-3 text-[14px] leading-[21px] text-[#374151]">
            <span aria-hidden className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[12px] font-semibold tabular-nums text-[#1a1a2e]">{i + 1}</span>
            <span className="pt-px">{s}</span>
          </li>
        ))}
      </ol>
      {provider === "sheets" ? (
        <div className="relative rounded-xl bg-[#111113] p-3 pr-12">
          <pre className="max-h-[180px] overflow-auto whitespace-pre text-[11.5px] leading-[1.5] text-[#e5e7eb]">{SHEETS_SCRIPT}</pre>
          <button type="button" aria-label={tt("Copy the script")} onClick={copy} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20">
            {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
          </button>
        </div>
      ) : null}
      <a href={PAGE_INTEGRATION_DOCS[provider]} target="_blank" rel="noopener noreferrer" className={cn(secondary, "self-start")}>
        {tt("{name} help", { name: PAGE_INTEGRATION_NAME[provider] })}
        <ExternalLink aria-hidden className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

/** One tool's sheet: connect it, or see what it sent, check it, change its list, disconnect it. */
export function IntegrationSheet({ provider, open, onClose }: { provider: PageIntegration; open: boolean; onClose: () => void }) {
  const phone = usePhone()
  const all = usePageIntegrations()
  const view = all?.integrations.find((i) => i.provider === provider)
  const hook = isWebhookIntegration(provider)
  const keyed = hook ? null : (provider as KeyIntegration)
  const [setup, setSetup] = React.useState(false)
  const [key, setKey] = React.useState("")
  const [url, setUrl] = React.useState("")
  const [lists, setLists] = React.useState<ProviderList[] | null>(null)
  const [tags, setTags] = React.useState<ProviderList[]>([])
  const [listId, setListId] = React.useState<string | null>(null)
  const [tagId, setTagId] = React.useState<string | null>(null)
  const [doubleOptin, setDoubleOptin] = React.useState(false)
  const [tag, setTag] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const [secret, setSecret] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setSetup(false)
    setKey("")
    setUrl("")
    setLists(null)
    setError(null)
    setNote(null)
    setSecret(null)
    setListId(view?.listId ?? null)
    setTagId(view?.tagId ?? null)
    setDoubleOptin(!!view?.doubleOptin)
    setTag(view?.tag ?? "")
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

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
    return r.data
  }

  const findLists = async () => {
    const d = await run("lists", key.trim() ? { step: "lists", apiKey: key.trim() } : { step: "lists" })
    if (!d) return
    setLists(d.lists ?? [])
    setTags(d.tags ?? [])
    if (!listId && d.lists?.length === 1) setListId(d.lists[0].id)
  }

  const connect = async () => {
    const d = hook
      ? await run("connect", { step: "connect", url: url.trim() })
      : await run("connect", { step: "connect", ...(key.trim() ? { apiKey: key.trim() } : {}), listId, tagId, doubleOptin, tag: tag.trim() || null })
    if (!d) return
    setLists(null)
    setKey("")
    if (d.signingSecret) setSecret(d.signingSecret)
    setNote(hook ? tt("Connected. A test event was sent.") : tt("Connected. New signups go there now."))
  }

  const test = async () => {
    const d = await run("test", { step: "test" })
    if (d) setNote(hook ? tt("Test event sent.") : tt("The key and the list work."))
  }

  const disconnect = async () => {
    const d = await run("disconnect", { disconnect: true })
    if (d) onClose()
  }

  const name = PAGE_INTEGRATION_NAME[provider]
  const choosing = !!keyed && lists !== null
  const s = all === null ? { text: tt("Could not be checked"), on: false, bad: false } : statusLine(view)

  return (
    <SheetDialog open={open} onClose={onClose} phone={phone} label={name} onOpenAutoFocus={(e) => e.preventDefault()} className="flex flex-col gap-0 overflow-hidden rounded-[20px] border-[#ececf1] bg-white p-0 sm:max-w-[440px]">
      <div data-integration-sheet={provider} className="flex max-h-[80vh] flex-col gap-4 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pb-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-white shadow-[inset_0_0_0_1px_rgba(16,24,40,0.08)]">
            <IntegrationMark id={provider} size={21} />
          </span>
          <div className="min-w-0">
            <SheetDialogTitle className="text-[18px] font-semibold text-[#111113]">{setup ? tt("Set up {name}", { name }) : name}</SheetDialogTitle>
            {!setup ? (
              <p className="flex items-center gap-1.5 truncate text-[12.5px] text-[#6b7280]">
                <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.bad ? "bg-[#d97706]" : s.on ? "bg-[#16a34a]" : "bg-[#d1d5db]")} />
                <span className="truncate">{s.text}</span>
              </p>
            ) : null}
          </div>
        </div>

        {/* The two views share the sheet: the setup slides in over the main one, and back (a crossfade with a 6px move, compositor only). */}
        <div key={setup ? "setup" : "main"} className="flex flex-col gap-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-1.5 motion-safe:duration-200">
          {setup ? (
            <SetupView provider={provider} onBack={() => setSetup(false)} />
          ) : (
            <>
              <p className="text-[13.5px] leading-snug text-[#4b5563]" data-integration-purpose="">{purpose(provider)}</p>

              {all && all.ready === false ? <p className="rounded-xl bg-[#fff7ed] p-3 text-[13px] text-[#9a3412]">{tt("Connecting needs SQL part 315 run in Supabase first.")}</p> : null}

              {all === null ? (
                /*
                  WHAT IS CONNECTED COULD NOT BE READ. The sheet used to take that
                  for "not connected" and offer Connect: a creator who pressed it
                  replaced a working key, and for a webhook, its signing secret.
                */
                <div className="flex flex-col gap-3" data-integration-unread="">
                  <p role="alert" className="rounded-xl bg-[#fff7ed] p-3 text-[13px] leading-relaxed text-[#9a3412]">{tt("Could not check what is connected. Try again in a moment.")}</p>
                  <button type="button" className={primary} disabled={!!busy} onClick={async () => { setBusy("reload"); await reloadPageIntegrations(); setBusy(null) }}>
                    {busy === "reload" ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
                    {tt("Try again")}
                  </button>
                </div>
              ) : view?.connected && !choosing ? (
                <div className="space-y-3">
                  <dl className="divide-y divide-[#f1f2f4] rounded-xl border border-[#e8e8ec] text-[13.5px]">
                    <div className="flex justify-between gap-3 px-3.5 py-2.5">
                      <dt className="text-[#6b7280]">{hook ? tt("Address") : tt("Key")}</dt>
                      <dd className="truncate font-medium text-[#1a1a2e]">{hook ? view.hint : view.hint ? `•••• ${view.hint}` : "••••"}</dd>
                    </div>
                    {keyed ? (
                      <div className="flex justify-between gap-3 px-3.5 py-2.5">
                        <dt className="text-[#6b7280]">{listWord(keyed)}</dt>
                        <dd className="truncate font-medium text-[#1a1a2e]">{[view.listName, view.tagName].filter(Boolean).join(", ") || tt("Account only")}</dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-3 px-3.5 py-2.5">
                      <dt className="text-[#6b7280]">{tt("Sent")}</dt>
                      <dd className="font-medium tabular-nums text-[#1a1a2e]">{view.sent}{view.failed ? ` · ${tt("{count} failed", { count: view.failed })}` : ""}</dd>
                    </div>
                  </dl>
                  {secret ? (
                    <div className="space-y-1.5 rounded-xl bg-[#f6f6f7] p-3">
                      <p className="text-[12.5px] text-[#4b5563]">{tt("Signing secret, shown once.")}</p>
                      <code className="block break-all text-[12.5px] text-[#111113]">{secret}</code>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={secondary} disabled={!!busy} onClick={test}>
                      {busy === "test" ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
                      {hook ? tt("Send a test") : tt("Check it")}
                    </button>
                    {keyed ? (
                      <button type="button" className={secondary} disabled={!!busy} onClick={findLists}>
                        {busy === "lists" ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
                        {tt("Change")}
                      </button>
                    ) : null}
                    <button type="button" className={cn(secondary, "text-[#b42318]")} disabled={!!busy} onClick={disconnect}>
                      {tt("Disconnect")}
                    </button>
                  </div>
                </div>
              ) : hook ? (
                <div className="flex flex-col gap-3">
                  <input className={field} value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder={provider === "zapier" ? "https://hooks.zapier.com/hooks/catch/..." : provider === "make" ? "https://hook.eu1.make.com/..." : provider === "sheets" ? "https://script.google.com/macros/s/.../exec" : "https://"} aria-label={tt("Address")} />
                  <button type="button" className={primary} disabled={!url.trim() || !!busy} onClick={connect}>
                    {busy === "connect" ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
                    {tt("Connect")}
                  </button>
                </div>
              ) : !choosing ? (
                <div className="flex flex-col gap-3">
                  <input className={field} type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder={tt("API key")} aria-label={tt("API key")} />
                  <button type="button" className={primary} disabled={!key.trim() || !!busy} onClick={findLists}>
                    {busy === "lists" ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
                    {tt("Continue")}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <ListPick label={listWord(keyed!)} lists={lists ?? []} value={listId} onChange={setListId} optional={!needsList(keyed!)} />
                  {provider === "kit" ? <ListPick label={tt("Tag")} lists={tags} value={tagId} onChange={setTagId} optional /> : null}
                  {offersDoubleOptin(keyed!) ? (
                    <label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-[13.5px] text-[#1a1a2e]">
                      {tt("Ask them to confirm by email first")}
                      <input type="checkbox" checked={doubleOptin} onChange={(e) => setDoubleOptin(e.target.checked)} className="h-4 w-4 accent-[#1a1a2e]" />
                    </label>
                  ) : null}
                  {provider === "mailchimp" ? <input className={field} value={tag} maxLength={100} onChange={(e) => setTag(e.target.value)} placeholder={tt("Tag (optional)")} aria-label={tt("Tag")} /> : null}
                  <button type="button" className={primary} disabled={(needsList(keyed!) && !listId) || !!busy} onClick={connect}>
                    {busy === "connect" ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
                    {view?.connected ? tt("Save") : tt("Connect")}
                  </button>
                </div>
              )}

              {view?.lastError && !error ? <p className="rounded-xl bg-[#fff7ed] p-3 text-[13px] leading-relaxed text-[#9a3412]">{view.lastError}</p> : null}
              {error ? <p role="alert" className="text-[13px] leading-relaxed text-[#b42318]">{error}</p> : null}
              {note ? <p role="status" className="flex items-center gap-1.5 text-[13px] text-[#15803d]"><Check aria-hidden className="h-4 w-4" />{note}</p> : null}
              {all !== null && (!view?.connected || provider === "webhook") ? (
                <button type="button" className={quiet} onClick={() => setSetup(true)} data-integration-setup-open="">
                  {hook && provider !== "webhook" ? tt("How to get the address") : provider === "webhook" ? tt("What is sent") : tt("Where to find the key")}
                  <ChevronRight aria-hidden className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </SheetDialog>
  )
}

const listBox = "divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#e8e8ec] bg-white"

/** Under a list whose read failed: says so, and asks again. Shared with Settings › Integrations' other two lists (./settings-integrations). */
export function UnreadNote({ onRetry }: { onRetry: () => unknown }) {
  const [busy, setBusy] = React.useState(false)
  return (
    <div className="flex items-center justify-between gap-3" data-integrations-unread="">
      <p role="alert" className="min-w-0 text-[12.5px] leading-snug text-[#9a3412]">{tt("Could not check what is connected.")}</p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onRetry()
          } finally {
            setBusy(false)
          }
        }}
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f3f4f6] disabled:opacity-50"
      >
        {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
        {tt("Try again")}
      </button>
    </div>
  )
}

/**
 * UNDER AN EMAIL SIGNUP'S SETTINGS: the tools its signups go to as they
 * happen, and the one the block was added as (the Add block sheet's
 * Mailchimp, Kit, Zapier row) first, ready to connect where the block is.
 * Nothing when none is connected and none was asked for.
 */
export function SignupTools({ suggest }: { suggest?: string | null }) {
  const all = usePageIntegrations()
  const [open, setOpen] = React.useState<PageIntegration | null>(null)
  const wanted = PAGE_INTEGRATIONS.find((p) => p === suggest) ?? null
  const shown = PAGE_INTEGRATIONS.filter((p) => p === wanted || all?.integrations.some((i) => i.provider === p && i.connected))
  if (!all || shown.length === 0) return null
  return (
    <div data-signup-tools="" className="space-y-1.5">
      <p className="text-[12px] font-medium text-[#374151]">{tt("Sent as they sign up")}</p>
      <div className={listBox}>
        {shown.map((p) => (
          <IntegrationRow key={p} provider={p} view={all.integrations.find((i) => i.provider === p)} onOpen={() => setOpen(p)} />
        ))}
      </div>
      {open ? <IntegrationSheet provider={open} open={!!open} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}

/** Settings › Integrations' third part: the tools each signup is sent to as it happens. Always every row, in one order; only the status lines fill in. */
export function PageIntegrationsSection({ only }: { only?: readonly PageIntegration[] }) {
  const all = usePageIntegrations()
  const [open, setOpen] = React.useState<PageIntegration | null>(null)
  const shown = only ?? PAGE_INTEGRATIONS
  return (
    <section className="space-y-2" aria-label={tt("Sent as they sign up")} data-page-integrations="">
      <p className="text-[13px] font-medium text-[#374151]">{tt("Sent as they sign up")}</p>
      <div className={listBox} aria-busy={all === undefined}>
        {shown.map((p) => (
          <IntegrationRow key={p} provider={p} view={all?.integrations.find((i) => i.provider === p)} loading={all === undefined} unread={all === null} onOpen={() => setOpen(p)} />
        ))}
      </div>
      {all === null ? <UnreadNote onRetry={reloadPageIntegrations} /> : null}
      {open ? <IntegrationSheet provider={open} open={!!open} onClose={() => setOpen(null)} /> : null}
    </section>
  )
}
