/**
 * ===========================================================================
 *  THE THEME MARKETPLACE'S FRAME, DRAWN ON THE SERVER (round 58)
 * ===========================================================================
 * The bar that names the place, "Storelib theme marketplace" beside the
 * footer's mark (StorelibLogo variant "solid", the near black square the
 * marketing footer draws), then a page's breadcrumbs, H1 and its answer
 * first summary. Under the grid: a page's questions, open in the HTML so a
 * crawler and an answer engine read them without a click, and the
 * categories as plain links.
 *
 * No "use client": none of it changes after the page arrives.
 */
import Link from "next/link"

import { StorelibLogo } from "@/components/brand/storelib-logo"
import { MARKETPLACE_PATH } from "@/lib/themes/marketplace-shared"

export const MARKET_CONTAINER = "mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8"

export function MarketplaceBar() {
  return (
    <div className="border-b border-[#eceef1] bg-white">
      <div className={`${MARKET_CONTAINER} flex h-14 items-center`}>
        <Link href={MARKETPLACE_PATH} className="-ml-1 inline-flex h-10 items-center gap-2.5 rounded-lg px-1 text-[15px] font-semibold tracking-[-0.01em] text-[#1a1a2e] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30" data-market-bar="">
          <StorelibLogo size={26} variant="solid" alt="" />
          Storelib theme marketplace
        </Link>
      </div>
    </div>
  )
}

export function Breadcrumbs({ trail }: { trail: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[13px] text-[#6b7280]">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        {trail.map((s, i) => (
          <li key={s.name} className="flex min-w-0 items-center gap-1.5">
            {i > 0 ? <span aria-hidden className="text-[#c4c8cf]">/</span> : null}
            {s.href ? (
              <Link href={s.href} className="truncate transition-colors hover:text-[#1a1a2e]">
                {s.name}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-[#1a1a2e]">
                {s.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function MarketplaceHeading({ h1, intro, trail }: { h1: string; intro: string; trail?: { name: string; href?: string }[] }) {
  return (
    <header className="pb-6 pt-6 sm:pt-8 lg:pb-8">
      {trail ? <Breadcrumbs trail={trail} /> : null}
      <h1 className={`${trail ? "mt-3" : ""} text-[28px] font-bold leading-[1.15] tracking-[-0.02em] text-[#1a1a2e] sm:text-[34px]`}>{h1}</h1>
      <p data-market-intro="" className="mt-3 max-w-[680px] text-[15px] leading-[1.6] text-[#4b5563]">
        {intro}
      </p>
    </header>
  )
}

export function FaqList({ faqs, title = "Questions" }: { faqs: { q: string; a: string }[]; title?: string }) {
  if (!faqs.length) return null
  return (
    <section aria-labelledby="market-faq" className="max-w-[760px]" data-market-faq="">
      <h2 id="market-faq" className="text-[20px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[22px]">
        {title}
      </h2>
      <dl className="mt-4 divide-y divide-[#eceef1] border-y border-[#eceef1]">
        {faqs.map((f) => (
          <div key={f.q} className="py-4">
            <dt className="text-[15px] font-semibold text-[#1a1a2e]">{f.q}</dt>
            <dd className="mt-1.5 text-[14.5px] leading-[1.6] text-[#4b5563]">{f.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function CategoryLinks({ categories, current }: { categories: { slug: string; h1: string; path: string }[]; current?: string | null }) {
  return (
    <section aria-labelledby="market-categories" data-market-category-links="">
      <h2 id="market-categories" className="text-[20px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[22px]">
        Browse templates by category
      </h2>
      <ul className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        {categories
          .filter((c) => c.slug !== current)
          .map((c) => (
            <li key={c.slug} className="border-b border-[#eceef1]">
              <Link href={c.path} className="flex h-12 items-center text-[15px] font-medium text-[#1a1a2e] underline-offset-4 hover:underline">
                {c.h1}
              </Link>
            </li>
          ))}
      </ul>
    </section>
  )
}
