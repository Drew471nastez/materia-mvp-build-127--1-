"use client"

/**
 * ===========================================================================
 *  ONE CONTACT: WHO, WHERE THEY CAME FROM, AND WHAT THEY HAVE BEEN SENT
 * ===========================================================================
 * Opened from a row of Subscribers. A panel on the right on a desktop, the
 * shared sheet on a phone (components/ui/bottom-sheet). It reads the
 * contact's automation runs itself, through the creator's own session
 * (row level security keeps it to theirs); before the engine's SQL has run
 * there are none, and it says so plainly.
 *
 * "When I click on an email it should open the bottom sheet clean, with no
 * glitch, smooth in and out." What the glitch was, measured:
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
 *   THE SHEET WAS MOUNTED BY AN EFFECT. The contact to show was copied into
 *   state from an effect, so the first render after the tap drew nothing,
 *   and the sheet was created fresh a render later, with its own mount
 *   round. It is always there on a phone now, closed, and opening it is one
 *   render: the sheet's portal and its content land in the same commit, and
 *   its rise starts before that commit is painted.
 *
 *   A SECOND CONTACT SHOWED THE FIRST ONE'S RUNS for a frame, then grey
 *   bars, then its own. The body is keyed by the contact and starts from
 *   what is already known about that contact.
 */

import * as React from "react"
import { X } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { createClient } from "@/lib/supabase/client"
import { sourceView } from "@/lib/contacts/contact-source"
import { cn } from "@/lib/utils"
import { StatusBadge, iconButton } from "../orders/order-parts"
import type { SubscriberRow } from "./emails-home"

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

/** A finger on a contact's row: ask for what its sheet will show. */
export function prefetchContact(email: string) {
  void readRuns(email)
}

/**
 * Resolves when the contact's runs are here, or after OPEN_WAIT_MS, whichever
 * is first. The row's pressed colour covers the wait.
 */
export function contactReady(email: string): Promise<void> {
  if (keptRuns(email)) return Promise.resolve()
  return Promise.race([
    readRuns(email).then(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, OPEN_WAIT_MS)),
  ])
}

/** Where a contact stands, in a word: the words the list's badge and Status filter use too. */
export function contactStatusLabel(s: Pick<SubscriberRow, "status" | "unsubscribed_at">): string {
  if (s.status === "subscribed") return s.unsubscribed_at ? "Resubscribed" : "Subscribed"
  if (s.status === "customer") return "Customer"
  if (s.status === "bounced") return "Bounced"
  if (s.status === "complained") return "Marked as spam"
  return "Unsubscribed"
}

function day(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export const RUN_STATUS: Record<string, { label: string; tone: "neutral" | "attention" | "critical" | "success" }> = {
  active: { label: "In progress", tone: "attention" },
  completed: { label: "Finished", tone: "success" },
  exited: { label: "Left", tone: "neutral" },
  cancelled: { label: "Stopped", tone: "neutral" },
  failed: { label: "Failed", tone: "critical" },
}

function useWide(query = "(min-width: 768px)") {
  const [wide, setWide] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia(query)
    const read = () => setWide(mq.matches)
    read()
    mq.addEventListener("change", read)
    return () => mq.removeEventListener("change", read)
  }, [query])
  return wide
}

export function ContactDetail({ contact, onClose }: { contact: SubscriberRow | null; onClose: () => void }) {
  const wide = useWide()
  const open = contact !== null
  /* The contact on screen, kept while the sheet or panel leaves. Taken while
     rendering, not from an effect, so the render that opens it draws it. */
  const [shown, setShown] = React.useState<SubscriberRow | null>(contact)
  if (contact && contact !== shown) setShown(contact)

  React.useEffect(() => {
    if (!open || !wide) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, wide, onClose])

  if (!wide) {
    /* Always there, closed, so opening is the one render that flips it. */
    return (
      <BottomSheet isOpen={open} onClose={onClose} label={shown?.email ?? "Contact"} hideFrom="md">
        {shown ? <ContactBody key={keyOf(shown.email)} contact={shown} /> : null}
      </BottomSheet>
    )
  }
  if (!shown) return null
  return (
    <div className={cn("fixed inset-0 z-[200]", open ? "" : "pointer-events-none")} aria-hidden={!open}>
      <div className={cn("absolute inset-0 bg-[#1a1a2e]/20 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")} onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={shown.email}
        className={cn(
          "absolute inset-y-2 right-2 flex w-[420px] flex-col overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_24px_60px_-12px_rgba(17,24,39,0.28),0_2px_8px_rgba(17,24,39,0.06)] transition-[translate,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
          open ? "translate-x-0 opacity-100" : "translate-x-6 opacity-0",
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-end border-b border-[#eef0f2] px-2">
          <button type="button" aria-label="Close" className={iconButton} onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ContactBody key={keyOf(shown.email)} contact={shown} />
        </div>
      </aside>
    </div>
  )
}

function ContactBody({ contact }: { contact: SubscriberRow }) {
  const source = sourceView(contact.source_detail, contact.source)
  /* What the tap already read, so the sheet rises with it in place. */
  const [runs, setRuns] = React.useState<RunLite[] | null>(() => keptRuns(contact.email))

  React.useEffect(() => {
    /* Kept runs come back as the same list, which draws nothing again. */
    let alive = true
    readRuns(contact.email).then((list) => {
      if (alive) setRuns(list)
    })
    return () => {
      alive = false
    }
  }, [contact.email])

  const status = contactStatusLabel(contact)

  return (
    <div data-contact-body="" className="px-5 pb-6 pt-3">
      <p className="truncate text-[17px] font-semibold text-[#1a1a2e]">{contact.name || contact.email}</p>
      {contact.name ? <p className="truncate text-[13px] text-[#6b7280]">{contact.email}</p> : null}

      <dl className="mt-5 grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 gap-y-3 text-[13px]">
        <dt className="text-[#6b7280]">Status</dt>
        <dd>
          <StatusBadge tone={contact.status === "subscribed" ? "success" : "neutral"}>{status}</StatusBadge>
        </dd>
        <dt className="text-[#6b7280]">{contact.status === "customer" ? "Added" : "Joined"}</dt>
        <dd className="text-[#1a1a2e]">{day(contact.subscribed_at) || "Not recorded"}</dd>
        <dt className="text-[#6b7280]">Source</dt>
        <dd className="min-w-0">
          <span className={cn("block break-words font-medium", source.recorded ? "text-[#1a1a2e]" : "text-[#6b7280]")}>{source.label}</span>
          {source.detail ? <span className="block break-words text-[#6b7280]">{source.detail}</span> : null}
        </dd>
        {contact.consent_text ? (
          <>
            <dt className="text-[#6b7280]">Consent</dt>
            <dd className="break-words text-[#4b5563]">{contact.consent_text}</dd>
          </>
        ) : null}
      </dl>

      <h3 className="mt-7 text-[13px] font-semibold text-[#1a1a2e]">Automations</h3>
      {runs === null ? (
        <div className="mt-2 space-y-2" aria-busy="true">
          <div className="h-10 rounded-lg bg-[#f4f5f7]" />
          <div className="h-10 rounded-lg bg-[#f7f8f9]" />
        </div>
      ) : runs.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-[#6b7280]">None yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-[#f1f2f4] rounded-xl border border-[#eef0f2]">
          {runs.map((r) => {
            const s = RUN_STATUS[r.status] ?? RUN_STATUS.cancelled
            return (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <a href={`/app/emails/flow/${r.flow_id}`} className="block truncate text-[13px] font-medium text-[#1a1a2e] hover:underline">
                    {r.email_flows?.name ?? "Deleted flow"}
                  </a>
                  <p className="truncate text-[12px] text-[#6b7280]">
                    {day(r.started_at)}
                    {r.exit_reason ? ` · ${r.exit_reason}` : ""}
                  </p>
                </div>
                <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
