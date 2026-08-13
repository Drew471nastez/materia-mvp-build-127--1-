"use client"

import { useMemo } from "react"
import Image from "next/image"
import { ArrowRight } from "lucide-react"

import { SmartLink } from "@/components/smart-link"
import { DEPARTMENTS, groupsForDepartment } from "@/lib/marketplace/listing-taxonomy"
import { cardImage, readVariants } from "@/lib/images/variants"
import { cn } from "@/lib/utils"

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
    /**
     * ---------------------------------------------------------------------
     * THE OLD SHAPE, WITH THE NEW DEPARTMENTS
     * ---------------------------------------------------------------------
     * It had become five equal tiles under a 22px heading — the same object as
     * the four listing rows above it, so the page ended in five sections that
     * all looked alike and nothing said "this is the way in". The version
     * before it was better and this is that shape back: a column on the left
     * carrying a large headline and one dark button, and the tiles to the right
     * of it, three across the top and two wider underneath.
     *
     * What does NOT come back is the old taxonomy. That layout was built for
     * nine legacy categories — sneakers, jewellery, home, vintage — which is
     * exactly the list that was cut down to five departments. The layout is the
     * part that was worth keeping; the categories in it are the real ones.
     */
    <section className="mt-12 border-t border-neutral-100 px-4 pt-10 sm:px-0 lg:mt-20 lg:pt-14">
      <div className="grid gap-6 sm:gap-8 lg:grid-cols-12 lg:gap-10">
        {/* The left column: the invitation, and one thing to press. */}
        <div className="flex flex-col justify-center lg:col-span-3">
          <h2 className="text-[21px] font-bold leading-[1.15] tracking-[-0.02em] text-neutral-900 sm:text-[26px] lg:text-[34px]">
            Cumpără second-hand pe categorii
          </h2>
          <p className="mt-2.5 text-[14px] font-medium leading-relaxed text-neutral-500 sm:mt-3 sm:text-[14.5px]">
            Fiecare articol are un singur exemplar și un vânzător real în spate.
          </p>
          <SmartLink
            href="/?q="
            className="mt-5 inline-flex h-11 w-fit items-center gap-2 rounded-full bg-neutral-900 px-5 text-[14.5px] font-semibold text-white transition-colors duration-200 ease-out hover:bg-neutral-800 sm:mt-6"
          >
            Vezi toate anunțurile
            <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
          </SmartLink>
        </div>

        {/* The tiles. Three across, then the remaining two at half the width
            each — which is what five things in a magazine grid look like, and
            the reason this is not a row of five identical rectangles. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 sm:gap-4 lg:col-span-9">
          {tiles.map((t, i) => (
          <SmartLink
            key={t.id}
            href={`/?category=${encodeURIComponent(t.id)}`}
            className={cn(
              "group relative block overflow-hidden rounded-2xl",
              i < 3 ? "sm:col-span-2" : "sm:col-span-3",
            )}
            style={{ backgroundColor: t.ground }}
          >
            <div className={cn("relative", i < 3 ? "aspect-[4/5]" : "aspect-[16/10]")}>
              {t.image && (
                <Image
                  src={t.image}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 340px, 45vw"
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
      </div>
    </section>
  )
}
