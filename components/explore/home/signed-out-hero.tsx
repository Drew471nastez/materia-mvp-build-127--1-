"use client"

import { useState } from "react"
import Image from "next/image"
import { Fingerprint, PackagePlus, ShieldCheck, Camera, Wallet, Truck } from "lucide-react"

import { SmartLink } from "@/components/smart-link"
import { openBuyerProtection } from "@/components/marketplace/buyer-protection"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE FIRST THING A STRANGER SEES
 * ===========================================================================
 *
 * Everything else on this page answers "what is for sale". This answers "what
 * is this", which is a question only somebody who has never been here has —
 * which is why it is drawn ONLY when signed out, and why it disappears the
 * moment there is an account behind the visit. A returning shopper being told
 * what the site is, every time, is the site not recognising them.
 *
 * ---------------------------------------------------------------------------
 * THE TOGGLE IS THE WHOLE PROPOSITION IN ONE CONTROL
 * ---------------------------------------------------------------------------
 * A resale marketplace has two halves and no way to know which one somebody
 * arrived for. A single headline has to pick, and picking wrong is the visit.
 * Two words at the top, and the entire panel answers to them: headline, line,
 * button and the three notes underneath. Nothing navigates until a button is
 * pressed, so switching costs nothing and reveals what the other side offers.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT HERE: NUMBERS
 * ---------------------------------------------------------------------------
 * The reference this is modelled on carries a count of items and a count of
 * daily listings. Storelib has neither at that scale, and a marketplace whose
 * front page opens with a figure it cannot stand behind has told its first lie
 * to everybody who ever visits.
 *
 * So the three tiles are PROPERTIES rather than counts — each one is true on
 * the day the catalogue holds four things and still true when it holds forty
 * thousand, and each is something the product actually does. The third opens
 * the buyer-protection panel rather than describing it, because the fastest way
 * to be believed about safety is to show the terms.
 */

type Side = "buy" | "sell"

/**
 * The tiles were ragged, and the cause was the copy rather than the CSS.
 *
 * "Anunț în câteva minute" wrapped to two lines while "Zero comision" sat on
 * one, and the third tile's link wrapped as well — so three boxes that are the
 * same object had three different heights and their icons, titles and lines all
 * started at different places. A grid can equalise the BOXES; it cannot make
 * three ragged blocks of text look like a set.
 *
 * So the titles are two words and the lines are short enough to hold one line
 * at the width this actually renders at. Six icons rather than the same three
 * twice: a tile about publishing photographs should not wear a t-shirt.
 */
const COPY: Record<
  Side,
  {
    title: string
    body: string
    cta: string
    href: string
    tiles: { icon: typeof Fingerprint; title: string; body: string }[]
  }
> = {
  buy: {
    /**
     * NOT ONLY FASHION.
     *
     * "Poartă-l cum vrei" and "ce nu mai porți" both say WEAR, and the taxonomy
     * this marketplace actually ships has Divertisment and Hobbyuri și colecții
     * in it — books, records, film, collectables. A front page that only
     * addresses clothes tells everybody selling a record player that they are
     * in the wrong place.
     *
     * So the verbs are neutral and the list is explicit: the second line names
     * four kinds of thing, two of which are not clothing at all.
     */
    title: "Cumpără second-hand. Fă-l al tău.",
    body: "Haine, pantofi, cărți, muzică și obiecte de colecție — lucruri care au mai trăit o dată, de la oameni din toată țara.",
    cta: "Vezi ce e de vânzare",
    href: "/?q=",
    tiles: [
      { icon: Fingerprint, title: "Lucruri unicat", body: "Un exemplar din fiecare." },
      { icon: PackagePlus, title: "Adăugate zilnic", body: "De la vânzători reali." },
      { icon: ShieldCheck, title: "Plată protejată", body: "Cum funcționează" },
    ],
  },
  sell: {
    title: "Vinde ce nu mai folosești. Fără comision.",
    body: "Publici în câteva minute, iar prețul pe care îl ceri este prețul pe care îl primești.",
    cta: "Publică un anunț",
    href: "/products/new",
    tiles: [
      { icon: Camera, title: "Publici rapid", body: "Câteva poze și un preț." },
      { icon: Wallet, title: "Zero comision", body: "Primești cât ai cerut." },
      { icon: Truck, title: "Livrare cu AWB", body: "Cum funcționează" },
    ],
  },
}

/**
 * ===========================================================================
 *  THE HERO ARTWORK — OURS, AND WHAT IT NEEDS FROM THE LAYOUT
 * ===========================================================================
 *
 * Three facts about this file decide everything below, and all three were read
 * off the asset rather than assumed:
 *
 *   1356 x 798, so 1.70:1. The box states that ratio, which is why nothing
 *   is cropped — a mismatch is what took a fifth off the previous artwork.
 *
 *   RGBA with a FULLY TRANSPARENT ground (corners sampled at 0,0,0,0). That is
 *   why it sits directly on the gradient with no card, no radius and no
 *   background of its own: the composition already carries its own rounded
 *   tiles and its own drop shadows, and putting it in a second box would be a
 *   card inside a card. It also means the format must keep alpha — AVIF and
 *   WebP both do, and next.config lists exactly those two, so there is no path
 *   here that flattens it onto black.
 *
 *   And it is big enough for the slot — 1356 wide against a ~600px
 *   column — which is what lets it fill rather than be capped.
 */
const HERO_IMAGE =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20design%20(2).png"

/** Its real ratio, so `object-contain` has nothing to letterbox and
 *  `object-cover` would have nothing to crop. */
const HERO_RATIO = "1356 / 798"

/**
 * THERE IS NO WIDTH CAP ANY MORE, AND THAT IS THE POINT.
 *
 * The previous export was 400x200 — smaller than the ~600px column it sits in.
 * Next's optimizer never upscales past the source, so no `quality` setting
 * could put back detail that was not in the file, and the only way to keep it
 * sharp was to cap the render at 400 and centre it in a column half empty.
 *
 * This one is 1356x798. It covers the column at 1x and still has headroom at
 * 2x, so it simply fills its half and the browser picks the rung it needs. The
 * cap is GONE rather than raised: a cap that never binds is a number somebody
 * has to reason about later for no reason.
 */

export function SignedOutHero() {
  const [side, setSide] = useState<Side>("buy")
  const c = COPY[side]

  return (
    <section
      /**
       * A PANEL ON THE PAGE, not a band across the window.
       *
       * Full-bleed was tried and reverted. Edge to edge, this stopped being one
       * of the page's sections and became a header — and the page it heads is a
       * grid of listings on a 1400px measure, so a ground running out past that
       * measure on both sides made the listings look inset rather than making
       * the hero look wide.
       *
       * Rounded, inset, on the same measure as everything under it. The radius
       * is what the listing cards, the slideshow and the category tiles all
       * already use.
       */
      className="relative mb-8 overflow-hidden rounded-2xl ring-1 ring-black/[0.04]"
      /**
       * VERY LIGHT, AND BARELY PURPLE.
       *
       * The page behind is #f5f5f5, so this has to be distinguishable from it
       * without becoming a coloured banner — the photographs and the listings
       * are the colour on this page and a saturated ground competes with both.
       * Three stops: a warm near-white, the faintest lilac through the middle,
       * and a cool grey out to the right. The purple is present at roughly the
       * strength of a shadow, which is enough to read as chosen rather than as
       * a default white card.
       */
      style={{
        background: "linear-gradient(115deg, #fbfafc 0%, #f4f2fa 42%, #eff0f5 78%, #f6f5f8 100%)",
      }}
    >
      <div className="grid items-center gap-10 px-6 py-10 sm:px-8 lg:grid-cols-[minmax(0,0.5fr)_minmax(0,0.5fr)] lg:gap-12 lg:px-12 lg:py-14">
        <div className="min-w-0">
          {/* THE TOGGLE. A track with a sliding thumb rather than two buttons
              that swap colour: the thumb moving is what says these are two
              sides of one thing, and it is one transform on one element. */}
          <div className="relative inline-flex rounded-full bg-white/80 p-1 shadow-[0_1px_2px_rgba(15,15,15,0.05)] ring-1 ring-black/[0.05]">
            <span
              aria-hidden
              /* BLACK, and the purple stays on the button below it.

                 Grey was tried and it was too quiet: on a near-white track on a
                 near-white panel, a neutral-200 thumb is three greys within a
                 few percent of each other, and at a glance the switch did not
                 look switched. Black is the only value on this panel with
                 enough distance from the ground to read as a selected state
                 from across the page.

                 It still does not compete with the CTA, because they are
                 different KINDS of thing: the switch is monochrome and the
                 button is the only colour, so the eye separates them by hue
                 rather than by weight. What could not work is both being
                 purple — two things claiming to be the primary action.

                 420ms on an overshoot curve. A thumb sliding between two stops
                 is the one movement where a slight overrun reads as physical
                 rather than as a wobble — it is a switch being thrown, and a
                 switch does not decelerate gently into place. */
              className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-neutral-900 shadow-[0_1px_3px_rgba(15,15,15,0.22)] transition-transform duration-[420ms] ease-[cubic-bezier(0.34,1.32,0.5,1)]"
              style={{ transform: side === "sell" ? "translateX(100%)" : "translateX(0)" }}
            />
            {(["buy", "sell"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                aria-pressed={side === s}
                /* White on the selected side, because the thumb underneath it
                   is now black. The colour has to change on the same 200ms the
                   thumb is travelling on, or the word goes unreadable for a
                   fifth of a second while a black pill slides under black
                   text. */
                className={cn(
                  "relative z-10 w-[100px] rounded-full py-2 text-[14px] font-semibold transition-colors duration-200",
                  side === s ? "text-white" : "text-neutral-500 hover:text-neutral-800",
                )}
              >
                {s === "buy" ? "Cumpără" : "Vinde"}
              </button>
            ))}
          </div>

          {/* `text-balance` so a two-line headline breaks into two even lines
              instead of a long one and an orphan. */}
          <h1 className="mt-7 text-balance text-[28px] font-bold leading-[1.12] tracking-[-0.03em] text-neutral-900 sm:text-[34px] lg:text-[42px]">
            {c.title}
          </h1>
          <p className="mt-4 max-w-[44ch] text-[15px] font-medium leading-relaxed text-neutral-600 lg:text-[16.5px]">
            {c.body}
          </p>

          <SmartLink
            href={c.href}
            /* THE PURPLE LIVES HERE NOW. It is the only thing on the panel
               that navigates, so it is the only thing that should look like it
               does — and the shadow is tinted with the same hue rather than
               black, which is what stops a coloured button reading as a
               rectangle with a grey smudge under it. */
            className="mt-8 inline-flex h-[52px] items-center justify-center rounded-xl bg-[#7c3aed] px-8 text-[15px] font-semibold text-white shadow-[0_1px_2px_rgba(76,29,149,0.24),0_8px_20px_-8px_rgba(124,58,237,0.55)] transition-[background-color,transform] duration-200 ease-out hover:bg-[#6d28d9] active:scale-[0.985]"
          >
            {c.cta}
          </SmartLink>

          {/* `items-stretch` is the grid default and `h-full` is what makes it
              reach the tallest tile — without it a shorter tile is a shorter
              box, which is the raggedness this row had. */}
          <div className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {c.tiles.map((tile, i) => {
              const Icon = tile.icon
              // The last tile's line is the buyer-protection page, on both
              // sides — a seller wants to know what the buyer is promised as
              // much as the buyer does.
              const opensPanel = i === 2
              return (
                <div
                  key={tile.title}
                  className="flex h-full flex-col rounded-xl bg-white/70 px-4 py-4 ring-1 ring-black/[0.05] backdrop-blur-[2px]"
                >
                  <Icon className="h-[19px] w-[19px] shrink-0 text-neutral-400" strokeWidth={1.8} />
                  <p className="mt-3 text-[14px] font-bold leading-tight tracking-[-0.01em] text-neutral-900">
                    {tile.title}
                  </p>
                  {opensPanel ? (
                    <button
                      type="button"
                      onClick={() => openBuyerProtection()}
                      className="mt-1 w-fit text-left text-[13px] font-medium leading-snug text-neutral-500 underline decoration-neutral-300 underline-offset-[3px] transition-colors hover:text-neutral-900"
                    >
                      {tile.body}
                    </button>
                  ) : (
                    <p className="mt-1 text-[13px] font-medium leading-snug text-neutral-500">{tile.body}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* The artwork, at its own ratio so nothing is cut and capped so
            nothing is blown up. Below 1024 it goes UNDER the copy rather than
            beside it — at that width a half column is 300px and this is a
            composition of three tiles, not a thumbnail. */}
        <div className="relative w-full" style={{ aspectRatio: HERO_RATIO }}>
          {/* NOT DRAGGABLE, NOT SELECTABLE, NOT RIGHT-CLICKABLE.
              
              `draggable={false}` stops the browser's own drag-to-copy, which is
              what lifts a ghost of the picture off the page the moment somebody
              swipes across it — easy to do by accident on a panel this size, and
              it looks broken every time.
              
              `pointer-events-none` is the other half and does more than it
              looks: with no pointer events the image cannot be the target of a
              context menu either, so "Save image as…" never appears, and it
              cannot be the start of a selection. Nothing here is interactive,
              so there is nothing to lose by taking the events away. */}
          <Image
            src={HERO_IMAGE}
            alt=""
            fill
            /* The real rendered widths, so the optimizer picks the smallest rung
               that covers them rather than the largest it has. */
            sizes="(min-width: 1024px) 620px, (min-width: 768px) 90vw, 100vw"
            priority
            /* 75 is the top of the list next.config permits, and it is the right
               end of that list for this: a composite with flat colour fields and
               small type on the book covers shows banding and ringing long
               before a photograph would. */
            quality={75}
            draggable={false}
            /* `object-contain`, not cover. The ratio matches so neither would
               crop today, but contain is the one that stays correct if the box
               ever drifts — and on artwork with its own shadows, a silent crop
               takes the shadow off one edge and nobody notices for a month. */
            className="pointer-events-none select-none object-contain [-webkit-user-drag:none]"
          />
        </div>
      </div>
    </section>
  )
}
