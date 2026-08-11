"use client"

import { useMemo } from "react"
import Image from "next/image"

import { SmartLink } from "@/components/smart-link"
import { DEPARTMENTS, groupsForDepartment } from "@/lib/marketplace/listing-taxonomy"
import { cardImage, readVariants } from "@/lib/images/variants"

/**
 * ===========================================================================
 *  SHOP SECOND-HAND BY CATEGORY
 * ===========================================================================
 *
 * Five tiles, one per department, and each one wears a photograph taken from a
 * listing that is actually in it. That is the whole difference between this and
 * the pill rail it replaces: a pill says "Femei" and a tile says "here is what
 * Femei looks like on this marketplace today", which is a far better answer to
 * the question somebody is asking when they scroll this far down a home page.
 *
 * A department with nothing listed in it gets a flat ground rather than a
 * borrowed photograph. Dressing an empty category in somebody else's stock is
 * how a marketplace ends up sending people to a page with nothing on it.
 */

/** The ground under a tile with no stock yet, one per department so the row is
 *  not five identical grey rectangles on a new marketplace. */
const GROUNDS: Record<string, string> = {
  women: "#4a3f5c",
  men: "#2f3a44",
  kids: "#4a4536",
  entertainment: "#33404a",
  hobby: "#453a3a",
}

export function ShopByCategory({ catalogue }: { catalogue: any[] }) {
  const tiles = useMemo(() => {
    // Which group ids belong to which department, resolved once rather than per
    // listing — this runs over every product on the page.
    const departmentOf = new Map<string, string>()
    for (const d of DEPARTMENTS) {
      for (const g of groupsForDepartment(d.id)) departmentOf.set(g.id, d.id)
    }

    const cover = new Map<string, string>()
    const count = new Map<string, number>()
    for (const p of catalogue) {
      const dep = departmentOf.get(p?.category)
      if (!dep) continue
      count.set(dep, (count.get(dep) ?? 0) + 1)
      if (!cover.has(dep)) {
        const img = cardImage(readVariants(p?.image_variants), p?.thumbnail_url, 0)
        if (img) cover.set(dep, img)
      }
    }

    return DEPARTMENTS.map((d) => ({
      id: d.id,
      label: d.label,
      image: cover.get(d.id) ?? null,
      ground: GROUNDS[d.id] ?? "#3d4451",
      count: count.get(d.id) ?? 0,
    }))
  }, [catalogue])

  return (
    <section className="mt-12">
      <h2 className="mb-4 text-[22px] font-bold tracking-[-0.02em] text-neutral-900">
        Cumpără second-hand pe categorii
      </h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <SmartLink
            key={t.id}
            href={`/?category=${encodeURIComponent(t.id)}`}
            className="group relative block overflow-hidden rounded-2xl"
            style={{ backgroundColor: t.ground }}
          >
            <div className="relative aspect-[4/5]">
              {t.image && (
                <Image
                  src={t.image}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 260px, 33vw"
                  className="object-cover transition-transform duration-[400ms] ease-out group-hover:scale-[1.04]"
                />
              )}
              {/* A floor under the label, and only under the label. A scrim over
                  the whole tile would flatten every photograph in the row to the
                  same grey; this is a gradient that is transparent where the
                  picture is doing its job. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 to-transparent"
              />
              <span className="absolute inset-x-0 bottom-0 p-4">
                <span className="block text-[16px] font-bold tracking-[-0.01em] text-white">{t.label}</span>
                {t.count > 0 && (
                  <span className="mt-0.5 block text-[12.5px] font-medium text-white/70">
                    {t.count === 1 ? "1 articol" : `${t.count} articole`}
                  </span>
                )}
              </span>
            </div>
          </SmartLink>
        ))}
      </div>
    </section>
  )
}
