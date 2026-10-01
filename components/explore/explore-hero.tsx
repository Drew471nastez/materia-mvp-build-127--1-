"use client"

/**
 * ===========================================================================
 *  DISCOVER, AND THE THING BEING DISCOVERED KEEPS CHANGING
 * ===========================================================================
 * The heading names what the page is for, and the second half of it cycles
 * through what is actually on sale: templates, courses, ebooks, tools,
 * resources. One noun would be a claim the catalogue cannot keep — "Discover
 * templates" is wrong for the half of it that is courses — and the list is
 * also the fastest way to tell a first-time visitor what this marketplace
 * has in it, without a paragraph saying so.
 *
 * WHAT A SCREEN READER GETS is the whole list at once, read from an
 * `sr-only` heading, with the animated half hidden from it. A word swapping
 * every two seconds inside a live region is a heading that never stops
 * talking; the sighted version is a flourish and the read version is a
 * sentence.
 *
 * THE SEARCH BELONGS HERE, not in the header, and it carries the anchor the
 * header watches: while this field is on screen the header has none, and it
 * grows one the moment this scrolls away. See lib/explore/use-search-handoff.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Search, X } from "lucide-react"
import { SEARCH_ANCHOR_ATTR } from "@/lib/explore/use-search-handoff"
import { cn } from "@/lib/utils"

/** What the catalogue is made of, in the order it reads best out loud. */
const NOUNS = ["templates", "courses", "ebooks", "tools", "software", "resources"] as const

export type DiscoverMode = "products" | "communities"

/**
 * THE WORD COMMUNITIES MODE HOLDS, kept at the END of the stack so it is
 * measured with the others and arriving at it is the same roll as any other
 * word. The product cycle never reaches it: it wraps at NOUNS.length.
 */
const COMMUNITIES_WORD = "communities"
const WORDS = [...NOUNS, COMMUNITIES_WORD] as const
const COMMUNITIES_INDEX = NOUNS.length

const MODE_OPTIONS: { id: DiscoverMode; label: string }[] = [
  { id: "products", label: "Digital products" },
  { id: "communities", label: "Communities" },
]

/** Long enough to read the word and sit with it. The owner asked for a
 *  second more than the 2.6s it was. */
const HOLD_MS = 3600
/** The roll itself. One movement, on the curve the rest of the product uses. */
const ROLL_MS = 420
/** A little slower per step when rolling forward into communities, so the
 *  mode change reads as one continuous reel rather than a hard cut. */
const MODE_ROLL_MS = 520
const ROLL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
/** Breathing room above and below the word, inside the chip. */
const CHIP_PAD_Y = 8
/**
 * And the horizontal padding, which has to be ADDED to the measured width.
 *
 * Everything in this project is `box-sizing: border-box`, so a width set on
 * the chip is the OUTSIDE of it and the padding eats into the space the word
 * has. The word was measured at its natural width, the chip was set to
 * exactly that, and the last letter fell outside the content box and was
 * clipped by the window: "resources" rendered as "resource".
 */
const CHIP_PAD_X = { base: 10, sm: 14 }

/**
 * ===========================================================================
 *  A ROLL, NOT A CROSSFADE, AND THE CHIP HUGS THE WORD
 * ===========================================================================
 * The first version faded the word out and the next one in, inside a chip
 * sized to the LONGEST word so the heading could not move. Both halves of
 * that were wrong and the owner said so: a five-letter word sat in a
 * nine-letter box with a lake of empty violet either side of it, and a
 * crossfade between two words in the same place is a flicker rather than a
 * change.
 *
 * So the words are stacked and the stack slides — one movement, one property,
 * no frame where two words are both half-visible. And the chip is measured to
 * the word that is arriving and animates to it on the same curve, so it hugs
 * the word the whole way instead of holding a shape for the longest one.
 *
 * The heading re-centres as the chip grows and shrinks. That is the trade for
 * losing the empty space, and it is only acceptable because the width is
 * animated on the same curve and duration as the roll: the line settles with
 * the word rather than jumping when it lands.
 *
 * MEASURED, NOT COMPUTED FROM CHARACTER COUNTS. The font is a variable one
 * and the size changes at the sm breakpoint, so the only honest width is the
 * one the browser gives for the text as rendered. A hidden copy of every word
 * is laid out once and re-measured whenever the box changes.
 */
function useRollingNoun(mode: DiscoverMode, paused: boolean) {
  const [index, setIndex] = useState(mode === "communities" ? COMMUNITIES_INDEX : 0)
  const [box, setBox] = useState<{ widths: number[]; height: number; padL: number; padR: number } | null>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const chipRef = useRef<HTMLSpanElement>(null)

  /* Layout, not effect: the chip must have its width before the first paint,
     or it opens at zero and springs out to the first word on load. */
  useLayoutEffect(() => {
    const measure = () => {
      const el = measureRef.current
      if (!el) return
      const kids = Array.from(el.children) as HTMLElement[]
      if (!kids.length) return
      /* Read from the chip rather than assumed, because the class that sets
         it changes at the sm breakpoint and this has to follow. The right
         side is wider than the left: it is where the switcher sits. */
      const style = chipRef.current ? getComputedStyle(chipRef.current) : null
      const padL = (style && parseFloat(style.paddingLeft)) || CHIP_PAD_X.base
      const padR = (style && parseFloat(style.paddingRight)) || CHIP_PAD_X.base
      setBox({
        widths: kids.map((k) => Math.ceil(k.getBoundingClientRect().width)),
        height: Math.ceil(kids[0].getBoundingClientRect().height),
        padL,
        padR,
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (measureRef.current) ro.observe(measureRef.current)
    /* The font decides the width, and it arrives after the first layout. */
    document.fonts?.ready.then(measure).catch(() => {})
    return () => ro.disconnect()
  }, [])

  /* Back to products: drop off "communities" before paint. Stepping into
     communities is animated in the effect below instead of snapping here. */
  useLayoutEffect(() => {
    if (mode !== "products") return
    setIndex((i) => (i >= NOUNS.length ? 0 : i))
  }, [mode])

  useEffect(() => {
    if (mode !== "communities") return
    if (index >= COMMUNITIES_INDEX) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIndex(COMMUNITIES_INDEX)
      return
    }
    const t = window.setTimeout(
      () => setIndex((i) => Math.min(i + 1, COMMUNITIES_INDEX)),
      MODE_ROLL_MS,
    )
    return () => window.clearTimeout(t)
  }, [mode, index])

  useEffect(() => {
    if (mode !== "products") return
    /* Held while the switcher's menu is open: the menu hangs off the chip,
       and a chip changing width under it would drag its edge about. */
    if (paused) return
    /* A visitor who asked for less motion gets the first word and nothing
       else. The objection is the movement, not its speed. */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % NOUNS.length), HOLD_MS)
    return () => window.clearInterval(id)
  }, [mode, paused])

  return { index, box, measureRef, chipRef }
}

export function ExploreHero({
  query,
  onQueryChange,
  mode = "products",
  onModeChange,
}: {
  query: string
  onQueryChange: (value: string) => void
  mode?: DiscoverMode
  onModeChange?: (mode: DiscoverMode) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { index, box, measureRef, chipRef } = useRollingNoun(mode, menuOpen)
  const rollingToCommunities = mode === "communities" && index < COMMUNITIES_INDEX
  const rollMs = rollingToCommunities ? MODE_ROLL_MS : ROLL_MS
  const switcherRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (switcherRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setMenuOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setMenuOpen(false)
      switcherRef.current?.focus()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [menuOpen])

  const communities = mode === "communities"
  /* "communities" plus "Discover" overflows a phone at the default size and
     the chip drops to its own line. Slightly smaller type on small screens
     only, and the pair is flex-nowrap so they stay one sentence. */
  const headingSize = communities
    ? "text-[28px] leading-[1.12] sm:text-[52px] sm:leading-[1.1]"
    : "text-[34px] leading-[1.15] sm:text-[52px] sm:leading-[1.1]"

  /*
    ═══════════════════════════════════════════════════════════════════════
     THE SEARCH RUNS WHEN YOU ASK IT TO, NOT ON EVERY LETTER
    ═══════════════════════════════════════════════════════════════════════
    This field used to hand each keystroke straight to the page's filter, and
    that is what the reported footer bug actually is. Typing "Just" narrowed
    twenty-four products to none, the listing became a dashed box about a
    hundred pixels tall, and a document that was eleven thousand pixels tall
    became about a thousand. The footer arrived directly under the category
    pills, which on a phone with the keyboard up is the whole screen: pills,
    then footer. Nothing was painted in the wrong place. The page really had
    collapsed, between one letter and the next.

    It also meant the Search key on the keyboard did nothing, because the
    search had already happened four letters ago.

    So the text lives here while it is being typed, and the page is told
    once, on submit. Clearing the field is a submit too, because emptying a
    search is a request to see everything again.
  */
  const [draft, setDraft] = useState(query)

  /* An external change — a category that resets it, arriving with ?q= — is
     the one case where the field should follow the page rather than lead. */
  useEffect(() => {
    setDraft(query)
  }, [query])

  /*
    THE AIR BETWEEN THE HEADER AND THE HEADING, TRIMMED BACK A LITTLE.

    It was opened up because the two were stacked with nothing between them;
    the owner has since asked for a little of it back, so this is 8px off each
    breakpoint — 56 -> 48 on a phone, 96 -> 88 on a desktop. Written in pixels
    rather than on the spacing scale because 88 is not a step on it, and
    splitting the pair across two notations would hide that they move
    together.
  */
  /*
    THE DESKTOP GAP GOES THE OTHER WAY, by five per cent, AND THE NUMBER CAME
    OFF THE PAGE RATHER THAN OUT OF THIS FILE.

    Adding up the classes said the gap was 16 + 8 = 24px: this padding plus
    the mt-2 on the section below. Measured on the deployed page it is 50px
    on a desktop and 40px on a phone — there is a py-0.5 on the pill track and
    the section header's own spacing in there as well, none of which is
    visible from here. Five per cent of 24 would have been 1.2px, and five per
    cent of the real gap is 2.5, so this is 16 + 2.5 = 18.5.

    scripts/check-explore-live measures the distance from the field's box to
    the first pill now, so the next one of these is read off the page too.

    Only the sm: side moves: the phone numbers below were asked for
    separately and stay where they are.

    AND THE TWO PHONE NUMBERS HAVE BOTH COME DOWN AGAIN.

    pt: 48 -> 42, the air between the header and "Discover".

    pb: with the section below opening on mt-2, the gap between this field and
    the category pills was 20px, then 18, and is 14 now: 6 + 8. The sm: side
    is untouched throughout, because every one of these was asked for on the
    phone.
  */
  return (
    <section className="pt-[42px] pb-[6px] sm:pt-[88px] sm:pb-[18.5px]">
      {/* The sentence, whole, for anything that reads rather than looks. */}
      <h1 className="sr-only">
        {communities
          ? "Discover communities from creators"
          : `Discover ${NOUNS.slice(0, -1).join(", ")} and ${NOUNS[NOUNS.length - 1]} from creators`}
      </h1>

      {/* Hidden from assistive tech piece by piece rather than as a whole,
          because the switcher inside the chip is a real control. */}
      <div className="text-center">
        <p className={cn("font-bold tracking-[-0.02em] text-[#1a1a2e]", headingSize)}>
          {/*
            MEASURED OUTSIDE THE CHIP, and that is not a detail.

            The first version put this copy INSIDE the chip, which is the
            element whose width it is measuring — so every word came back the
            same width, the box never resized, and the words wrapped and
            stacked three-deep in the window. The probe reported one chip
            width across every word and three words visible at once.

            Fixed rather than absolute, so it needs no positioned ancestor and
            is constrained by nothing. It sits inside the heading so it
            inherits the same font, weight and size at every breakpoint, which
            is the only reason the numbers it produces are the right ones.
          */}
          <span
            ref={measureRef}
            aria-hidden
            /* `items-start`, or the column stretches every child to the width of the
               widest and all five words measure the same. They did: 187px each,
               and the chip never resized. */
            /* `invisible` as well as off screen. It is `position: fixed`, so it is not
               clipped by anything and could in principle paint anywhere; a probe
               run on production counted it as overlapping the footer. Hidden
               visibility still lays out, which is all the measuring needs. */
            className="pointer-events-none invisible fixed -left-[9999px] top-0 flex flex-col items-start whitespace-nowrap"
          >
            {WORDS.map((w) => (
              <span key={w} className="block">{w}</span>
            ))}
          </span>

          <span className="inline-flex max-w-[calc(100vw-2rem)] flex-nowrap items-center justify-center gap-2 sm:gap-2.5">
          <span aria-hidden className="shrink-0">Discover</span>

          <span
            ref={chipRef}
            /* More depth, per the owner: an inset hairline so the chip has an edge,
               and a soft violet cast under it so it sits on the page rather than
               being a flat wash of colour. No gradient. */
            /* The right padding is the switcher's slot: the word keeps the
               left padding it always had, and the chevrons sit in the extra
               room on the right, inside the violet. */
            className="relative inline-flex shrink-0 flex-col justify-center rounded-xl bg-violet-50 pl-2.5 pr-[26px] sm:pl-3.5 sm:pr-[34px] align-middle shadow-[inset_0_0_0_1px_rgba(91,33,182,0.06),0_1px_2px_rgba(91,33,182,0.05),0_6px_18px_-14px_rgba(91,33,182,0.30)] motion-safe:transition-[width] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              width: box ? box.widths[index] + box.padL + box.padR : undefined,
              height: box ? box.height + CHIP_PAD_Y * 2 : undefined,
              transitionDuration: `${rollMs}ms`,
            }}
          >
            {/*
              THE WINDOW IS EXACTLY ONE WORD TALL, and the chip's padding is
              OUTSIDE it. With the padding inside the clip, the window was
              taller than a line and the words above and below showed eight
              pixels of themselves at the top and bottom edges — three words
              on screen at once, which is most of what "junky" was.
            */}
            {/*
              ═══════════════════════════════════════════════════════════════
               ONE WORD UNTIL THE MEASUREMENT EXISTS, OR THE PAGE JUMPS
              ═══════════════════════════════════════════════════════════════
              The window's height comes from `box`, which is set in a layout
              effect, so on the very first render there was no height on it
              and no height on the words inside it. `overflow-hidden` clips
              nothing when the box is auto: all six nouns rendered stacked,
              and the heading was several hundred pixels taller than it ends
              up being.

              Filmed on the deployed page with scripts/check-header-on-load,
              at 390px with the CPU throttled 4x, the same in three runs out
              of three: the search field sat at 438px, and about a second
              later it settled at 260px. Everything below the heading moved
              up 178px, roughly a second in, on every single load. That is
              the flash on refresh, and it is this.

              So the stack is only a stack once there is a height to give it.
              Before that it is the current word and nothing else, which is
              exactly one line tall with no help from JavaScript. The
              measuring span above is untouched: it is `position: fixed` and
              was never in the flow.
            */}
            <span aria-hidden className="block overflow-hidden" style={{ height: box ? box.height : undefined }}>
              <span
                className="flex flex-col motion-safe:transition-transform motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  transform: box ? `translateY(${-index * box.height}px)` : undefined,
                  transitionDuration: `${rollMs}ms`,
                }}
              >
                {box ? (
                  WORDS.map((w) => (
                    <span
                      key={w}
                      className="block whitespace-nowrap text-[#5b21b6]"
                      style={{ height: box.height }}
                    >
                      {w}
                    </span>
                  ))
                ) : (
                  <span className="block whitespace-nowrap text-[#5b21b6]">{WORDS[index]}</span>
                )}
              </span>
            </span>

            <button
              ref={switcherRef}
              type="button"
              aria-label="Choose what to discover"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              disabled={!onModeChange}
              onClick={() => setMenuOpen((o) => !o)}
              className="absolute right-1 sm:right-1.5 top-1/2 -translate-y-1/2 flex h-7 w-5 sm:h-8 sm:w-6 items-center justify-center rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100/90 aria-expanded:text-neutral-700 aria-expanded:bg-neutral-100/90 outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 transition-colors cursor-pointer disabled:cursor-default"
            >
              <svg aria-hidden viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 sm:h-4 sm:w-4">
                <path d="M5 6.25 8 3.25l3 3M5 9.75l3 3 3-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* At least as wide as the chip, wider only if a label needs it.
                Always mounted, so closing can fade out instead of vanishing. */}
            <span
              ref={menuRef}
              role="menu"
              aria-label="Discover"
              className={cn(
                "absolute left-0 top-[calc(100%+6px)] z-30 block min-w-full origin-top rounded-[10px] border border-neutral-200/80 bg-white p-1 text-left",
                "shadow-[0_1px_3px_rgba(15,23,42,0.045),0_9px_27px_-16px_rgba(15,23,42,0.315)]",
                "transition-[opacity,scale,translate,visibility] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                menuOpen ? "visible opacity-100 scale-100 translate-y-0" : "invisible pointer-events-none opacity-0 scale-[0.96] -translate-y-1",
              )}
            >
              {MODE_OPTIONS.map((opt) => {
                const on = mode === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    tabIndex={menuOpen ? 0 : -1}
                    onClick={() => {
                      setMenuOpen(false)
                      if (!on) onModeChange?.(opt.id)
                    }}
                    className={cn(
                      "block w-full whitespace-nowrap rounded-[7px] px-2.5 py-1.5 text-left text-[14px] leading-5 tracking-normal outline-none transition-colors cursor-pointer",
                      on
                        ? "bg-neutral-100 font-semibold text-[#1a1a2e]"
                        : "font-medium text-neutral-600 hover:bg-neutral-50 focus-visible:bg-neutral-50",
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </span>
          </span>
          </span>
        </p>

        {/*
          450, up from 420, up from 400. Asked for twice, a little each time,
          and Inter is a variable font so each of those is a real weight
          rather than a synthesised bold — 430 and 450 are genuinely
          different, which they would not be on a static family.

          And mt-3 rather than mt-4: 12px under the heading instead of 16.
        */}
        <p aria-hidden className="mt-3 text-[15px] sm:text-[17px] font-[450] text-neutral-600">
          Discover what creators are building across the internet.
        </p>
        {/* "or start selling your own" was here. The owner took it off: this
            page is for looking through what other people have made, and an
            invitation to go and sell something is a different errand. */}
      </div>

      {/* The page's search. The header's appears only once this has gone. */}
      <div className="mt-6 sm:mt-8 mx-auto w-full max-w-[720px]" {...{ [SEARCH_ANCHOR_ATTR]: "" }}>
        <form
          role="search"
          className="relative"
          onSubmit={(e) => {
            e.preventDefault()
            onQueryChange(draft.trim())
          }}
        >
          <Search className="pointer-events-none absolute left-4 sm:left-5 top-1/2 h-[18px] w-[18px] sm:h-5 sm:w-5 -translate-y-1/2 text-neutral-400" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            type="search"
            inputMode="search"
            /* iOS labels the return key from this, so it reads Search. */
            enterKeyHint="search"
            placeholder={communities ? "Search communities, creators, topics..." : "Search products, creators, topics..."}
            aria-label={communities ? "Search communities, creators and topics" : "Search products, creators and topics"}
            className={cn(
              /* 10px, per the owner. A pill reads as a chip; this is a field. */
              "h-[52px] sm:h-[62px] w-full rounded-[10px] bg-white",
              /* Ten per cent shallower than it was: offsets, blurs and both
                 alphas scaled by 0.9. It stays level with the chip above,
                 which sits at 0.05 and 0.30 against this field's 0.045 and
                 0.315, so the two still read as the same depth. */
              "border border-neutral-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.045),0_9px_27px_-16px_rgba(15,23,42,0.315)]",
              "pl-12 sm:pl-14 pr-12 text-[15px] sm:text-[17px] text-neutral-900 placeholder:text-neutral-400",
              /*
                NO VIOLET HALO ON FOCUS. It bloomed a purple glow around the
                whole field the moment it was tapped, which on a phone is the
                first thing that happens and the loudest thing on the screen.
                Focus darkens the border instead: neutral-200/80 to
                neutral-300, which is the affordance without the colour.

                AND THE SHADOW IS BACK, BECAUSE I TOOK IT OUT ON A BAD
                MEASUREMENT. I reported it as dead CSS: the rule shipped, had
                the specificity to win, and reading the computed value after
                focus gave the resting shadow at both widths.

                The reading was wrong. getComputedStyle DURING a transition
                returns the current interpolated value, not the target, and
                the probe read one frame after calling focus() while
                transition-shadow was animating that exact property. It was
                reporting the value the transition had started from. The same
                artefact then hid the border change too, once the transition
                covered colours, which is what gave it away: a border that had
                measurably worked an hour earlier could not have stopped.

                With the probe waiting for the transition, both move. So both
                are here: a slightly deeper neutral shadow and a darker
                border, and no violet in either.
              */
              "outline-none transition-[box-shadow,border-color] focus:border-neutral-300",
              "focus:shadow-[0_1px_3px_rgba(15,23,42,0.054),0_11px_27px_-16px_rgba(15,23,42,0.36)]",
            )}
          />
          {draft && (
            <button
              type="button"
              onClick={() => {
                setDraft("")
                onQueryChange("")
              }}
              aria-label="Clear search"
              className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          )}
        </form>
      </div>
    </section>
  )
}
