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
 * IT DEGRADES INTO SOMETHING USEFUL RATHER THAN INTO NOTHING
 * ---------------------------------------------------------------------------
 * A first-time visitor has no history, and a strip of pills that is empty on
 * every first visit is a strip that is empty for most visits. So the fallback
 * is the catalogue's OWN most common brands — still a real query, still
 * something for sale, just not personal yet.
 */
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

    // The fallback: what this marketplace actually has a lot of.
    if (out.length < 4) {
      const counts = new Map<string, number>()
      for (const p of catalogue) {
        const brand = (p?.brand || "").trim()
        if (brand) counts.set(brand, (counts.get(brand) ?? 0) + 1)
      }
      ;[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .forEach(([brand]) => push(brand, brand))
    }

    return out.slice(0, 8)
  }, [views, catalogue])

  if (pills.length < 3) return null

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-[22px] font-bold tracking-[-0.02em] text-neutral-900">S-ar putea să te intereseze</h2>
      <div className="flex flex-wrap gap-2.5">
        {pills.map((p) => (
          <SmartLink
            key={p.label}
            href={`/?q=${encodeURIComponent(p.q)}`}
            // Outlined rather than filled: eight solid pills in a row is eight
            // buttons competing with the listings above and below them, and
            // these are an offer rather than an instruction.
            className="inline-flex h-11 items-center rounded-lg border border-neutral-200 bg-white px-4 text-[14.5px] font-medium text-neutral-800 transition-colors duration-200 ease-out hover:border-neutral-300 hover:bg-neutral-50"
          >
            {p.label}
          </SmartLink>
        ))}
      </div>
    </section>
  )
}
