"use client"

/**
 * ===========================================================================
 *  ASK STORELIB'S HISTORY: EVERY CONVERSATION ON THIS WEBSITE
 * ===========================================================================
 * The sub page the history button slides in. Newest first, each one named by
 * the first thing asked in it, with when it was last used. Opening one slides
 * back to the thread with that conversation in it.
 *
 * Read from app/api/website-builder/themes/[installId]/chat/conversations,
 * which proves the signed in creator owns this install and reads through
 * their own client, so nothing from another website can be in the list.
 *
 * Fetched every time it opens (`refreshKey`), because the conversation just
 * had moves to the top the moment it is used.
 */

import * as React from "react"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/** What a row opens: a conversation by id, or the messages from before conversations. */
export type HistoryTarget = { kind: "one"; id: string; title: string } | { kind: "earlier" }

interface Listed {
  id: string
  title: string
  updatedAt: string
}

/** "Just now", "12 min ago", "Yesterday", "Mon", "3 Sep", "3 Sep 2025". */
export function whenLabel(iso: string, now = Date.now()): string {
  const at = new Date(iso)
  const ms = now - at.getTime()
  if (!Number.isFinite(ms)) return ""
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} min ago`
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const day = new Date(at)
  day.setHours(0, 0, 0, 0)
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000)
  if (days === 0) return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  if (days === 1) return "Yesterday"
  if (days < 7) return at.toLocaleDateString(undefined, { weekday: "short" })
  return at.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(at.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  })
}

export function AskHistory({
  installId,
  refreshKey,
  current,
  locked,
  phone,
  onOpen,
}: {
  installId: string
  refreshKey: number
  /** The conversation on screen, marked in the list. */
  current: { id: string | null; earlier: boolean }
  /** A change is still running: another conversation cannot be opened until it ends. */
  locked: boolean
  phone: boolean
  onOpen: (target: HistoryTarget) => void
}) {
  const [rows, setRows] = React.useState<Listed[] | null>(null)
  const [earlier, setEarlier] = React.useState<{ preview: string; updatedAt: string } | null>(null)
  const [problem, setProblem] = React.useState<null | "not_set_up" | "read_failed">(null)

  React.useEffect(() => {
    if (refreshKey === 0) return
    let live = true
    setProblem(null)
    void (async () => {
      try {
        const response = await fetch(`/api/website-builder/themes/${installId}/chat/conversations`, { cache: "no-store" })
        const body = (await response.json().catch(() => ({}))) as {
          conversations?: Listed[]
          earlier?: { preview: string; updatedAt: string } | null
          reason?: string
        }
        if (!live) return
        if (!response.ok) {
          setProblem(body.reason === "not_set_up" ? "not_set_up" : "read_failed")
          setRows((was) => was ?? [])
          return
        }
        setRows(body.conversations ?? [])
        setEarlier(body.earlier ?? null)
      } catch {
        if (live) {
          setProblem("read_failed")
          setRows((was) => was ?? [])
        }
      }
    })()
    return () => {
      live = false
    }
  }, [installId, refreshKey])

  /* The earlier thread takes its place by date among the others. */
  const items: Array<{ key: string; title: string; when: string; target: HistoryTarget; active: boolean }> = []
  for (const row of rows ?? []) {
    items.push({
      key: row.id,
      title: row.title,
      when: row.updatedAt,
      target: { kind: "one", id: row.id, title: row.title },
      active: current.id === row.id,
    })
  }
  if (earlier) {
    items.push({
      key: "earlier",
      title: earlier.preview,
      when: earlier.updatedAt,
      target: { kind: "earlier" },
      active: current.earlier,
    })
  }
  items.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())

  return (
    <div data-ask-history="" className="h-full min-h-0 overflow-y-auto overscroll-contain px-2 pb-3 [touch-action:pan-y]">
      {rows === null ? (
        <p className="flex items-center gap-2 px-2 py-3 text-[13px] text-[#6b7280]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading
        </p>
      ) : problem === "not_set_up" ? (
        <p className="px-2 py-3 text-[13px] leading-relaxed text-[#6b7280]">
          Past conversations are not kept on this database yet. This one still works.
        </p>
      ) : problem === "read_failed" && items.length === 0 ? (
        <p className="px-2 py-3 text-[13px] leading-relaxed text-[#6b7280]">
          Your conversations could not be loaded. Nothing is lost; try again in a moment.
        </p>
      ) : items.length === 0 ? (
        <p className="px-2 py-3 text-[13px] leading-relaxed text-[#6b7280]">
          No conversations yet. Ask for a change and it will be kept here.
        </p>
      ) : (
        <>
          {locked && (
            <p className="px-2 pb-2 pt-1 text-[12px] text-[#6b7280]">
              You can open another conversation when the current change finishes.
            </p>
          )}
          <ul className="space-y-0.5">
            {items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  data-history-row={item.key}
                  aria-current={item.active ? "true" : undefined}
                  disabled={locked && !item.active}
                  onClick={() => onOpen(item.target)}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-3 rounded-xl px-3 text-left transition-colors disabled:opacity-45",
                    phone ? "min-h-[52px] py-2" : "min-h-[44px] py-2",
                    item.active ? "bg-black/[0.045]" : "hover:bg-black/[0.03] active:bg-black/[0.05]",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#1a1a2e]">{item.title}</span>
                  <span className="shrink-0 text-[12px] tabular-nums text-[#6b7280]">{whenLabel(item.when)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
