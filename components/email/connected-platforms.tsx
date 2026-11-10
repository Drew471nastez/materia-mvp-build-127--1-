"use client"

/**
 * ===========================================================================
 *  EMAILS › SETTINGS: EMAIL PLATFORMS AND THE SENDING DOMAIN
 * ===========================================================================
 * The email tools a store already uses, kept in step with Storelib, and the
 * domain its emails are sent from. Two cards, Storelib's own (the card,
 * badge and button of Orders and Coupons, app/app/orders/order-parts):
 *
 *   Email platforms   Klaviyo, Omnisend, Brevo, MailerLite and Kit, a row
 *                     each: its mark, its name, where it stands, and a badge
 *                     (Connected, Needs attention) or Connect. A row opens in
 *                     place, its height eased over 150ms, to the same sync
 *                     card Settings › Integrations shows (components/app/
 *                     settings/marketing-sync-panel). A panel opened once
 *                     stays mounted, so closing and opening again never
 *                     blanks or reloads it.
 *   Sending domain    the store's own domain (lib/emails/sending-domain), in
 *                     steps: 1 the domain and the address to send as (a root
 *                     domain is offered mail.<domain> instead), 2 the DNS
 *                     records, each part copyable, 3 Check DNS. While it
 *                     waits it is checked again by itself every 30 seconds
 *                     for ten minutes (and by the cron after that, lib/
 *                     emails/sending-domain-server recheckSendingDomains), so
 *                     nobody has to sit and press. Verified: one line says
 *                     what mail comes from, the records fold away.
 *
 * Nothing here is a key: the server answers last four characters and DNS
 * records only.
 */
import * as React from "react"
import { Check, ChevronDown, Copy, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { Field, Notice, TextInput, api, dateTime } from "@/components/physical/ui"
import { IntegrationMark } from "@/components/onepage/brand-icons"
import { ShimmerBlock } from "@/components/ui/shimmer"
import { MARKETING_NAME, MARKETING_PROVIDER_IDS, MarketingSyncPanel, type MarketingProviderId, type MarketingState } from "@/components/app/settings/marketing-sync-panel"
import { domainProblem, fromLocalProblem, hostOf, isRootDomain, type SendingDomainView, type SendingRecord } from "@/lib/emails/sending-domain"
import { StatusBadge, buttonPrimary, buttonSecondary, card } from "@/app/(storelib)/app/orders/order-parts"

export const SENDING_DOMAIN_PATH = "/api/email/sending-domain"

export interface SendingDomainData {
  domain: SendingDomainView | null
  ready: boolean
  available: boolean
}

export interface PlatformsData {
  marketing: MarketingState[]
  sending: SendingDomainData
}

/** The line under a platform's name: where it stands, in a few words. */
export function platformLine(s: MarketingState | undefined): { text: string; tone: "ok" | "warn" | "off" } {
  if (!s?.connected) return { text: tt("Not connected"), tone: "off" }
  if (s.lastError) return { text: s.lastError, tone: "warn" }
  const who = s.account ? `${s.account} · ` : ""
  return { text: s.lastSyncAt ? `${who}${tt("Last sync {date}", { date: dateTime(s.lastSyncAt) })}` : `${who}${tt("Not synced yet")}`, tone: "ok" }
}

/** 44px to tap on a phone, the button inside it (Orders' Export). */
const TAP = "relative before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] sm:before:hidden"
/** A phone's buttons are 40px; from sm up the list's 32px. */
const BIG = "max-sm:h-10 max-sm:px-4 max-sm:text-[14px]"
const LINK = "font-medium text-[#1a1a2e] underline decoration-[#d1d5db] underline-offset-2 outline-none hover:decoration-[#1a1a2e] focus-visible:decoration-[#1a1a2e]"

/**
 * A part that opens in place: its height eased from nothing to its content
 * (grid rows 0fr to 1fr) in 150ms, never a jump, and nothing at all with
 * reduced motion. Its content is mounted the first time it opens and kept.
 */
function Unfold({ open, id, children }: { open: boolean; id?: string; children: React.ReactNode }) {
  const [ever, setEver] = React.useState(open)
  if (open && !ever) setEver(true)
  return (
    <div id={id} className="grid transition-[grid-template-rows] duration-150 ease-out motion-reduce:transition-none" style={{ gridTemplateRows: open ? "1fr" : "0fr" }} aria-hidden={!open} inert={!open || undefined}>
      <div className="min-h-0 overflow-hidden">{ever ? children : null}</div>
    </div>
  )
}

export function ConnectedPlatforms({ data, onChange }: { data: PlatformsData | null; onChange?: (next: PlatformsData) => void }) {
  const [marketing, setMarketing] = React.useState<MarketingState[] | null>(data?.marketing ?? null)
  const [sending, setSending] = React.useState<SendingDomainData | null>(data?.sending ?? null)
  const [open, setOpen] = React.useState<MarketingProviderId | null>(null)
  React.useEffect(() => {
    if (data) {
      setMarketing(data.marketing)
      setSending(data.sending)
    }
  }, [data])
  const tell = React.useCallback(
    (m: MarketingState[] | null, s: SendingDomainData | null) => {
      if (m && s) onChange?.({ marketing: m, sending: s })
    },
    [onChange],
  )
  const onMarketing = React.useCallback(
    (next: MarketingState[]) => {
      setMarketing(next)
      tell(next, sending)
    },
    [sending, tell],
  )

  return (
    <div className="space-y-4" data-connected-platforms="">
      <section className={cn(card, "overflow-hidden")} aria-labelledby="email-platforms-title" data-email-platforms="">
        <div className="px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
          <h2 id="email-platforms-title" className="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">
            {tt("Email platforms")}
          </h2>
          <p className="mt-0.5 text-[13.5px] leading-5 text-[#6b7280]">{tt("New subscribers go there within a minute. Unsubscribes go both ways.")}</p>
        </div>
        <ul className="divide-y divide-[#f1f2f4] border-t border-[#f1f2f4]">
          {MARKETING_PROVIDER_IDS.map((id) => {
            const s = marketing?.find((m) => m.provider === id)
            const line = platformLine(s)
            const isOpen = open === id
            return (
              <li key={id} data-platform={id} data-platform-connected={s?.connected ? "" : undefined} data-platform-open={isOpen ? "" : undefined}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`platform-${id}`}
                  onClick={() => setOpen(isOpen ? null : id)}
                  className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors duration-100 hover:bg-[#fafbfb] focus-visible:bg-[#f8f9fa] active:bg-[#f4f5f7] sm:px-6 [-webkit-tap-highlight-color:transparent]"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border border-[#eef0f2] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                    <IntegrationMark id={id} size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-5 text-[#1a1a2e]">{MARKETING_NAME[id]}</span>
                    {marketing === null ? (
                      <ShimmerBlock className="shimmer-wait mt-1.5 h-3 w-32 rounded-full" />
                    ) : (
                      <span className={cn("mt-0.5 block truncate text-[13px] leading-5", line.tone === "warn" ? "text-[#8a1c0f]" : "text-[#6b7280]")} data-platform-line="">
                        {line.text}
                      </span>
                    )}
                  </span>
                  {marketing === null ? null : s?.connected ? (
                    <StatusBadge tone={s.lastError ? "attention" : "success"} className="shrink-0 max-[359px]:hidden">
                      {s.lastError ? tt("Needs attention") : tt("Connected")}
                    </StatusBadge>
                  ) : (
                    <span className={cn(buttonSecondary, "pointer-events-none shrink-0 transition-opacity duration-100 max-[359px]:hidden", isOpen && "opacity-0")} aria-hidden data-platform-connect="">
                      {tt("Connect")}
                    </span>
                  )}
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-150 motion-reduce:transition-none", isOpen && "rotate-180")} aria-hidden />
                </button>
                <Unfold open={isOpen} id={`platform-${id}`}>
                  <div className="px-4 pb-5 pt-1 sm:px-6 md:pl-[76px]">
                    <MarketingSyncPanel provider={id} onChanged={onMarketing} />
                  </div>
                </Unfold>
              </li>
            )
          })}
        </ul>
      </section>
      <SendingDomain
        data={sending}
        onChange={(next) => {
          setSending(next)
          tell(marketing, next)
        }}
      />
    </div>
  )
}

/* ─── The sending domain ─────────────────────────────────────────────── */

const KIND_LABEL: Record<SendingRecord["kind"], () => string> = {
  spf: () => "SPF",
  dkim: () => "DKIM",
  tracking: () => tt("Tracking"),
  dmarc: () => "DMARC",
}

/** Where a record stands, as a badge: found, still missing (needed), or recommended. */
export function recordState(r: SendingRecord): { text: string; tone: "success" | "attention" | "neutral" } {
  if (r.valid === true) return { text: tt("Found"), tone: "success" }
  const optional = r.kind === "dmarc" || r.kind === "tracking"
  if (optional) return { text: tt("Recommended"), tone: "neutral" }
  return r.valid === false ? { text: tt("Not found yet"), tone: "attention" } : { text: tt("Not checked yet"), tone: "neutral" }
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<number | undefined>(undefined)
  React.useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => setCopied(false), 1400)
        })
      }}
      className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#6b7280] outline-none transition-colors duration-100 before:absolute before:-inset-1 before:content-[''] hover:bg-[#eceef1] hover:text-[#1a1a2e] focus-visible:bg-[#eceef1] sm:before:hidden [-webkit-tap-highlight-color:transparent]"
      aria-label={copied ? tt("Copied") : label}
      title={copied ? tt("Copied") : label}
      data-copy=""
    >
      {copied ? <Check className="h-4 w-4 text-[#067647]" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
    </button>
  )
}

/** One part of a record (its name or its value) on a light grey well, with a copy button. */
function RecordPart({ label, value, hint, copyLabel }: { label: string; value: string; hint?: string | null; copyLabel: string }) {
  return (
    <div className="flex min-w-0 items-start gap-1 rounded-lg bg-[#f6f7f8] py-0.5 pl-3">
      <span className="w-12 shrink-0 pt-[9px] text-[12px] text-[#6b7280]">{label}</span>
      <span className="min-w-0 flex-1 py-2">
        <code className="block break-all font-mono text-[12.5px] leading-[18px] text-[#1a1a2e]">{value}</code>
        {hint ? <span className="mt-0.5 block text-[12px] leading-4 text-[#6b7280]">{hint}</span> : null}
      </span>
      <CopyValue value={value} label={copyLabel} />
    </div>
  )
}

function Records({ d }: { d: SendingDomainView }) {
  return (
    <ul className="space-y-3" data-sending-records="">
      {d.records.map((r) => {
        const st = recordState(r)
        const host = hostOf(r.name, d.domain)
        return (
          <li key={`${r.kind}:${r.name}`} className="rounded-xl border border-[#eef0f2] p-3" data-record={r.kind} data-record-valid={r.valid === true ? "yes" : r.valid === false ? "no" : "unknown"}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[13.5px] font-semibold text-[#1a1a2e]">
                {KIND_LABEL[r.kind]()} <span className="font-normal text-[#6b7280]">· {r.type}</span>
              </span>
              <StatusBadge tone={st.tone}>{st.text}</StatusBadge>
            </div>
            <div className="grid gap-1.5">
              <RecordPart label={tt("Name")} value={r.name} hint={host !== r.name ? tt("Some DNS providers only want {host}", { host }) : null} copyLabel={tt("Copy name")} />
              <RecordPart label={tt("Value")} value={r.value} copyLabel={tt("Copy value")} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** A numbered step: the number in a circle (a check once done), a title, and what to do. */
function Step({ n, done, title, children }: { n: number; done?: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3" data-step={n} data-step-done={done ? "" : undefined}>
      <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums", done ? "bg-[#e3f5e9] text-[#14532d]" : "bg-[#1a1a2e] text-white")} aria-hidden>
        {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold leading-6 text-[#1a1a2e]">{title}</p>
        {/* On a phone the step's content takes the card's whole width, under its number too. */}
        {children ? <div className="mt-2 max-sm:-ml-9">{children}</div> : null}
      </div>
    </li>
  )
}

/** Checked again by itself while waiting: every 30 seconds for ten minutes, while the page is in view. */
const POLL_MS = 30_000
const POLL_TIMES = 20

function SendingDomain({ data, onChange }: { data: SendingDomainData | null; onChange: (next: SendingDomainData) => void }) {
  const [domain, setDomain] = React.useState("")
  const [local, setLocal] = React.useState("hello")
  const [editLocal, setEditLocal] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<null | "add" | "verify" | "from" | "remove">(null)
  const [quiet, setQuiet] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmOff, setConfirmOff] = React.useState(false)
  const [showRecords, setShowRecords] = React.useState(false)
  const d = data?.domain ?? null
  const waiting = !!d && d.status !== "verified"

  const send = React.useCallback(
    async (body: Record<string, unknown>, step: "add" | "verify" | "from" | "remove", opts: { silent?: boolean } = {}) => {
      if (opts.silent) setQuiet(true)
      else {
        setBusy(step)
        setError(null)
      }
      const r = await api<SendingDomainData>(SENDING_DOMAIN_PATH, { method: "POST", body })
      if (opts.silent) setQuiet(false)
      else setBusy(null)
      if (!r.ok) {
        if (!opts.silent) setError(r.error)
        return false
      }
      onChange(r.data)
      return true
    },
    [onChange],
  )

  /* Waiting for DNS: asked again by itself, quietly, while the page is in view. */
  const polls = React.useRef(0)
  React.useEffect(() => {
    if (!waiting) {
      polls.current = 0
      return
    }
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible" || polls.current >= POLL_TIMES) return
      polls.current += 1
      void send({ action: "verify" }, "verify", { silent: true })
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [waiting, send])

  /* What the add form would make, worked out as it is typed (the server checks the same way). */
  const typed = domain.trim()
  const shaped = typed ? domainProblem(typed) : null
  const cleanDomain = shaped && "domain" in shaped ? shaped.domain : ""
  const localShaped = fromLocalProblem(local)
  const suggest = cleanDomain && isRootDomain(cleanDomain) ? `mail.${cleanDomain}` : null
  const preview = `${"local" in localShaped ? localShaped.local : local.trim() || "hello"}@${cleanDomain || "mail.yourshop.com"}`
  const add = () => {
    if (!typed) return setError(tt("Add the domain you send from, like mail.yourshop.com."))
    if (shaped && "error" in shaped) return setError(shaped.error)
    if ("error" in localShaped) return setError(localShaped.error)
    void send({ action: "add", domain: cleanDomain, fromLocal: local.trim() }, "add")
  }

  const badge = d ? (
    d.status === "verified" ? (
      <StatusBadge tone="success">{tt("Verified")}</StatusBadge>
    ) : d.status === "failed" ? (
      <StatusBadge tone="critical">{tt("Records missing")}</StatusBadge>
    ) : (
      <StatusBadge tone="attention">{tt("Waiting for DNS")}</StatusBadge>
    )
  ) : null

  const fromLine = !d ? null : editLocal === null ? (
    <p className="min-w-0 break-all text-[14px] leading-6 text-[#1a1a2e]" data-sending-from="">
      <span className="text-[#6b7280]">{d.status === "verified" ? tt("Sending from") : tt("Will send from")} </span>
      <span className="font-semibold">{d.fromAddress}</span>
      <button type="button" className={cn(LINK, "ml-2 text-[13px]")} onClick={() => setEditLocal(d.fromLocal)} data-sending-change="">
        {tt("Change")}
      </button>
    </p>
  ) : (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <TextInput aria-label={tt("Send as")} value={editLocal} onChange={(e) => setEditLocal(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} className="min-w-0 flex-1" autoFocus />
        <span className="min-w-0 max-w-[55%] truncate text-[14px] text-[#6b7280]">@{d.domain}</span>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className={cn(buttonSecondary, BIG)} disabled={!!busy} onClick={() => setEditLocal(null)}>
          {tt("Cancel")}
        </button>
        <button type="button" className={cn(buttonPrimary, BIG)} disabled={!!busy || !editLocal.trim()} onClick={() => void send({ action: "from", fromLocal: editLocal.trim() }, "from").then((ok) => ok && setEditLocal(null))}>
          {busy === "from" ? tt("Saving") : tt("Save")}
        </button>
      </div>
    </div>
  )

  const removeRow = d ? (
    <div className="flex min-h-10 flex-wrap items-center justify-end gap-2 border-t border-[#f1f2f4] pt-4">
      {confirmOff ? (
        <>
          <span className="mr-auto text-[13px] leading-5 text-[#6b7280]">{tt("Remove {domain}? Emails go out from Storelib's address again.", { domain: d.domain })}</span>
          <button type="button" className={cn(buttonSecondary, BIG)} disabled={!!busy} onClick={() => setConfirmOff(false)}>
            {tt("Keep")}
          </button>
          <button type="button" className={cn(buttonSecondary, BIG, "border-[#f3c4bd] text-[#b42318] hover:bg-[#fef2f2]")} disabled={!!busy} onClick={() => void send({ action: "remove" }, "remove").then(() => setConfirmOff(false))} data-sending-remove-confirm="">
            {busy === "remove" ? tt("Removing") : tt("Remove")}
          </button>
        </>
      ) : (
        <button type="button" className={cn(buttonSecondary, BIG, "mr-auto border-transparent text-[#b42318] shadow-none hover:bg-[#fef2f2]")} disabled={!!busy} onClick={() => setConfirmOff(true)} data-sending-remove="">
          {tt("Remove domain")}
        </button>
      )}
    </div>
  ) : null

  return (
    <section className={cn(card, "px-4 py-4 sm:px-6 sm:py-5")} aria-labelledby="sending-domain-title" data-sending-domain={d?.status ?? "none"}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="sending-domain-title" className="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">
          {tt("Sending domain")}
        </h2>
        {badge}
      </div>
      <p className="mt-0.5 text-[13.5px] leading-5 text-[#6b7280]">{tt("Your campaigns, automations and buyer emails come from your address instead of Storelib's.")}</p>

      {!data ? (
        <div className="mt-4 space-y-2" aria-hidden>
          <ShimmerBlock className="shimmer-wait h-10 w-full rounded-lg" />
          <ShimmerBlock className="shimmer-wait h-10 w-2/3 rounded-lg" />
        </div>
      ) : !data.ready ? (
        <Notice tone="amber" className="mt-4">
          {tt("Your own sending domain needs its database update (SQL part 341).")}
        </Notice>
      ) : !data.available ? (
        <Notice tone="gray" className="mt-4">
          {tt("Sending from your own domain is not set up on this server yet.")}
        </Notice>
      ) : !d ? (
        /* 1 the domain and the address; the records come after Add. */
        <ol className="mt-4 space-y-4" data-sending-steps="add">
          <Step n={1} title={tt("Your domain")}>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                add()
              }}
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <Field label={tt("Domain")} htmlFor="sending-domain">
                  <TextInput
                    id="sending-domain"
                    value={domain}
                    onChange={(e) => {
                      setDomain(e.target.value)
                      if (error) setError(null)
                    }}
                    placeholder="mail.yourshop.com"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    inputMode="url"
                    enterKeyHint="go"
                  />
                </Field>
                <Field label={tt("Send as")} htmlFor="sending-local">
                  <TextInput id="sending-local" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="hello" autoComplete="off" autoCapitalize="none" spellCheck={false} />
                </Field>
              </div>
              {suggest ? (
                <div className="flex flex-col gap-2 rounded-xl bg-[#f6f7f8] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between" data-sending-suggest="">
                  <p className="text-[13px] leading-5 text-[#374151]">{tt("Use a subdomain like {suggest}, so the mail you already get at {domain} is never touched.", { suggest, domain: cleanDomain })}</p>
                  <button type="button" className={cn(buttonSecondary, BIG, "shrink-0 self-start sm:self-auto")} onClick={() => setDomain(suggest)} data-sending-use-suggest="">
                    {tt("Use {suggest}", { suggest })}
                  </button>
                </div>
              ) : null}
              <p className="min-w-0 break-all text-[13px] leading-5 text-[#6b7280]" data-sending-preview="">
                {tt("Emails will come from")} <span className="font-medium text-[#1a1a2e]">{preview}</span>
              </p>
              {error ? <Notice>{error}</Notice> : null}
              <div className="flex justify-end">
                <button type="submit" className={cn(buttonPrimary, BIG, TAP)} disabled={!!busy || typed.length < 4} data-sending-add="">
                  {busy === "add" ? tt("Adding") : tt("Add domain")}
                </button>
              </div>
            </form>
          </Step>
          <Step n={2} title={tt("Add the DNS records")} />
        </ol>
      ) : d.status === "verified" ? (
        <div className="mt-4 space-y-4" data-sending-steps="verified">
          <div className="flex items-start gap-3 rounded-xl bg-[#f3faf5] px-3.5 py-3">
            <span className="mt-[3px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#12b76a] text-white" aria-hidden>
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <div className="min-w-0 flex-1">{fromLine}</div>
          </div>
          {error ? <Notice>{error}</Notice> : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className={cn(buttonSecondary, BIG)} aria-expanded={showRecords} aria-controls="sending-records" onClick={() => setShowRecords((v) => !v)} data-sending-show-records="">
              {tt("DNS records")}
              <ChevronDown className={cn("h-4 w-4 text-[#6b7280] transition-transform duration-150 motion-reduce:transition-none", showRecords && "rotate-180")} aria-hidden />
            </button>
            <button type="button" className={cn(buttonSecondary, BIG)} disabled={!!busy} onClick={() => void send({ action: "verify" }, "verify")} data-sending-verify="">
              <RefreshCw className={cn("h-3.5 w-3.5", busy === "verify" && "animate-spin")} aria-hidden />
              {busy === "verify" ? tt("Checking") : tt("Check again")}
            </button>
          </div>
          <Unfold open={showRecords} id="sending-records">
            <div className="pt-1">
              <Records d={d} />
            </div>
          </Unfold>
          {removeRow}
        </div>
      ) : (
        <div className="mt-4 space-y-4" data-sending-steps="dns">
          <ol className="space-y-5">
            <Step n={1} done title={tt("Your domain")}>
              {fromLine}
              <p className="mt-1 text-[13px] leading-5 text-[#6b7280]">{tt("Until it is verified, emails keep coming from Storelib's address.")}</p>
            </Step>
            <Step n={2} title={tt("Add the DNS records")}>
              <p className="mb-3 text-[13.5px] leading-5 text-[#374151]">{tt("Where your domain's DNS is kept (your registrar, Cloudflare or your host), add each record below. Copy the name and the value exactly.")}</p>
              {isRootDomain(d.domain) ? (
                <Notice tone="gray" className="mb-3">
                  {tt("{domain} may already have an SPF record. Add include:mailgun.org to that one rather than making a second.", { domain: d.domain })}
                </Notice>
              ) : null}
              <Records d={d} />
            </Step>
            <Step n={3} title={tt("Check DNS")}>
              <p className="text-[13.5px] leading-5 text-[#374151]">{tt("Records usually show within an hour, sometimes up to a day. Storelib checks again on its own, so you can leave this page.")}</p>
              {d.lastError ? (
                <Notice tone="amber" className="mt-3">
                  {d.lastError}
                </Notice>
              ) : null}
              {error ? <Notice className="mt-3">{error}</Notice> : null}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <p className="text-[13px] text-[#6b7280]" aria-live="polite" data-sending-checked="">
                  {quiet || busy === "verify" ? tt("Checking…") : d.lastCheckedAt ? tt("Checked {date}", { date: dateTime(d.lastCheckedAt) }) : tt("Not checked yet")}
                </p>
                <button type="button" className={cn(buttonPrimary, BIG, TAP)} disabled={!!busy} onClick={() => void send({ action: "verify" }, "verify")} data-sending-verify="">
                  <RefreshCw className={cn("h-3.5 w-3.5", busy === "verify" && "animate-spin")} aria-hidden />
                  {busy === "verify" ? tt("Checking") : tt("Check DNS")}
                </button>
              </div>
            </Step>
          </ol>
          {removeRow}
        </div>
      )}
    </section>
  )
}
