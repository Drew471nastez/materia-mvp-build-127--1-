"use client"

/**
 * ===========================================================================
 *  THE TOOLS A ONEPAGE'S SIGNUPS GO TO, CONNECTED FROM THE PAGE ITSELF
 * ===========================================================================
 * Round 40, the owner: "Integrations, once connected, work very well with
 * the one page and send things cleanly", and "add more integrations
 * essential for a link in bio tool". Mailchimp, Kit and beehiiv by key;
 * Zapier, Make, Google Sheets and any address of the creator's own by
 * webhook. Each signup on the page is sent to each connected one as it
 * happens (lib/onepage/integrations/deliver-server), and the row says how
 * many went and the last thing that went wrong, in the provider's words.
 *
 * Drawn in the editor's Settings › Integrations (./settings-integrations)
 * and under an email signup's settings (./creator-blocks SignupDestination),
 * so the tool a block was added as can be connected where the block is.
 * Keys are typed here and sent once to /api/onepage/integrations; they never
 * come back, only their last four characters.
 */

import * as React from "react"
import { Check, ChevronRight, Copy, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { IntegrationMark } from "@/components/onepage/brand-icons"
import { PAGE_INTEGRATIONS, PAGE_INTEGRATION_DOCS, PAGE_INTEGRATION_NAME, isWebhookIntegration, type PageIntegration } from "@/lib/onepage/integrations/catalog"
import type { ProviderList } from "@/lib/onepage/integrations/providers"
import type { PageIntegrationView } from "@/lib/onepage/integrations/connect-server"

type Answer = { integrations: PageIntegrationView[]; ready: boolean }

/* One read for every row on the screen, kept until a change. */
let cached: Answer | null = null
const listeners = new Set<(a: Answer | null) => void>()
function publish(a: Answer | null) {
  cached = a
  listeners.forEach((l) => l(a))
}
async function reload(): Promise<Answer | null> {
  try {
    const r = await fetch("/api/onepage/integrations", { cache: "no-store" })
    const d = r.ok ? ((await r.json()) as Answer) : null
    publish(d)
    return d
  } catch {
    publish(null)
    return null
  }
}

export function usePageIntegrations(): Answer | null | undefined {
  const [value, setValue] = React.useState<Answer | null | undefined>(cached ?? undefined)
  React.useEffect(() => {
    const l = (a: Answer | null) => setValue(a)
    listeners.add(l)
    if (!cached) void reload()
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
  var d = JSON.parse(e.postData.contents);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) sheet.appendRow(["When", "Email", "Name", "Form", "Lead magnet", "Detail", "Page"]);
  if (d.event === "onepage.signup") sheet.appendRow([d.created_at, d.email, d.name || "", d.form, d.lead_magnet || "", d.detail || "", d.page_url || ""]);
  return ContentService.createTextOutput("ok");
}`
/* i18n-ignore-end */

function help(p: PageIntegration): string {
  switch (p) {
    case "mailchimp":
      return tt("In Mailchimp: Profile, Extras, API keys, Create A Key.")
    case "kit":
      return tt("In Kit: Settings, Developer, Add a new key (v4).")
    case "beehiiv":
      return tt("In beehiiv: Settings, API, Create new API key.")
    case "zapier":
      return tt("In Zapier, start a Zap with Webhooks by Zapier, Catch Hook, and paste its address here.")
    case "make":
      return tt("In Make, add a Webhooks module, Custom webhook, and paste its address here.")
    case "sheets":
      return tt("In your sheet: Extensions, Apps Script. Paste the script below, Deploy as a web app anyone can open, and paste its address here.")
    default:
      return tt("Each signup is sent as JSON to this address, signed in X-Storelib-Signature (HMAC SHA-256).")
  }
}

export function statusLine(v: PageIntegrationView | undefined): { text: string; on: boolean; bad: boolean } {
  if (!v?.connected) return { text: tt("Not connected"), on: false, bad: false }
  if (v.lastError) return { text: v.lastError, on: true, bad: true }
  const where = v.listName || v.hint
  if (v.sent > 0) return { text: where ? tt("{count, plural, one {# signup sent} other {# signups sent}} to {value}", { count: v.sent, value: where }) : tt("{count, plural, one {# signup sent} other {# signups sent}}", { count: v.sent }), on: true, bad: false }
  return { text: where ? tt("Connected, {value}", { value: where }) : tt("Connected"), on: true, bad: false }
}

export function IntegrationRow({ provider, view, onOpen }: { provider: PageIntegration; view: PageIntegrationView | undefined; onOpen: () => void }) {
  const s = statusLine(view)
  return (
    <button type="button" data-page-integration={provider} data-on={s.on ? "" : undefined} onClick={onOpen} className="flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors [@media(hover:hover)]:hover:bg-[#fafafb]">
      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white shadow-[inset_0_0_0_1px_rgba(16,24,40,0.08)]">
        <IntegrationMark id={provider} size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{PAGE_INTEGRATION_NAME[provider]}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-[#6b7280]">
          <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.bad ? "bg-[#d97706]" : s.on ? "bg-[#16a34a]" : "bg-[#d1d5db]")} />
          <span className="truncate">{s.text}</span>
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

/** One tool's sheet: connect it, or see what it sent, test it, change its list, disconnect it. */
export function IntegrationSheet({ provider, open, onClose }: { provider: PageIntegration; open: boolean; onClose: () => void }) {
  const phone = usePhone()
  const all = usePageIntegrations()
  const view = all?.integrations.find((i) => i.provider === provider)
  const hook = isWebhookIntegration(provider)
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
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
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
  const choosing = !hook && lists !== null
  const needsList = provider === "mailchimp" || provider === "beehiiv"

  return (
    <SheetDialog open={open} onClose={onClose} phone={phone} label={name} onOpenAutoFocus={(e) => e.preventDefault()} className="flex flex-col gap-0 overflow-hidden rounded-[20px] border-[#ececf1] bg-white p-0 sm:max-w-[460px]">
      <div data-integration-sheet={provider} className="flex max-h-[80vh] flex-col gap-4 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pb-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-white shadow-[inset_0_0_0_1px_rgba(16,24,40,0.08)]">
            <IntegrationMark id={provider} size={21} />
          </span>
          <div className="min-w-0">
            <SheetDialogTitle className="text-[18px] font-semibold text-[#111113]">{name}</SheetDialogTitle>
            <p className="truncate text-[12.5px] text-[#6b7280]">{statusLine(view).text}</p>
          </div>
        </div>

        {all && all.ready === false ? <p className="rounded-xl bg-[#fff7ed] p-3 text-[13px] text-[#9a3412]">{tt("Connecting needs SQL part 315 run in Supabase first.")}</p> : null}

        {view?.connected && !choosing ? (
          <div className="space-y-3">
            <dl className="divide-y divide-[#f1f2f4] rounded-xl border border-[#e8e8ec] text-[13.5px]">
              <div className="flex justify-between gap-3 px-3.5 py-2.5">
                <dt className="text-[#6b7280]">{hook ? tt("Address") : tt("Key")}</dt>
                <dd className="truncate font-medium text-[#1a1a2e]">{hook ? view.hint : view.hint ? `•••• ${view.hint}` : "••••"}</dd>
              </div>
              {!hook ? (
                <div className="flex justify-between gap-3 px-3.5 py-2.5">
                  <dt className="text-[#6b7280]">{provider === "kit" ? tt("Form") : provider === "beehiiv" ? tt("Publication") : tt("Audience")}</dt>
                  <dd className="truncate font-medium text-[#1a1a2e]">{[view.listName, view.tagName].filter(Boolean).join(", ") || tt("Account only")}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 px-3.5 py-2.5">
                <dt className="text-[#6b7280]">{tt("Sent")}</dt>
                <dd className="font-medium tabular-nums text-[#1a1a2e]">{view.sent}{view.failed ? ` · ${tt("{count} failed", { count: view.failed })}` : ""}</dd>
              </div>
            </dl>
            {view.lastError ? <p className="rounded-xl bg-[#fff7ed] p-3 text-[13px] leading-relaxed text-[#9a3412]">{view.lastError}</p> : null}
            {secret ? (
              <div className="space-y-1.5 rounded-xl bg-[#f6f6f7] p-3">
                <p className="text-[12.5px] text-[#4b5563]">{tt("Signing secret, shown once. Keep it to check X-Storelib-Signature.")}</p>
                <code className="block break-all text-[12.5px] text-[#111113]">{secret}</code>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondary} disabled={!!busy} onClick={test}>
                {busy === "test" ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
                {hook ? tt("Send a test") : tt("Check it")}
              </button>
              {!hook ? (
                <button type="button" className={secondary} disabled={!!busy} onClick={findLists}>
                  {busy === "lists" ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
                  {tt("Change list")}
                </button>
              ) : null}
              <button type="button" className={cn(secondary, "text-[#b42318]")} disabled={!!busy} onClick={disconnect}>
                {tt("Disconnect")}
              </button>
            </div>
          </div>
        ) : hook ? (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-[#4b5563]">{help(provider)}</p>
            {provider === "sheets" ? <ScriptBox copied={copied} onCopy={async () => { try { await navigator.clipboard.writeText(SHEETS_SCRIPT); setCopied(true); window.setTimeout(() => setCopied(false), 1500) } catch { /* the script is selectable too */ } }} /> : null}
            <input className={field} value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder={provider === "zapier" ? "https://hooks.zapier.com/hooks/catch/..." : provider === "make" ? "https://hook.eu1.make.com/..." : provider === "sheets" ? "https://script.google.com/macros/s/.../exec" : "https://"} aria-label={tt("Address")} />
            <button type="button" className={primary} disabled={!url.trim() || !!busy} onClick={connect}>
              {busy === "connect" ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
              {tt("Connect and send a test")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {!choosing ? (
              <>
                <p className="text-[13px] leading-relaxed text-[#4b5563]">
                  {help(provider)}{" "}
                  <a href={PAGE_INTEGRATION_DOCS[provider]} target="_blank" rel="noopener noreferrer" className="font-medium text-[#1a1a2e] underline underline-offset-2">{tt("Where to find it")}</a>
                </p>
                <input className={field} type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder={tt("API key")} aria-label={tt("API key")} />
                <button type="button" className={primary} disabled={!key.trim() || !!busy} onClick={findLists}>
                  {busy === "lists" ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
                  {tt("Check the key")}
                </button>
              </>
            ) : (
              <>
                <ListPick label={provider === "kit" ? tt("Add them to a form") : provider === "beehiiv" ? tt("Publication") : tt("Audience")} lists={lists ?? []} value={listId} onChange={setListId} optional={provider === "kit"} />
                {provider === "kit" ? <ListPick label={tt("And tag them")} lists={tags} value={tagId} onChange={setTagId} optional /> : null}
                {provider === "mailchimp" ? (
                  <>
                    <label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-[13.5px] text-[#1a1a2e]">
                      {tt("Ask them to confirm by email first")}
                      <input type="checkbox" checked={doubleOptin} onChange={(e) => setDoubleOptin(e.target.checked)} className="h-4 w-4 accent-[#1a1a2e]" />
                    </label>
                    <input className={field} value={tag} maxLength={100} onChange={(e) => setTag(e.target.value)} placeholder={tt("Tag (optional), like OnePage")} aria-label={tt("Tag")} />
                  </>
                ) : null}
                <button type="button" className={primary} disabled={(needsList && !listId) || !!busy} onClick={connect}>
                  {busy === "connect" ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
                  {view?.connected ? tt("Save") : tt("Connect")}
                </button>
              </>
            )}
          </div>
        )}

        {error ? <p role="alert" className="text-[13px] leading-relaxed text-[#b42318]">{error}</p> : null}
        {note ? <p role="status" className="flex items-center gap-1.5 text-[13px] text-[#15803d]"><Check aria-hidden className="h-4 w-4" />{note}</p> : null}
        <p className="text-[12px] leading-relaxed text-[#9ca3af]">{tt("Every signup also stays in Emails, Subscribers.")}</p>
      </div>
    </SheetDialog>
  )
}

function ScriptBox({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <div className="relative rounded-xl bg-[#111113] p-3 pr-12">
      <pre className="max-h-[140px] overflow-auto whitespace-pre text-[11.5px] leading-[1.5] text-[#e5e7eb]">{SHEETS_SCRIPT}</pre>
      <button type="button" aria-label={tt("Copy the script")} onClick={onCopy} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20">
        {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
      </button>
    </div>
  )
}

const listBox = "divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#e8e8ec] bg-white"

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

/** Settings › Integrations' third part: the tools each signup is sent to as it happens. */
export function PageIntegrationsSection({ only }: { only?: readonly PageIntegration[] }) {
  const all = usePageIntegrations()
  const [open, setOpen] = React.useState<PageIntegration | null>(null)
  const shown = only ?? PAGE_INTEGRATIONS
  return (
    <section className="space-y-2" aria-label={tt("Sent as they sign up")} data-page-integrations="">
      <p className="text-[13px] font-medium text-[#374151]">{tt("Sent as they sign up")}</p>
      <p className="text-[12.5px] leading-snug text-[#6b7280]">{tt("Each signup on your page goes to these the moment it happens.")}</p>
      {all === undefined ? (
        <div aria-hidden className="h-[168px] animate-pulse rounded-xl bg-[#f4f4f6]" />
      ) : (
        <div className={listBox}>
          {shown.map((p) => (
            <IntegrationRow key={p} provider={p} view={all?.integrations.find((i) => i.provider === p)} onOpen={() => setOpen(p)} />
          ))}
        </div>
      )}
      {open ? <IntegrationSheet provider={open} open={!!open} onClose={() => setOpen(null)} /> : null}
    </section>
  )
}
