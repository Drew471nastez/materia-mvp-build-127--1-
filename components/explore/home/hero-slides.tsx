"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight } from "lucide-react"

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
 * ALL THREE ARE EDITORIAL, AND ALL THREE OPEN A REAL SEARCH
 * ---------------------------------------------------------------------------
 * Two of them used the LISTING'S OWN TITLE as the headline, which meant the
 * front page of the marketplace read "Eu2" in 32px — a name that means
 * something to the person who typed it and nothing to anybody else. A hero is
 * the one place on the site that has to speak to somebody who has not decided
 * to buy anything yet, and a product title cannot do that.
 *
 * So the words are written, and they are written to be read by everybody:
 * sneakers, denim and one-off pieces are the three things this catalogue is
 * actually full of, none of them is addressed to men or to women, and each one
 * gives a REASON rather than a name — priced so you can justify it, worn
 * exactly enough, not something everybody else has.
 *
 * The photographs still come from the catalogue where there are any, so what is
 * on the front page is stock this marketplace really holds. The button opens a
 * SEARCH rather than the single listing whose picture it borrowed — a slide
 * that promises "denim" and lands on one pair of jeans is a bait, and a search
 * is the honest version of the same promise.
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

/**
 * The three, written rather than generated.
 *
 * `match` is how each one finds its own photograph in the catalogue — a slide
 * about denim should not be wearing a picture of a lamp. It is a substring test
 * over the title, the brand and the category rather than a filter on a field,
 * because a second-hand catalogue files "blugi" under four different leaves and
 * spells it three ways.
 *
 * `fallback` is what it wears when the catalogue has nothing matching, and it is
 * the editorial artwork rather than a borrowed photograph of something else.
 */
type SlideCopy = Omit<Slide, "key" | "image" | "alt"> & {
  match: string[]
  fallback: string
  alt: string
}

const SNEAKERS_ART =
  "https://contentful.depop.com/itoh30v6uh9a/6kH5Llt5SlaiA1fsozElfZ/e824fe68ea258ea059a35a1f31616ba8/748x240__2_.jpg?fm=webp&w=1400"

const COPY: SlideCopy[] = [
  {
    eyebrow: "Selecție",
    title: "Sneakers sub 250 lei",
    body: "Perechi purtate puțin, la un preț pe care îl poți justifica.",
    cta: "Vezi selecția",
    href: "/?q=sneakers",
    ground: "#3d4451",
    match: ["sneaker", "adidasi", "adidași", "nike", "jordan", "shoes", "pantofi"],
    fallback: SNEAKERS_ART,
    alt: "Sneakers second-hand",
  },
  {
    eyebrow: "Denim",
    title: "Blugi care au trecut proba timpului",
    body: "Denim purtat exact cât trebuie — se poartă mai bine decât unul nou și costă mai puțin.",
    cta: "Vezi denim",
    href: "/?q=blugi",
    ground: "#2b3a4a",
    match: ["blugi", "denim", "jeans", "levi", "geac", "jachet"],
    fallback: SNEAKERS_ART,
    alt: "Blugi second-hand",
  },
  {
    eyebrow: "Unicat",
    title: "Lucruri pe care nu le are toată lumea",
    body: "Fiecare anunț este un singur exemplar. Când pleacă, a plecat — și de aceea merită căutat.",
    cta: "Descoperă",
    href: "/?q=vintage",
    ground: "#4a3f5c",
    match: ["vintage", "retro", "unicat", "y2k", "second"],
    fallback: SNEAKERS_ART,
    alt: "Piese vintage second-hand",
  },
]

/** The first listing whose title, brand or category contains one of the words —
 *  and which has not already been taken by an earlier slide. */
function pickImage(listings: HeroListing[], words: string[], taken: Set<string>): string | null {
  const hit = listings.find((l) => {
    if (taken.has(l.id)) return false
    const hay = `${l.title ?? ""} ${l.brand ?? ""} ${l.category ?? ""} ${l.subcategory ?? ""}`.toLowerCase()
    return words.some((w) => hay.includes(w))
  })
  if (!hit) return null
  const img = cardImage(readVariants(hit.image_variants), hit.thumbnail_url, 0)
  if (img) taken.add(hit.id)
  return img
}

export function HeroSlides({ listings }: { listings: HeroListing[] }) {
  const slides = useMemo<Slide[]>(() => {
    const taken = new Set<string>()
    return COPY.map((c, i) => ({
      key: `slide-${i}`,
      eyebrow: c.eyebrow,
      title: c.title,
      body: c.body,
      cta: c.cta,
      href: c.href,
      ground: c.ground,
      alt: c.alt,
      // The first slide keeps its editorial artwork whatever is listed: it is
      // the one that has to be right on an empty marketplace.
      image: (i === 0 ? c.fallback : pickImage(listings, c.match, taken) ?? c.fallback),
    }))
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
      className="group/hero relative overflow-hidden rounded-2xl"
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

      {/* ARROWS.
          
          Dots say which of three you are on; they do not say you can move. A
          carousel whose only control is a 6px dot is one people wait out rather
          than drive, and on a desktop — where there is no swipe — waiting is the
          only option they had.
          
          Over the photograph rather than the copy, because the copy half is
          where the button is and two things to press in one corner is a corner
          nobody presses confidently. They fade in on hover of the strip and stay
          permanently visible to a keyboard, so a pointer gets a clean image and
          a tab does not get a hidden control. */}
      {count > 1 && (
        <>
          <HeroArrow side="left" onClick={() => go(index - 1)} />
          <HeroArrow side="right" onClick={() => go(index + 1)} />
        </>
      )}

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

/**
 * One of the two arrows.
 *
 * `opacity-0 … group-hover:opacity-100` on the SECTION's hover rather than its
 * own: an arrow that only appears once the cursor is already on it is an arrow
 * you have to know is there. `focus-visible:opacity-100` keeps it reachable
 * without a pointer at all.
 */
function HeroArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Slide-ul anterior" : "Slide-ul următor"}
      className={cn(
        "absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full",
        "bg-white/90 text-neutral-900 shadow-[0_2px_10px_rgba(0,0,0,0.18)] backdrop-blur-sm",
        "opacity-0 transition-[opacity,transform] duration-200 ease-out",
        "group-hover/hero:opacity-100 focus-visible:opacity-100 hover:bg-white active:scale-95",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={2.4} />
    </button>
  )
}
