"use client"

import { useMemo } from "react"

import { SmartLink } from "@/components/smart-link"
import { categoryLabelFor } from "@/lib/marketplace/listing-taxonomy"
import { signalsFrom, type RecentView } from "@/lib/marketplace/recent-views"

/**
 * ===========================================================================
 *  SEARCHES WORTH OFFERING THIS PERSON
 * ===========================================================================
 *
 * "Gildan t-shirts", "Brandy Melville crop tops" — a brand crossed with the
 * kind of thing you were looking at. They are not recommendations and they are
 * not categories: they are the query you were about to type, offered before you
 * type it, which on a resale marketplace is most of how anybody finds anything.
 *
 * Built entirely from what is on this device (lib/marketplace/recent-views), so
 * it costs no request and works signed out. It updates the moment you come back
 * from a listing, because that is when the signal changed.
 *
 * ---------------------------------------------------------------------------
 * IT IS THE ONE SECTION THAT IS NEVER EMPTY, BY DESIGN
 * ---------------------------------------------------------------------------
 * The two rows above and below it disappear entirely when there is no history —
 * a row of five listings you have never looked at is not "based on your recent
 * views", so it does not get drawn. This one is the opposite: it is the section
 * that carries a first visit, so it must ALWAYS have something in it, and
 * MIN = 6 is enforced rather than hoped for.
 *
 * The ladder down is: brand × the thing it was sold as (personal) → the
 * categories you browsed → the catalogue's most common brands → the departments
 * that actually have stock in them. The last two are broad on purpose. They are
 * what everybody sees until this device has told us anything, and every one of
 * them still lands on a page with real listings on it, which is the only rule
 * that matters here.
 */
/** The floor, and it is a requirement rather than a preference — see above. */
const MIN = 6
const MAX = 10

export function YouMightBeInto({
  views,
  catalogue,
}: {
  views: RecentView[]
  /** Every listing the page was given, for the fallback and for pairing a brand
   *  with a category it is actually sold in. */
  catalogue: any[]
}) {
  const pills = useMemo(() => {
    const out: { label: string; q: string }[] = []
    const seen = new Set<string>()

    const push = (label: string, q: string) => {
      const key = label.toLowerCase()
      if (seen.has(key) || !label.trim()) return
      seen.add(key)
      out.push({ label, q })
    }

    /**
     * A BRAND CROSSED WITH WHAT IT WAS SOLD AS.
     *
     * "Nike" alone is a brand page; "Nike sneakers" is a search somebody was
     * about to run. The pairing comes from the listing that produced the signal
     * rather than from a table, so it can only ever name a combination that
     * exists in the catalogue.
     */
    const brands = signalsFrom(views, "brand").slice(0, 6)
    for (const b of brands) {
      const from = views.find((v) => v.brand === b.value && v.subcategory)
      const leaf = from ? categoryLabelFor(from.category, from.subcategory) : null
      const noun = leaf ? leaf.split(" · ").pop() : null
      push(noun ? `${b.value} ${noun.toLowerCase()}` : b.value, noun ? `${b.value} ${noun}` : b.value)
    }

    // Then the categories themselves, for somebody who browses by kind rather
    // than by label.
    for (const c of signalsFrom(views, "subcategory").slice(0, 4)) {
      const from = views.find((v) => v.subcategory === c.value)
      const leaf = from ? categoryLabelFor(from.category, from.subcategory) : null
      if (leaf) push(leaf.split(" · ").pop() as string, leaf.split(" · ").pop() as string)
    }

    // FALLBACK ONE: what this marketplace actually has a lot of. Broad, but
    // every pill is a brand somebody is selling right now.
    if (out.length < MIN) {
      const counts = new Map<string, number>()
      for (const p of catalogue) {
        const brand = (p?.brand || "").trim()
        if (brand) counts.set(brand, (counts.get(brand) ?? 0) + 1)
      }
      ;[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX)
        .forEach(([brand]) => push(brand, brand))
    }

    /**
     * FALLBACK TWO: the kinds of thing, from the listings themselves.
     *
     * A young catalogue can have fewer than six distinct brands — most
     * second-hand listings have no brand at all — and stopping there is how the
     * one section that must never be empty ends up with three pills. These come
     * from the leaf category each listing was filed under, most stocked first,
     * so "Pantofi" only appears when there are shoes.
     */
    if (out.length < MIN) {
      const counts = new Map<string, number>()
      for (const p of catalogue) {
        const leaf = categoryLabelFor(p?.category, p?.subcategory)
        const noun = leaf ? leaf.split(" · ").pop() : null
        if (noun) counts.set(noun, (counts.get(noun) ?? 0) + 1)
      }
      ;[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX)
        .forEach(([noun]) => push(noun, noun))
    }

    return out.slice(0, MAX)
  }, [views, catalogue])

  /**
   * Below six it is not drawn — but by construction that only happens on a
   * catalogue with almost nothing in it, where a strip of two pills would be
   * advertising the emptiness rather than hiding it.
   */
  if (pills.length < MIN) return null

  return (
    <section className="mt-10 px-4 sm:mt-14 sm:px-0">
      <h2 className="mb-4 text-[19px] font-bold tracking-[-0.02em] text-neutral-900 sm:text-[22px]">
        S-ar putea să te intereseze
      </h2>
      {/* Still wrapping on a phone rather than scrolling: these are eight short
          words, not eight photographs, and four rows of pills is a block you
          read at a glance. A rail would hide half of them behind a gesture for
          no gain in height. h-10 is the one concession — 44 is a target size for
          something you aim at, and these are read first and pressed second. */}
      <div className="flex flex-wrap gap-2 sm:gap-2.5">
        {pills.map((p) => (
          <SmartLink
            key={p.label}
            href={`/?q=${encodeURIComponent(p.q)}`}
            // Outlined rather than filled: eight solid pills in a row is eight
            // buttons competing with the listings above and below them, and
            // these are an offer rather than an instruction.
            className="inline-flex h-10 items-center rounded-lg border border-neutral-200 bg-white px-3.5 text-[14px] font-medium text-neutral-800 transition-colors duration-200 ease-out hover:border-neutral-300 hover:bg-neutral-50 sm:h-11 sm:px-4 sm:text-[14.5px]"
          >
            {p.label}
          </SmartLink>
        ))}
      </div>
    </section>
  )
}
