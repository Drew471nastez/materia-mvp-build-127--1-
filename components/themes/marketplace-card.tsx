/**
 * ===========================================================================
 *  ONE TEMPLATE ON STORELIB.COM/THEMES: ITS FIRST SCREEN, NAME, KIND, PRICE
 * ===========================================================================
 * Round 58, after Shopify's theme store: the picture is the template's home
 * page as it opens, cut to 4:5 (scripts/build-theme-seo-images.mjs, about
 * 30 KB rather than the 140 to 330 KB whole page the old card loaded), then
 * the name and the price on one line and the category under it. The whole
 * card is one link to the template's page, so a crawler and a keyboard
 * reach the same address a finger does.
 *
 * The box is drawn at its shape before the picture arrives (width, height
 * and aspect ratio), so nothing below it moves when it does. Hover is a
 * slight zoom on the picture, a transform only, and none with reduced
 * motion.
 *
 * Not the library's card (components/themes/theme-card.tsx), which the
 * builder's marketplace popup and the OnePage design tab still use.
 */
import Link from "next/link"

import type { MarketplaceCard as Card } from "@/lib/themes/theme-seo"

export function MarketplaceCard({ card, priority = false, hidden = false }: { card: Card; priority?: boolean; hidden?: boolean }) {
  return (
    <article data-market-card={card.slug} hidden={hidden} className="min-w-0">
      <Link href={card.href} prefetch={false} className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 focus-visible:ring-offset-4">
        <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-[#eef0f3] shadow-[0_0_0_1px_rgba(17,24,39,0.06),0_1px_2px_rgba(17,24,39,0.04)] transition-shadow duration-300 group-hover:shadow-[0_0_0_1px_rgba(17,24,39,0.08),0_12px_28px_-16px_rgba(17,24,39,0.28)]">
          {card.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- already cut to size and WebP; the optimizer would only resize it again
            <img
              src={card.image.src}
              srcSet={card.image.srcSet || undefined}
              sizes="(min-width: 1280px) 300px, (min-width: 1024px) 30vw, (min-width: 520px) 46vw, 92vw"
              width={card.image.width}
              height={card.image.height}
              alt={card.alt}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : undefined}
              decoding="async"
              draggable={false}
              className="absolute inset-0 h-full w-full select-none object-cover object-top transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center px-6 text-center text-[15px] font-semibold text-[#9ca3af]">{card.name}</span>
          )}
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <h3 className="min-w-0 truncate text-[15px] font-semibold leading-5 text-[#1a1a2e]">{card.name}</h3>
          <span data-market-price="" className="shrink-0 text-[14px] leading-5 tabular-nums text-[#1a1a2e]">{card.price}</span>
        </div>
        <p className="mt-0.5 truncate text-[13px] leading-5 text-[#6b7280]">{card.categoryName}</p>
      </Link>
    </article>
  )
}
