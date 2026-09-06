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
        UNDERLINE TABS ON A RULE. The pills came first and went; this is what
        was asked for in the end, and it is the shape the rest of the web uses
        for exactly this job.

        The rule runs the full width of the content column and the active tab
        sits ON it, breaking it — which is what makes the selection read as a
        position rather than as a highlight. The underline slides in width and
        colour rather than snapping.
      */}
      <div className="mx-auto w-full max-w-[1100px] px-3 pt-1 sm:px-4 lg:px-6">
        {/*
          CENTRED ON A PHONE, left-aligned from `sm` up.

          Three short words in a 390px column read as centred whether you meant
          it or not — pushed to the left edge they looked like the start of a
          row that had lost its other half. On desktop they line up with the
          grid below, where there is enough width for that to read as
          deliberate.
        */}
        <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div
            className="flex min-w-max justify-center gap-7 border-b border-border sm:justify-start"
            role="tablist"
          >
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
                    "-mb-px whitespace-nowrap border-b-2 px-0.5 pb-3 pt-1 text-sm",
                    "transition-[color,border-color] duration-200 ease-out",
                    selected
                      ? "border-foreground font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/*
        Every panel stays mounted and the inactive ones are hidden, rather than
        being unmounted and rebuilt. Switching back to Home does not re-run the
        sections or re-fetch a single image, and anything a visitor had scrolled
        or typed into a panel is still there when they return.
      */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`storefront-panel-${tab.id}`}
          role="tabpanel"
          hidden={tab.id !== active}
          /**
           * ONE TOP GAP FOR EVERY PANEL, forced.
           *
           * Each panel used to bring its own: the Home tab's first section
           * carries a `paddingTop` from the creator's spacing settings, the
           * Products grid had `py-8`, the empty states had `py-16`. So the
           * distance from the tab bar to the content changed as you switched
           * tabs — measured 48px on Home against 40px on Products — which
           * reads as the page shifting under you.
           *
           * The gap is set HERE and the panel's own top padding is zeroed —
           * two levels deep, because a Home section nests its spacing inside a
           * SectionContainer and zeroing only the outer wrapper still left the
           * inner 24px on top of this one.
           *
           * `!` because a section's padding arrives as an inline style, and an
           * inline style beats a class. This is the one place allowed to
           * overrule it.
           */
          className={cn(
            "pt-8 [&>*:first-child]:!pt-0 [&>*:first-child>*:first-child]:!pt-0",
            /**
             * The switch used to be instantaneous, which reads as a jump
             * rather than as a change — the old panel is simply replaced
             * mid-blink. A short fade-and-rise on the incoming panel gives the
             * eye something to follow.
             *
             * Only the panel arriving animates; the one leaving is hidden
             * immediately, because animating both means a frame where neither
             * is readable. `motion-reduce` turns it off entirely.
             */
            /**
             * OPACITY ONLY, and short. The first version also rose 6px, which
             * on a grid of product images reads as the cards jumping rather
             * than as the panel arriving — the movement draws the eye to the
             * pictures at exactly the moment they are least settled.
             */
            tab.id === active && "animate-[storefront-tab-in_140ms_ease-out] motion-reduce:animate-none",
          )}
        >
          {tab.panel}
        </div>
      ))}
    </>
  )
}
