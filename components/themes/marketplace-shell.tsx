/**
 * ===========================================================================
 *  THE THEME MARKETPLACE'S FRAME, DRAWN ON THE SERVER (round 58, round 23)
 * ===========================================================================
 * A page's breadcrumbs and H1, the page's questions under the grid (open in
 * the HTML, so a crawler and an answer engine read them without a click),
 * and the categories as plain links. The footer is storelib.com's own
 * (components/marketing/footer.tsx, marketplace round 24). The bar at the top is
 * components/themes/marketplace-header.tsx, the only header on these pages
 * (round 23, the owner: "no double header").
 *
 * THE HEADING STANDS ALONE (round 23, the owner: "no subheading under the
 * heading"). Large and plain, as a store of themes opens, with the count
 * beside the order further down. A category's own summary is still in the
 * page for search, under its grid (CategorySummary), not under its name.
 *
 * No "use client": none of it changes after the page arrives.
 */
import Link from "next/link"


export const MARKET_CONTAINER = "mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8"

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

export function MarketplaceHeading({ h1, trail }: { h1: string; trail?: { name: string; href?: string }[] }) {
  return (
    <header className="pb-7 pt-6 sm:pb-10 sm:pt-10 lg:pb-12 lg:pt-12">
      {trail ? <Breadcrumbs trail={trail} /> : null}
      <h1 className={`${trail ? "mt-3" : ""} text-[34px] font-bold leading-[1.08] tracking-[-0.025em] text-[#111114] sm:text-[44px] lg:text-[52px]`}>{h1}</h1>
    </header>
  )
}

/** A category's summary, for search: in the page, under the grid, never under the heading. */
export function CategorySummary({ text }: { text: string }) {
  return (
    <p data-market-intro="" className="max-w-[760px] text-[15px] leading-[1.65] text-[#4b5563]">
      {text}
    </p>
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
