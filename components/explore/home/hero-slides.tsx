"use client"

import { useCallback, useMemo, useRef, useState } from "react"
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

  const go = useCallback(
    (next: number) => {
      setIndex(((next % count) + count) % count)
    },
    [count],
  )

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  NOTHING MOVES UNLESS SOMEBODY MOVES IT
   * ═══════════════════════════════════════════════════════════════════════
   *
   * There was a six-second autoplay here, hedged with a pause-on-hover and a
   * visibility check. Both hedges were admissions: the first says the thing is
   * annoying while you read it, the second says it wastes work when nobody is
   * watching. A control that needs two guards against its own default
   * behaviour is a control whose default behaviour is wrong.
   *
   * It also cannot be made to feel good. The transform is smooth; what is not
   * smooth is a page that changes under you while you are deciding whether to
   * click something on it. Every attempt to "make the autoplay smoother" is an
   * attempt to make an interruption feel less like one.
   *
   * So the strip is now driven only by the arrows, the dots and the arrow keys
   * — and because nothing is racing a timer, the slide can take its time: 620ms
   * on a long ease-out, which is the difference between a jump and a movement.
   */

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
      className="group/hero relative overflow-hidden rounded-2xl"
    >
      {/* THE TRACK. One transform for the whole strip rather than a fade per
          slide: a crossfade of two 1400px images is two full-width layers being
          composited every frame, and this is the first thing on the page. */}
      <div
        className="flex"
        style={{
          transform: `translate3d(-${index * 100}%, 0, 0)`,
          transition: `transform 620ms ${EASE}`,
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
            className="grid h-[320px] w-full shrink-0 grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)] lg:h-[340px] lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]"
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
              className="flex flex-col justify-center py-8 pl-[72px] pr-6 lg:pl-[88px] lg:pr-12"
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
                className="flex h-full items-center justify-center gap-3 px-5 lg:gap-4 lg:px-8"
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
          <HeroArrow side="left" tone={slides[index]?.tone} onClick={() => go(index - 1)} />
          <HeroArrow side="right" tone="light" onClick={() => go(index + 1)} />
        </>
      )}

      {/* The dots, over the ground rather than over the photograph — the one
          part of this that IS drawn on top of something, and it is drawn on the
          half whose colour we chose, so they take that slide's ink. */}
      {count > 1 && (
        <div className="absolute bottom-5 left-[72px] flex items-center gap-2 lg:left-[88px]">
          {slides.map((s, i) => {
            const onPale = slides[index]?.tone === "dark"
            return (
              <button
                key={s.key}
                type="button"
                aria-label={`Slide ${i + 1} din ${count}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className={cn(
                  "h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out",
                  i === index
                    ? cn("w-6", onPale ? "bg-neutral-900" : "bg-white")
                    : cn("w-1.5", onPale ? "bg-neutral-900/25 hover:bg-neutral-900/40" : "bg-white/40 hover:bg-white/60"),
                )}
              />
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
        "group/card w-[132px] flex-col lg:w-[152px]",
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
