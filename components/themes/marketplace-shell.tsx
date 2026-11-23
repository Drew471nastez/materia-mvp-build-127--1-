/**
 * ===========================================================================
 *  THE THEME MARKETPLACE'S FRAME, DRAWN ON THE SERVER (round 58, round 23)
 * ===========================================================================
 * A page's breadcrumbs and H1, the page's questions under the grid (open in
 * the HTML, so a crawler and an answer engine read them without a click),
 * the categories as plain links, and the footer. The bar at the top is
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

import { StorelibLogo } from "@/components/brand/storelib-logo"
import { MARKETPLACE_PATH } from "@/lib/themes/marketplace-shared"
import { publicHelpUrl } from "@/lib/help/paths"

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

/*
  ===========================================================================
   THE FOOTER (round 23, the owner: a proper footer, black, columns of links)
  ===========================================================================
  The way on from any marketplace page: every category, the free and newest
  templates, Storelib's help, and Storelib itself, then the legal pages on
  a line under a rule. Storelib's real addresses only. The mark is the
  solid one the site's black footer draws (components/marketing/footer.tsx).
*/
type FooterLink = { label: string; href: string }

export function MarketplaceFooter({ categories }: { categories: { slug: string; name: string; path: string }[] }) {
  const columns: { title: string; links: FooterLink[] }[] = [
    { title: "Categories", links: categories.map((c) => ({ label: c.name, href: c.path })) },
    {
      title: "Templates",
      links: [
        { label: "All templates", href: MARKETPLACE_PATH },
        { label: "Free templates", href: `${MARKETPLACE_PATH}?price=free` },
        { label: "Newest", href: `${MARKETPLACE_PATH}?sort=newest` },
      ],
    },
    {
      title: "Help",
      links: [
        { label: "Help center", href: publicHelpUrl() },
        { label: "Questions", href: "/faq" },
        { label: "Developers", href: "/developers" },
        { label: "Blog", href: "/blog" },
      ],
    },
    {
      title: "Storelib",
      links: [
        { label: "Features", href: "/features" },
        { label: "Pricing", href: "/pricing" },
        { label: "Discover", href: "/explore" },
        { label: "Contact us", href: "mailto:team@storelib.com" },
      ],
    },
  ]
  const legal: FooterLink[] = [
    { label: "Terms of Service", href: "/terms" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Refund Policy", href: "/refund-policy" },
  ]
  const linkClass = "rounded text-[15px] leading-6 text-white/70 outline-none transition-colors duration-150 hover:text-white focus-visible:text-white focus-visible:ring-2 focus-visible:ring-white/40"
  return (
    <footer
      data-market-footer=""
      className="bg-[#0a0a0c] text-white"
      style={{ marginBottom: "calc(-1 * env(safe-area-inset-bottom, 0px))", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className={`${MARKET_CONTAINER} pb-10 pt-14 sm:pt-16`}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,1fr))] md:gap-x-8">
          <div className="col-span-2 md:col-span-1">
            <Link href={MARKETPLACE_PATH} aria-label="Storelib theme marketplace" className="inline-flex rounded-[9px] outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-white/40">
              <StorelibLogo size={40} variant="solid" alt="" />
            </Link>
          </div>
          {columns.map((c) => (
            <nav key={c.title} aria-label={c.title} data-market-footer-column={c.title}>
              <p className="text-[16px] font-semibold text-white">{c.title}</p>
              <ul className="mt-4 space-y-3">
                {c.links.map((l) => (
                  <li key={l.href}>
                    {l.href.startsWith("mailto:") || l.href.startsWith("http") ? (
                      <a href={l.href} className={linkClass}>
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} prefetch={false} className={linkClass}>
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-14 flex flex-col gap-4 border-t border-white/15 pt-7 sm:flex-row sm:items-center sm:justify-between">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {legal.map((l) => (
              <li key={l.href}>
                <Link href={l.href} prefetch={false} className={linkClass}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-[14px] text-white/50">© {new Date().getFullYear()} Storelib</p>
        </div>
      </div>
    </footer>
  )
}
