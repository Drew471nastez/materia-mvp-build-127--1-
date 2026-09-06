"use client"

/**
 * Home / Products across the top of a creator's page.
 *
 * The panels are SERVER-RENDERED and handed in as props. This component only
 * decides which one is on screen, so switching tabs costs nothing — no fetch,
 * no spinner, no second render of the sections — and the Home panel is still
 * in the first HTML the visitor receives, which is what search engines and a
 * cold load actually get.
 *
 * ON THE THIRD TAB: "Communities" is a paid membership a creator sells
 * alongside their products, and Storelib has no such thing — `community_posts`
 * is the creator's own dashboard feed, not something anyone can join or be
 * charged for. The tab is there anyway because it was asked for, and it says
 * so in the panel rather than opening onto nothing. When the feature exists,
 * the panel is the only thing that has to change.
 */

import * as React from "react"
import { cn } from "@/lib/utils"

export interface StorefrontTab {
  id: string
  label: string
  panel: React.ReactNode
}

/**
 * Shown by a tab that has nothing behind it yet.
 *
 * Communities is on the page because it was asked for, with the feature not
 * built — so the tab has to say that plainly. A blank panel reads as broken; a
 * sentence reads as "not yet", which is what it is.
 */
export function EmptyTabPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-3 py-16 sm:px-4 lg:px-6">
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <p className="font-medium text-foreground">{title}</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

export function StorefrontTabs({ tabs }: { tabs: StorefrontTab[] }) {
  const [active, setActive] = React.useState(tabs[0]?.id)

  // A single tab is not a choice; showing a lone "Home" button is noise.
  if (tabs.length < 2) return <>{tabs[0]?.panel ?? null}</>

  return (
    <>
      {/*
        LEFT-ALIGNED, AND STILL NO FULL-WIDTH RULE.

        The strip used to sit on a `border-b` spanning the whole 1100px column,
        which cut the page in half under a header that is centred and has no
        other hard edges in it. That rule is gone for good — the only line is
        the one under the active tab, which is the line that means something.

        The tabs themselves are back on the left, where they line up with the
        content they switch: the product grid below starts at the same edge, so
        the eye follows one vertical, not two.
      */}
      <div className="mx-auto w-full max-w-[1100px] px-3 sm:px-4 lg:px-6">
        <div className="flex gap-7" role="tablist">
          {tabs.map((tab) => {
            const selected = tab.id === active
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`storefront-panel-${tab.id}`}
                onClick={() => setActive(tab.id)}
                className={cn(
                  "border-b-2 px-1 pb-2.5 pt-1 text-sm transition-colors",
                  selected
                    ? "border-foreground font-semibold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/*
        Every panel stays mounted and the inactive ones are hidden, rather than
        being unmounted and rebuilt. Switching back to Home does not re-run the
        sections or re-fetch a single image, and anything a visitor had scrolled
        or typed into a panel is still there when they return.
      */}
      {tabs.map((tab) => (
        <div key={tab.id} id={`storefront-panel-${tab.id}`} role="tabpanel" hidden={tab.id !== active}>
          {tab.panel}
        </div>
      ))}
    </>
  )
}
