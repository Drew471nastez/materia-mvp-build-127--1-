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

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Search, X } from "lucide-react"
import { SEARCH_ANCHOR_ATTR } from "@/lib/explore/use-search-handoff"
import { cn } from "@/lib/utils"

/** What the catalogue is made of, in the order it reads best out loud. */
const NOUNS = ["templates", "courses", "ebooks", "tools", "resources"] as const

/** Long enough to read the word and notice it, short enough to see it change. */
const HOLD_MS = 2200
/** The swap itself. Two frames of motion, not a performance. */
const SWAP_MS = 260

function useRotatingNoun(): { word: string; swapping: boolean } {
  const [index, setIndex] = useState(0)
  const [swapping, setSwapping] = useState(false)
  const timers = useRef<number[]>([])

  useEffect(() => {
    /*
      A visitor who has asked for less motion gets the first word and nothing
      else. Not a slower rotation: the objection to motion is the movement,
      not its speed.
    */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const tick = () => {
      setSwapping(true)
      timers.current.push(
        window.setTimeout(() => {
          setIndex((i) => (i + 1) % NOUNS.length)
          setSwapping(false)
        }, SWAP_MS),
      )
    }
    const id = window.setInterval(tick, HOLD_MS)
    return () => {
      window.clearInterval(id)
      timers.current.forEach(window.clearTimeout)
      timers.current = []
    }
  }, [])

  return { word: NOUNS[index], swapping }
}

export function ExploreHero({
  query,
  onQueryChange,
  sellHref = "/signup",
}: {
  query: string
  onQueryChange: (value: string) => void
  /** Where "start selling" goes. A prop so an authed visitor can be sent to
   *  their dashboard instead of asked to sign up again. */
  sellHref?: string
}) {
  const { word, swapping } = useRotatingNoun()

  return (
    <section className="pt-8 pb-6 sm:pt-12 sm:pb-8">
      {/* The sentence, whole, for anything that reads rather than looks. */}
      <h1 className="sr-only">Discover {NOUNS.slice(0, -1).join(", ")} and {NOUNS[NOUNS.length - 1]} from creators</h1>

      <div aria-hidden className="text-center">
        <p className="text-[34px] leading-[1.15] sm:text-[52px] sm:leading-[1.1] font-bold tracking-[-0.02em] text-[#1a1a2e]">
          Discover{" "}
          {/*
            The chip is sized from the LONGEST word and centres the current
            one inside it, so the heading does not jump sideways every two
            seconds. A shrink-to-fit chip re-centres the whole line on every
            swap, which is the thing that makes a rotating word feel cheap.
          */}
          <span className="relative inline-grid align-baseline rounded-xl bg-violet-50 px-2.5 sm:px-3.5 py-0.5">
            <span className="invisible col-start-1 row-start-1 whitespace-nowrap">
              {NOUNS.reduce((a, b) => (b.length > a.length ? b : a))}
            </span>
            <span
              className={cn(
                "col-start-1 row-start-1 whitespace-nowrap text-[#5b21b6]",
                /* `translate`, not `transform`. Tailwind v4 builds `-translate-y-1.5` out of
                   the standalone `translate` property, which is not part of `transform` and
                   is animatable in its own right — so naming `transform` here animated the
                   opacity and let the word JUMP. See tests/motion-properties. */
                "motion-safe:transition-[opacity,translate] motion-safe:duration-[260ms] motion-safe:ease-out",
                swapping ? "motion-safe:opacity-0 motion-safe:-translate-y-1.5" : "opacity-100 translate-y-0",
              )}
            >
              {word}
            </span>
          </span>
        </p>

        <p className="mt-4 text-[15px] sm:text-[17px] text-neutral-600">
          Discover what creators are building across the internet.
        </p>
        <p className="mt-1.5 text-[15px] sm:text-[17px] text-neutral-600">
          or{" "}
          <Link
            href={sellHref}
            className="font-semibold text-[#5b21b6] underline-offset-4 hover:underline"
          >
            start selling your own
          </Link>
        </p>
      </div>

      {/* The page's search. The header's appears only once this has gone. */}
      <div className="mt-7 sm:mt-9 mx-auto w-full max-w-[720px]" {...{ [SEARCH_ANCHOR_ATTR]: "" }}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 sm:left-5 top-1/2 h-[18px] w-[18px] sm:h-5 sm:w-5 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search products, creators, topics..."
            aria-label="Search products, creators and topics"
            className={cn(
              "h-[52px] sm:h-[62px] w-full rounded-full bg-white",
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
