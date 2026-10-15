"use client"

/**
 * ===========================================================================
 *  A SECTION THAT IS STILL ON ITS WAY: ITS FRAME
 * ===========================================================================
 * Round 32, the owner: "the navigation between Overview, Posts, Spaces ...
 * takes too much". A section opened for the first time used to keep the
 * last one on screen until the server answered, then a spinner. Now the
 * press shows the section's own frame at once, in the place and the shape
 * the section will have: the same cards, the same card heads, the rows as
 * light gray shapes (components/ui/shimmer, which waits 200ms before it
 * shows, so a quick answer shows only the cards filling in). Drawn by the
 * shell on the press (community-shell.tsx) and by the server page as its
 * Suspense fallback (app/app/community/[id]/<section>/page.tsx), the same
 * markup both times, so the hand over between the two moves nothing.
 *
 * The heads are the section heads' own boxes (ListCard's 52px, 48px from
 * 768px, the toolbar's 48 and 44px), so the first card's head is where the
 * section's will be and the rows land under it.
 * scripts/check-community-admin-round32.mjs measures the difference.
 */
import { cn } from "@/lib/utils"
import { card } from "./parts"
import { Shimmer, ShimmerBlock, ShimmerRows, ShimmerChart } from "@/components/ui/shimmer"
import type { AdminSection } from "./logic"

/** What the frame needs to know about the section that the address alone does not say. */
export interface SectionFrameFacts {
  /** Posts: the writer's card above the list (the section draws it for whoever may post somewhere). */
  composer?: boolean
  /** Settings: the address names no panel, so a phone opens on the list of panels (settings-section.tsx). */
  settingsList?: boolean
}

/** Settings' list of panels on a phone, in its three groups: a group's name over a card of 60px rows. */
function SettingsListFrame() {
  return (
    <Shimmer className="space-y-5 lg:hidden">
      {[4, 3, 1].map((rows, g) => (
        <div key={g}>
          <div className="mb-1.5 flex h-[19.5px] items-center px-1">
            <ShimmerBlock className="h-2.5 w-20 rounded-full" />
          </div>
          <div className={cn(card, "divide-y divide-[#f1f2f4] overflow-hidden")} data-frame-card="">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex min-h-[60px] items-center px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <ShimmerBlock className="h-3 w-28 rounded-full" />
                  <ShimmerBlock className="mt-2 h-2.5 w-48 max-w-full rounded-full" />
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Shimmer>
  )
}

const HEAD = "flex min-h-[52px] items-center gap-2 border-b border-[#eef0f2] py-1.5 pl-1.5 pr-2 md:min-h-12 md:pl-2 md:pr-3"
const TOOLBAR = "flex min-h-12 items-center gap-1 border-b border-[#eef0f2] pl-1 pr-1.5 md:min-h-11 md:pl-2 md:pr-3"

/** A filter's word in a card head: the FilterTabs button's own box (40px, 32px from 768px). */
function HeadWords({ widths }: { widths: number[] }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5">
      {widths.map((w, i) => (
        <span key={i} className={cn("inline-flex h-10 shrink-0 items-center rounded-[10px] px-3 md:h-8 md:rounded-lg md:px-2.5", i === 0 && "bg-[#f4f5f7]")}>
          <ShimmerBlock className="h-2.5 rounded-full" style={{ width: w }} />
        </span>
      ))}
    </div>
  )
}

/** A list card: its head, an optional toolbar under it, and rows. */
function ListFrame({ words, action, toolbar = false, rows, rowHeight, lead = false }: { words: number[]; action?: number; toolbar?: boolean; rows: number; rowHeight: number; lead?: boolean }) {
  return (
    <section className={cn(card, "overflow-hidden")} data-frame-card="">
      <div className={HEAD} data-frame-head="">
        <Shimmer className="flex min-w-0 flex-1 items-center">
          <HeadWords widths={words} />
          {action ? <ShimmerBlock className="ml-auto h-9 shrink-0 rounded-[10px]" style={{ width: action }} /> : null}
        </Shimmer>
      </div>
      {toolbar ? (
        <div className={TOOLBAR}>
          <Shimmer className="flex h-11 flex-1 items-center pl-2 md:h-9">
            <ShimmerBlock className="h-3 w-40 rounded-full" />
          </Shimmer>
        </div>
      ) : null}
      <ShimmerRows rows={rows} rowHeight={rowHeight} cols={["42%", "16%"]} lead={lead} className="px-1 sm:px-2" />
    </section>
  )
}

/** The overview's figures: the Figure cell's own box (components/community/creator/overview.tsx), four of them. */
function FiguresFrame() {
  return (
    <section className={cn(card, "overflow-hidden")} data-frame-card="">
      <Shimmer className="grid grid-cols-2 gap-px bg-[#f1f2f4] sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="bg-white">
            <div className="min-w-0 px-4 py-3.5 sm:px-5 sm:py-4">
              <p className="truncate text-[12.5px] font-medium">
                <ShimmerBlock className="inline-block h-2.5 w-20 rounded-full align-middle" />
              </p>
              <p className="mt-1 text-[22px] font-semibold leading-7">
                <ShimmerBlock className="inline-block h-5 w-16 rounded-md align-middle" />
              </p>
            </div>
          </div>
        ))}
      </Shimmer>
    </section>
  )
}

/** A card with a heading line and a few rows (the overview's checklist, a settings panel). */
function PanelFrame({ rows, className }: { rows: number; className?: string }) {
  return (
    <section className={cn(card, "p-4 sm:p-5", className)} data-frame-card="">
      <Shimmer>
        <div className="flex h-[22px] items-center">
          <ShimmerBlock className="h-3 w-28 rounded-full" />
        </div>
        <ShimmerRows bare rows={rows} rowHeight={52} cols={["56%", "14%"]} inset={false} className="mt-2" />
      </Shimmer>
    </section>
  )
}

export function SectionFrame({ id, facts = {} }: { id: AdminSection; facts?: SectionFrameFacts }) {
  let body: React.ReactNode
  switch (id) {
    case "overview":
      body = (
        <>
          <FiguresFrame />
          <PanelFrame rows={3} />
        </>
      )
      break
    case "feed":
      body = (
        <>
          {facts.composer ? (
            <section className={cn(card, "flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-3.5")} data-frame-card="" data-frame-composer="">
              <Shimmer className="flex h-11 flex-1 items-center gap-3">
                <ShimmerBlock className="h-10 w-10 shrink-0 rounded-full" />
                <ShimmerBlock className="h-3 w-44 rounded-full" />
              </Shimmer>
            </section>
          ) : null}
          <ListFrame words={[64, 64]} rows={6} rowHeight={92} />
        </>
      )
      break
    case "spaces":
      body = <ListFrame words={[120]} action={112} rows={4} rowHeight={68} lead />
      break
    case "classroom":
      body = (
        <>
          <Shimmer className="flex min-h-[44px] items-center">
            <ShimmerBlock className="h-4 w-28 rounded-full" />
          </Shimmer>
          <ListFrame words={[]} rows={3} rowHeight={72} />
        </>
      )
      break
    case "events":
      body = <ListFrame words={[72, 44]} action={104} rows={4} rowHeight={76} />
      break
    case "members":
      body = <ListFrame words={[52, 60, 52, 52]} action={96} toolbar rows={8} rowHeight={64} lead />
      break
    case "moderation":
      body = <ListFrame words={[60, 64, 72, 40]} rows={5} rowHeight={84} />
      break
    case "analytics":
      body = (
        <>
          <Shimmer className="flex h-8 items-center">
            <ShimmerBlock className="h-8 w-48 rounded-[10px]" />
          </Shimmer>
          <section className={cn(card, "p-4 sm:p-5")} data-frame-card="">
            <ShimmerChart height={320} figure />
          </section>
        </>
      )
      break
    case "settings":
      body = (
        <div className="lg:grid lg:grid-cols-[208px_minmax(0,1fr)] lg:items-start lg:gap-8">
          {/* From 1024px the column of panels (the groups' names, then 36px rows), and the panel with its name over it. */}
          <Shimmer className="hidden lg:block">
            {[4, 3, 1].map((rows, g) => (
              <div key={g} className={cn("mb-1", g > 0 && "mt-4")}>
                <div className="flex h-[22px] items-center px-3 pb-1">
                  <ShimmerBlock className="h-2 w-16 rounded-full" />
                </div>
                {Array.from({ length: rows }, (_, i) => (
                  <div key={i} className="flex h-9 items-center px-3">
                    <ShimmerBlock className="h-2.5 rounded-full" style={{ width: 64 + (((g * 4 + i) * 29) % 50) }} />
                  </div>
                ))}
              </div>
            ))}
          </Shimmer>
          {facts.settingsList ? <SettingsListFrame /> : null}
          <div className={cn("min-w-0", facts.settingsList && "max-lg:hidden")}>
            <Shimmer className="mb-4 lg:mb-5">
              {/* The way back to the list, on a phone. */}
              <div className="mb-1.5 h-10 lg:hidden" />
              <p className="text-[20px] font-bold leading-7 lg:text-[22px]">
                <ShimmerBlock className="inline-block h-4 w-32 rounded-full align-middle" />
              </p>
              <p className="mt-0.5 text-[14px]">
                <ShimmerBlock className="inline-block h-2.5 w-64 max-w-full rounded-full align-middle" />
              </p>
            </Shimmer>
            <PanelFrame rows={5} />
          </div>
        </div>
      )
      break
  }
  return (
    <div className="space-y-4" data-section-frame={id} aria-busy="true">
      {body}
    </div>
  )
}
