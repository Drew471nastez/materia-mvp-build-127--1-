"use client"

/**
 * ===========================================================================
 *  THE TICKETS OF ONE EVENT
 * ===========================================================================
 * Who is coming to a paid event, what they paid and how they got in. It
 * opens from the event's menu in the list and takes the whole section, the
 * way the Learn builder opens a program, so a long attendee list has room
 * on a phone as well as a computer.
 *
 *   The head      sold, given free, taken, refunded and seats left, every
 *                 figure a sum of ticket rows (never a price times a count)
 *   The holders   twenty five at a time, newest first, with a search by
 *                 name (or email, for whoever may see emails)
 *   Per person    Refund, for somebody with refund_tickets, and Came
 *                 (marked when they turned up)
 *   Invite free   members picked by name, or an email address typed in,
 *                 handed to the invite route with what happened said plainly
 *
 * Every button here is one the route also checks: hiding it is not the
 * permission.
 */
import * as React from "react"
import { ArrowLeft, Check, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { AppAvatar } from "@/components/app/app-avatar"
import { StatusBadge } from "@/app/app/orders/order-parts"
import { eventTime } from "@/lib/communities/format"
import { eventPriceLabel } from "@/lib/communities/event-tickets"
import type { CommunityHead, EventEditView, EventTicketPanelView, InvitePickMember, TicketHolderView } from "./view-types"
import { Confirm, Dialog, Empty, ListCard, Notice, SearchField, buttonPrimary, buttonSecondary, card, errorText, field, label, send, shortDate, useToast } from "./parts"

/** How somebody got in, in two or three words. */
function sourceWords(t: TicketHolderView): string {
  if (t.source === "purchase") return t.amountCents && t.amountCents > 0 ? `Paid ${eventPriceLabel(t.amountCents, t.currency)}` : "Bought"
  if (t.source === "invite") return t.invitedByName ? `Invited by ${t.invitedByName}` : "Invited"
  return "Given a seat"
}

/* Only what the row's own buttons do not already say: whether they came is the Came button beside it. */
function statusBadge(t: TicketHolderView): React.ReactNode {
  if (t.status === "refunded") return <StatusBadge tone="neutral">Refunded</StatusBadge>
  if (t.status === "cancelled") return <StatusBadge tone="neutral">Gave up the seat</StatusBadge>
  if (t.status === "held") return <StatusBadge tone="attention">Paying</StatusBadge>
  return null
}

export function EventTicketsPanel({ head, event, currency, onBack }: { head: CommunityHead; event: EventEditView; currency: string; onBack: () => void }) {
  const toast = useToast()
  const base = `/api/app/community/${head.id}/events/${event.id}/tickets`
  const [panel, setPanel] = React.useState<EventTicketPanelView | null>(null)
  const [rows, setRows] = React.useState<TicketHolderView[]>([])
  const [cursor, setCursor] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [more, setMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [refunding, setRefunding] = React.useState<TicketHolderView | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [inviting, setInviting] = React.useState(false)
  const mayRefund = head.can.refund_tickets === true
  const mayInvite = head.can.price_events === true

  const load = React.useCallback(
    async (q: string) => {
      setLoading(true)
      const res = await send<{ panel: EventTicketPanelView }>(`${base}?q=${encodeURIComponent(q)}`, "GET")
      setLoading(false)
      if (!res.ok || !res.data.panel) return setError(errorText(res.data.error, "The tickets could not be loaded."))
      setError(null)
      setPanel(res.data.panel)
      setRows(res.data.panel.rows)
      setCursor(res.data.panel.nextCursor)
    },
    [base],
  )

  React.useEffect(() => {
    void load("")
  }, [load])

  /* The search waits for the typing to stop, like the member list's. */
  React.useEffect(() => {
    if (loading && panel === null) return
    const t = window.setTimeout(() => void load(query.trim()), query.trim() ? 300 : 0)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const loadMore = async () => {
    if (!cursor) return
    setMore(true)
    const res = await send<{ panel: EventTicketPanelView }>(`${base}?q=${encodeURIComponent(query.trim())}&cursor=${encodeURIComponent(cursor)}`, "GET")
    setMore(false)
    if (!res.ok || !res.data.panel) return setError(errorText(res.data.error))
    setRows((old) => [...old, ...res.data.panel.rows])
    setCursor(res.data.panel.nextCursor)
  }

  const refund = async (t: TicketHolderView, reason: string) => {
    setBusy(true)
    const res = await send<{ refundedCents?: number }>(base, "DELETE", { ticketId: t.ticketId, reason: reason || null })
    setBusy(false)
    if (!res.ok) return toast(errorText(res.data.error, "The refund did not go through."))
    setRefunding(null)
    toast(`${eventPriceLabel(res.data.refundedCents ?? t.amountCents ?? 0, t.currency)} is on its way back to ${t.name}`)
    await load(query.trim())
  }

  const attended = async (t: TicketHolderView) => {
    const came = !t.attendedAt
    setRows((old) => old.map((r) => (r.ticketId === t.ticketId ? { ...r, attendedAt: came ? new Date().toISOString() : null } : r)))
    const res = await send(base, "PATCH", { ticketId: t.ticketId, attended: came })
    if (!res.ok) {
      setRows((old) => old.map((r) => (r.ticketId === t.ticketId ? { ...r, attendedAt: t.attendedAt } : r)))
      toast(errorText(res.data.error, "That did not save."))
    }
  }

  const money = panel?.money
  const figures: { label: string; value: string; sub?: string }[] = money
    ? [
        { label: "Sold", value: money.sold.toLocaleString("en-US"), sub: money.invited > 0 ? `${money.invited} given free` : undefined },
        { label: "Taken", value: eventPriceLabel(money.grossCents, money.currency || currency) },
        { label: "Refunded", value: eventPriceLabel(money.refundedCents, money.currency || currency) },
        { label: "Seats left", value: panel?.seatsLeft === null || panel?.seatsLeft === undefined ? "No limit" : String(panel.seatsLeft), sub: panel?.capacity ? `${panel.capacity} seats` : undefined },
      ]
    : []

  return (
    <div className="space-y-4" data-event-tickets={event.id}>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Back to events" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[#e5e7eb] bg-white text-[#1a1a2e] hover:bg-[#f8f9fa] sm:h-9 sm:w-9" data-tickets-back="">
          <ArrowLeft aria-hidden className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-[#6b7280]">Tickets</p>
          <h2 className="flex min-w-0 items-center gap-2 text-[19px] font-bold leading-6 text-[#1a1a2e] sm:text-[22px]">
            <span className="truncate">{panel?.title ?? event.title}</span>
          </h2>
          <p className="mt-0.5 truncate text-[12.5px] text-[#6b7280]">
            {eventTime(event.startsAt, event.endsAt)}
            {(panel?.priceCents ?? event.priceCents ?? 0) > 0 ? ` · ${eventPriceLabel((panel?.priceCents ?? event.priceCents) as number, panel?.currency ?? event.currency)} a ticket` : ""}
          </p>
        </div>
        {mayInvite ? (
          <button type="button" onClick={() => setInviting(true)} className={cn(buttonPrimary, "shrink-0 max-sm:basis-full")} data-invite-free="">
            <Plus aria-hidden className="h-4 w-4" />
            Invite free
          </button>
        ) : null}
      </div>

      {error ? <Notice>{error}</Notice> : null}
      {panel && !panel.ready ? <Notice tone="info">Tickets need the database update, run-now part 105.</Notice> : null}
      {panel?.cancelled && money && money.grossCents > 0 && money.refundedCents === 0 ? (
        <Notice tone="warn">This event is cancelled and nobody has had their money back yet. Refund each ticket below, or ask the owner to.</Notice>
      ) : null}

      {figures.length > 0 ? (
        <section className={cn(card, "overflow-hidden")} aria-label="What this event took">
          <div className="grid grid-cols-2 gap-px bg-[#f1f2f4] sm:grid-cols-4">
            {figures.map((x) => (
              <div key={x.label} className="bg-white px-4 py-3.5" data-ticket-figure={x.label}>
                <p className="truncate text-[12.5px] font-medium text-[#6b7280]">{x.label}</p>
                <p className="mt-1 text-[22px] font-semibold leading-7 tabular-nums text-[#1a1a2e]">{x.value}</p>
                {x.sub ? <p className="mt-0.5 truncate text-[12px] text-[#9ca3af]">{x.sub}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <ListCard busy={loading || undefined} toolbar={<SearchField value={query} onChange={setQuery} placeholder="Search by name" label="Search the holders" />}>
        {rows.length === 0 ? (
          loading ? (
            <p className="px-4 py-6 text-[13.5px] text-[#6b7280] sm:px-5">Loading</p>
          ) : query.trim() ? (
            <Empty title="Nobody by that name holds a ticket." />
          ) : (
            <Empty title="No tickets yet." detail={mayInvite ? "Share the event, or invite people free." : undefined} />
          )
        ) : (
          <ul className="divide-y divide-[#f1f2f4]">
            {rows.map((t) => (
              <li key={t.ticketId} className="flex min-h-[64px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-5" data-ticket-row={t.ticketId}>
                <AppAvatar src={t.avatarUrl ?? undefined} name={t.name} size={36} className="h-9 w-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-1.5 text-[14px] font-medium text-[#1a1a2e]">
                    <span className="truncate">{t.name}</span>
                    {statusBadge(t)}
                  </p>
                  <p className="truncate text-[12.5px] text-[#6b7280]">
                    {[sourceWords(t), t.paidAt ? shortDate(t.paidAt) : null, t.email].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 max-sm:w-full max-sm:justify-end">
                  {t.status === "paid" ? (
                    <button
                      type="button"
                      onClick={() => void attended(t)}
                      aria-pressed={Boolean(t.attendedAt)}
                      className={cn(buttonSecondary, "h-10 sm:h-9", t.attendedAt && "border-[#cfe7d8] bg-[#f3faf6] text-[#15724b]")}
                      data-ticket-attended={t.attendedAt ? "yes" : "no"}
                    >
                      {t.attendedAt ? <Check aria-hidden className="h-3.5 w-3.5" /> : null}
                      {t.attendedAt ? "Came" : "Mark attended"}
                    </button>
                  ) : null}
                  {mayRefund && t.status === "paid" && (t.amountCents ?? 0) > 0 ? (
                    <button type="button" onClick={() => setRefunding(t)} className={cn(buttonSecondary, "h-10 text-[#b42318] sm:h-9")} data-ticket-refund="">
                      Refund
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </ListCard>

      {panel?.capped ? <p className="px-1 text-[13px] text-[#6b7280]">Showing the first matches. Type more of the name to narrow it down.</p> : null}
      {cursor ? (
        <div className="flex justify-center">
          <button type="button" onClick={() => void loadMore()} disabled={more} className={cn(buttonSecondary, "h-10 px-5")} data-tickets-more="">
            {more ? "Loading" : "Show more"}
          </button>
        </div>
      ) : null}

      <Confirm
        open={refunding !== null}
        onClose={() => setRefunding(null)}
        title={`Refund ${refunding?.name ?? "this ticket"}?`}
        detail={`${eventPriceLabel(refunding?.amountCents ?? 0, refunding?.currency ?? currency)} goes back to the card it came from, and the seat opens again. A card takes 5 to 10 days to show it.`}
        action="Refund"
        danger
        busy={busy}
        reason
        onConfirm={(reason) => refunding && void refund(refunding, reason)}
      />

      <InviteFree open={inviting} onClose={() => setInviting(false)} communityId={head.id} eventId={event.id} onDone={() => void load(query.trim())} />
    </div>
  )
}

/**
 * INVITING PEOPLE FREE. Members are picked by name, and anybody who is not
 * a member yet is invited by email through the community's own invite flow,
 * which carries the event so joining hands them the ticket. What happened
 * is always said: how many got in, how many did not, and who was not a
 * member.
 */
function InviteFree({ open, onClose, communityId, eventId, onDone }: { open: boolean; onClose: () => void; communityId: string; eventId: string; onDone: () => void }) {
  const [query, setQuery] = React.useState("")
  const [found, setFound] = React.useState<InvitePickMember[]>([])
  const [picked, setPicked] = React.useState<InvitePickMember[]>([])
  const [emails, setEmails] = React.useState("")
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<string | null>(null)
  const search = `/api/app/community/${communityId}/events/${eventId}/tickets`

  React.useEffect(() => {
    if (!open) return
    setQuery("")
    setFound([])
    setPicked([])
    setEmails("")
    setNote("")
    setError(null)
    setDone(null)
  }, [open])

  React.useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return setFound([])
    const t = window.setTimeout(async () => {
      const res = await send<{ members: InvitePickMember[] }>(`${search}?find=${encodeURIComponent(q)}`, "GET")
      if (res.ok) setFound(res.data.members ?? [])
    }, 300)
    return () => window.clearTimeout(t)
  }, [query, search])

  const toggle = (m: InvitePickMember) => setPicked((old) => (old.some((x) => x.userId === m.userId) ? old.filter((x) => x.userId !== m.userId) : [...old, m]))

  const sendInvites = async () => {
    const list = emails
      .split(/[,\s]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@"))
    if (!picked.length && !list.length) return setError("Pick a member, or type an email address.")
    setBusy(true)
    setError(null)
    const res = await send<{ invited?: number; failed?: number; notMembers?: number }>(`/api/community/${communityId}/events/${eventId}/invite`, "POST", {
      userIds: picked.map((m) => m.userId),
      emails: list,
      message: note.trim() || undefined,
    })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error, "The invites did not go out."))
    const invited = res.data.invited ?? 0
    const failed = res.data.failed ?? 0
    const notMembers = res.data.notMembers ?? 0
    setDone(
      [
        invited === 0 ? "Nobody was given a ticket." : `${invited} ${invited === 1 ? "ticket" : "tickets"} given free.`,
        notMembers > 0 ? `${notMembers} ${notMembers === 1 ? "person is" : "people are"} not a member yet and got an invite to join, which hands them the ticket.` : "",
        failed > 0 ? `${failed} did not go through.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    )
    setPicked([])
    setEmails("")
    onDone()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Invite people free"
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
            {done ? "Close" : "Cancel"}
          </button>
          <button type="button" onClick={() => void sendInvites()} disabled={busy} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")} data-invite-send="">
            {busy ? "Sending" : "Give them a ticket"}
          </button>
        </>
      }
    >
      <div className="space-y-3.5" data-invite-free-sheet="">
        <p className="text-[13.5px] leading-relaxed text-[#4b5563]">They get in without paying, and they are told what the ticket would have cost.</p>
        <div>
          <label htmlFor="invite-find" className={label}>
            Members
          </label>
          <input id="invite-find" value={query} onChange={(e) => setQuery(e.target.value.slice(0, 80))} placeholder="Search by name" className={cn(field, "h-11 sm:h-10")} />
          {found.length > 0 ? (
            <ul className="mt-2 max-h-[220px] overflow-y-auto rounded-xl border border-[#e5e7eb]/70">
              {found.map((m) => {
                const on = picked.some((x) => x.userId === m.userId)
                return (
                  <li key={m.userId} className="border-b border-[#f1f2f4] last:border-b-0">
                    <button type="button" onClick={() => toggle(m)} disabled={m.hasTicket} className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[#fafbfb] disabled:opacity-60" data-invite-pick={m.userId}>
                      <AppAvatar src={m.avatarUrl ?? undefined} name={m.name} size={28} className="h-7 w-7 shrink-0 rounded-full" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-[#1a1a2e]">{m.name}</span>
                        {m.email ? <span className="block truncate text-[12px] text-[#6b7280]">{m.email}</span> : null}
                      </span>
                      {m.hasTicket ? <span className="shrink-0 text-[12px] text-[#6b7280]">Already in</span> : <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border", on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#d1d5db]")}>{on ? <Check aria-hidden className="h-3.5 w-3.5" /> : null}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : query.trim().length >= 2 ? (
            <p className="mt-1.5 text-[12.5px] text-[#6b7280]">No member by that name. Use the email field below.</p>
          ) : null}
          {picked.length > 0 ? <p className="mt-1.5 text-[12.5px] text-[#4b5563]">{picked.map((m) => m.name).join(", ")}</p> : null}
        </div>
        <div>
          <label htmlFor="invite-emails" className={label}>
            Or email addresses
          </label>
          <textarea id="invite-emails" value={emails} onChange={(e) => setEmails(e.target.value.slice(0, 2000))} rows={2} placeholder="one@example.com, two@example.com" className={cn(field, "resize-y py-2.5 leading-relaxed")} />
          <p className="mt-1.5 text-[12.5px] leading-snug text-[#6b7280]">Somebody who is not a member yet gets an invite to join that hands them the ticket when they arrive.</p>
        </div>
        <div>
          <label htmlFor="invite-note" className={label}>
            A line from you (optional)
          </label>
          <input id="invite-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Hope you can make it" className={cn(field, "h-11 sm:h-10")} />
        </div>
        {error ? <Notice>{error}</Notice> : null}
        {done ? (
          <p className="rounded-xl border border-[#cfe7d8] bg-[#f3faf6] px-3.5 py-2.5 text-[13.5px] leading-5 text-[#15724b]" data-invite-done="" role="status">
            {done}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}
