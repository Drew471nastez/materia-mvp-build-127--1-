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
    tiles: { icon: typeof Fingerprint; title: string; body: string; opensProtection?: boolean }[]
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
    body: "Haine, sneakers, cărți, muzică, și obiecte de colecție, vândute de oameni din toată țara.",
    cta: "Vezi ce e de vânzare",
    href: "/?q=",
    tiles: [
      { icon: Fingerprint, title: "Lucruri diferite", body: "Găsești ceva nou de fiecare dată." },
      { icon: PackagePlus, title: "Adăugate zilnic", body: "Listări noi, în fiecare zi." },
      // The only tile that opens something. Safety is the one claim on this
      // panel a stranger has no reason to take on trust, and the fastest way to
      // be believed about it is to show the terms rather than describe them.
      { icon: ShieldCheck, title: "Safe Buying", body: "Plătești simplu și în siguranță.", opensProtection: true },
    ],
  },
  sell: {
    title: "Vinde ce nu mai folosești. Fără comision.",
    body: "Publici rapid, găsești un cumpărător și păstrezi banii din vânzare.",
    cta: "Începe să vinzi",
    href: "/products/new",
    tiles: [
      { icon: Camera, title: "Publici rapid", body: "Câteva poze, un preț și gata." },
      { icon: Wallet, title: "Zero comision", body: "Primești prețul pe care îl setezi." },
      { icon: Truck, title: "Livrare simplă", body: "AWB generat automat" },
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
/**
 * ONE ARTWORK PER SIDE OF THE TOGGLE.
 *
 * The panel already swaps its headline, its line, its button and its three
 * tiles when you press Vinde — everything except the picture, which went on
 * showing a shopper's composition while the copy talked about publishing a
 * listing. That is the one element on the panel that was not answering the
 * control, and it is the largest.
 */
const HERO_IMAGE: Record<Side, string> = {
  buy: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20design%20(2).png",
  /* (4) → (5). Checked against the buy side before it went in, because the
     three facts above are what the ratio box, the `object-contain` and the
     absence of any background of its own all rest on: 1356x798, RGBA, and all
     four corners sampled at 0,0,0,0. Same canvas, same ratio, same transparent
     ground — so this is a swap of the file and nothing else. An asset a few
     pixels off would letterbox inside the box rather than crop, which is the
     failure that hides for a month. */
  sell: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20design%20(5).png",
}

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

/**
 * @param className Outer spacing, owned by the caller.
 *
 * The desktop page wants it inset on a 1400px measure with `mb-8` under it;
 * the phone feed wants it inside a scroller that already has its own gutters
 * and a grid of listings directly below. Baking either one in means the other
 * caller is undoing it, and `mb-8` undone by `mb-0` is two margins arguing in
 * a class string. `cn` is tailwind-merge, so a margin passed here REPLACES the
 * default rather than landing beside it.
 */
export function SignedOutHero({ className }: { className?: string } = {}) {
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
      /**
       * A LITTLE DEPTH, AND DELIBERATELY A LITTLE.
       *
       * The panel was a flat tint with a hairline ring: correct on a #f5f5f5
       * page in the sense that it did not shout, and slightly too correct — at
       * that weight it read as a region of the background rather than as
       * something placed on it, so the page opened on a large pale rectangle
       * with no edge.
       *
       * Two shadows and a very slightly darker ring. The first is a one-pixel
       * contact shadow, which is what actually says "this sits on top"; the
       * second is a wide, heavily-offset ambient one at 12% — spread over 40px
       * and pulled 24px in, so it never reads as a drop shadow, only as the
       * ground being a touch darker underneath. Nothing here is above ~0.12
       * alpha, which is about a five percent change in perceived separation:
       * enough that the edge exists, not enough to make a card out of a
       * section.
       */
      className={cn(
        "relative mb-8 overflow-hidden rounded-2xl ring-1 ring-black/[0.055] shadow-[0_1px_2px_rgba(15,15,15,0.04),0_18px_40px_-24px_rgba(15,15,15,0.12)]",
        className,
      )}
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
        /* IT FALLS NOW, RATHER THAN SWEEPING ACROSS.
         *
         * 115deg was a diagonal, and a diagonal on a panel twice as wide as it
         * is tall spends most of its travel on the horizontal: the left-hand
         * side was lighter than the right-hand side, which put the brightest
         * part of the ground directly behind the headline and the darkest part
         * behind the artwork — the two things on this panel that least want a
         * ground drawing attention to itself.
         *
         * 170deg is top to bottom with ten degrees of lean, and the lean is the
         * whole of the difference between this and a mechanical band. Light
         * enters at the top edge and the panel darkens the whole way down,
         * which is the one direction a surface can be lit from without anybody
         * reading it as a gradient — it is just where the light is.
         *
         * MONOTONIC, AND THAT IS NEW. Every previous setting here ended on a
         * lighter stop than the one before it, because a diagonal wants to come
         * back up in the far corner. Falling light does not: 253 → 250 → 245 →
         * 240 → 235, five stops so the ramp has no step in it, ending four
         * percent under the #f5f5f5 page. Five stops rather than three because
         * a near-flat ramp over six hundred pixels is exactly where 8-bit sRGB
         * bands, and the extra stops are free.
         *
         * The chroma is where the last pass left it — present at about the
         * strength of a shadow. This changed the DIRECTION, not the amount. */
        background:
          "linear-gradient(170deg, #fdfcff 0%, #faf8fd 22%, #f5f3fa 46%, #f0eef6 72%, #ebebf3 100%)",
      }}
    >
      {/* ═══════════════════════════════════════════════════════════════════
          BIGGER ARTWORK IN A SHORTER PANEL, WHICH IS ONLY A CONTRADICTION IF
          THE ARTWORK IS WHAT MAKES IT TALL
          ═══════════════════════════════════════════════════════════════════

          It is not. The copy column is: a toggle, a 42px headline, a
          paragraph, a 52px button and a row of tiles come to something over
          450px, while the picture at a half column is about 350. `items-center`
          then centres the shorter of the two, and the ~100px of slack either
          side of the artwork is the panel's height being set entirely by the
          left-hand side.

          So the two asks do not fight each other. The artwork grows into slack
          it already had — 45/55 instead of 50/50, which is a tenth more width
          and a tenth more height on a 1.7:1 box — and the height comes off the
          copy column's own rhythm, where it was actually being spent.

          THE 55 IS NOT FREE, and the number was picked by what it costs the
          other side rather than by what it gives this one. A half column at
          1400px is ~596px and 45% is ~536px: the headline still breaks in two
          at 42px, and the tile bodies still run to the same two lines they
          already ran to, because a third of 536 minus the padding is still
          more than twenty characters. Anything past 55 starts reflowing the
          left-hand side, and reflowing the left-hand side makes the panel
          TALLER — the opposite of the other half of this. */}
      {/* AND ON A PHONE IT IS ONE COLUMN, WHICH IT ALWAYS WAS — but at desktop
          measurements, which it should not have been. 24px of side padding on a
          375px screen is 13% of the width gone before the headline starts, and
          a 40px gap between the copy and the picture is a gap you scroll past.
          20/28 and a 28px gap: the same composition, measured for the screen it
          is actually on. Everything above sm is untouched. */}
      <div className="grid items-center gap-7 px-5 py-7 sm:gap-10 sm:px-8 sm:py-9 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)] lg:gap-12 lg:px-12 lg:py-[46px]">
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
              instead of a long one and an orphan.

              THE FIVE PERCENT COMES OFF HERE, and off the tile row below, and
              off the panel's own padding — three places rather than one. The
              panel is ~586px at 1400px wide, so five percent is about 29
              pixels; taking all of it from `py` would have meant 41px of air
              above a 42px headline, which is a panel with its contents pushed
              against the edges rather than a shorter panel. 20px off the
              padding, 4 here, 4 at the tiles. Nothing that carries meaning —
              the gap between the button and the tiles is the one that separates
              "what to do" from "what you get", and it is untouched. */}
          <h1 className="mt-6 text-balance text-[28px] font-bold leading-[1.12] tracking-[-0.03em] text-neutral-900 sm:text-[34px] lg:text-[42px]">
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
              box, which is the raggedness this row had.

              ═══════════════════════════════════════════════════════════════
              ON A PHONE IT IS A RAIL, BECAUSE ONE COLUMN OF THREE IS 300px
              ═══════════════════════════════════════════════════════════════

              `grid-cols-1` below sm stacked these, which is the honest
              responsive answer for a page and the wrong one for this panel:
              three boxes at ~95px each plus their gaps is 300px of supporting
              detail under a button, on a screen where the whole hero has to
              stay short enough that the listings under it are still on the
              first screenful.

              A snapping rail keeps all three at the height of one. It is also
              the pattern a phone already teaches — anything wider than the
              screen scrolls sideways — so there is nothing to learn, and the
              second tile peeking at the right edge is what says so without a
              chevron or a row of dots.

              `basis-[78%]` rather than a fixed width: it scales with the
              screen, and it is deliberately not a round fraction, because a
              tile that ends exactly at the edge looks like the last one.

              `-mx-5 px-5` bleeds the rail to the panel's edges and puts the
              padding inside the scroller instead, so the first tile still
              lines up with the headline while the last one can scroll fully
              into view rather than stopping short by the panel's inset.
              `sm:mx-0 sm:px-0` hands it all back to the grid above sm, where
              none of this applies. */}
          <div className="-mx-5 mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 scrollbar-hide sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
            {c.tiles.map((tile) => {
              const Icon = tile.icon
              /**
               * WHICH TILE OPENS THE PROTECTION PANEL IS A PROPERTY OF THE TILE,
               * not of its position.
               *
               * It was `i === 2` — the third one, on both sides — which was true
               * while both third tiles said "Cum funcționează" and both meant
               * the same page. They do not any more: the seller's third tile is
               * about AWB labels, and an underlined line reading "AWB-ul este
               * generat pentru tine" that opens a page about buyer protection is
               * a link that lies about where it goes.
               */
              const opensPanel = tile.opensProtection === true
              return (
                <div
                  key={tile.title}
                  // The same treatment one step quieter: these sit ON the panel
                  // that now sits on the page, and two objects at the same
                  // elevation stacked on each other is what flattens both.
                  className="flex h-auto min-w-0 shrink-0 basis-[78%] snap-start flex-col rounded-xl bg-white/75 px-4 py-4 ring-1 ring-black/[0.055] shadow-[0_1px_2px_rgba(15,15,15,0.035)] backdrop-blur-[2px] sm:h-full sm:basis-auto"
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
        {/* ONE DRIFT FOR BOTH LAYERS, on the box they share.
        
            It was on each layer, which is two animations where one will do —
            and two animations of the same length started at the same moment are
            in phase only until something desynchronises them. During a switch
            that would be the two compositions drifting fractionally apart while
            they cross-fade, which is movement invented by the code rather than
            present in the artwork. On the parent there is nothing to keep in
            step: the pictures cannot drift relative to each other because they
            are not being animated at all. */}
        <div className="hero-art-drift relative w-full" style={{ aspectRatio: HERO_RATIO }}>
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
          {/* ═══════════════════════════════════════════════════════════════
              BOTH ARE MOUNTED, AND OPACITY DECIDES WHICH ONE YOU SEE
              ═══════════════════════════════════════════════════════════

              Swapping `src` on one element is not a cross-fade — the browser
              tears the first picture down, requests the second, and shows
              whatever is behind them in between. On a half-panel this size that
              is a white hole for as long as the network takes, every time
              somebody presses the toggle.

              Two elements, both `priority`, both decoded before either is
              needed, and only their opacity changes. The switch is then a
              composited cross-fade with nothing to fetch, which is the whole
              of "it should change smoothly between Cumpără and Vinde", and it
              costs one extra image on a panel that is only ever drawn to people
              with no account.

              `aria-hidden` on the inactive one, so a screen reader is not read
              two decorative images; `alt=""` means neither is announced anyway,
              and this is belt as well as braces. */}
          {(["buy", "sell"] as const).map((s) => (
            <div
              key={s}
              aria-hidden={side !== s}
              /**
               * THE OUTGOING ONE LEAVES FASTER THAN THE INCOMING ONE ARRIVES.
               *
               * Both at 420ms meant that halfway through the switch you were
               * looking at two whole compositions at half strength each — three
               * cards dissolving into three different cards, all six visible at
               * once. Nothing is moving, but everything LOOKS like it is, which
               * is exactly "the images move too much when I change side".
               *
               * Cutting the overlap is the fix, not slowing the fade down: the
               * one going away is gone in 200ms while the one arriving takes
               * 340 and is held back 90ms behind it. For most of the transition
               * only one picture is meaningfully on screen, so what you see is a
               * replacement rather than a blend.
               *
               * The two canvases are identical — both 1356x798, both drawn into
               * the same ratio box with `object-contain` — so there is no
               * geometry to correct here. Everything that read as movement was
               * the overlap.
               */
              style={{
                transitionProperty: "opacity",
                transitionDuration: side === s ? "340ms" : "200ms",
                transitionDelay: side === s ? "90ms" : "0ms",
                transitionTimingFunction: side === s ? "cubic-bezier(0.22,0.61,0.16,1)" : "linear",
              }}
              className={cn("absolute inset-0", side === s ? "opacity-100" : "opacity-0")}
            >
              {/* THE DRIFT.
                  
                  Nine seconds, five pixels, and a curve that is symmetric at
                  both ends so the loop has no seam. It is deliberately below the
                  threshold where you would call it an animation: what it buys is
                  that the panel is not a photograph of an interface — a page
                  where nothing at all moves reads as a screenshot, and this is
                  the first thing somebody who has never been here looks at.
                  
                  Five pixels over four and a half seconds is about one pixel a
                  second. You cannot watch it move; you notice that it has moved.
                  Any faster and it becomes a thing on the page competing with
                  the headline beside it, which is the failure mode of every
                  floating hero image ever shipped.
                  
                  `transform` only, so it is the compositor's business and never
                  the layout's — this element is `absolute inset-0` inside a
                  ratio box, so nothing can be pushed by it either way. It stops
                  entirely under `prefers-reduced-motion`; a continuous loop is
                  exactly what that preference is about. */}
              <div className="absolute inset-0">
                <Image
                  src={HERO_IMAGE[s]}
                  alt=""
                  fill
                  /* The real rendered widths, so the optimizer picks the smallest
                     rung that covers them rather than the largest it has. 55%
                     of a 1400px measure less the panel's padding and gap is
                     ~655px, up from ~596 — the column grew, so this grew with
                     it. A `sizes` left behind by a layout change is the quiet
                     kind of wrong: the picture still fits, it is just being
                     upscaled from a rung too small for it. */
                  sizes="(min-width: 1024px) 680px, (min-width: 768px) 90vw, 100vw"
                  priority
                  /* 75 is the top of the list next.config permits, and it is the
                     right end of that list for this: a composite with flat colour
                     fields and small type on the book covers shows banding and
                     ringing long before a photograph would. */
                  quality={75}
                  draggable={false}
                  /* `object-contain`, not cover. The ratio matches so neither
                     would crop today, but contain is the one that stays correct
                     if the box ever drifts — and on artwork with its own
                     shadows, a silent crop takes the shadow off one edge and
                     nobody notices for a month. */
                  className="pointer-events-none select-none object-contain [-webkit-user-drag:none]"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
