"use client"

import { useState } from "react"
import Image from "next/image"
import { Shirt, Sparkles, ShieldCheck } from "lucide-react"

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
 * The reference this is modelled on carries "49M+ items for sale" and "1.1M+
 * new listings every day". Storelib has neither, and a marketplace whose front
 * page opens with a figure it cannot stand behind has told its first lie to
 * everybody who ever visits.
 *
 * So the three tiles are PROPERTIES rather than counts — each one is true on
 * the day the catalogue holds four things and still true when it holds forty
 * thousand, and each is something the product actually does. The third opens
 * the buyer-protection panel rather than describing it, because the fastest way
 * to be believed about safety is to show the terms.
 */

type Side = "buy" | "sell"

const COPY: Record<
  Side,
  {
    title: string
    body: string
    cta: string
    href: string
    tiles: { icon: typeof Shirt; title: string; body: string }[]
  }
> = {
  buy: {
    title: "Cumpără second-hand. Poartă-l cum vrei.",
    body: "Haine, pantofi și obiecte care au mai trăit o dată — de la oameni din toată țara.",
    cta: "Vezi ce e de vânzare",
    href: "/?q=",
    tiles: [
      {
        icon: Shirt,
        title: "Piese unicat",
        body: "Fiecare anunț este un singur exemplar.",
      },
      {
        icon: Sparkles,
        title: "Adăugate în fiecare zi",
        body: "Vânzători reali, nu stoc de magazin.",
      },
      {
        icon: ShieldCheck,
        title: "Cumperi în siguranță",
        body: "Protecția cumpărătorului",
      },
    ],
  },
  sell: {
    title: "Vinde ce nu mai porți. Fără comision.",
    body: "Publici în câteva minute, iar prețul pe care îl ceri este prețul pe care îl primești.",
    cta: "Publică un anunț",
    href: "/products/new",
    tiles: [
      {
        icon: Shirt,
        title: "Anunț în câteva minute",
        body: "Câteva poze, un preț, gata.",
      },
      {
        icon: Sparkles,
        title: "Zero comision",
        body: "Primești exact suma pe care ai cerut-o.",
      },
      {
        icon: ShieldCheck,
        title: "Livrare cu AWB",
        body: "Protecția cumpărătorului",
      },
    ],
  },
}

/** Composed for this shape, and the one image on the page that was. */
const HERO_IMAGE = "https://assets.depop.com/web/assets/dual-homepage/hero/2026-07/buyer-desktop@2x.webp"

export function SignedOutHero() {
  const [side, setSide] = useState<Side>("buy")
  const c = COPY[side]

  return (
    <section
      className="relative mb-6 overflow-hidden rounded-2xl"
      // A warm ground rather than white: the page behind is #f5f5f5 and a white
      // panel on it is a rectangle you have to look for. This reads as the top
      // of the page rather than as the first card on it.
      style={{ background: "linear-gradient(105deg, #f6f1ea 0%, #f2eef7 62%, #eef0f7 100%)" }}
    >
      <div className="grid items-center gap-8 px-8 py-10 lg:grid-cols-[minmax(0,0.52fr)_minmax(0,0.48fr)] lg:gap-10 lg:px-12 lg:py-12">
        <div>
          {/* THE TOGGLE. A track with a sliding thumb rather than two buttons
              that swap colour: the thumb moving is what says these are two
              sides of one thing, and it is one transform on one element. */}
          <div className="relative inline-flex rounded-full bg-white/70 p-1 shadow-[0_1px_2px_rgba(15,15,15,0.06)] ring-1 ring-black/[0.04]">
            <span
              aria-hidden
              className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-white shadow-[0_1px_3px_rgba(15,15,15,0.14)] transition-transform duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
              style={{ transform: side === "sell" ? "translateX(100%)" : "translateX(0)" }}
            />
            {(["buy", "sell"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                aria-pressed={side === s}
                className={cn(
                  "relative z-10 w-[104px] rounded-full py-2 text-[14.5px] font-semibold transition-colors duration-200",
                  side === s ? "text-neutral-900" : "text-neutral-500 hover:text-neutral-700",
                )}
              >
                {s === "buy" ? "Cumpără" : "Vinde"}
              </button>
            ))}
          </div>

          <h1 className="mt-6 text-[30px] font-bold leading-[1.1] tracking-[-0.025em] text-neutral-900 lg:text-[40px]">
            {c.title}
          </h1>
          <p className="mt-3 max-w-[46ch] text-[15px] font-medium leading-relaxed text-neutral-600 lg:text-[16px]">
            {c.body}
          </p>

          <SmartLink
            href={c.href}
            className="mt-7 inline-flex h-12 items-center justify-center rounded-lg bg-neutral-900 px-7 text-[15px] font-semibold text-white transition-colors duration-200 ease-out hover:bg-neutral-800"
          >
            {c.cta}
          </SmartLink>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {c.tiles.map((tile, i) => {
              const Icon = tile.icon
              // The last tile's line is the buyer-protection page, on both
              // sides — a seller wants to know what the buyer is promised as
              // much as the buyer does.
              const opensPanel = i === 2
              return (
                <div
                  key={tile.title}
                  className="rounded-xl bg-white/60 px-4 py-3.5 ring-1 ring-black/[0.04] backdrop-blur-[2px]"
                >
                  <Icon className="h-[18px] w-[18px] text-neutral-500" strokeWidth={1.9} />
                  <p className="mt-2 text-[14px] font-bold tracking-[-0.01em] text-neutral-900">{tile.title}</p>
                  {opensPanel ? (
                    <button
                      type="button"
                      onClick={() => openBuyerProtection()}
                      className="mt-0.5 text-[12.5px] font-medium text-neutral-600 underline decoration-neutral-300 underline-offset-2 transition-colors hover:text-neutral-900"
                    >
                      {tile.body}
                    </button>
                  ) : (
                    <p className="mt-0.5 text-[12.5px] font-medium leading-relaxed text-neutral-600">{tile.body}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* The photograph. `hidden lg:block` rather than shrinking: below 1024
            the copy needs the whole measure, and a 300px-wide version of this
            picture is a thumbnail of a composition. */}
        <div className="relative hidden aspect-[4/3] w-full lg:block">
          <Image
            src={HERO_IMAGE}
            alt=""
            fill
            sizes="(min-width: 1024px) 620px, 0px"
            priority
            className="rounded-2xl object-cover"
          />
        </div>
      </div>
    </section>
  )
}
