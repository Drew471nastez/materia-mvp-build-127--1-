import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { listingBySlug, publishedListings } from "@/lib/themes/marketplace-server"
import { CODE_TEMPLATES, LISTING_SLUG_RE, MARKETPLACE_PATH, builtinListings, hasLivePreview, listingPath, templatePreviewPath, tierLabel, type ThemeListing } from "@/lib/themes/marketplace-shared"
import { featureLabel, marketplaceCard, relatedListings, themeAlt, themeCategoryPath, themeImages, themePageCopy, THEME_SEO_CATEGORIES, marketplaceCategoryCopy, categoriesOf } from "@/lib/themes/theme-seo"
import { themeJsonLd } from "@/lib/themes/theme-seo-jsonld"
import { pageMetadata } from "@/lib/seo/page-metadata"
import Link from "next/link"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { MarketplaceCard } from "@/components/themes/marketplace-card"
import { Breadcrumbs, CategoryLinks, FaqList, MARKET_CONTAINER, MarketplaceBar } from "@/components/themes/marketplace-shell"
import { ThemeActions } from "./theme-detail"

/**
 * ===========================================================================
 *  STORELIB.COM/THEMES/<SLUG>: ONE TEMPLATE, WRITTEN FOR THE SEARCH IT ANSWERS
 * ===========================================================================
 * Round 58. The H1 and the first paragraph say what the template is and who
 * it is for (lib/themes/theme-seo.ts), then the facts an answer engine
 * quotes (price, what it works with, the pages in it, who made it), the
 * gallery, what is included, who it is for, the questions, related
 * templates and the categories. All of it is drawn here on the server; only
 * Use this template and the demo answer a click (./theme-detail.tsx).
 *
 * Held at the edge like the list, and dropped with it when the admin saves.
 * Storelib's own templates are built ahead of time; an uploaded one is drawn
 * on its first visit.
 */
export const revalidate = 300

export function generateStaticParams() {
  return CODE_TEMPLATES.map((t) => ({ slug: t.slug }))
}

async function find(slug: string) {
  const s = decodeURIComponent(slug).toLowerCase()
  return LISTING_SLUG_RE.test(s) ? listingBySlug(s).catch(() => builtinListings().find((l) => l.slug === s) ?? null) : null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const listing = await find((await params).slug)
  if (!listing) return { title: "Theme not found" }
  const copy = themePageCopy(listing)
  const og = themeImages(listing).og
  /* The whole set: an openGraph of only an image (or none) left og:url and og:title the home page's. */
  return pageMetadata({
    path: listingPath(listing.slug),
    title: copy.title,
    absolute: true,
    description: copy.description,
    image: og ? { url: og.src, alt: themeAlt(listing, "og", copy.h1) } : null,
  })
}

/** Where View demo goes, or null when a template has nothing to show beyond its pictures. */
function demoOf(listing: ThemeListing): string | null {
  if (hasLivePreview(listing)) return `/theme-preview/${encodeURIComponent(listing.slug)}`
  return templatePreviewPath(listing) ?? listing.demoUrl
}

export default async function ThemePage({ params }: { params: Promise<{ slug: string }> }) {
  const listing = await find((await params).slug)
  if (!listing) notFound()
  const all = await publishedListings().catch(() => builtinListings())
  const copy = themePageCopy(listing)
  const img = themeImages(listing)
  const cat = copy.primaryCategory
  const related = relatedListings(listing, all, 3)
  const otherCats = categoriesOf(listing).slice(1)

  return (
    <div className="bg-white" data-theme-detail={listing.slug}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(themeJsonLd(listing, copy)) }} />
      <MarketplaceBar />
      <div className={`${MARKET_CONTAINER} pb-24 pt-6 sm:pt-8`}>
        <Breadcrumbs trail={[{ name: "Themes", href: MARKETPLACE_PATH }, ...(cat ? [{ name: cat.name, href: themeCategoryPath(cat.slug) }] : []), { name: listing.name }]} />

        <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
          {/* ── What it is, what it costs, the button (first in the page, and beside the gallery on a computer) ── */}
          <div className="lg:col-start-2 lg:row-start-1">
            <div className="lg:sticky lg:top-[88px]">
              <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.02em] text-[#1a1a2e] sm:text-[34px]">{copy.h1}</h1>
              <p data-theme-intro="" className="mt-3 text-[15px] leading-[1.6] text-[#4b5563]">{copy.intro}</p>
              {listing.description && copy.intro !== listing.description ? <p data-theme-description="" className="mt-3 text-[15px] leading-[1.6] text-[#4b5563]">{listing.description}</p> : null}
              <p data-theme-price="" className="mt-5 text-[22px] font-semibold tabular-nums text-[#1a1a2e]">
                {tierLabel(listing)}
                {listing.tier === "pro" ? <span className="ml-2 text-[14px] font-normal text-[#6b7280]">with the Grow and Pro plans</span> : null}
              </p>
              <div className="mt-4">
                <ThemeActions slug={listing.slug} name={listing.name} tier={listing.tier} demo={demoOf(listing)} />
              </div>
              <dl data-theme-facts="" className="mt-6 divide-y divide-[#eceef1] border-y border-[#eceef1] text-[14px]">
                {copy.facts.map((f) => (
                  <div key={f.label} className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 py-3">
                    <dt className="text-[#6b7280]">{f.label}</dt>
                    <dd className="text-[#1a1a2e]">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          {/* ── The gallery: the home page on a computer and on a phone ── */}
          <section aria-label="Gallery" className="min-w-0 lg:col-start-1 lg:row-start-1" data-theme-gallery="">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.3fr)] items-end gap-3 sm:gap-5">
              {img.hero ? (
                <figure className="min-w-0">
                  <div className="overflow-hidden rounded-xl bg-[#eef0f3] shadow-[0_0_0_1px_rgba(17,24,39,0.08),0_18px_40px_-24px_rgba(15,23,42,0.35)]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- cut to size and WebP already (scripts/build-theme-seo-images.mjs) */}
                    <img src={img.hero.src} width={img.hero.width} height={img.hero.height} alt={themeAlt(listing, "hero", copy.h1)} fetchPriority="high" decoding="async" className="block aspect-[8/5] h-auto w-full object-cover object-top" />
                  </div>
                </figure>
              ) : null}
              {img.phone ? (
                <figure className="min-w-0">
                  <div className="overflow-hidden rounded-[14px] bg-[#eef0f3] shadow-[0_0_0_1px_rgba(17,24,39,0.1),0_16px_32px_-18px_rgba(15,23,42,0.4)] sm:rounded-[20px]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- cut to size and WebP already */}
                    <img src={img.phone.src} width={img.phone.width} height={img.phone.height} alt={themeAlt(listing, "phone", copy.h1)} loading="lazy" decoding="async" className="block aspect-[390/844] h-auto w-full object-cover object-top" />
                  </div>
                </figure>
              ) : null}
            </div>
            {img.fullDesktop || img.fullPhone ? (
              <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
                {img.fullDesktop ? (
                  <a href={img.fullDesktop} target="_blank" rel="noopener" className="font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/25 underline-offset-4 hover:decoration-[#1a1a2e]">
                    Whole home page on a computer
                  </a>
                ) : null}
                {img.fullPhone ? (
                  <a href={img.fullPhone} target="_blank" rel="noopener" className="font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/25 underline-offset-4 hover:decoration-[#1a1a2e]">
                    On a phone
                  </a>
                ) : null}
              </p>
            ) : null}

            {/* ── What is in it ───────────────────────────────── */}
            <div className="mt-14 grid grid-cols-1 gap-10 md:grid-cols-2">
              <section aria-labelledby="theme-included" data-theme-included="">
                <h2 id="theme-included" className="text-[20px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[22px]">What is included</h2>
                {copy.features.length ? (
                  <ul className="mt-3 space-y-1.5 text-[15px] leading-[1.55] text-[#374151]">
                    {copy.features.map((f) => (
                      <li key={f} className="flex gap-2.5"><span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#9ca3af]" />{featureLabel(f)}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-3 text-[15px] leading-[1.55] text-[#374151]">
                  <span className="font-semibold text-[#1a1a2e]">Pages: </span>
                  {copy.pages.join(", ")}.
                </p>
              </section>
              {copy.bestFor.length ? (
                <section aria-labelledby="theme-for" data-theme-for="">
                  <h2 id="theme-for" className="text-[20px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[22px]">Who it is for</h2>
                  <ul className="mt-3 space-y-1.5 text-[15px] leading-[1.55] text-[#374151]">
                    {copy.bestFor.map((b) => (
                      <li key={b} className="flex gap-2.5"><span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#9ca3af]" />{b}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            <div className="mt-14">
              <FaqList faqs={copy.faqs} title={`Questions about ${listing.name}`} />
            </div>
          </section>
        </div>

        {/* ── Related templates, and the way back to each category ── */}
        {related.length ? (
          <section aria-labelledby="theme-related" className="mt-20 border-t border-[#eceef1] pt-12" data-theme-related="">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2 id="theme-related" className="text-[20px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[22px]">Related templates</h2>
              {cat ? (
                <Link href={themeCategoryPath(cat.slug)} className="text-[14px] font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/25 underline-offset-4 hover:decoration-[#1a1a2e]">
                  All {cat.h1.toLowerCase()}
                </Link>
              ) : null}
            </div>
            <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-9 min-[520px]:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => (
                <MarketplaceCard key={r.slug} card={marketplaceCard(r)} />
              ))}
            </div>
            {otherCats.length ? (
              <p className="mt-8 text-[14px] text-[#6b7280]">
                Also in{" "}
                {otherCats.map((c, i) => (
                  <span key={c.slug}>
                    {i > 0 ? (i === otherCats.length - 1 ? " and " : ", ") : null}
                    <Link href={themeCategoryPath(c.slug)} className="font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/25 underline-offset-4 hover:decoration-[#1a1a2e]">{c.h1.toLowerCase()}</Link>
                  </span>
                ))}
                .
              </p>
            ) : null}
          </section>
        ) : null}
        <div className="mt-16">
          <CategoryLinks categories={THEME_SEO_CATEGORIES.map(marketplaceCategoryCopy)} current={cat?.slug ?? null} />
        </div>
      </div>
    </div>
  )
}
