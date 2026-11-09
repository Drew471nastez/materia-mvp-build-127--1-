"use client"

/**
 * ===========================================================================
 *  SETTINGS › TEAM › TRANSFER OWNERSHIP
 * ===========================================================================
 * For a founder who built this business for somebody else (lib/handoff):
 * a claim link, optionally sent to their email, working for a few days and
 * once, with the choice to stay on the team. While it is open: who it waits
 * for and until when, Send again, New link, Revoke, and what happened to it.
 *
 * Drawn only in a business added from the account menu: a login's first
 * business is the login itself and is never handed over, so there it draws
 * nothing. The link is shown once, when it is made; the server keeps only
 * its fingerprint, so New link is how to see one again (the old one stops).
 * Everything is decided on the server; this only shows it and asks.
 */
import { displayEmail } from "@/lib/businesses/email-alias"
import * as React from "react"
import { Copy, Check } from "lucide-react"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Card, Field, Modal, Notice, SelectInput, TextInput, Toggle, api } from "@/components/physical/ui"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { formatRelative } from "@/lib/i18n/format"
import { PRESET_LABEL } from "@/lib/team/permissions"
import { DEFAULT_TTL_DAYS, FOUNDER_ACCESS, TTL_CHOICES, handoffEmail, type FounderAccess } from "@/lib/handoff/rules"

interface Pending {
  id: string
  email: string | null
  expiresAt: string
  createdAt: string
  lastSentAt: string | null
  expired: boolean
  keepFounder: boolean
  founderAccess: FounderAccess
  ttlDays: number
}

type Panel =
  | { ready: false; error: string }
  | { ready: true; eligible: false }
  | { ready: true; eligible: true; business: { name: string }; blockerText: string[]; pending: Pending | null; events: { event: string; at: string }[] }

const PATH = "/api/handoff"

function eventLabel(event: string): string {
  switch (event) {
    case "created": return tt("Link created")
    case "sent": return tt("Email sent")
    case "renewed": return tt("New link made")
    case "viewed": return tt("Link opened")
    case "failed": return tt("Someone tried to accept")
    case "accepted": return tt("Accepted")
    case "revoked": return tt("Revoked")
    default: return event
  }
}

export function HandoffPanel() {
  const [panel, setPanel] = React.useState<Panel | null>(null)
  const [link, setLink] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [busy, setBusy] = React.useState<null | "create" | "send" | "renew" | "revoke">(null)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = React.useState(false)
  const [email, setEmail] = React.useState("")
  const [days, setDays] = React.useState<number>(DEFAULT_TTL_DAYS)
  const [keep, setKeep] = React.useState(false)
  const [access, setAccess] = React.useState<FounderAccess>("full")

  const load = React.useCallback(async () => {
    const r = await api<Panel>(PATH, { method: "GET" })
    if (r.ok) setPanel(r.data)
    else setPanel({ ready: false, error: r.error })
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])

  if (!panel || (panel.ready && !panel.eligible)) return null
  if (!panel.ready) {
    return (
      <Card title={tt("Transfer ownership")}>
        <Notice tone="gray">{panel.error}</Notice>
      </Card>
    )
  }

  const typed = email.trim()
  const emailProblem = typed && !handoffEmail(typed) ? tt("Enter a valid email, or leave it empty.") : null
  const pending = panel.pending

  const afterLink = (data: { link: string; pending: Pending; emailed: boolean }, sent: boolean) => {
    setLink(data.link)
    setCopied(false)
    setPanel({ ...panel, pending: data.pending })
    if (sent && data.emailed) toast({ title: tt("Sent to {email}", { email: displayEmail(data.pending.email) ?? "" }) })
    else if (sent && data.pending.email) toast({ title: tt("The email didn't go out. Copy the link and send it yourself."), variant: "destructive" })
    void load()
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || emailProblem) return
    setBusy("create")
    setError(null)
    const r = await api<{ link: string; pending: Pending; emailed: boolean }>(PATH, { method: "POST", body: { email: typed || null, days, keepFounder: keep, founderAccess: access } })
    setBusy(null)
    if (!r.ok) return setError(r.error)
    afterLink(r.data, !!typed)
  }

  const renew = async (send: boolean) => {
    if (busy || !pending) return
    setBusy(send ? "send" : "renew")
    setError(null)
    const r = await api<{ link: string; pending: Pending; emailed: boolean }>(`${PATH}/${pending.id}`, { method: "POST", body: { send } })
    setBusy(null)
    if (!r.ok) return setError(r.error)
    afterLink(r.data, send)
  }

  const revoke = async () => {
    if (busy || !pending) return
    setBusy("revoke")
    setError(null)
    const r = await api(`${PATH}/${pending.id}`, { method: "DELETE" })
    setBusy(null)
    setConfirmRevoke(false)
    if (!r.ok) return setError(r.error)
    setLink(null)
    toast({ title: tt("Link revoked") })
    void load()
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast({ title: tt("Link copied") })
    } catch {
      setCopied(false)
    }
  }

  return (
    <Card title={tt("Transfer ownership")} description={tt("Give {name} to someone else. They accept with their own account; its pages, store and web addresses stay the same.", { name: panel.business.name })}>
      <div data-handoff-panel={pending ? "open" : "new"}>
        {panel.blockerText.length > 0 ? (
          <Notice tone="amber" className="mb-4">
            <ul className="space-y-1">
              {panel.blockerText.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </Notice>
        ) : null}

        {pending ? (
          <div className="space-y-4">
            <div>
              <p className="text-[14px] font-medium text-[#1a1a2e]" data-handoff-waiting="">
                {displayEmail(pending.email) ? tt("Waiting for {email} to accept", { email: displayEmail(pending.email) }) : tt("Waiting for someone to accept")}
              </p>
              <p className={cn("mt-0.5 text-[13px] leading-5", pending.expired ? "text-[#b42318]" : "text-[#6b7280]")}>
                {pending.expired ? tt("The link has expired. Make a new one to send it again.") : tt("The link works until {date}, once.", { date: new Date(pending.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) })}
                {pending.keepFounder ? ` ${tt("You stay on the team with {access}.", { access: PRESET_LABEL[pending.founderAccess].toLowerCase() })}` : ""}
              </p>
            </div>

            {link ? (
              <div>
                <div className="flex gap-2">
                  <TextInput readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label={tt("Claim link")} className="min-w-0 flex-1 font-mono text-[13px]" data-handoff-link="" />
                  <button type="button" className={cn(BTN_SECONDARY, "shrink-0")} onClick={() => void copy()}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? tt("Copied") : tt("Copy")}
                  </button>
                </div>
                <p className="mt-2 text-[13px] leading-5 text-[#6b7280]">{tt("Shown once. If you lose it, make a new link.")}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {pending.email ? (
                <button type="button" className={BTN_PRIMARY} disabled={busy !== null} onClick={() => void renew(true)}>
                  {busy === "send" ? tt("Sending") : tt("Send again")}
                </button>
              ) : null}
              <button type="button" className={BTN_SECONDARY} disabled={busy !== null} onClick={() => void renew(false)}>
                {busy === "renew" ? tt("Making link") : tt("New link")}
              </button>
              <button type="button" className={BTN_DANGER} disabled={busy !== null} onClick={() => setConfirmRevoke(true)}>
                {tt("Revoke")}
              </button>
            </div>

            {panel.events.length > 0 ? (
              <ul className="space-y-1 border-t border-[#f1f2f4] pt-3" data-handoff-events="">
                {panel.events.map((e, i) => (
                  <li key={`${e.event}-${e.at}-${i}`} className="flex justify-between gap-3 text-[13px] leading-5">
                    <span className="text-[#374151]">{eventLabel(e.event)}</span>
                    <span className="shrink-0 text-[#9ca3af]">{formatRelative(e.at)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <form onSubmit={create} className="space-y-4" noValidate>
            <Field label={tt("Their email")} htmlFor="handoff-email" error={emailProblem}>
              <TextInput
                id="handoff-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label={tt("Link works for")} htmlFor="handoff-days">
              <SelectInput id="handoff-days" value={String(days)} onChange={(v) => setDays(Number(v))}>
                {TTL_CHOICES.map((d) => (
                  <option key={d} value={d}>{tt("{count, plural, one {# day} other {# days}}", { count: d })}</option>
                ))}
              </SelectInput>
            </Field>
            <Toggle label={tt("Keep me on the team")} description={tt("Without payouts or billing.")} checked={keep} onChange={setKeep} />
            {keep ? (
              <Field label={tt("My access")} htmlFor="handoff-access">
                <SelectInput id="handoff-access" value={access} onChange={(v) => setAccess(v as FounderAccess)}>
                  {FOUNDER_ACCESS.map((a) => (
                    <option key={a} value={a}>{PRESET_LABEL[a]}</option>
                  ))}
                </SelectInput>
              </Field>
            ) : null}
            <p className="text-[13px] leading-5 text-[#6b7280]">
              {tt("Your payout account, plan and other businesses stay with you. They connect their own payouts.")}
            </p>
            <button type="submit" className={BTN_PRIMARY} disabled={busy !== null || !!emailProblem || panel.blockerText.length > 0} data-handoff-create="">
              {busy === "create" ? tt("Making link") : typed ? tt("Send claim link") : tt("Create claim link")}
            </button>
          </form>
        )}
        {error ? <p role="alert" className="mt-3 text-[13px] leading-5 text-[#b42318]">{error}</p> : null}
      </div>

      <Modal
        open={confirmRevoke}
        onClose={() => setConfirmRevoke(false)}
        title={tt("Revoke this link?")}
        footer={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setConfirmRevoke(false)}>{tt("Keep")}</button>
            <button type="button" className={BTN_DANGER} disabled={busy !== null} onClick={() => void revoke()}>{busy === "revoke" ? tt("Revoking") : tt("Revoke")}</button>
          </>
        }
      >
        <p className="text-[14px] leading-[21px] text-[#4b5563]">{tt("It stops working at once. {name} stays yours.", { name: panel.business.name })}</p>
      </Modal>
    </Card>
  )
}
