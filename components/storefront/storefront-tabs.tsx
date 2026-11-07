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
import { Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { CommunitiesIllustration } from "./communities-illustration"

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
/**
 * A NAME, NOT A COMPONENT.
 *
 * This took `icon?: React.ComponentType`, and the creator page is a SERVER
 * component, so handing it a lucide icon meant passing a forwardRef object
 * across the server/client boundary. React cannot serialise that, and it
 * does not fail quietly: the whole RSC render throws
 *
 *   "Functions cannot be passed directly to Client Components"
 *
 * which took out every creator's live page, not only the one being edited.
 * A string crosses the boundary; the mapping lives on this side of it.
 */
const EMPTY_ICONS = {
  people: Users,
  communities: CommunitiesIllustration,
} as const

export function EmptyTabPanel({
  title,
  detail,
  icon = "people",
}: {
  title: string
  detail: string
  icon?: keyof typeof EMPTY_ICONS
}) {
  const Icon = (EMPTY_ICONS[icon] ?? Users) as typeof Users
  return (
    <div className="mx-auto w-full max-w-[1180px] px-3 sm:px-4 lg:px-6">
      {/*
        AN ICON AND ONE LINE.

        The box used to carry two sentences explaining that Storelib has no
        paid-communities feature yet — a roadmap note in the middle of
        somebody's shop. A visitor does not need the reason, and the creator
        cannot act on it: all either of them needs is that there is nothing
        here. So it is a mark, four words and a short line, and the box shrank
        by about 60px, which is 60px less of the void underneath.

        `data-panel-spacing` OPTS OUT of the panel reset below. That reset
        zeroes the top padding of a panel's first two levels so every tab
        starts the same distance under the rule — necessary, because a Home
        section carries its spacing as an inline style. But this box is two
        levels deep, so the reset was stripping its own padding too and the
        heading ended up sitting ON the dashed border.
      */}
      <div data-panel-spacing className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
        {/* The drawn mark carries its own colours and size; a glyph is tinted. */}
        {icon === "communities" ? (
          <CommunitiesIllustration className="mx-auto mb-4 h-[88px] w-[112px] sm:mb-5 sm:h-[100px] sm:w-[128px]" />
        ) : (
          <Icon className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" aria-hidden />
        )}
        <p className="font-medium text-foreground">{title}</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

export interface StorefrontTabsSurface {
  textColor?: string
  mutedColor?: string
  borderColor?: string
}

export function StorefrontTabs({
  tabs,
  isMobile = false,
  surface,
}: {
  tabs: StorefrontTab[]
  /**
   * THE SCHEME'S COLOURS, because `text-foreground` is not one.
   *
   * The strip was painted entirely from design-system tokens — foreground for
   * the active tab and the sliding bar, muted-foreground for the others,
   * border for the rule. Those tokens describe the Storelib app, not the
   * creator's page, so on a dark scheme the three labels stayed dark grey on
   * near-black and the rule under them vanished. The classes stay as the
   * fallback for the builder canvas, which renders this without a surface.
   */
  surface?: StorefrontTabsSurface
  /**
   * The store builder's phone preview, where the frame is narrow but the
   * viewport is not — so CSS cannot see it and has to be told. Every other
   * component on this page needed the same escape hatch for the same reason;
   * without it the builder shows a desktop tab strip inside a phone.
   */
  isMobile?: boolean
}) {
  const [active, setActive] = React.useState(tabs[0]?.id)

  /**
   * THE UNDERLINE SLIDES. This is the whole of "make switching feel smooth".
   *
   * The panels themselves swap instantly and must keep doing so — they are
   * already rendered, and fading them in was the flash. But an instant swap
   * with a mark that also teleports gives the eye nothing to follow: you press
   * a word and the page is simply different. So the movement lives in the one
   * element that can move without any content moving with it. The bar travels
   * from the old tab to the new one, and because it changes width as it goes
   * it reads as one object crossing the bar rather than two marks blinking.
   *
   * It is measured, not computed from a fraction of the width: the tabs are
   * equal thirds on a phone but their own widths on desktop, and a font
   * loading late changes those widths after first paint.
   */
  const listRef = React.useRef<HTMLDivElement>(null)
  const tabRefs = React.useRef(new Map<string, HTMLButtonElement>())
  const [bar, setBar] = React.useState<{ left: number; width: number } | null>(null)
  const panelsRef = React.useRef<HTMLDivElement>(null)
  /** Where the strip was on screen the moment a tab was pressed. */
  const heldAt = React.useRef<number | null>(null)

  const choose = (id: string) => {
    if (id === active) return
    heldAt.current = listRef.current ? listRef.current.getBoundingClientRect().top : null
    setActive(id)
    /* In a row that scrolls sideways, the tab opened is shown whole (round 50). Only the row moves: the page does not. */
    const tab = tabRefs.current.get(id)
    const row = tab?.closest<HTMLElement>(".overflow-x-auto")
    if (tab && row && row.scrollWidth > row.clientWidth) {
      const t = tab.getBoundingClientRect()
      const r = row.getBoundingClientRect()
      const by = t.left < r.left ? t.left - r.left - 12 : t.right > r.right ? t.right - r.right + 12 : 0
      if (by !== 0) row.scrollBy({ left: by, behavior: "smooth" })
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  THE STRIP STAYS UNDER THE FINGER
   * ═══════════════════════════════════════════════════════════════════════
   * Scrolled down a long Home and pressing Communities, the page got shorter
   * than the scroll position. The browser clamps that, so the whole page,
   * strip included, dropped down the screen by the difference: measured at
   * 115px on a 1280 window. That is the jump.
   *
   * So, before paint, the strip is put back where it was: the panels are
   * given exactly the room the clamp took away and the scroll is handed back.
   * Nothing moves on screen. The room is only ever what the clamp took, and
   * it goes again (below) as soon as it is out of sight, so the page does not
   * end in a hole once the visitor scrolls on.
   */
  React.useLayoutEffect(() => {
    const panels = panelsRef.current
    const list = listRef.current
    const was = heldAt.current
    heldAt.current = null
    if (!panels || !list) return
    panels.style.minHeight = ""
    if (was === null) return
    const drift = list.getBoundingClientRect().top - was
    if (drift < 0.5) return

    const scroller = scrollParent(list)
    const natural = panels.offsetHeight
    panels.style.minHeight = `${natural + drift}px`
    if (scroller) scroller.scrollTop += drift
    else window.scrollBy(0, drift)

    /* Gone once the held room is wholly below what can be seen. */
    const target: HTMLElement | Window = scroller ?? window
    const release = () => {
      const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight
      if (panels.getBoundingClientRect().top + natural <= bottom) return
      panels.style.minHeight = ""
      target.removeEventListener("scroll", release)
    }
    target.addEventListener("scroll", release, { passive: true })
    return () => target.removeEventListener("scroll", release)
  }, [active])

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  THE OTHER TABS' PICTURES ARE FETCHED BEFORE THEY ARE ASKED FOR
   * ═══════════════════════════════════════════════════════════════════════
   * A panel that is not showing is `hidden`, which is `display: none`, and a
   * lazy picture inside it is never requested. So the first press of
   * Products opened a grid of grey boxes that filled in one by one a
   * moment later: measured, none of nine pictures ready on the first frame.
   * That, not the panel swap, was the flash.
   *
   * Once the page has loaded and the browser is idle, the pictures in the
   * hidden panels are asked for and decoded. The first press then shows a
   * finished grid. Not on a connection that asked to save data, and only the
   * first couple of dozen, which is more than a phone shows at once.
   */
  React.useEffect(() => {
    if (tabs.length < 2) return
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (connection?.saveData) return
    let idle: number | null = null
    let timer: number | null = null
    const warm = () => {
      const panels = panelsRef.current
      if (!panels) return
      const waiting = panels.querySelectorAll<HTMLImageElement>('[role="tabpanel"][hidden] img[loading="lazy"]')
      waiting.forEach((img, i) => {
        if (i >= 24) return
        img.loading = "eager"
        img.decode?.().catch(() => {})
      })
    }
    const start = () => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
      if (w.requestIdleCallback) idle = w.requestIdleCallback(warm, { timeout: 2500 })
      else timer = window.setTimeout(warm, 800)
    }
    if (document.readyState === "complete") start()
    else window.addEventListener("load", start, { once: true })
    return () => {
      window.removeEventListener("load", start)
      const w = window as Window & { cancelIdleCallback?: (id: number) => void }
      if (idle !== null) w.cancelIdleCallback?.(idle)
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [tabs.length])

  React.useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current.get(active)
      if (!el) return
      setBar({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()

    // Widths change without the tab changing: rotation, a late webfont, the
    // strip being laid out inside something that resizes.
    const list = listRef.current
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    if (list && observer) observer.observe(list)
    window.addEventListener("resize", measure)
    document.fonts?.ready.then(measure).catch(() => {})

    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [active, tabs.length])

  /**
   * NO CONTEXT FOR SWITCHING TABS FROM INSIDE A PANEL.
   *
   * There was one, for a "View all products →" link on the Home rail. The link
   * is gone — the tab strip is directly above it saying "Products", and a
   * second control two inches below the first is not a shortcut — so the
   * context had no consumers, which makes it the kind of plumbing that reads
   * as a feature and is a no-op.
   */

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
      <div className="mx-auto w-full max-w-[1180px] px-3 pt-1 sm:px-4 lg:px-6">
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
        {/*
          A ROW LONGER THAN THE SCREEN SWIPES (round 50). Four tabs in a
          longer language did not fit 390px: the row was `w-full`, so the
          words ran past its rule and the swipe stopped at the screen's edge
          with the last tab cut. It is as wide as its words when they need
          more (`w-max min-w-full`, the three still share the width when they
          fit), a sideways swipe stays in the row rather than becoming the
          browser's back gesture, and the tab being opened is brought into view.
        */}
        <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div
            ref={listRef}
            className={cn(
              "relative flex w-max min-w-full gap-0 border-b border-border",
              !isMobile && "sm:w-auto sm:min-w-max sm:justify-start sm:gap-7",
            )}
            style={surface?.borderColor ? { borderBottomColor: surface.borderColor } : undefined}
            role="tablist"
          >
            {tabs.map((tab) => {
              const selected = tab.id === active
              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    if (el) tabRefs.current.set(tab.id, el)
                    else tabRefs.current.delete(tab.id)
                  }}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`storefront-panel-${tab.id}`}
                  onClick={() => choose(tab.id)}
                  className={cn(
                    // `flex-1` on a phone so the three share the width evenly;
                    // `sm:flex-none` hands the width back to the words.
                    "-mb-px flex-1 whitespace-nowrap border-b-2 px-0.5 pb-3 pt-1 text-center text-sm",
                    !isMobile && "sm:flex-none sm:text-left",
                    "transition-[color,border-color] duration-200 ease-out",
                    /**
                     * FOCUS IS RINGED, NOT OUTLINED. The webview drew its own
                     * blue box around the whole button after a tap — visible
                     * in the shipped iOS app, sitting over the tab bar like an
                     * error state. This replaces it with something that looks
                     * deliberate, and only for keyboard focus.
                     */
                    "rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    /*
                      HALF A WEIGHT STEP ON EACH, the same move the lines
                      under the creator's name got. A tab row set at 400 next
                      to a name set large reads as a caption of the page
                      rather than as the way around it, and the selected one
                      at 500 has to stay clearly ahead of the others — so
                      both go up rather than only the rest.

                      Inter comes through next/font as the variable face, so
                      450 and 530 are real weights here and not rounds to 400
                      and 500. scripts/check-profile-type.mjs measures that.
                    */
                    selected ? "font-[530] text-foreground" : "font-[450] text-muted-foreground hover:text-foreground",
                    /**
                     * The static underline is the SERVER's answer and the
                     * fallback. Once the sliding bar has measured itself it
                     * takes over, so the two are never both on screen — the
                     * measurement happens in a layout effect, before paint.
                     */
                    selected && !bar ? "border-foreground" : "border-transparent",
                  )}
                  style={
                    surface?.textColor || surface?.mutedColor
                      ? {
                          color: selected ? surface.textColor : surface.mutedColor || surface.textColor,
                          borderBottomColor: selected && !bar ? surface.textColor : "transparent",
                        }
                      : undefined
                  }
                >
                  {/*
                    AS WIDE AS ITS OWN SELECTED SELF. The chosen tab is set a
                    weight heavier, and on a computer the tabs take their own
                    widths, so choosing one widened it and pushed every label
                    to its right sideways. The invisible second copy is the
                    label at the chosen weight; the box is always that wide.
                    It is generated content with empty alternative text, so
                    it is neither in the text nor read out.
                  */}
                  <span
                    data-tab-label
                    data-label={tab.label}
                    className="inline-flex flex-col items-center after:invisible after:h-0 after:select-none after:overflow-hidden after:font-[530] after:content-[attr(data-label)_/_'']"
                  >
                    {tab.label}
                  </span>
                </button>
              )
            })}

            {/*
              ON TRANSFORM, NOT ON LEFT AND WIDTH. Animating `left` and `width`
              is a layout on every frame of the slide; a one-pixel bar moved
              and stretched by a transform is drawn by the compositor, so the
              slide holds its frames even while the panel under it swaps.
            */}
            {bar && (
              <span
                aria-hidden
                data-tab-mark
                className="absolute -bottom-px left-0 h-0.5 w-px origin-left bg-foreground transition-transform duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                style={{ transform: `translateX(${bar.left}px) scaleX(${bar.width})`, background: surface?.textColor }}
              />
            )}
          </div>
        </div>
      </div>

      {/*
        Every panel stays mounted and the inactive ones are hidden, rather than
        being unmounted and rebuilt. Switching back to Home does not re-run the
        sections or re-fetch a single image, and anything a visitor had scrolled
        or typed into a panel is still there when they return.
      */}
      <div ref={panelsRef} data-tab-panels>
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
          className={cn(
            "pt-8 [&>*:first-child:not([data-panel-spacing])]:!pt-0",
            "[&>*:first-child>*:first-child:not([data-panel-spacing])]:!pt-0",
            /**
             * AND THE BOTTOM, for the same reason and by the same means.
             *
             * Only the top was forced, so the space between the last product
             * and the About rule below was whatever the panel happened to
             * bring: 24px from the Featured rail's spacing setting, 32 from
             * the Products grid, 64 from the empty state. Stacked on About's
             * own 48px of top padding that came to 129px of nothing on every
             * tab — a third of a phone screen — and a different 129 on each,
             * so the page shifted as you switched.
             *
             * Zeroed here, the gap to the section below is that section's own
             * top padding and nothing else: one number, one owner, the same on
             * all three tabs.
             */
            "[&>*:last-child:not([data-panel-spacing])]:!pb-0",
            "[&>*:last-child>*:last-child:not([data-panel-spacing])]:!pb-0",
          )}
        >
          {tab.panel}
        </div>
      ))}
      </div>
    </>
  )
}

/** The nearest ancestor that scrolls, or null for the page itself. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node && node !== document.body && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}
