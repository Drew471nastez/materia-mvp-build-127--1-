"use client"

/**
 * ===========================================================================
 *  ASK STORELIB'S HISTORY: EVERY CONVERSATION ON THIS WEBSITE
 * ===========================================================================
 * The sub page the history button slides in. Newest first, under the day
 * they were last used (Today, Yesterday, Previous 7 days, then months), each
 * named by the first thing asked in it. Opening one slides back to the
 * thread with that conversation in it.
 *
 * DELETING. A row's bin asks in place, "Delete this chat?", and the row
 * itself becomes the question: no dialog over the chat. "Delete all chats"
 * at the foot does the same for every conversation on this website. Both go
 * to routes that prove the signed in creator owns the website and delete
 * only what their own client can read (lib/website-builder/agent/chat.ts).
 *
 * BEFORE THE DATABASE UPDATE the list cannot be kept, and it says so in one
 * sentence rather than looking empty; the one thread there is can still be
 * deleted.
 *
 * Read from app/api/website-builder/themes/[installId]/chat/conversations
 * every time it opens (`refreshKey`), because the conversation just had
 * moves to the top the moment it is used.
 */

import * as React from "react"
import { Loader2, Trash2 } from "lucide-react"

import {
  deleteAllConversations,
  deleteConversation,
  listConversations,
  type DeleteProblem,
  type HistoryProblem,
  type ListedConversation,
} from "@/lib/website-builder/ask-client"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

/** What a row opens: a conversation by id, or the messages from before conversations. */
export type HistoryTarget = { kind: "one"; id: string; title: string } | { kind: "earlier" }

/** What was deleted, for the chat to follow: one row, or every conversation. */
export type DeletedTarget = HistoryTarget | { kind: "all" }

/** "Just now", "12 min ago", "14:05", "Yesterday", "Mon", "3 Sep", "3 Sep 2025". */
export function whenLabel(iso: string, now = Date.now()): string {
  const at = new Date(iso)
  const ms = now - at.getTime()
  if (!Number.isFinite(ms)) return ""
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return tt("Just now")
  if (minutes < 60) return tt("{minutes} min ago", { minutes })
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const day = new Date(at)
  day.setHours(0, 0, 0, 0)
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000)
  if (days === 0) return at.toLocaleTimeString(appLocale(), zoned({ hour: "numeric", minute: "2-digit" }))
  if (days === 1) return tt("Yesterday")
  if (days < 7) return at.toLocaleDateString(appLocale(), zoned({ weekday: "short" }))
  return at.toLocaleDateString(appLocale(), zoned({
    day: "numeric",
    month: "short",
    ...(at.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  }))
}

/** The heading a conversation is filed under: "Today", "Yesterday", "Previous 7 days", "Previous 30 days", "August 2026". */
export function dayGroup(iso: string, now = Date.now()): string {
  const at = new Date(iso)
  if (!Number.isFinite(at.getTime())) return tt("Earlier")
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const day = new Date(at)
  day.setHours(0, 0, 0, 0)
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000)
  if (days <= 0) return tt("Today")
  if (days === 1) return tt("Yesterday")
  if (days < 7) return tt("Previous 7 days")
  if (days < 30) return tt("Previous 30 days")
  return at.toLocaleDateString(appLocale(), zoned({ month: "long", year: "numeric" }))
}

interface Item {
  key: string
  title: string
  when: string
  target: HistoryTarget
  active: boolean
}

const DELETE_PROBLEM: Record<DeleteProblem, string> = {
  get not_set_up() { return tt("Deleting needs the database update to be run first.") },
  get not_found() { return tt("That chat was already gone.") },
  get failed() { return tt("That did not delete. Try again in a moment.") },
}

export function AskHistory({
  installId,
  refreshKey,
  current,
  locked,
  phone,
  onOpen,
  onDeleted,
}: {
  installId: string
  refreshKey: number
  /** The conversation on screen, marked in the list. */
  current: { id: string | null; earlier: boolean }
  /** A change is still running: another conversation cannot be opened, nor this one deleted, until it ends. */
  locked: boolean
  phone: boolean
  onOpen: (target: HistoryTarget) => void
  onDeleted: (target: DeletedTarget) => void
}) {
  const [rows, setRows] = React.useState<ListedConversation[] | null>(null)
  const [earlier, setEarlier] = React.useState<{ preview: string; updatedAt: string } | null>(null)
  const [problem, setProblem] = React.useState<HistoryProblem | null>(null)
  /** The row asking "Delete this chat?", or "all" for the foot. */
  const [confirming, setConfirming] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (refreshKey === 0) return
    let live = true
    setProblem(null)
    setConfirming(null)
    setNotice(null)
    void listConversations(installId).then((answer) => {
      if (!live) return
      if (answer.ok === false) {
        setProblem(answer.problem)
        setRows((was) => was ?? [])
        return
      }
      setRows(answer.conversations)
      setEarlier(answer.earlier)
    })
    return () => {
      live = false
    }
  }, [installId, refreshKey])

  /* The earlier thread takes its place by date among the others. */
  const items: Item[] = []
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
    items.push({ key: "earlier", title: earlier.preview, when: earlier.updatedAt, target: { kind: "earlier" }, active: current.earlier })
  }
  items.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())

  const groups: { label: string; items: Item[] }[] = []
  for (const item of items) {
    const label = dayGroup(item.when)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }

  const removeOne = async (item: Item) => {
    setBusy(true)
    setNotice(null)
    const answer = await deleteConversation(installId, item.target.kind === "one" ? item.target.id : "earlier")
    setBusy(false)
    setConfirming(null)
    if (answer.ok === false && answer.problem !== "not_found") {
      setNotice(DELETE_PROBLEM[answer.problem])
      return
    }
    if (item.target.kind === "one") setRows((was) => (was ?? []).filter((row) => row.id !== item.key))
    else setEarlier(null)
    onDeleted(item.target)
  }

  const removeAll = async () => {
    setBusy(true)
    setNotice(null)
    const answer = await deleteAllConversations(installId)
    setBusy(false)
    setConfirming(null)
    if (answer.ok === false) {
      setNotice(DELETE_PROBLEM[answer.problem])
      return
    }
    setRows([])
    setEarlier(null)
    onDeleted({ kind: "all" })
  }

  const rowHeight = phone ? "min-h-[52px]" : "min-h-[44px]"
  const confirmButtons = (onYes: () => void, yes: string) => (
    <>
      <button
        type="button"
        data-history-confirm-yes=""
        onClick={onYes}
        disabled={busy}
        className={cn("shrink-0 rounded-full bg-[#dc2626] px-3 text-[12.5px] font-medium text-white transition-opacity disabled:opacity-60", phone ? "h-10" : "h-8")}
      >
        {busy ? tt("Deleting") : yes}
      </button>
      <button
        type="button"
        data-history-confirm-no=""
        onClick={() => setConfirming(null)}
        disabled={busy}
        className={cn("shrink-0 rounded-full px-2.5 text-[12.5px] text-[#6b7280] hover:text-[#1a1a2e]", phone ? "h-10" : "h-8")}
      >
        {tt("Keep")}
      </button>
    </>
  )

  return (
    <div data-ask-history="" className="h-full min-h-0 overflow-y-auto overscroll-contain px-2 pb-3 [touch-action:pan-y]">
      {notice && (
        <p role="alert" data-history-notice="" className="px-3 pb-1 pt-2 text-[12.5px] text-[#b45309]">
          {notice}
        </p>
      )}
      {rows === null ? (
        <p className="flex items-center gap-2 px-3 py-3 text-[13px] text-[#6b7280]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {tt("Loading")}
        </p>
      ) : problem === "not_set_up" ? (
        <div data-history-not-set-up="" className="px-3 py-3">
          <p className="text-[13px] leading-relaxed text-[#1a1a2e]">{tt("History turns on once the database update is run.")}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#6b7280]">{tt("Until then your messages on this website are kept as one chat.")}</p>
          <div className="mt-3 flex items-center gap-2">
            {confirming === "all" ? (
              <>
                <span className="min-w-0 flex-1 text-[13px] text-[#1a1a2e]">{tt("Delete this chat?")}</span>
                {confirmButtons(() => void removeAll(), tt("Delete"))}
              </>
            ) : (
              <button
                type="button"
                data-history-delete-all=""
                onClick={() => setConfirming("all")}
                disabled={locked}
                className="h-8 rounded-full text-[12.5px] text-[#6b7280] transition-colors hover:text-[#dc2626] disabled:opacity-40"
              >
                {tt("Delete this chat")}
              </button>
            )}
          </div>
        </div>
      ) : problem === "read_failed" && items.length === 0 ? (
        <p className="px-3 py-3 text-[13px] leading-relaxed text-[#6b7280]">
          {tt("Your chats could not be loaded. Nothing is lost; try again in a moment.")}
        </p>
      ) : items.length === 0 ? (
        <p className="px-3 py-3 text-[13px] leading-relaxed text-[#6b7280]">{tt("No chats yet. Every chat on this website is kept here.")}</p>
      ) : (
        <>
          {locked && (
            <p className="px-3 pb-1 pt-2 text-[12px] text-[#6b7280]">{tt("Other chats open once the current change finishes.")}</p>
          )}
          {groups.map((group) => (
            <section key={group.label} data-history-group={group.label} className="pt-2">
              <h3 className="px-3 pb-1 text-[11.5px] font-medium text-[#6b7280]">{group.label}</h3>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.key} data-history-item={item.key}>
                    {confirming === item.key ? (
                      <div data-history-confirm="" className={cn("flex items-center gap-2 rounded-xl bg-[#dc2626]/[0.06] pl-3 pr-1.5", rowHeight)}>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-[#1a1a2e]">{tt("Delete this chat?")}</span>
                        {confirmButtons(() => void removeOne(item), tt("Delete"))}
                      </div>
                    ) : (
                      <div className="group/row relative">
                        <button
                          type="button"
                          data-history-row={item.key}
                          aria-current={item.active ? "true" : undefined}
                          disabled={locked && !item.active}
                          onClick={() => onOpen(item.target)}
                          className={cn(
                            "flex w-full min-w-0 items-center gap-3 rounded-xl pl-3 text-left transition-colors disabled:opacity-45",
                            rowHeight,
                            phone ? "pr-12" : "pr-3",
                            item.active ? "bg-black/[0.045]" : "hover:bg-black/[0.03] active:bg-black/[0.05]",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#1a1a2e]">{item.title}</span>
                          <span
                            className={cn(
                              "shrink-0 text-[12px] tabular-nums text-[#6b7280] transition-opacity",
                              !phone && "group-focus-within/row:opacity-0 group-hover/row:opacity-0",
                            )}
                          >
                            {whenLabel(item.when)}
                          </span>
                        </button>
                        <button
                          type="button"
                          data-history-delete={item.key}
                          onClick={() => {
                            setNotice(null)
                            setConfirming(item.key)
                          }}
                          disabled={locked && item.active}
                          aria-label={tt("Delete {title}", { title: item.title })}
                          title={tt("Delete")}
                          className={cn(
                            "absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full text-[#6b7280] transition-[opacity,background-color,color] hover:bg-black/[0.05] hover:text-[#dc2626] disabled:hidden",
                            phone ? "h-11 w-11" : "h-8 w-8 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100",
                          )}
                        >
                          <Trash2 className="h-[15px] w-[15px]" strokeWidth={1.8} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <div className="mt-3 border-t border-[#e5e7eb]/70 px-1 pt-2">
            {confirming === "all" ? (
              <div data-history-confirm="all" className={cn("flex items-center gap-2 rounded-xl bg-[#dc2626]/[0.06] pl-2 pr-1.5", rowHeight)}>
                <span className="min-w-0 flex-1 text-[13px] leading-snug text-[#1a1a2e]">
                  {tt("Delete all {length, plural, one {# chat} other {# chats}} on this website?", { length: items.length })}
                </span>
                {confirmButtons(() => void removeAll(), tt("Delete all"))}
              </div>
            ) : (
              <button
                type="button"
                data-history-delete-all=""
                onClick={() => {
                  setNotice(null)
                  setConfirming("all")
                }}
                disabled={locked}
                className={cn("rounded-full px-2 text-[12.5px] text-[#6b7280] transition-colors hover:text-[#dc2626] disabled:opacity-40", phone ? "h-11" : "h-8")}
              >
                {tt("Delete all chats")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
