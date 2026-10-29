"use client"

/**
 * ===========================================================================
 *  EMAILS › PLATFORMS
 * ===========================================================================
 * The email tools a store already uses, kept in step with Storelib, and the
 * domain its emails are sent from. Two parts, one card (the tab's own,
 * app/app/emails/emails-home.tsx):
 *
 *   Email platforms   Klaviyo, Omnisend, Brevo, MailerLite and Kit, a row
 *                     each: its mark, its name, where it stands (connected,
 *                     when it last synced, what went wrong). A row opens in
 *                     place to the same sync card Settings › Integrations
 *                     shows (components/app/settings/marketing-sync-panel).
 *   Sending domain    the store's own domain (lib/emails/sending-domain):
 *                     add it, put the records in its DNS, Check DNS, and
 *                     campaigns, automations and buyer emails go From it.
 *
 * One row open at a time, so a phone never holds two forms. Nothing here is
 * a key: the server answers last four characters and DNS records only.
 */
import * as React from "react"
import { Check, ChevronDown, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Field, Notice, TextInput, api, dateTime } from "@/components/physical/ui"
import { IntegrationMark } from "@/components/onepage/brand-icons"
import { ShimmerBlock } from "@/components/ui/shimmer"
import { MARKETING_NAME, MARKETING_PROVIDER_IDS, MarketingSyncPanel, type MarketingProviderId, type MarketingState } from "@/components/app/settings/marketing-sync-panel"
import { isRootDomain, type SendingDomainView, type SendingRecord } from "@/lib/emails/sending-domain"

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
    <div data-connected-platforms="">
      <div className="px-4 pb-2 pt-4 sm:px-6 sm:pt-5">
        <h2 className="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">{tt("Email platforms")}</h2>
        <p className="mt-0.5 text-[13.5px] leading-5 text-[#6b7280]">{tt("New subscribers go there within a minute. Unsubscribes go both ways.")}</p>
      </div>
      <ul className="divide-y divide-[#f1f2f4] border-y border-[#f1f2f4]">
        {MARKETING_PROVIDER_IDS.map((id) => {
          const s = marketing?.find((m) => m.provider === id)
          const line = platformLine(s)
          const isOpen = open === id
          return (
            <li key={id} data-platform={id} data-platform-connected={s?.connected ? "" : undefined}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`platform-${id}`}
                onClick={() => setOpen(isOpen ? null : id)}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors duration-75 hover:bg-[#fafbfb] focus-visible:bg-[#f8f9fa] active:bg-[#f4f5f7] sm:px-6 [-webkit-tap-highlight-color:transparent]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[#eef0f2] bg-white">
                  <IntegrationMark id={id} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-5 text-[#1a1a2e]">{MARKETING_NAME[id]}</span>
                  {marketing === null ? (
                    <ShimmerBlock className="shimmer-wait mt-1.5 h-3 w-32 rounded-full" />
                  ) : (
                    <span className={cn("mt-0.5 block truncate text-[13.5px] leading-5", line.tone === "warn" ? "text-[#b42318]" : line.tone === "ok" ? "text-[#374151]" : "text-[#6b7280]")} data-platform-line="">
                      {line.tone === "ok" ? <span className="mr-1.5 inline-block h-1.5 w-1.5 -translate-y-[2px] rounded-full bg-[#12b76a]" aria-hidden /> : null}
                      {line.text}
                    </span>
                  )}
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-150", isOpen && "rotate-180")} aria-hidden />
              </button>
              {isOpen ? (
                <div id={`platform-${id}`} className="px-4 pb-5 pt-1 sm:px-6">
                  <MarketingSyncPanel provider={id} onChanged={onMarketing} />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
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

function recordState(r: SendingRecord): { text: string; tone: "ok" | "warn" | "off" } {
  if (r.valid === true) return { text: tt("Found"), tone: "ok" }
  if (r.valid === false) return { text: r.kind === "dmarc" ? tt("Not found. Recommended") : tt("Not found yet"), tone: r.kind === "dmarc" || r.kind === "tracking" ? "off" : "warn" }
  return { text: tt("Not checked yet"), tone: "off" }
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1400)
        })
      }}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#6b7280] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent]"
      aria-label={copied ? tt("Copied") : label}
    >
      {copied ? <Check className="h-4 w-4 text-[#067647]" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
    </button>
  )
}

function SendingDomain({ data, onChange }: { data: SendingDomainData | null; onChange: (next: SendingDomainData) => void }) {
  const [domain, setDomain] = React.useState("")
  const [local, setLocal] = React.useState("hello")
  const [editLocal, setEditLocal] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<null | "add" | "verify" | "from" | "remove">(null)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmOff, setConfirmOff] = React.useState(false)
  const d = data?.domain ?? null

  const send = async (body: Record<string, unknown>, step: NonNullable<typeof busy>) => {
    setBusy(step)
    setError(null)
    const r = await api<SendingDomainData>(SENDING_DOMAIN_PATH, { method: "POST", body })
    setBusy(null)
    if (!r.ok) {
      setError(r.error)
      return false
    }
    onChange(r.data)
    return true
  }

  const statusText = d ? (d.status === "verified" ? tt("Verified") : d.status === "failed" ? tt("Records missing") : tt("Waiting for DNS")) : ""
  return (
    <section className="px-4 py-4 sm:px-6 sm:py-5" aria-labelledby="sending-domain-title" data-sending-domain={d?.status ?? "none"}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="sending-domain-title" className="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">
          {tt("Sending domain")}
        </h2>
        {d ? <span className={cn("text-[13.5px] font-medium", d.status === "verified" ? "text-[#067647]" : "text-[#b54708]")}>{statusText}</span> : null}
      </div>

      {!data ? null : !data.ready ? (
        <Notice tone="amber" className="mt-3">{tt("Your own sending domain needs its database update (SQL part 341).")}</Notice>
      ) : !data.available ? (
        <Notice tone="gray" className="mt-3">{tt("Sending from your own domain is not set up on this server yet.")}</Notice>
      ) : !d ? (
        <div className="mt-1 space-y-3">
          <p className="text-[13.5px] leading-5 text-[#6b7280]">{tt("Your campaigns, automations and buyer emails come from your address instead of Storelib's.")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tt("Domain")} htmlFor="sending-domain" hint={tt("A subdomain like mail.yourshop.com keeps this apart from your inbox.")}>
              <TextInput id="sending-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="mail.yourshop.com" autoComplete="off" autoCapitalize="none" spellCheck={false} inputMode="url" />
            </Field>
            <Field label={tt("Send as")} htmlFor="sending-local">
              <div className="flex min-w-0 items-center gap-2">
                <TextInput id="sending-local" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="hello" autoComplete="off" autoCapitalize="none" spellCheck={false} className="min-w-0 flex-1" />
                <span className="min-w-0 max-w-[55%] truncate text-[14px] text-[#6b7280]">@{domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || "mail.yourshop.com"}</span>
              </div>
            </Field>
          </div>
          {error ? <Notice>{error}</Notice> : null}
          <div className="flex justify-end">
            <button type="button" className={BTN_PRIMARY} disabled={!!busy || domain.trim().length < 4} onClick={() => void send({ action: "add", domain: domain.trim(), fromLocal: local.trim() }, "add")} data-sending-add="">
              {busy === "add" ? tt("Adding") : tt("Add domain")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {editLocal === null ? (
              <p className="min-w-0 break-all text-[14px] text-[#1a1a2e]">
                <span className="text-[#6b7280]">{tt("From")} </span>
                <span className="font-semibold">{d.fromAddress}</span>
                <button type="button" className="ml-2 text-[13.5px] font-medium text-[#7c3aed] outline-none hover:underline focus-visible:underline" onClick={() => setEditLocal(d.fromLocal)}>
                  {tt("Change")}
                </button>
              </p>
            ) : (
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <TextInput aria-label={tt("Send as")} value={editLocal} onChange={(e) => setEditLocal(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} className="min-w-0 flex-1" />
                  <span className="min-w-0 truncate text-[14px] text-[#6b7280]">@{d.domain}</span>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className={BTN_SECONDARY} disabled={!!busy} onClick={() => setEditLocal(null)}>
                    {tt("Cancel")}
                  </button>
                  <button type="button" className={BTN_PRIMARY} disabled={!!busy || !editLocal.trim()} onClick={() => void send({ action: "from", fromLocal: editLocal.trim() }, "from").then((ok) => ok && setEditLocal(null))}>
                    {busy === "from" ? tt("Saving") : tt("Save")}
                  </button>
                </div>
              </div>
            )}
          </div>
          {d.status !== "verified" ? (
            <p className="text-[13.5px] leading-5 text-[#374151]">
              {tt("Add these records where your domain's DNS is kept, then press Check DNS. Until it is verified, emails keep coming from Storelib's address.")}
            </p>
          ) : null}
          {isRootDomain(d.domain) && d.status !== "verified" ? (
            <Notice tone="gray">{tt("{domain} may already have an SPF record. Add include:mailgun.org to that one rather than making a second.", { domain: d.domain })}</Notice>
          ) : null}
          <ul className="divide-y divide-[#f1f2f4] border-y border-[#f1f2f4]" data-sending-records="">
            {d.records.map((r) => {
              const st = recordState(r)
              return (
                <li key={`${r.kind}:${r.name}`} className="py-3" data-record={r.kind} data-record-valid={r.valid === true ? "yes" : r.valid === false ? "no" : "unknown"}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13.5px] font-semibold text-[#1a1a2e]">
                      {KIND_LABEL[r.kind]()} <span className="font-normal text-[#6b7280]">· {r.type}</span>
                    </span>
                    <span className={cn("shrink-0 text-[13px] font-medium", st.tone === "ok" ? "text-[#067647]" : st.tone === "warn" ? "text-[#b54708]" : "text-[#6b7280]")}>{st.text}</span>
                  </div>
                  <div className="mt-1.5 grid gap-1">
                    <div className="flex min-w-0 items-center gap-1 rounded-lg bg-[#f8f9fa] pl-3">
                      <span className="w-12 shrink-0 text-[12px] text-[#6b7280]">{tt("Name")}</span>
                      <code className="min-w-0 flex-1 break-all py-2 font-mono text-[12.5px] leading-[18px] text-[#1a1a2e]">{r.name}</code>
                      <CopyValue value={r.name} label={tt("Copy name")} />
                    </div>
                    <div className="flex min-w-0 items-center gap-1 rounded-lg bg-[#f8f9fa] pl-3">
                      <span className="w-12 shrink-0 text-[12px] text-[#6b7280]">{tt("Value")}</span>
                      <code className="min-w-0 flex-1 break-all py-2 font-mono text-[12.5px] leading-[18px] text-[#1a1a2e]">{r.value}</code>
                      <CopyValue value={r.value} label={tt("Copy value")} />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="text-[13px] text-[#6b7280]">{d.lastCheckedAt ? tt("Checked {date}", { date: dateTime(d.lastCheckedAt) }) : tt("Not checked yet")}</p>
          {d.lastError && d.status !== "verified" ? <Notice tone="amber">{d.lastError}</Notice> : null}
          {error ? <Notice>{error}</Notice> : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {confirmOff ? (
              <>
                <span className="mr-auto text-[13px] text-[#6b7280]">{tt("Remove {domain}? Emails go out from Storelib's address again.", { domain: d.domain })}</span>
                <button type="button" className={BTN_SECONDARY} disabled={!!busy} onClick={() => setConfirmOff(false)}>
                  {tt("Keep")}
                </button>
                <button type="button" className={BTN_DANGER} disabled={!!busy} onClick={() => void send({ action: "remove" }, "remove").then(() => setConfirmOff(false))} data-sending-remove-confirm="">
                  {busy === "remove" ? tt("Removing") : tt("Remove")}
                </button>
              </>
            ) : (
              <>
                <button type="button" className={BTN_DANGER} disabled={!!busy} onClick={() => setConfirmOff(true)} data-sending-remove="">
                  {tt("Remove")}
                </button>
                <button type="button" className={BTN_PRIMARY} disabled={!!busy} onClick={() => void send({ action: "verify" }, "verify")} data-sending-verify="">
                  {busy === "verify" ? tt("Checking") : tt("Check DNS")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
