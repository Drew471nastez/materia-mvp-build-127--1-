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
  const [shown, setShown] = React.useState<SubscriberRow | null>(contact)
  React.useEffect(() => {
    if (contact) setShown(contact)
  }, [contact])

  React.useEffect(() => {
    if (!open || !wide) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, wide, onClose])

  if (!shown) return null
  if (!wide) {
    return (
      <BottomSheet isOpen={open} onClose={onClose} label={shown.email} hideFrom="md">
        <ContactBody contact={shown} />
      </BottomSheet>
    )
  }
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
          <ContactBody contact={shown} />
        </div>
      </aside>
    </div>
  )
}

function ContactBody({ contact }: { contact: SubscriberRow }) {
  const source = sourceView(contact.source_detail, contact.source)
  const [runs, setRuns] = React.useState<RunLite[] | null>(null)

  React.useEffect(() => {
    let alive = true
    setRuns(null)
    ;(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("email_flow_runs")
        .select("id, status, exit_reason, started_at, flow_id, email_flows(name)")
        .eq("email", contact.email.toLowerCase())
        .order("started_at", { ascending: false })
        .limit(20)
      if (alive) setRuns(error ? [] : ((data ?? []) as unknown as RunLite[]))
    })()
    return () => {
      alive = false
    }
  }, [contact.email])

  const status =
    contact.status === "subscribed" ? (contact.unsubscribed_at ? "Resubscribed" : "Subscribed") : contact.status === "unsubscribed" ? "Unsubscribed" : contact.status

  return (
    <div className="px-5 pb-6 pt-3">
      <p className="truncate text-[17px] font-semibold text-[#1a1a2e]">{contact.name || contact.email}</p>
      {contact.name ? <p className="truncate text-[13px] text-[#6b7280]">{contact.email}</p> : null}

      <dl className="mt-5 grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 gap-y-3 text-[13px]">
        <dt className="text-[#6b7280]">Status</dt>
        <dd>
          <StatusBadge tone={contact.status === "subscribed" ? "success" : "neutral"}>{status}</StatusBadge>
        </dd>
        <dt className="text-[#6b7280]">Joined</dt>
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
