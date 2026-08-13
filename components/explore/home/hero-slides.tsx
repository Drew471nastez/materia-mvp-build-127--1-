"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { SmartLink } from "@/components/smart-link"
import { useLocale } from "@/components/locale-provider"
import { cardImage, readVariants } from "@/lib/images/variants"
import { buyerPaysCents } from "@/lib/marketplace/display-price"
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

/** Matched to the panel transitions elsewhere, so the page has one curve. */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

/**
 * How long a slide holds, and how long the dot takes to fill. ONE constant for
 * both — a bar that finishes before the slide changes, or is still running when
 * it does, is worse than no bar, and two numbers drift the first time either is
 * tuned.
 */
const AUTOPLAY_MS = 5000

/**
 * The slide's own travel, and it is NOT the panel curve above.
 *
 * `EASE` starts fast and settles — right for a sheet answering a tap, wrong for
 * something that moves on its own: an unprompted movement that begins at full
 * speed reads as a jerk, because nothing preceded it. This one eases in AND
 * out, so the strip gathers itself, travels, and arrives.
 *
 * 480ms, down from 720. The curve was right and the length was not: an
 * ease-in-out spends its middle third at full speed and its outer thirds slow,
 * so at 720 the two ends are long enough to WATCH — the strip appears to
 * hesitate before it goes and again before it lands. The same shape at 480 has
 * the same three phases and none of them outstays the eye. It is also the one
 * animation on this page nobody asked for, which is the argument for it being
 * at the short end of what reads as deliberate.
 */
const SLIDE_EASE = "cubic-bezier(0.65, 0, 0.35, 1)"

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
  price_cents?: number | null
}

/** One thing on a shelf: enough to draw a card, not a whole listing. */
type ShelfItem = {
  id: string
  image: string
  slug: string
  title: string
  brand: string | null
  priceCents: number | null
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
  /** "dark" ink on a pale ground; "light" (the default) on a dark one. */
  tone: "light" | "dark"
  alt: string
} & (
  | { kind: "art"; image: string }
  /** Three real listings, each in its own 3:4 box. */
  | { kind: "shelf"; items: ShelfItem[] }
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
  /**
   * Which way round the ink runs on this slide's ground.
   *
   * Defaults to "light" — white type — because two of the three grounds are
   * dark. A slide that sets a pale ground must say `tone: "dark"` or its copy
   * is white on bone, which is the sort of thing that ships because the person
   * who changed the colour never scrolled to the slide.
   */
  tone?: "light" | "dark"
  alt: string
} & (
  /** The one composed image. */
  | { art: string }
  /** Preference for which listings fill this slide's shelf; it is a preference
   *  and not a filter — see pickShelf. */
  | { prefer: string[] }
)

const SNEAKERS_ART =
  "https://unfazed.ro/cdn/shop/collections/unfazed-desktop-collection-jordan-4-retro_6.jpg?v=1744359752&width=2048"

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
    /**
     * WHY THIS IS DARK AGAIN.
     *
     * It was bone (#f2efe9) for one deploy, to break up three dark panels in a
     * row. Two things were wrong with it and only one was taste.
     *
     * The real fault: this is a SHELF slide, and the shelf lives on the same
     * ground. Flipping the ink covered the headline, the body and the button —
     * and missed the three cards' captions, which stayed white. So a pale slide
     * showed "Guess / 372 RON" in white on bone: the products were there and
     * their names and prices were invisible. That is fixed properly now (the
     * tone reaches ShelfCard), but it is why a pale ground is the one that has
     * to earn its place rather than be assumed safe.
     *
     * The taste: bone next to the page's own near-white read as a hole in the
     * page rather than a panel on it.
     *
     * Espresso instead. It is a WARM dark against two cool ones — slate and
     * green — so the three still read as three, and every photograph on the
     * shelf sits on it better than on a pale ground, because a listing photo is
     * usually itself light.
     */
    ground: "#3a2e29",
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

function pickShelf(listings: HeroListing[], prefer: string[], taken: Set<string>): ShelfItem[] {
  const out: ShelfItem[] = []

  const consider = (l: HeroListing) => {
    if (out.length === SHELF || taken.has(l.id)) return
    const image = cardImage(readVariants(l.image_variants), l.thumbnail_url, 0)
    if (!image) return
    taken.add(l.id)
    out.push({
      id: l.id,
      image,
      slug: l.slug,
      title: l.title ?? "",
      brand: l.brand ?? null,
      priceCents: typeof l.price_cents === "number" ? l.price_cents : null,
    })
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

export function HeroSlides({
  listings,
  className,
}: {
  listings: HeroListing[]
  /** The gap above it. See the note on the section's own className below — this
   *  section is sometimes the first thing on the page and sometimes the fourth,
   *  and only the caller knows which. */
  className?: string
}) {
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
        tone: c.tone ?? ("light" as const),
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
  const count = slides.length
  /**
   * Bumped on every DELIBERATE move, and never by the timer.
   *
   * It is what the dots' fill animation is keyed on: pressing an arrow has to
   * restart the countdown from zero, and it can only do that if React throws
   * the running animation away and mounts a new one. An index alone cannot say
   * "the same slide, but the clock was reset" — going 0 → 1 → 0 would reuse
   * slide 0's element and inherit however far through its fill had already got.
   */
  const [turn, setTurn] = useState(0)

  const go = useCallback(
    (next: number) => {
      setIndex(((next % count) + count) % count)
      setTurn((t) => t + 1)
    },
    [count],
  )

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  FIVE SECONDS, AND THE DOTS SHOW THEM PASSING
   * ═══════════════════════════════════════════════════════════════════════
   *
   * The timer is deliberately NOT a `setInterval` that lives across slides. It
   * is one timeout per slide, torn down and rebuilt whenever the index or the
   * turn changes — which is what makes pressing an arrow reset the countdown
   * rather than advancing into a tick that was already half spent. An interval
   * gives you the opposite: press next at 4.9s and the slide you just chose
   * lasts 100ms.
   *
   * It is the same clock the dots draw: AUTOPLAY_MS is used once here and once
   * in the fill animation below, so the bar cannot finish early or run past the
   * change. Two constants would drift the first time either was tuned.
   *
   * A hidden tab does not advance. Thirty slides pass in a background tab
   * otherwise, and you come back to an arbitrary one having paid for thirty
   * layout passes nobody watched.
   */
  useEffect(() => {
    if (count < 2) return
    const id = window.setTimeout(() => {
      if (document.visibilityState === "visible") go(index + 1)
      else setTurn((t) => t + 1)
    }, AUTOPLAY_MS)
    return () => window.clearTimeout(id)
  }, [index, turn, count, go])


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
      /* JUST ENOUGH TO SIT ON THE PAGE.
         
         Two shadows rather than one: a 1px hairline at 6% that draws the edge,
         and a wide soft one at 8% that lifts it. A single large shadow at a
         weight you can see reads as a floating card and turns the top of the
         page into a component; this reads as the page having a surface. */
      /* THE OUTER SPACING IS THE CALLER'S, and it has to be: this is the only
         section on the home page that is sometimes the FIRST thing on it and
         sometimes the fourth. Baking `mt-14` in would put a gap above the top
         of the page; leaving it at nothing — which is what it was — butts the
         previous row's cards straight against the slideshow with no space at
         all between them, which is what it did. */
      className={cn(
        "group/hero relative overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(15,15,15,0.06),0_12px_28px_-12px_rgba(15,15,15,0.18)]",
        className,
      )}
    >
      {/* THE TRACK. One transform for the whole strip rather than a fade per
          slide: a crossfade of two 1400px images is two full-width layers being
          composited every frame, and this is the first thing on the page. */}
      <div
        className="flex"
        style={{
          transform: `translate3d(-${index * 100}%, 0, 0)`,
          transition: `transform 480ms ${SLIDE_EASE}`,
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
            /* 0.46/0.54 below 1024, 0.42/0.58 above. At 768px the copy half was
               322px carrying a 32px headline and a button, which is where the
               "Sneakers sub" wrapping came from. */
            /* ═══════════════════════════════════════════════════════════
               STACKED ON A PHONE, SIDE BY SIDE FROM md UP
               ═══════════════════════════════════════════════════════════

               Two columns at 375px gives the copy half about 172px, and what
               is in it is a 22px headline, two lines of body and a 44px
               button. Nothing about that fits: the headline breaks after every
               second word and the button wraps. A slide is one picture and one
               sentence, and on a narrow screen those go one above the other —
               which is also the only arrangement where the picture gets the
               full width it was composed for.

               A DEFINITE PICTURE ROW AND A CONTENT-SIZED COPY ROW, rather
               than a ratio on each half. `aspect-ratio` inside a grid track
               that the flex track is also stretching is two rules arguing over
               one number: the row grows to match the tallest slide and the
               picture grows with it, so the ratio it was given stops being
               true. 264px is fixed, and the number comes from the shelf slides:
               two cards at 46% of a 375px screen are 154px wide, so a 3:4
               photograph is 205px and its caption is another 44. Anything
               shorter and the price is clipped off the bottom; anything taller
               and the cards float in a band of ground with nothing in it, which
               is what 228 left them doing.

               The copy row is `auto`, so it takes what it needs; the flex
               track stretches every slide to the tallest of them, and the
               extra lands in that row where `justify-center` absorbs it. No
               slide is ever a different height from its neighbours, which is
               what would make the track jump as it moves. */
            className="grid h-auto w-full shrink-0 grid-rows-[264px_auto] md:h-[320px] md:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)] md:grid-rows-none lg:h-[340px] lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]"
            aria-hidden={i !== index}
          >
            {/* The words, on a ground that cannot be argued with.

                THE LEFT PADDING IS THE ARROW'S SEAT.

                `pl-[72px]` is not styling — it is the gutter the previous
                arrow was sitting IN somebody's headline for want of. The
                arrow is vertically centred at the left edge, which is exactly
                where a centred block of copy also is, so the only way the two
                can share that edge is for the copy to start after it. Reserve
                the space and the collision is impossible by construction,
                rather than avoided by hoping the headline stays short. */}
            <div
              /* THE LEFT PADDING IS THE ARROW'S SEAT, and only where the
                 arrow is. Below md the arrows are not drawn — the track is
                 swipeable and a 36px disc over a 375px slide is a control in
                 the way of the thing it controls — so reserving 72px there is
                 an inch of empty ground beside every headline on a screen with
                 none to spare. `order-2` puts the words UNDER the picture in
                 the stack: the photograph is what stops the scroll, and the
                 sentence is what you read once it has.

                 `pb-11` is the dots' strip. They are absolutely positioned to
                 the bottom of the SECTION, and in the stack the bottom of the
                 section is the bottom of this half — so without it they land on
                 the button. Reserved rather than avoided, because the button is
                 the one thing on a slide anybody presses. */
              className="order-2 flex flex-col justify-center px-5 pb-11 pt-6 md:order-none md:px-0 md:py-8 md:pl-[72px] md:pr-6 lg:pl-[88px] lg:pr-12"
              style={{ backgroundColor: s.ground }}
            >
              {s.eyebrow && (
                <p
                  className={cn(
                    "mb-2 truncate text-[12px] font-semibold uppercase tracking-[0.08em]",
                    s.tone === "dark" ? "text-neutral-500" : "text-white/60",
                  )}
                >
                  {s.eyebrow}
                </p>
              )}
              <h2
                className={cn(
                  "line-clamp-2 text-[22px] font-bold leading-[1.15] tracking-[-0.02em] lg:text-[32px]",
                  s.tone === "dark" ? "text-neutral-900" : "text-white",
                )}
              >
                {s.title}
              </h2>
              <p
                className={cn(
                  "mt-2 line-clamp-2 max-w-[34ch] text-[13.5px] font-medium leading-relaxed lg:text-[14.5px]",
                  s.tone === "dark" ? "text-neutral-600" : "text-white/70",
                )}
              >
                {s.body}
              </p>
              <SmartLink
                href={s.href}
                className={cn(
                  "mt-6 inline-flex h-11 w-fit items-center justify-center rounded-lg px-6 text-[14.5px] font-semibold transition-colors duration-200 ease-out",
                  s.tone === "dark"
                    ? "bg-neutral-900 text-white hover:bg-neutral-800"
                    : "bg-white text-neutral-900 hover:bg-white/90",
                )}
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
              <div className="relative order-1 h-full md:order-none">
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
                className="order-1 flex h-full items-center justify-center gap-3 px-5 md:order-none lg:gap-4 lg:px-8"
                style={{ backgroundColor: s.ground }}
              >
                {s.items.map((it, n) => (
                  <ShelfCard
                    key={it.id}
                    item={it}
                    tone={s.tone}
                    tabbable={i === index}
                    /* THE THIRD ONE STANDS DOWN ON A NARROW WINDOW.

                       Between 768 and 1024 the picture half is about 430px, and
                       three cards plus their gaps do not fit in it — they were
                       being squeezed until the titles wrapped to three lines and
                       the prices fell off the bottom. Two cards at a comfortable
                       size say the same thing as three cramped ones. */
                    className={n === 2 ? "hidden lg:flex" : "flex"}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          BACK ON THE EDGES — WITH A SEAT RESERVED FOR THE LEFT ONE
          ═══════════════════════════════════════════════════════════════════

          They belong on the edges: that is where everybody's hand goes on a
          carousel, and moving them into a corner made a familiar control into
          one you have to find.

          The reason they were moved is that the left one was drawn straight
          through the headline. The answer is not to relocate the arrow but to
          stop the copy claiming that strip: the left column now starts at 72px
          (88 above 1024), so the arrow sits in a gutter the text can never
          reach. Overlap is impossible by construction rather than avoided by
          hoping headlines stay short.

          The dots move to the same 72/88, so the copy, the button and the dots
          share one left margin instead of three. */}
      {count > 1 && (
        <>
          {/* md UP ONLY. A 36px disc pinned over a 375px slide sits on top of
              the picture it is there to change, and the track is already
              swipeable — the gesture a phone reaches for first. The dots stay
              at every width: they are the clock, not the control. */}
          <div className="hidden md:contents">
            <HeroArrow side="left" tone={slides[index]?.tone} onClick={() => go(index - 1)} />
            <HeroArrow side="right" tone="light" onClick={() => go(index + 1)} />
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          THE DOTS ARE THE CLOCK
          ═══════════════════════════════════════════════════════════════════

          A dot that only says WHICH of three you are on leaves the movement
          unexplained: the slide changes, and nothing on the screen was
          building up to it. The active one is a track with a bar that fills
          over exactly AUTOPLAY_MS — the same constant the timer uses — so the
          change is something you watched arrive rather than something that
          happened to you.

          `key={turn}` on the bar is what makes it honest. Pressing an arrow
          must restart the fill from zero, and React will only replay a CSS
          animation on a NEW element; reusing the old one inherits however far
          through it already was. An index alone cannot express "same slide,
          clock reset" — 0 → 1 → 0 would reuse slide 0's bar.

          `animation-play-state` is left alone deliberately: the timer does not
          pause on hover, so a bar that did would be lying about when the change
          is coming.

          They keep the bottom left, on the ground whose colour we chose, and
          take that slide's ink. */}
      {/* 72/88 is the arrow's gutter, which only exists from md up — below it
          the dots go where the copy goes, which is 20px in, so the three share
          one left edge at every width rather than at two of them. */}
      {count > 1 && (
        <div className="absolute bottom-4 left-5 flex items-center gap-2 md:bottom-5 md:left-[72px] lg:left-[88px]">
          {slides.map((s, i) => {
            const onPale = slides[index]?.tone === "dark"
            const active = i === index
            return (
              <button
                key={s.key}
                type="button"
                aria-label={`Slide ${i + 1} din ${count}`}
                aria-current={active}
                onClick={() => go(i)}
                className={cn(
                  "h-1.5 overflow-hidden rounded-full transition-[width,background-color] duration-300 ease-out",
                  active
                    ? cn("w-8", onPale ? "bg-neutral-900/20" : "bg-white/30")
                    : cn("w-1.5", onPale ? "bg-neutral-900/25 hover:bg-neutral-900/40" : "bg-white/40 hover:bg-white/60"),
                )}
              >
                {active && (
                  <span
                    key={turn}
                    className={cn("hero-dot-fill block h-full rounded-full", onPale ? "bg-neutral-900" : "bg-white")}
                    style={{ animationDuration: `${AUTOPLAY_MS}ms` }}
                  />
                )}
              </button>
            )
          })}
        </div>
      )}

    </section>
  )
}

/**
 * ===========================================================================
 *  ONE THING ON THE SHELF — A PICTURE AND WHAT IT IS
 * ===========================================================================
 *
 * It was a photograph and nothing else, and three unlabelled photographs is a
 * mood board: you cannot tell whether the thing is five lei or five hundred,
 * or even what it is, without clicking one to find out. On a marketplace's
 * front page that is the one question the picture exists to answer.
 *
 * So it is a card. The image keeps its 3:4 exactly — the whole reason these
 * are boxes rather than a stretched banner — and the two lines under it are
 * the two facts somebody needs to decide whether to click: what it is, and
 * what it costs.
 *
 * The price is the BUYER-INCLUSIVE one, through buyerPaysCents, because that is
 * the number quoted everywhere else on this site. A hero showing 130 next to a
 * grid showing 141 for the same jumper would be the front page undercutting the
 * rest of the marketplace.
 *
 * White at 70% for the name and full white for the price: on a coloured ground
 * the price has to survive being the smallest thing on the slide.
 */
function ShelfCard({
  item,
  tone = "light",
  tabbable,
  className,
}: {
  item: ShelfItem
  /**
   * THE CAPTIONS ARE PART OF THE INK, and forgetting that shipped a slide whose
   * products were invisible: white "Guess / 372 RON" on a bone ground. A tone
   * that reaches the headline but not the three things it is introducing is not
   * a tone, it is a half-applied theme.
   */
  tone?: "light" | "dark"
  tabbable: boolean
  className?: string
}) {
  const { t, formatPrice } = useLocale()
  return (
    <SmartLink
      href={`/products/${item.slug}`}
      tabIndex={tabbable ? 0 : -1}
      className={cn(
        /* IT FILLS THE ROW ON A PHONE. 132px is a card measured for a
           half-slide on a desktop; two of them on a 375px screen use 276 of the
           335 available and leave the rest as ground, so the slide reads as two
           small pictures floating in a coloured box rather than as a shelf.
           46% is the same two cards at the width they are actually given, and
           the cap stops them ballooning on a large phone in landscape. */
        "group/card w-[46%] max-w-[170px] flex-col sm:w-[132px] lg:w-[152px]",
        // The whole card lifts, not just the photograph — a picture that moves
        // inside a caption that does not is two objects, and this is one.
        "transition-transform duration-[380ms] ease-out hover:-translate-y-1",
        className,
      )}
    >
      <span className="relative block aspect-[3/4] w-full overflow-hidden rounded-xl bg-black/20">
        <Image
          src={item.image}
          alt=""
          fill
          sizes="160px"
          className="object-cover transition-transform duration-[500ms] ease-out group-hover/card:scale-[1.05]"
        />
      </span>
      <span
        className={cn(
          "mt-2 block truncate text-[12.5px] font-medium leading-tight",
          tone === "dark" ? "text-neutral-500" : "text-white/70",
        )}
      >
        {item.brand || item.title}
      </span>
      <span
        className={cn(
          "mt-0.5 block text-[14px] font-bold leading-tight",
          tone === "dark" ? "text-neutral-900" : "text-white",
        )}
      >
        {item.priceCents == null
          ? " "
          : item.priceCents === 0
            ? t("product.free")
            : formatPrice(buyerPaysCents(item.priceCents))}
      </span>
    </SmartLink>
  )
}

/**
 * One of the two arrows. Positioned by the pair that holds them, not by itself.
 *
 * They stay VISIBLE rather than fading in on hover. Hiding them was the right
 * call when they sat over the middle of the artwork; in the corner they take up
 * no picture worth seeing, and a control that appears only once you have
 * guessed it is there is a control most people never find. Muted white so they
 * read as chrome on any of the three grounds.
 */
function HeroArrow({
  side,
  tone = "light",
  onClick,
}: {
  side: "left" | "right"
  /** The ink of the half this arrow sits over, so a white disc never lands on
   *  a bone ground as an invisible smudge. */
  tone?: "light" | "dark"
  onClick: () => void
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Slide-ul anterior" : "Slide-ul următor"}
      className={cn(
        "absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full",
        "shadow-[0_2px_10px_rgba(0,0,0,0.16)] backdrop-blur-sm",
        "transition-[background-color,transform] duration-200 ease-out active:scale-95",
        tone === "dark"
          ? "bg-neutral-900/85 text-white hover:bg-neutral-900"
          : "bg-white/85 text-neutral-900 hover:bg-white",
        side === "left" ? "left-4 lg:left-5" : "right-4 lg:right-5",
      )}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.4} />
    </button>
  )
}
