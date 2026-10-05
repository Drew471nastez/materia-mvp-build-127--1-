/**
 * ROUND 13, BLOCKED WORDS, with fixtures, for scripts/check-community-safety.mjs.
 * The real client component (components/community/creator/blocked-words.tsx)
 * inside the Moderation card's Rules view as /app draws it: a slow mode row
 * above it (drawn here as a plain row of the same shape), the rules below.
 *
 *   ?case=edit      the owner, with five words already saved, held for review
 *   ?case=empty     the owner, no words yet
 *   ?case=read      a moderator: the list as text, no box
 *   ?case=load      no `initial`: the component reads GET /words itself
 *
 * /api/app/community/<id>/words is answered by the probe (window.__put has
 * what Save sent).
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { BlockedWords } from "@/components/community/creator/blocked-words"
import { ToastHost, card } from "@/components/community/creator/parts"
import { cn } from "@/lib/utils"
import type { WordSettings } from "@/lib/communities/word-filter"

const which = new URLSearchParams(location.search).get("case") || "edit"
const CID = "c0000000-0000-4000-8000-000000000001"
const saved: WordSettings = { words: ["free followers", "crypto signal*", "telegram group", "dm me for*", "forex"], action: "hold" }
const initial = which === "edit" || which === "read" ? saved : which === "empty" ? { words: [], action: "block" as const } : undefined

function Page() {
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="mx-auto max-w-[1080px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="mb-4 text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Moderation</h1>
        <section className={cn(card, "overflow-hidden")}>
          <div className="flex gap-1 border-b border-[#f1f2f4] px-4 py-2.5 text-[13.5px] font-medium text-[#6b7280] sm:px-5">
            <span className="rounded-md px-2 py-1">Reports</span>
            <span className="rounded-md px-2 py-1">Restricted</span>
            <span className="rounded-md bg-[#f1f2f4] px-2 py-1 text-[#1a1a2e]">Rules</span>
            <span className="rounded-md px-2 py-1">Audit log</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#f1f2f4] px-4 py-3 sm:px-5" data-slow-mode="">
            <div className="min-w-0 flex-1 basis-[220px]">
              <p className="text-[14px] font-medium text-[#1a1a2e]">Slow mode</p>
              <p className="mt-0.5 text-[13px] leading-snug text-[#6b7280]">How often a member can post, comment or send a chat message. The team is never slowed.</p>
            </div>
            <span className="h-10 w-full rounded-lg border border-[#e1e3e7] bg-white px-3 py-2.5 text-[14px] sm:w-[200px]">Off</span>
          </div>
          <BlockedWords communityId={CID} canEdit={which !== "read"} initial={initial} />
          <p className="px-4 py-3 text-[13px] text-[#6b7280] sm:px-5">Shown on the community&rsquo;s page before somebody joins.</p>
        </section>
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <ToastHost>
    <Page />
  </ToastHost>,
)
