/**
 * The space pills as the feed draws them, for scripts/check-space-pills16.mjs:
 * the real row (components/community/member/space-chips.tsx) at the top of a
 * page under the real pull to refresh (components/ui/pull-to-refresh.tsx),
 * where the feed has them. A pick chooses the pill at once and, LIST_AFTER_MS
 * later, does what drawing a new list does to the page's thread: a block of
 * work (BUILD_MS, 90 by default, the longest the feed measured at 4x CPU) and
 * a new list of cards. Each pick and each refresh is counted on window.
 */
import React, { useState } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { SpaceChips, type ChipPick } from "@/components/community/member/space-chips"
import { LIST_AFTER_MS } from "@/components/community/member/chip-hit"
import { PullToRefresh } from "@/components/ui/pull-to-refresh"
import type { SpaceView } from "@/components/community/member/view-types"

type W = Window & { __picks: string[]; __refreshes: number; __buildMs?: number }
const w = window as unknown as W
w.__picks = []
w.__refreshes = 0

const space = (slug: string, name: string, icon: string): SpaceView => ({ id: slug, slug, name, description: null, icon, kind: "feed", canPost: true, commentsEnabled: true, unread: 0 })
const SPACES: SpaceView[] = [
  space("general", "General", "messages-square"),
  space("announcements", "Announcements", "megaphone"),
  space("introductions", "Introductions", "hand"),
  space("glazes", "Glazes", "🎨"),
  space("firing", "Firing logs", "🔥"),
  space("critique", "Critique", "🎯"),
]

function List({ name }: { name: string }) {
  return (
    <div className="space-y-3 px-4 sm:px-0" data-probe-list={name}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={`${name}-${i}`} className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[15px] font-semibold text-[#1a1a2e]">
            {name} post {i + 1}
          </p>
          <p className="mt-1 text-[14px] text-[#6b7280]">A few words about the post, as a card in the feed would have them.</p>
        </div>
      ))}
    </div>
  )
}

function Feed() {
  const [active, setActive] = useState<string | null>(null)
  const [list, setList] = useState("All")
  const pick = (p: ChipPick) => {
    const slug = p.kind === "space" ? p.slug : null
    w.__picks.push(slug ?? "all")
    setActive(slug)
    window.setTimeout(() => {
      requestAnimationFrame(() => {
        const end = performance.now() + (w.__buildMs ?? 90)
        while (performance.now() < end) {
          /* the page's thread, busy building the new list */
        }
        flushSync(() => setList(slug ?? "All"))
      })
    }, LIST_AFTER_MS)
  }
  return (
    <PullToRefresh onRefresh={() => new Promise<void>((r) => window.setTimeout(() => ((w.__refreshes += 1), r()), 300))}>
      <div className="min-h-[200vh] bg-[#f8f9fa]">
        <header className="sticky top-0 z-30 flex h-14 items-center border-b border-[#e5e7eb] bg-white px-4 text-[16px] font-semibold text-[#1a1a2e]">Clay Studio</header>
        <div className="mx-auto max-w-[680px] pt-4">
          <SpaceChips slug="clay-studio" spaces={SPACES} active={active} onPick={pick} />
          <List name={list} />
        </div>
      </div>
    </PullToRefresh>
  )
}

createRoot(document.getElementById("app")!).render(<Feed />)
