"use client"

/**
 * ===========================================================================
 *  SETTINGS › TEAM › TRANSFER OWNERSHIP
 * ===========================================================================
 * For a founder who built this business for somebody else (lib/handoff). In
 * the Team card's own shape (./team-panel): the same row of an email and a
 * button, the same person row with its status pill, Resend and the "..."
 * menu (ResponsiveActionMenu: a menu on a computer, a sheet on a phone).
 *
 *   NEW     their email (or none, to copy a link), and two choices as one
 *           line of selectors: how long the link works, and what happens to
 *           the founder after (leave, or stay with full, content or support
 *           access; never payouts or billing). One button.
 *   OPEN    who it waits for, its status (Sent, Opened, Tried to accept,
 *           Expired) and until when, Resend, and in the menu Copy new link
 *           and Cancel transfer. A link just made is shown once with Copy;
 *           the server keeps only its fingerprint, so a new link is how to
 *           see one again, and the old one stops (said where it happens).
 *
 * A login's first business is the login itself and is never handed over;
 * there the card says so in one line, so nobody looks for a button that
 * cannot exist. Everything is decided on the server; this shows and asks.
 */
import { displayEmail } from "@/lib/businesses/email-alias"
import * as React from "react"
import { Check, Copy, Link2, MoreHorizontal, RotateCw, X } from "lucide-react"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Card, Modal, Notice, Pill, SelectInput, TextInput, api } from "@/components/physical/ui"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { formatRelative } from "@/lib/i18n/format"
import { DEFAULT_TTL_DAYS, FOUNDER_ACCESS, RESEND_COOLDOWN_MS, TTL_CHOICES, handoffEmail, type FounderAccess } from "@/lib/handoff/rules"

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
  | { ready: true; eligible: false; reason?: "first_business" | "on_its_own" }
  | { ready: true; eligible: true; business: { name: string }; blockerText: string[]; pending: Pending | null; events: { event: string; at: string }[] }

const PATH = "/api/handoff"

/** After the transfer: "leave", or stay on the team with one of the presets. One selector instead of a switch and a second select. */
type After = "leave" | FounderAccess

const DOTS =
  "grid h-10 w-10 shrink-0 place-items-center rounded-lg sm:h-9 sm:w-9 text-[#6b7280] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#9ca3af]/40 [-webkit-tap-highlight-color:transparent]"

/** What the founder picks for after the transfer, and how the open link says it back. Never payouts or billing (lib/handoff/rules FOUNDER_ACCESS). */
const STAY: Record<FounderAccess, () => string> = {
  full: () => tt("I stay with full access"),
  content: () => tt("I stay to edit content"),
  support: () => tt("I stay to help with orders"),
}
const STAYING: Record<FounderAccess, () => string> = {
  full: () => tt("You stay on the team with full access, without payouts or billing."),
  content: () => tt("You stay on the team to edit content."),
  support: () => tt("You stay on the team to help with orders and customers."),
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

/** What the open link is doing, from its record: the newest thing that happened to it that the founder cares about. */
export function pendingStatus(pending: Pick<Pending, "expired" | "lastSentAt" | "createdAt">, events: { event: string; at: string }[]): { word: string; tone: "blue" | "green" | "amber"; line: string } {
  if (pending.expired) return { word: tt("Expired"), tone: "amber", line: tt("Expired. Make a new link to send it again.") }
  const latest = events.find((e) => e.event === "viewed" || e.event === "failed" || e.event === "sent" || e.event === "renewed" || e.event === "created")
  if (latest?.event === "failed") return { word: tt("Opened"), tone: "green", line: tt("Tried to accept {when}", { when: formatRelative(latest.at) }) }
  if (latest?.event === "viewed") return { word: tt("Opened"), tone: "green", line: tt("Opened {when}", { when: formatRelative(latest.at) }) }
  if (pending.lastSentAt) return { word: tt("Sent"), tone: "blue", line: tt("Sent {when}", { when: formatRelative(pending.lastSentAt) }) }
  return { word: tt("Waiting"), tone: "blue", line: tt("Link made {when}", { when: formatRelative(latest?.at ?? pending.createdAt) }) }
}

export function HandoffPanel() {
  const [panel, setPanel] = React.useState<Panel | null>(null)
  const [link, setLink] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [busy, setBusy] = React.useState<null | "create" | "send" | "renew" | "revoke">(null)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = React.useState(false)
  const [email, setEmail] = React.useState("")
  const [days, setDays] = React.useState<number>(DEFAULT_TTL_DAYS)
  const [after, setAfter] = React.useState<After>("leave")
  const [now, setNow] = React.useState(() => Date.now())

  const load = React.useCallback(async () => {
    const r = await api<Panel>(PATH, { method: "GET" })
    if (r.ok) setPanel(r.data)
    else setPanel({ ready: false, error: r.error })
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])
  /* Resend's countdown, only while there is one. */
  const sentAt = panel && panel.ready && panel.eligible && panel.pending?.lastSentAt ? Date.parse(panel.pending.lastSentAt) : NaN
  const wait = Number.isFinite(sentAt) ? Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN_MS - now) / 1000)) : 0
  React.useEffect(() => {
    if (!Number.isFinite(sentAt) || Date.now() - sentAt > RESEND_COOLDOWN_MS) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [sentAt])

  if (!panel) return null
  if (panel.ready && !panel.eligible) {
    return (
      <Card title={tt("Transfer ownership")} description={tt("Your first business is your login, so it stays yours. A business you add from the account menu can be handed over from its own Team settings.")}>
        <span data-handoff-panel="first" hidden />
      </Card>
    )
  }
  if (!panel.ready) {
    return (
      <Card title={tt("Transfer ownership")}>
        <Notice tone="gray">{panel.error}</Notice>
      </Card>
    )
  }

  const typed = email.trim()
  const emailProblem = typed && !handoffEmail(typed) ? tt("Enter a valid email, or leave it empty to copy a link.") : null
  const pending = panel.pending
  const blocked = panel.blockerText.length > 0

  const afterLink = (data: { link: string; pending: Pending; emailed: boolean }, sent: boolean, renewed: boolean) => {
    setLink(data.link)
    setCopied(false)
    setPanel({ ...panel, pending: data.pending })
    setNow(Date.now())
    if (sent && data.emailed) toast({ title: tt("Sent to {email}", { email: displayEmail(data.pending.email) ?? "" }), description: renewed ? tt("The earlier link no longer works.") : undefined })
    else if (sent && data.pending.email) toast({ title: tt("The email didn't go out. Copy the link and send it yourself."), variant: "destructive" })
    else if (renewed) toast({ title: tt("New link made"), description: tt("The earlier link no longer works.") })
    void load()
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || emailProblem || blocked) return
    setBusy("create")
    setError(null)
    const r = await api<{ link: string; pending: Pending; emailed: boolean }>(PATH, { method: "POST", body: { email: typed || null, days, keepFounder: after !== "leave", founderAccess: after === "leave" ? "full" : after } })
    setBusy(null)
    if (!r.ok) return setError(r.error)
    setEmail("")
    afterLink(r.data, !!typed, false)
  }

  const renew = async (send: boolean) => {
    if (busy || !pending) return
    setBusy(send ? "send" : "renew")
    setError(null)
    const r = await api<{ link: string; pending: Pending; emailed: boolean }>(`${PATH}/${pending.id}`, { method: "POST", body: { send } })
    setBusy(null)
    if (!r.ok) return setError(r.error)
    afterLink(r.data, send, true)
  }

  const cancel = async () => {
    if (busy || !pending) return
    setBusy("revoke")
    setError(null)
    const r = await api(`${PATH}/${pending.id}`, { method: "DELETE" })
    setBusy(null)
    setConfirmCancel(false)
    if (!r.ok) return setError(r.error)
    setLink(null)
    toast({ title: tt("Transfer cancelled"), description: tt("The link no longer works.") })
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

  const expired = !!pending && (pending.expired || Date.parse(pending.expiresAt) <= now)
  const who = pending ? displayEmail(pending.email) : null
  const status = pending ? pendingStatus({ ...pending, expired }, panel.events) : null
  const items: ActionMenuItem[] = pending
    ? [
        ...(pending.email && !expired ? [{ label: wait > 0 ? tt("Resend in {wait}s", { wait }) : tt("Resend"), icon: <RotateCw className="h-4 w-4" />, onClick: () => void renew(true) }] : []),
        { label: tt("Copy new link"), icon: <Link2 className="h-4 w-4" />, onClick: () => void renew(false) },
        { label: tt("Cancel transfer"), icon: <X className="h-4 w-4" />, variant: "destructive" as const, separatorBefore: true, onClick: () => setConfirmCancel(true) },
      ]
    : []

  return (
    <Card title={tt("Transfer ownership")} description={tt("Hand {name} to someone with their own Storelib account. Its pages, store and addresses stay the same.", { name: panel.business.name })}>
      <div data-handoff-panel={pending ? "open" : "new"}>
        {blocked ? (
          <Notice tone="amber" className="mb-4">
            <ul className="space-y-1">
              {panel.blockerText.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </Notice>
        ) : null}

        {pending && status ? (
          <>
            <div className="-mx-1 flex min-h-[56px] items-center gap-3 rounded-xl px-1 py-2" data-handoff-row={status.word}>
              <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eef0f3] text-[15px] font-semibold text-[#4b5563]">
                {(who?.match(/[\p{L}\p{N}]/u)?.[0] ?? "").toUpperCase() || <Link2 className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-[#1a1a2e]" data-handoff-waiting="">{who ?? tt("Anyone with the link")}</p>
                <p className={cn("text-[13px] leading-[18px]", expired ? "text-[#b45309]" : "text-[#6b7280]")} data-handoff-status="">
                  {status.line}
                  {!expired ? <>{" · "}<span className="whitespace-nowrap">{tt("until {date}", { date: shortDate(pending.expiresAt) })}</span></> : null}
                </p>
              </div>
              <Pill tone={status.tone} className="hidden sm:inline-flex">{status.word}</Pill>
              {pending.email && !expired ? (
                <button type="button" className={cn(BTN_SECONDARY, "hidden h-9 min-w-[112px] px-3 text-[13px] tabular-nums sm:inline-flex")} disabled={busy !== null || wait > 0} onClick={() => void renew(true)} data-handoff-resend="">
                  {busy === "send" ? tt("Sending") : wait > 0 ? tt("Resend in {wait}s", { wait }) : tt("Resend")}
                </button>
              ) : expired ? (
                <button type="button" className={cn(BTN_SECONDARY, "hidden h-9 px-3 text-[13px] sm:inline-flex")} disabled={busy !== null} onClick={() => void renew(!!pending.email)}>
                  {busy ? tt("Making link") : tt("New link")}
                </button>
              ) : null}
              <ResponsiveActionMenu
                title={who ?? tt("Transfer link")}
                items={items}
                trigger={
                  <button type="button" className={DOTS} aria-label={tt("Transfer actions")} disabled={busy !== null} data-handoff-menu="">
                    <MoreHorizontal className="h-[18px] w-[18px]" />
                  </button>
                }
              />
            </div>

            {link ? (
              <div className="mt-2 border-t border-[#f1f2f4] pt-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {/* The whole link, readable: storelib.com/team/claim/k7m2-x9qp-4hfd-w3nc wraps on a phone instead of hiding in a field. */}
                  <p className="min-w-0 flex-1 select-all rounded-lg border border-[#e5e7eb] bg-[#f8f9fa] px-3 py-2.5 text-[14px] leading-5 text-[#1a1a2e] [overflow-wrap:anywhere]" aria-label={tt("Transfer link")} data-handoff-link={link}>
                    {link.replace(/^https?:\/\//, "")}
                  </p>
                  <button type="button" className={cn(BTN_PRIMARY, "shrink-0")} onClick={() => void copy()}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? tt("Copied") : tt("Copy link")}
                  </button>
                </div>
                <p className="mt-2 text-[13px] leading-5 text-[#6b7280]">{tt("Shown once. Copy new link makes another and stops this one.")}</p>
              </div>
            ) : null}
            <p className="mt-2 border-t border-[#f1f2f4] pt-3 text-[13px] leading-5 text-[#6b7280]" data-handoff-after-line="">
              {pending.keepFounder ? STAYING[pending.founderAccess]() : tt("You leave the business once they accept.")}
            </p>
          </>
        ) : (
          <form onSubmit={create} noValidate data-handoff-form="">
            <label htmlFor="handoff-email" className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">
              {tt("New owner's email")}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
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
                aria-invalid={emailProblem ? true : undefined}
                aria-describedby="handoff-hint"
                className={cn("sm:flex-1", emailProblem && "border-[#fca5a5] focus:border-[#f87171]")}
                disabled={blocked}
              />
              <button type="submit" className={cn(BTN_PRIMARY, "sm:min-w-[132px]")} disabled={busy !== null || !!emailProblem || blocked} data-handoff-create="">
                {busy === "create" ? tt("Making link") : typed ? tt("Send link") : tt("Create link")}
              </button>
            </div>
            <p id="handoff-hint" className={cn("mt-2 text-[13px] leading-5", emailProblem ? "text-[#b42318]" : "text-[#6b7280]")} aria-live="polite">
              {emailProblem ?? tt("Leave it empty to copy the link and send it yourself.")}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[#f1f2f4] pt-4 sm:grid-cols-2">
              <label className="min-w-0">
                <span className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">{tt("Link works for")}</span>
                <SelectInput value={String(days)} onChange={(v) => setDays(Number(v))} disabled={blocked} data-handoff-days="">
                  {TTL_CHOICES.map((d) => (
                    <option key={d} value={d}>{tt("{count, plural, one {# day} other {# days}}", { count: d })}</option>
                  ))}
                </SelectInput>
              </label>
              <label className="min-w-0">
                <span className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">{tt("After the transfer")}</span>
                <SelectInput value={after} onChange={(v) => setAfter(v as After)} disabled={blocked} data-handoff-after="">
                  <option value="leave">{tt("I leave the business")}</option>
                  {FOUNDER_ACCESS.map((a) => (
                    <option key={a} value={a}>{STAY[a]()}</option>
                  ))}
                </SelectInput>
              </label>
            </div>
            <p className="mt-3 text-[13px] leading-5 text-[#6b7280]">{tt("Your payout account, plan and other businesses stay with you.")}</p>
          </form>
        )}
        {error ? <p role="alert" className="mt-3 text-[13px] leading-5 text-[#b42318]">{error}</p> : null}
      </div>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={tt("Cancel this transfer?")}
        footer={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setConfirmCancel(false)}>{tt("Keep")}</button>
            <button type="button" className={BTN_DANGER} disabled={busy !== null} onClick={() => void cancel()}>{busy === "revoke" ? tt("Cancelling") : tt("Cancel transfer")}</button>
          </>
        }
      >
        <p className="text-[14px] leading-[21px] text-[#4b5563]">{tt("The link stops working at once. {name} stays yours.", { name: panel.business.name })}</p>
      </Modal>
    </Card>
  )
}
