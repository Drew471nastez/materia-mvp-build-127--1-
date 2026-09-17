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
const NOUNS = ["templates", "courses", "ebooks", "tools", "resources"] as const

/** Long enough to read the word, short enough to see it change. */
const HOLD_MS = 2600
/** The roll itself. One movement, on the curve the rest of the product uses. */
const ROLL_MS = 420
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
function useRollingNoun() {
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<{ widths: number[]; height: number; padX: number } | null>(null)
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
         it changes at the sm breakpoint and this has to follow. */
      const padX = chipRef.current
        ? parseFloat(getComputedStyle(chipRef.current).paddingLeft) || CHIP_PAD_X.base
        : CHIP_PAD_X.base
      setBox({
        widths: kids.map((k) => Math.ceil(k.getBoundingClientRect().width)),
        height: Math.ceil(kids[0].getBoundingClientRect().height),
        padX,
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (measureRef.current) ro.observe(measureRef.current)
    /* The font decides the width, and it arrives after the first layout. */
    document.fonts?.ready.then(measure).catch(() => {})
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    /* A visitor who asked for less motion gets the first word and nothing
       else. The objection is the movement, not its speed. */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % NOUNS.length), HOLD_MS)
    return () => window.clearInterval(id)
  }, [])

  return { index, box, measureRef, chipRef }
}

export function ExploreHero({
  query,
  onQueryChange,
}: {
  query: string
  onQueryChange: (value: string) => void
}) {
  const { index, box, measureRef, chipRef } = useRollingNoun()

  /* More air between the black header and the heading, per the owner: the two
     were stacked with nothing between them. */
  return (
    <section className="pt-14 pb-3 sm:pt-24 sm:pb-4">
      {/* The sentence, whole, for anything that reads rather than looks. */}
      <h1 className="sr-only">Discover {NOUNS.slice(0, -1).join(", ")} and {NOUNS[NOUNS.length - 1]} from creators</h1>

      <div aria-hidden className="text-center">
        <p className="text-[34px] leading-[1.15] sm:text-[52px] sm:leading-[1.1] font-bold tracking-[-0.02em] text-[#1a1a2e]">
          Discover{" "}
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
            {NOUNS.map((w) => (
              <span key={w} className="block">{w}</span>
            ))}
          </span>

          <span
            ref={chipRef}
            className="relative inline-flex flex-col justify-center rounded-xl bg-violet-50 px-2.5 sm:px-3.5 align-middle motion-safe:transition-[width] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              width: box ? box.widths[index] + 2 * box.padX : undefined,
              height: box ? box.height + CHIP_PAD_Y * 2 : undefined,
              transitionDuration: `${ROLL_MS}ms`,
            }}
          >
            {/*
              THE WINDOW IS EXACTLY ONE WORD TALL, and the chip's padding is
              OUTSIDE it. With the padding inside the clip, the window was
              taller than a line and the words above and below showed eight
              pixels of themselves at the top and bottom edges — three words
              on screen at once, which is most of what "junky" was.
            */}
            <span className="block overflow-hidden" style={{ height: box ? box.height : undefined }}>
              <span
                className="flex flex-col motion-safe:transition-transform motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  transform: box ? `translateY(${-index * box.height}px)` : undefined,
                  transitionDuration: `${ROLL_MS}ms`,
                }}
              >
                {NOUNS.map((w) => (
                  <span
                    key={w}
                    className="block whitespace-nowrap text-[#5b21b6]"
                    style={{ height: box ? box.height : undefined }}
                  >
                    {w}
                  </span>
                ))}
              </span>
            </span>
          </span>
        </p>

        <p className="mt-4 text-[15px] sm:text-[17px] text-neutral-600">
          Discover what creators are building across the internet.
        </p>
        {/* "or start selling your own" was here. The owner took it off: this
            page is for looking through what other people have made, and an
            invitation to go and sell something is a different errand. */}
      </div>

      {/* The page's search. The header's appears only once this has gone. */}
      <div className="mt-6 sm:mt-8 mx-auto w-full max-w-[720px]" {...{ [SEARCH_ANCHOR_ATTR]: "" }}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 sm:left-5 top-1/2 h-[18px] w-[18px] sm:h-5 sm:w-5 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search products, creators, topics..."
            aria-label="Search products, creators and topics"
            className={cn(
              /* 10px, per the owner. A pill reads as a chip; this is a field. */
              "h-[52px] sm:h-[62px] w-full rounded-[10px] bg-white",
              "border border-neutral-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.05),0_10px_30px_-18px_rgba(15,23,42,0.35)]",
              "pl-12 sm:pl-14 pr-12 text-[15px] sm:text-[17px] text-neutral-900 placeholder:text-neutral-400",
              "outline-none transition-shadow focus:border-violet-300 focus:shadow-[0_1px_3px_rgba(15,23,42,0.05),0_12px_34px_-16px_rgba(91,33,182,0.45)]",
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
