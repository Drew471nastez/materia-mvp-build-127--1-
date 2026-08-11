"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"

import { SmartLink } from "@/components/smart-link"
import { cardImage, readVariants } from "@/lib/images/variants"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE HERO, SPLIT
 * ===========================================================================
 *
 * It was a photograph with the title, the seller and the price laid over the
 * bottom-left corner of it — which is a product card blown up to 1400 pixels,
 * not a hero. Text over a photograph is legible over the picture you chose and
 * over nothing else, and every one of these pictures is uploaded by a seller
 * who was photographing a jumper rather than composing a banner.
 *
 * So it is two halves that never fight: a solid ground carrying the words and a
 * button, and the photograph beside it doing the one thing a photograph is for.
 * Nothing is drawn on top of anything, so no image can make the copy
 * unreadable — which is the property that lets a slide be built from whatever
 * happens to be listed today.
 *
 * ---------------------------------------------------------------------------
 * TWO OF THE THREE SLIDES COME FROM THE CATALOGUE
 * ---------------------------------------------------------------------------
 * A marketplace hero advertising nothing that is for sale is a poster. The
 * first slide is editorial; the other two pull a real listing's photograph and
 * link to it, so what the front page is showing is a thing somebody can
 * actually buy this minute. A slide whose listing cannot be found is DROPPED
 * rather than drawn empty.
 */

const AUTOPLAY_MS = 6000
/** Matched to the panel transitions elsewhere, so the page has one curve. */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

export type HeroListing = {
  id: string
  title: string
  slug: string
  thumbnail_url?: string | null
  gallery_urls?: string[] | null
  image_variants?: unknown
  brand?: string | null
  category?: string | null
  subcategory?: string | null
}

type Slide = {
  key: string
  eyebrow?: string
  title: string
  body: string
  cta: string
  href: string
  image: string
  alt: string
  /** The left half. Chosen per slide so three in a row are not one colour. */
  ground: string
}

/** The editorial slide. Everything after it is whatever is listed today. */
const EDITORIAL: Slide = {
  key: "editorial",
  eyebrow: "Selecție",
  title: "Sneakers sub 250 lei",
  body: "Perechi purtate puțin, la un preț pe care îl poți justifica.",
  cta: "Vezi selecția",
  href: "/?q=sneakers",
  image:
    "https://contentful.depop.com/itoh30v6uh9a/6kH5Llt5SlaiA1fsozElfZ/e824fe68ea258ea059a35a1f31616ba8/748x240__2_.jpg?fm=webp&w=1400",
  alt: "Sneakers second-hand",
  ground: "#3d4451",
}

/** Words for a slide built from a listing — the listing's own title is the
 *  headline, because it is the only honest thing to put there. */
function slideFor(listing: HeroListing, index: number): Slide | null {
  const variants = readVariants(listing.image_variants)
  const image = cardImage(variants, listing.thumbnail_url, 0)
  if (!image) return null
  const grounds = ["#1f2937", "#4a3f5c"]
  return {
    key: listing.id,
    eyebrow: listing.brand?.trim() || "Nou pe Storelib",
    title: listing.title,
    body: "Un singur exemplar. Când pleacă, a plecat.",
    cta: "Vezi anunțul",
    href: `/products/${listing.slug}`,
    image,
    alt: listing.title,
    ground: grounds[index % grounds.length],
  }
}

export function HeroSlides({ listings }: { listings: HeroListing[] }) {
  const slides = useMemo(() => {
    const fromCatalogue = listings
      .slice(0, 2)
      .map((l, i) => slideFor(l, i))
      .filter((s): s is Slide => s !== null)
    return [EDITORIAL, ...fromCatalogue]
  }, [listings])

  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = slides.length

  const go = useCallback(
    (next: number) => {
      setIndex(((next % count) + count) % count)
    },
    [count],
  )

  /**
   * AUTOPLAY THAT STOPS WHEN SOMEBODY IS LOOKING AT IT.
   *
   * A carousel that moves under the cursor while you are reading the slide is
   * the reason people hate carousels. It also stops when the tab is hidden —
   * otherwise a background tab advances thirty slides and comes back somewhere
   * arbitrary, having done thirty layout passes nobody watched.
   */
  useEffect(() => {
    if (paused || count < 2) return
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setIndex((i) => (i + 1) % count)
    }, AUTOPLAY_MS)
    return () => window.clearInterval(id)
  }, [paused, count])

  /** Arrow keys, once the strip has focus. */
  const rootRef = useRef<HTMLDivElement>(null)
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowRight") go(index + 1)
      if (e.key === "ArrowLeft") go(index - 1)
    },
    [go, index],
  )

  if (count === 0) return null

  return (
    <section
      ref={rootRef}
      aria-roledescription="carousel"
      aria-label="Selecții"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="relative overflow-hidden rounded-2xl"
    >
      {/* THE TRACK. One transform for the whole strip rather than a fade per
          slide: a crossfade of two 1400px images is two full-width layers being
          composited every frame, and this is the first thing on the page. */}
      <div
        className="flex"
        style={{
          transform: `translate3d(-${index * 100}%, 0, 0)`,
          transition: `transform 520ms ${EASE}`,
          willChange: "transform",
        }}
      >
        {slides.map((s, i) => (
          <div
            key={s.key}
            className="grid w-full shrink-0 grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]"
            aria-hidden={i !== index}
          >
            {/* The words, on a ground that cannot be argued with. */}
            <div
              className="flex flex-col justify-center px-8 py-10 lg:px-12"
              style={{ backgroundColor: s.ground }}
            >
              {s.eyebrow && (
                <p className="mb-2 truncate text-[12.5px] font-semibold uppercase tracking-[0.08em] text-white/60">
                  {s.eyebrow}
                </p>
              )}
              <h2 className="line-clamp-2 text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-white lg:text-[32px]">
                {s.title}
              </h2>
              <p className="mt-2 line-clamp-2 max-w-[34ch] text-[14.5px] font-medium leading-relaxed text-white/70">
                {s.body}
              </p>
              <SmartLink
                href={s.href}
                className="mt-6 inline-flex h-11 w-fit items-center justify-center rounded-lg bg-white px-6 text-[14.5px] font-semibold text-neutral-900 transition-colors duration-200 ease-out hover:bg-white/90"
                // A slide that is off-screen must not be in the tab order: three
                // hidden buttons before the first row of listings is three
                // presses of Tab that appear to do nothing.
                tabIndex={i === index ? 0 : -1}
              >
                {s.cta}
              </SmartLink>
            </div>

            {/* The photograph, doing the one thing a photograph is for. */}
            <div className="relative h-[240px] lg:h-[260px]">
              <Image
                src={s.image}
                alt={s.alt}
                fill
                sizes="(min-width: 1024px) 820px, 60vw"
                // Only the first slide is above the fold on arrival; the others
                // are one transform away and can wait.
                priority={i === 0}
                className="object-cover"
              />
            </div>
          </div>
        ))}
      </div>

      {/* The dots, over the ground rather than over the photograph — the one
          part of this that IS drawn on top of something, and it is drawn on the
          half whose colour we chose. */}
      {count > 1 && (
        <div className="absolute bottom-5 left-8 flex items-center gap-2 lg:left-12">
          {slides.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-label={`Slide ${i + 1} din ${count}`}
              aria-current={i === index}
              onClick={() => go(i)}
              className={cn(
                "h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out",
                i === index ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60",
              )}
            />
          ))}
        </div>
      )}
    </section>
  )
}
