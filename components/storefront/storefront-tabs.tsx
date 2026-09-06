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
 * ON THE THIRD TAB: the design this was taken from also has "Communities", a
 * paid membership a creator sells alongside their products. Storelib has no
 * such thing — `community_posts` is the creator's own dashboard feed, not
 * something anyone can join or be charged for — so there is no tab for it.
 * Rendering one that leads to an empty panel would be worse than not having
 * it. `tabs` is a list rather than three hardcoded buttons precisely so that
 * the day paid communities exist, they get a tab by appearing in the data.
 */

import * as React from "react"
import { cn } from "@/lib/utils"

export interface StorefrontTab {
  id: string
  label: string
  panel: React.ReactNode
}

export function StorefrontTabs({ tabs }: { tabs: StorefrontTab[] }) {
  const [active, setActive] = React.useState(tabs[0]?.id)

  // A single tab is not a choice; showing a lone "Home" button is noise.
  if (tabs.length < 2) return <>{tabs[0]?.panel ?? null}</>

  return (
    <>
      {/*
        NO FULL-WIDTH RULE. The strip used to sit on a `border-b` spanning the
        whole 1100px column, which cut the page in half under a header that is
        centred and has no other hard edges in it. The only line now is the one
        under the active tab, which is the line that means something.

        Centred, too, for the same reason: the name, handle, bio and icons above
        are all on the centre line, and a left-aligned pair of words with no rule
        to anchor them reads as though it slipped.
      */}
      <div className="mx-auto w-full max-w-[1100px] px-3 sm:px-4 lg:px-6">
        <div className="flex justify-center gap-8" role="tablist">
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
