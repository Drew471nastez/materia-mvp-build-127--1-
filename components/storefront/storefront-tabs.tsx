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
    <div className="mx-auto w-full max-w-[1100px] px-3 pb-16 sm:px-4 lg:px-6">
      {/*
        `data-panel-spacing` OPTS OUT of the panel reset above.

        That reset zeroes the top padding of a panel's first two levels so
        every tab starts the same distance below the rule — necessary, because
        a Home section carries its spacing as an inline style. But this box is
        two levels deep, so the reset was stripping its `p-10` top as well and
        the heading ended up sitting ON the dashed border with nothing above
        it. The marker says "this padding is mine, leave it".
      */}
      <div data-panel-spacing className="rounded-lg border border-dashed border-border p-10 text-center">
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
          FULL WIDTH ON A PHONE, left-aligned from `sm` up.

          Centring three short words in a 390px column still left them huddled
          in the middle with dead rule either side, and the active underline —
          the thing that says where you are — was as narrow as the word above
          it. Etsy, and every phone tab bar that works, gives each tab an equal
          share of the width: the underline then spans a third of the screen
          and is unmissable, and the tap targets stop being word-sized.

          On desktop they go back to their own widths and line up with the grid
          below, where three stretched tabs across 1100px would read as a
          navigation bar rather than as a filter on the content underneath.
        */}
        <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div
            className="flex w-full gap-0 border-b border-border sm:w-auto sm:min-w-max sm:justify-start sm:gap-7"
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
                    // `flex-1` on a phone so the three share the width evenly;
                    // `sm:flex-none` hands the width back to the words.
                    "-mb-px flex-1 whitespace-nowrap border-b-2 px-0.5 pb-3 pt-1 text-center text-sm sm:flex-none sm:text-left",
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
          /**
           * NO ENTRANCE ANIMATION. There were two, and both were the flash.
           *
           * A fade-in on the arriving panel means the outgoing one is hidden
           * on the same frame the incoming one starts at `opacity: 0` — so
           * every switch opened with a frame of empty page and the product
           * cards appeared to blink into existence. Dropping the 6px rise
           * first made it subtler without making it a different thing.
           *
           * Both panels are already rendered and already hold their images.
           * Swapping which one is visible is genuinely instantaneous, and
           * instantaneous is what "no flash" means. The movement that says a
           * switch happened is the underline sliding under the tab you
           * pressed, which is where the eye already is.
           *
           * The exception a fade would earn — content that has to be fetched —
           * does not apply here and must not be reintroduced without one.
           */
          className='pt-8 [&>*:first-child:not([data-panel-spacing])]:!pt-0 [&>*:first-child>*:first-child:not([data-panel-spacing])]:!pt-0'
        >
          {tab.panel}
        </div>
      ))}
    </>
  )
}
