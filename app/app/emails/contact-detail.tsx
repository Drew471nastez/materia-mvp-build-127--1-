"use client"

/**
 * ===========================================================================
 *  ONE CONTACT: WHO, WHERE THEY CAME FROM, AND WHAT THEY HAVE BEEN SENT
 * ===========================================================================
 * Opened from a row of Subscribers as its own page over the list, the way
 * an order opens over Orders: "when I click on an email it should take me
 * to a sub page of that email, like the orders". The bar with back, who it
 * is, where they stand and what can be done; then their automations and
 * their details as cards, two columns on a computer. It comes in and goes
 * back with Orders' own move (app/app/orders/order-motion.ts, run by
 * ./emails-client.tsx), and it reads the contact's automation runs itself,
 * through the creator's own session (row level security keeps it to
 * theirs); before the engine's SQL has run there are none, and it says so.
 *
 * It used to be a sheet on a phone and a panel on a computer. What made that
 * sheet glitch, measured, still shapes how the page opens:
 *
 *   THE SHEET CAME UP BEFORE ITS CONTENT. The runs were asked for when the
 *   sheet opened, so it rose with two grey bars in it and, half way up or
 *   just after, they turned into the list or into "None yet": a different
 *   height, and since the sheet stands on the bottom of the screen its top
 *   edge jumped under the thumb. Now a finger on the row asks for them
 *   (`prefetchContact`), the tap waits for the answer for at most
 *   OPEN_WAIT_MS (usually it is already here), and the sheet rises once,
 *   with everything in it laid out.
 *
 *   A SECOND CONTACT SHOWED THE FIRST ONE'S RUNS for a frame, then grey
 *   bars, then its own. The body is keyed by the contact and starts from
 *   what is already known about that contact.
 */

import * as React from "react"
import { ArrowLeft, ChevronDown, MoreHorizontal } from "lucide-react"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { WaitingArea } from "@/components/ui/activity-spinner"
import { createClient } from "@/lib/supabase/client"
import { sourceView } from "@/lib/contacts/contact-source"
import { cn } from "@/lib/utils"
import { GUTTER, ORDER_WIDTH, OrderBarFrame, StatusBadge, buttonSecondary, card, iconButton } from "../orders/order-parts"
import type { SubscriberRow } from "./emails-home"
import { tt, ttx } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

interface RunLite {
  id: string
  status: string
  exit_reason: string | null
  started_at: string
  flow_id: string
  email_flows: { name: string } | null
}

/** The longest a tap waits for a contact's runs before the sheet rises without them. */
export const OPEN_WAIT_MS = 300
/** How long a contact's runs are good for before they are read again. */
const FRESH_MS = 30_000

const runsKept = new Map<string, { at: number; runs: RunLite[] }>()
const runsAsked = new Map<string, Promise<RunLite[]>>()

const keyOf = (email: string) => email.toLowerCase()

function keptRuns(email: string): RunLite[] | null {
  const hit = runsKept.get(keyOf(email))
  return hit && Date.now() - hit.at < FRESH_MS ? hit.runs : null
}

/** The contact's last twenty runs: kept, already asked for, or asked for now. */
function readRuns(email: string): Promise<RunLite[]> {
  const key = keyOf(email)
  const kept = keptRuns(email)
  if (kept) return Promise.resolve(kept)
  const asked = runsAsked.get(key)
  if (asked) return asked
  const request = (async () => {
    try {
      const { data, error } = await createClient()
        .from("email_flow_runs")
        .select("id, status, exit_reason, started_at, flow_id, email_flows(name)")
        .eq("email", key)
        .order("started_at", { ascending: false })
        .limit(20)
      const runs = error ? [] : ((data ?? []) as unknown as RunLite[])
      /* A failed read is shown as none, and not kept: the next open asks again. */
      if (!error) runsKept.set(key, { at: Date.now(), runs })
      return runs
    } catch {
      return []
    } finally {
      runsAsked.delete(key)
    }
  })()
  runsAsked.set(key, request)
  return request
}

/**
 * ===========================================================================
 *  WHAT THEY WROTE, FROM A WEBSITE'S CONTACT FORM
 * ===========================================================================
 * Each message sent through a contact form on one of the creator's websites
 * is emailed to them and kept (lib/site-contact), and this is where it is
 * kept: on the page of the person who wrote it, newest first, with a way to
 * reply. Read through the creator's own session; row level security keeps
 * it to their messages. Before the contact form SQL has run there are none,
 * and the card is simply not there.
 */
interface MessageLite {
  id: string
  subject: string | null
  message: string
  site: string | null
  page: string | null
  /** When the copy to the creator's inbox went out; null when it did not. */
  emailed_at: string | null
  created_at: string
}

const messagesKept = new Map<string, { at: number; list: MessageLite[] }>()
const messagesAsked = new Map<string, Promise<MessageLite[]>>()

function keptMessages(email: string): MessageLite[] | null {
  const hit = messagesKept.get(keyOf(email))
  return hit && Date.now() - hit.at < FRESH_MS ? hit.list : null
}

function readMessages(email: string): Promise<MessageLite[]> {
  const key = keyOf(email)
  const kept = keptMessages(email)
  if (kept) return Promise.resolve(kept)
  const asked = messagesAsked.get(key)
  if (asked) return asked
  const request = (async () => {
    try {
      const { data, error } = await createClient()
        .from("site_contact_messages")
        .select("id, subject, message, site, page, emailed_at, created_at")
        .eq("email", key)
        .order("created_at", { ascending: false })
        .limit(20)
      const list = error ? [] : ((data ?? []) as MessageLite[])
      if (!error) messagesKept.set(key, { at: Date.now(), list })
      return list
    } catch {
      return []
    } finally {
      messagesAsked.delete(key)
    }
  })()
  messagesAsked.set(key, request)
  return request
}

/** A finger on a contact's row: ask for what its sheet will show. */
export function prefetchContact(email: string) {
  void readRuns(email)
  void readMessages(email)
}

/**
 * Resolves when the contact's runs and messages are here, or after
 * OPEN_WAIT_MS, whichever is first. The row's pressed colour covers the wait.
 */
export function contactReady(email: string): Promise<void> {
  if (keptRuns(email) && keptMessages(email)) return Promise.resolve()
  return Promise.race([
    Promise.all([readRuns(email), readMessages(email)]).then(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, OPEN_WAIT_MS)),
  ])
}

/** Where a contact stands, in a word: the words the list's badge and Status filter use too. */
export function contactStatusLabel(s: Pick<SubscriberRow, "status" | "unsubscribed_at">): string {
  if (s.status === "subscribed") return s.unsubscribed_at ? tt("Resubscribed") : tt("Subscribed")
  if (s.status === "customer") return tt("Customer")
  /* Wrote through a website's contact form and did not ask for news. */
  if (s.status === "wrote") return tt("Wrote to you")
  if (s.status === "bounced") return tt("Bounced")
  if (s.status === "complained") return tt("Marked as spam")
  return tt("Unsubscribed")
}

function day(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric", year: "numeric" }))
}

export const RUN_STATUS: Record<string, { label: string; tone: "neutral" | "attention" | "critical" | "success" }> = {
  active: { get label() { return tt("In progress") }, tone: "attention" },
  completed: { get label() { return tt("Finished") }, tone: "success" },
  exited: { get label() { return ttx("person", "Left") }, tone: "neutral" },
  cancelled: { get label() { return tt("Stopped") }, tone: "neutral" },
  failed: { get label() { return tt("Failed") }, tone: "critical" },
}

/**
 * One contact, as a page. `contact` is null only while a reloaded
 * /app/emails?contact=<id> is still reading the list it comes from.
 */
export function ContactPage({
  contact,
  onBack,
  onCopy,
  onRemove,
}: {
  contact: SubscriberRow | null
  onBack: () => void
  onCopy: (email: string) => void
  onRemove: (id: string) => void
}) {
  const back = (
    <button type="button" onClick={onBack} aria-label={tt("Back to subscribers")} className={cn(iconButton, "h-9 w-9")}>
      <ArrowLeft className="h-5 w-5" />
    </button>
  )
  if (!contact) {
    return (
      <>
        <OrderBarFrame back={back} title={<h1 className="text-[20px] font-bold leading-7 text-[#1a1a2e]">{tt("Contact")}</h1>} subtitle={null} />
        <div className={cn("orders-body mx-auto pt-4 pb-6", ORDER_WIDTH, GUTTER)}>
          <WaitingArea className="h-[420px]" />
        </div>
      </>
    )
  }
  const status = contactStatusLabel(contact)
  const joined = day(contact.subscribed_at)
  const removable = contact.status === "subscribed"
  return (
    <>
      <OrderBarFrame
        back={back}
        title={
          <>
            <h1 className="min-w-0 truncate text-[20px] font-bold leading-7 text-[#1a1a2e]">{contact.name || contact.email}</h1>
            <StatusBadge tone={contact.status === "subscribed" ? "success" : "neutral"}>{status}</StatusBadge>
          </>
        }
        actions={
          <ResponsiveActionMenu
            title={contact.email}
            menuWidth="w-56"
            items={[
              { label: tt("Copy email"), onClick: () => onCopy(contact.email) },
              ...(removable ? [{ label: tt("Remove"), variant: "destructive" as const, separatorBefore: true, onClick: () => onRemove(contact.id) }] : []),
            ]}
            trigger={
              <button type="button" className={cn(buttonSecondary, "shrink-0 px-2.5 sm:px-3")} aria-label={tt("More actions")}>
                <span className="hidden sm:inline">{tt("More actions")}</span>
                <MoreHorizontal className="h-4 w-4 sm:hidden" />
                <ChevronDown className="hidden h-4 w-4 sm:block" />
              </button>
            }
          />
        }
        subtitle={
          <>
            {contact.name ? contact.email : null}
            {contact.name && joined ? " · " : null}
            {joined ? `${contact.status === "customer" ? tt("Added") : contact.status === "wrote" ? tt("First wrote") : tt("Joined")} ${joined}` : null}
          </>
        }
      />
      <div className={cn("orders-body mx-auto pt-4 pb-6", ORDER_WIDTH, GUTTER)}>
        <ContactBody key={keyOf(contact.email)} contact={contact} />
      </div>
    </>
  )
}

function ContactBody({ contact }: { contact: SubscriberRow }) {
  const source = sourceView(contact.source_detail, contact.source)
  /* What the tap already read, so the sheet rises with it in place. */
  const [runs, setRuns] = React.useState<RunLite[] | null>(() => keptRuns(contact.email))
  const [messages, setMessages] = React.useState<MessageLite[] | null>(() => keptMessages(contact.email))

  React.useEffect(() => {
    /* Kept runs come back as the same list, which draws nothing again. */
    let alive = true
    readRuns(contact.email).then((list) => {
      if (alive) setRuns(list)
    })
    readMessages(contact.email).then((list) => {
      if (alive) setMessages(list)
    })
    return () => {
      alive = false
    }
  }, [contact.email])

  const status = contactStatusLabel(contact)

  return (
    <div data-contact-body="" className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
      {messages && messages.length > 0 ? (
        <section className={cn(card, "min-w-0 px-4 pb-3 pt-3.5 lg:col-start-1")} data-contact-messages="">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Messages")}</h2>
            <a
              href={`mailto:${encodeURIComponent(contact.email)}${messages[0].subject ? `?subject=${encodeURIComponent(`Re: ${messages[0].subject}`)}` : ""}`}
              className="text-[13px] font-medium text-[#1a1a2e] underline-offset-4 hover:underline"
            >
              {tt("Reply")}
            </a>
          </div>
          <ul className="-mx-4 mt-2 divide-y divide-[#f1f2f4] border-t border-[#f1f2f4]">
            {messages.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <p className="text-[12px] text-[#6b7280]">
                  {day(m.created_at)}
                  {m.site ? ` · ${m.site}${m.page && m.page !== "home" ? `/${m.page}` : ""}` : ""}
                  {m.emailed_at ? null : ` · ${tt("Not sent to your inbox")}`}
                </p>
                {m.subject ? <p className="mt-1 break-words text-[14px] font-medium text-[#1a1a2e]">{m.subject}</p> : null}
                <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-6 text-[#374151]">{m.message}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className={cn(card, "min-w-0 px-4 pb-3 pt-3.5 lg:col-start-1", messages && messages.length > 0 ? "" : "lg:row-start-1")}>
        <h2 className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Automations")}</h2>
        {runs === null ? (
          <div className="mt-3 space-y-2" aria-busy="true">
            <div className="h-11 rounded-lg bg-[#f4f5f7]" />
            <div className="h-11 rounded-lg bg-[#f7f8f9]" />
          </div>
        ) : runs.length === 0 ? (
          <p className="mt-1.5 pb-1 text-[13px] text-[#6b7280]">{tt("None yet. When an automation starts for them, it shows here.")}</p>
        ) : (
          <ul className="-mx-4 mt-2 divide-y divide-[#f1f2f4] border-t border-[#f1f2f4]">
            {runs.map((r) => {
              const st = RUN_STATUS[r.status] ?? RUN_STATUS.cancelled
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <a href={`/app/emails/flow/${r.flow_id}`} className="block truncate text-[14px] font-medium text-[#1a1a2e] hover:underline">
                      {r.email_flows?.name ?? tt("Deleted flow")}
                    </a>
                    <p className="truncate text-[12px] text-[#6b7280]">
                      {day(r.started_at)}
                      {r.exit_reason ? ` · ${r.exit_reason}` : ""}
                    </p>
                  </div>
                  <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className={cn(card, "min-w-0 px-4 pb-4 pt-3.5 lg:col-start-2 lg:row-start-1")}>
        <h2 className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Details")}</h2>
        <dl className="mt-3 grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-3 text-[13px]">
          <dt className="text-[#6b7280]">{tt("Email")}</dt>
          <dd className="min-w-0 break-words text-[#1a1a2e]">{contact.email}</dd>
          {contact.name ? (
            <>
              <dt className="text-[#6b7280]">{tt("Name")}</dt>
              <dd className="min-w-0 break-words text-[#1a1a2e]">{contact.name}</dd>
            </>
          ) : null}
          <dt className="text-[#6b7280]">{tt("Status")}</dt>
          <dd>
            <StatusBadge tone={contact.status === "subscribed" ? "success" : "neutral"}>{status}</StatusBadge>
          </dd>
          <dt className="text-[#6b7280]">{contact.status === "customer" ? tt("Added") : contact.status === "wrote" ? tt("First wrote") : tt("Joined")}</dt>
          <dd className="text-[#1a1a2e]">{day(contact.subscribed_at) || tt("Not recorded")}</dd>
          <dt className="text-[#6b7280]">{tt("Source")}</dt>
          <dd className="min-w-0">
            <span className={cn("block break-words font-medium", source.recorded ? "text-[#1a1a2e]" : "text-[#6b7280]")}>{source.label}</span>
            {source.detail ? <span className="block break-words text-[#6b7280]">{source.detail}</span> : null}
          </dd>
          {contact.consent_text ? (
            <>
              <dt className="text-[#6b7280]">{tt("Consent")}</dt>
              <dd className="break-words text-[#4b5563]">{contact.consent_text}</dd>
            </>
          ) : null}
        </dl>
      </section>
    </div>
  )
}
