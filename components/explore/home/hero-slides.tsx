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
 * So the words are written, and they are written to be read by everybody: a
 * price you can justify, things that went up this week, things that exist once.
 * None of the three is addressed to men or to women, and each gives a REASON
 * rather than a name.
 *
 * The photographs come from the catalogue, so what is on the front page is
 * stock this marketplace really holds. The button opens a SEARCH rather than
 * the single listing whose picture it borrowed — a slide that promises a
 * category and lands on one item is a bait, and a search is the honest version
 * of the same promise.
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
  /** The left half. Chosen per slide so three in a row are not one colour. */
  ground: string
  alt: string
} & (
  | { kind: "art"; image: string }
  /** Three real listings, each in its own 3:4 box. */
  | { kind: "shelf"; items: { id: string; image: string; slug: string }[] }
)

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
type SlideCopy = {
  eyebrow: string
  title: string
  body: string
  cta: string
  href: string
  ground: string
  alt: string
} & (
  /** The one composed image. */
  | { art: string }
  /** Preference for which listings fill this slide's shelf; it is a preference
   *  and not a filter — see pickShelf. */
  | { prefer: string[] }
)

const SNEAKERS_ART =
  "https://contentful.depop.com/itoh30v6uh9a/6kH5Llt5SlaiA1fsozElfZ/e824fe68ea258ea059a35a1f31616ba8/748x240__2_.jpg?fm=webp&w=1400"

/**
 * ---------------------------------------------------------------------------
 * WHY THERE IS NO LONGER A SLIDE ABOUT JEANS
 * ---------------------------------------------------------------------------
 * "Blugi care au trecut proba timpului" over a stock photograph was copy
 * written to sound like a campaign for a category this marketplace does not
 * especially have. It read as generated, which on a second-hand site is the
 * one thing that cannot be true — the whole proposition is that these are real
 * objects owned by real people.
 *
 * What replaced it says something that is simply a FACT about the catalogue —
 * these went up in the last few days; each of these exists once — and then
 * proves it by showing the actual things rather than a picture of the idea of
 * them. Nothing to disbelieve, nothing to write.
 *
 * The grounds are muted and natural for the same reason: three saturated
 * panels in a row is a banner ad, and the photographs are the colour on this
 * page.
 */
const COPY: SlideCopy[] = [
  {
    eyebrow: "Selecție",
    title: "Sneakers sub 250 lei",
    body: "Perechi purtate puțin, la un preț pe care îl poți justifica.",
    cta: "Vezi selecția",
    href: "/?q=sneakers",
    ground: "#3d4451",
    art: SNEAKERS_ART,
    alt: "Sneakers second-hand",
  },
  {
    eyebrow: "Noutăți",
    title: "Adăugate zilele astea",
    body: "Piese urcate de curând de oameni din toată țara. Se vând o singură dată.",
    cta: "Vezi noutățile",
    href: "/?q=",
    ground: "#5b5148",
    prefer: [],
    alt: "Anunțuri adăugate recent",
  },
  {
    eyebrow: "Unicat",
    title: "Lucruri pe care nu le are toată lumea",
    body: "Fiecare anunț este un singur exemplar. Când pleacă, a plecat.",
    cta: "Descoperă",
    href: "/?q=vintage",
    ground: "#3f4a44",
    prefer: ["vintage", "retro", "unicat", "y2k", "second", "handmade"],
    alt: "Piese vintage second-hand",
  },
]

/**
 * ===========================================================================
 *  WHY THE LISTING SLIDES ARE A SHELF AND NOT A PHOTOGRAPH
 * ===========================================================================
 *
 * They used to stretch one listing's photo across the whole right half, and it
 * was the worst thing on the page. A listing photograph is PORTRAIT — a jumper
 * on a hanger, a pair of jeans on a floor, shot 3:4 by somebody holding a phone
 * vertically. Putting that in a 820x260 slot with `object-cover` throws away
 * three quarters of it and keeps a horizontal band from the middle, which is
 * how the front page ended up showing two people's torsos and a picnic blanket.
 * No crop rule fixes that; the aspect ratios are simply not the same shape.
 *
 * A shelf of three, each in its own 3:4 box, crops NOTHING. It also happens to
 * be more honest and better looking: three real things somebody is selling,
 * side by side, instead of one stock-looking lifestyle photograph that could
 * have come from anywhere. Clean, and unmistakably this marketplace's.
 *
 * ---------------------------------------------------------------------------
 * THE KEYWORDS ARE A PREFERENCE, NOT A FILTER
 * ---------------------------------------------------------------------------
 * They used to be a filter, and on the real catalogue that meant BOTH listing
 * slides found fewer than three matches, both fell back to the artwork, and the
 * front page showed the SAME photograph three times in a row. Three identical
 * slides is worse than any crop.
 *
 * So each slide takes its preferred listings first and then tops up from
 * whatever else is unused. A slide called "Unicat" showing a coat that is not
 * literally tagged vintage is still telling the truth — it IS a single
 * exemplar, that is the claim — whereas showing the same stock photo three
 * times is not telling the truth about anything.
 *
 * A slide that STILL cannot fill three boxes is dropped from the carousel
 * outright. One honest slide beats three copies of one.
 */
const SHELF = 3

function pickShelf(
  listings: HeroListing[],
  prefer: string[],
  taken: Set<string>,
): { id: string; image: string; slug: string }[] {
  const out: { id: string; image: string; slug: string }[] = []

  const consider = (l: HeroListing) => {
    if (out.length === SHELF || taken.has(l.id)) return
    const image = cardImage(readVariants(l.image_variants), l.thumbnail_url, 0)
    if (!image) return
    taken.add(l.id)
    out.push({ id: l.id, image, slug: l.slug })
  }

  // Preferred first, in catalogue order (which is newest-first).
  if (prefer.length > 0) {
    for (const l of listings) {
      if (out.length === SHELF) break
      const hay = `${l.title ?? ""} ${l.brand ?? ""} ${l.category ?? ""} ${l.subcategory ?? ""}`.toLowerCase()
      if (prefer.some((w) => hay.includes(w))) consider(l)
    }
  }
  // Then anything still unclaimed.
  for (const l of listings) {
    if (out.length === SHELF) break
    consider(l)
  }
  return out
}

export function HeroSlides({ listings }: { listings: HeroListing[] }) {
  const slides = useMemo<Slide[]>(() => {
    const taken = new Set<string>()
    const out: Slide[] = []
    COPY.forEach((c, i) => {
      const base = {
        key: `slide-${i}`,
        eyebrow: c.eyebrow,
        title: c.title,
        body: c.body,
        cta: c.cta,
        href: c.href,
        ground: c.ground,
        alt: c.alt,
      }
      // The one composed image. It is the slide that has to be right on an
      // empty marketplace, and the only picture on this page that was made for
      // this shape rather than cropped into it.
      if ("art" in c) {
        out.push({ ...base, kind: "art", image: c.art })
        return
      }
      const items = pickShelf(listings, c.prefer, taken)
      // Dropped rather than filled with the artwork again — see the note above
      // pickShelf. Three copies of one photograph was the actual complaint.
      if (items.length === SHELF) out.push({ ...base, kind: "shelf", items })
    })
    return out
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
          /* THE HEIGHT LIVES HERE, ON THE SLIDE, NOT ON THE PICTURE.

             It used to be on the image half — `h-[240px]` on a grid item, while
             the copy half was sized by its own contents. Eyebrow, two lines of
             32px headline, two lines of body, a 44px button and 80px of padding
             come to about 285px, so the ROW was 285 tall and the picture was
             240: a band of page-white under the photograph, for the whole width
             of it. That is the cut edge.

             With the height on the row both halves stretch to it, and the copy
             is centred in whatever is left rather than deciding it. */
          <div
            key={s.key}
            className="grid h-[300px] w-full shrink-0 grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:h-[320px]"
            aria-hidden={i !== index}
          >
            {/* The words, on a ground that cannot be argued with. */}
            <div
              className="flex flex-col justify-center px-8 py-8 lg:px-12"
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

            {/* The right half: either artwork composed for this shape, or three
                real listings each in its own box. Never one portrait photograph
                stretched across a landscape slot — see the note above pickShelf. */}
            {s.kind === "art" ? (
              <div className="relative h-full">
                <Image
                  src={s.image}
                  alt={s.alt}
                  fill
                  sizes="(min-width: 1024px) 820px, 60vw"
                  // Only the first slide is above the fold on arrival; the
                  // others are one transform away and can wait.
                  priority={i === 0}
                  className="object-cover"
                />
              </div>
            ) : (
              <div
                className="flex h-full items-center justify-center gap-3 px-6 lg:gap-4 lg:px-8"
                style={{ backgroundColor: s.ground }}
              >
                {s.items.map((it) => (
                  /* `aspect-[3/4]` rather than a width, so the box IS the card's
                     ratio and `object-cover` has nothing to throw away. The row
                     is centred because three 3:4 boxes are narrower than the
                     half they sit in — space either side is the correct answer,
                     stretching them to fill it is not. */
                  <SmartLink
                    key={it.id}
                    href={`/products/${it.slug}`}
                    tabIndex={i === index ? 0 : -1}
                    className="relative h-[236px] aspect-[3/4] overflow-hidden rounded-xl bg-black/20 lg:h-[252px]"
                  >
                    <Image
                      src={it.image}
                      alt=""
                      fill
                      sizes="200px"
                      className="object-cover transition-transform duration-[400ms] ease-out hover:scale-[1.04]"
                    />
                  </SmartLink>
                ))}
              </div>
            )}
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
