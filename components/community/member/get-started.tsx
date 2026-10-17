"use client"

/**
 * ===========================================================================
 *  A NEW MEMBER'S FIRST STEPS, ON THE FEED (round 32)
 * ===========================================================================
 * The short list the community's admins chose (Settings › Features › First
 * steps), above the feed for a member's first 30 days until it is done or
 * hidden. Each row is the step and where to do it; the ones a member does
 * anyway (a post, a comment, a lesson, an RSVP, their line about themselves)
 * tick themselves, the rules and the admin's own steps tick when opened.
 *
 * Only asked for when it can be shown: an active member who is not the
 * owner, joined in the last 30 days, who has not hidden it on this device.
 * Asked again when the page comes back into view, so a step done elsewhere
 * is ticked on return. The server decides everything else
 * (app/api/community/[communityId]/get-started).
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Check, ChevronRight } from "lucide-react"
import { checklistWindow, type ChecklistView } from "@/lib/communities/onboarding-checklist"
import type { ViewerView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { CARD } from "./ui"
import { FillBar } from "@/components/ui/fill-bar"

const HIDDEN_KEY = (id: string) => `storelib:first-steps-hidden:${id}`

function hiddenHere(communityId: string): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_KEY(communityId)) === "1"
  } catch {
    return false
  }
}

export function GetStarted({ communityId, viewer }: { communityId: string; viewer: ViewerView }) {
  const eligible = viewer.active && !viewer.isOwner && viewer.role !== "owner" && checklistWindow(viewer.joinedAt ?? null)
  const [list, setList] = useState<ChecklistView | null>(null)
  const [gone, setGone] = useState(false)

  const load = useCallback(async () => {
    const r = await api<{ checklist: ChecklistView | null }>(`${apiBase(communityId)}/get-started`)
    if (r.ok) setList(r.data.checklist)
  }, [communityId])

  useEffect(() => {
    if (!eligible || hiddenHere(communityId)) return
    void load()
    const again = () => {
      if (document.visibilityState === "visible") void load()
    }
    document.addEventListener("visibilitychange", again)
    return () => document.removeEventListener("visibilitychange", again)
  }, [eligible, communityId, load])

  if (!eligible || gone || !list || !list.items.length) return null

  const mark = (id: string) => {
    setList((l) => (l ? { ...l, items: l.items.map((i) => (i.id === id ? { ...i, done: true } : i)), done: l.items.filter((i) => i.done || i.id === id).length } : l))
    void api(`${apiBase(communityId)}/get-started`, { method: "POST", body: { step: id } })
  }
  const hide = () => {
    setGone(true)
    try {
      window.localStorage.setItem(HIDDEN_KEY(communityId), "1")
    } catch {
      /* The server keeps it as well. */
    }
    void api(`${apiBase(communityId)}/get-started`, { method: "POST", body: { step: "dismissed" } })
  }
  const all = list.done >= list.total

  return (
    <section className={`${CARD} overflow-hidden`} data-get-started="" aria-labelledby="get-started-title">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 id="get-started-title" className="text-[15.5px] font-semibold text-[#1a1a2e]">
            {all ? "You're all set" : "First steps"}
          </h2>
          <p className="mt-0.5 text-[13px] tabular-nums text-[#6b7280]" data-get-started-count="">
            {list.done} of {list.total} done
          </p>
        </div>
        <button type="button" onClick={hide} className="-mr-1.5 inline-flex min-h-10 shrink-0 items-center rounded-lg px-2.5 text-[13px] font-medium text-[#6b7280] outline-none transition-colors duration-100 hover:bg-[#f4f5f7] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent]" data-get-started-hide="">
          {all ? "Close" : "Hide"}
        </button>
      </div>
      <FillBar quiet value={list.done} max={Math.max(1, list.total)} size="thin" className="mx-4 sm:mx-5" />
      <ol className="mt-2 divide-y divide-[#f1f2f4] pb-1">
        {list.items.map((item) => {
          const external = !!item.href && /^https:\/\//.test(item.href)
          const inner = (
            <>
              <span aria-hidden className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border transition-colors duration-150 ${item.done ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#c9ccd2] bg-white"}`}>
                {item.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
              </span>
              <span className={`min-w-0 flex-1 text-[14.5px] leading-snug [overflow-wrap:anywhere] ${item.done ? "text-[#8a8f98] line-through decoration-[#c9ccd2]" : "text-[#1a1a2e]"}`}>{item.label}</span>
              {item.href && !item.done ? <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" /> : null}
            </>
          )
          const row = "flex min-h-[48px] w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors duration-100 hover:bg-[#fafafb] active:bg-[#f5f6f7] focus-visible:bg-[#f5f6f7] sm:px-5 [-webkit-tap-highlight-color:transparent]"
          const onOpen = () => {
            if (item.manual && !item.done) mark(item.id)
          }
          return (
            <li key={item.id} data-get-started-step={item.kind} data-done={item.done || undefined}>
              {item.href ? (
                external ? (
                  <a href={item.href} target="_blank" rel="noopener noreferrer" onClick={onOpen} className={row}>
                    {inner}
                  </a>
                ) : (
                  <Link href={item.href} onClick={onOpen} className={row}>
                    {inner}
                  </Link>
                )
              ) : (
                <button type="button" onClick={onOpen} disabled={item.done || !item.manual} className={`${row} disabled:cursor-default`}>
                  {inner}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
