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

/** Long enough to read the word and sit with it. The owner asked for a
 *  second more than the 2.6s it was. */
const HOLD_MS = 3600
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
    AND THE TWO PHONE NUMBERS HAVE BOTH COME DOWN AGAIN.

    pt: 48 -> 42, the air between the header and "Discover".

    pb: with the section below opening on mt-2, the gap between this field and
    the category pills was 20px, then 18, and is 14 now: 6 + 8. The sm: side
    is untouched throughout, because every one of these was asked for on the
    phone.
  */
  return (
    <section className="pt-[42px] pb-[6px] sm:pt-[88px] sm:pb-4">
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
            /* More depth, per the owner: an inset hairline so the chip has an edge,
               and a soft violet cast under it so it sits on the page rather than
               being a flat wash of colour. No gradient. */
            className="relative inline-flex flex-col justify-center rounded-xl bg-violet-50 px-2.5 sm:px-3.5 align-middle shadow-[inset_0_0_0_1px_rgba(91,33,182,0.06),0_1px_2px_rgba(91,33,182,0.05),0_6px_18px_-14px_rgba(91,33,182,0.30)] motion-safe:transition-[width] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
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
            <span className="block overflow-hidden" style={{ height: box ? box.height : undefined }}>
              <span
                className="flex flex-col motion-safe:transition-transform motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  transform: box ? `translateY(${-index * box.height}px)` : undefined,
                  transitionDuration: `${ROLL_MS}ms`,
                }}
              >
                {box ? (
                  NOUNS.map((w) => (
                    <span
                      key={w}
                      className="block whitespace-nowrap text-[#5b21b6]"
                      style={{ height: box.height }}
                    >
                      {w}
                    </span>
                  ))
                ) : (
                  <span className="block whitespace-nowrap text-[#5b21b6]">{NOUNS[index]}</span>
                )}
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
        <p className="mt-3 text-[15px] sm:text-[17px] font-[450] text-neutral-600">
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
            placeholder="Search products, creators, topics..."
            aria-label="Search products, creators and topics"
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

                THERE WAS A FOCUS SHADOW HERE AND IT DID NOTHING. It shipped:
                the rule is in the built stylesheet, correctly generated, with
                the specificity to win. Driving the deployed page and reading
                the computed value before and after focus gave the same two
                layers both times, at both widths. Rather than keep a
                declaration that measurably has no effect, it is gone, and the
                border carries the state on its own. scripts/check-explore-live
                reports both now, so a focus style that changes nothing cannot
                sit here unnoticed again.
              */
              "outline-none transition-colors focus:border-neutral-300",
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
