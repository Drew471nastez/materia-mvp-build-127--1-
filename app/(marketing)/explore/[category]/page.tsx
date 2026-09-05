import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  CATEGORIES,
  categoryPath,
  getCategory,
  normalizeCategoryToId,
  subcategoryLabel,
} from "@/lib/marketplace/categories"
import { ProductCard } from "@/components/explore/product-card"
import { getServerT } from "@/lib/i18n/server"

/**
 * ===========================================================================
 *  /explore/<category> — ONE PAGE PER DEPARTMENT
 * ===========================================================================
 *
 * These are the pages app/sitemap.ts advertises, one per category and one per
 * subcategory beneath it. They were 404ing: the sitemap was pointed at the new
 * taxonomy before the route that serves it existed, which is worse than not
 * listing them at all -- a crawler following the sitemap gets a 404 from the
 * domain that submitted it.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS REPLACES, AND WHY IT IS NOT A RESTORATION
 * ---------------------------------------------------------------------------
 * The marketplace had a page here with the same shape -- per-category metadata,
 * a hand-written SEO description each, CollectionPage JSON-LD, a product grid.
 * Its content was womenswear, sneakers and vintage.
 *
 * There is no digital version to restore. This repository's ROOT commit already
 * contains _legacy-landing.tsx and _explore-feed.tsx, so the pivot to a fashion
 * marketplace predates the first commit and the pre-pivot browse pages are not
 * in the history at all. The landing page is the only artefact of that era
 * anybody preserved.
 *
 * So the STRUCTURE here is the marketplace page's, which was well built and is
 * what these URLs already rank as, and the CONTENT is the digital taxonomy.
 * The descriptions below are written for what Storelib actually sells, in the
 * same voice and at the same length the old ones used, because they are what a
 * search result shows and an empty meta description wastes the page.
 */

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ category: string }>
  searchParams: Promise<{ sub?: string }>
}

/**
 * One description per category. Hand-written rather than generated from the
 * subcategory list: "Design: Design Templates, Fonts, Digital Art" is a list,
 * not a sentence, and Google shows it to a person.
 */
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  design:
    "Design assets from independent creators: templates, fonts, digital art, photography and game assets. Instant download, yours to keep.",
  templates:
    "Notion templates, spreadsheets and worksheets built by people who use them daily. Set up in minutes instead of starting from a blank page.",
  learning:
    "Online courses, video tutorials, e-books, coaching and fitness plans from creators who do the thing they are teaching.",
  audio: "Music, beat packs and podcasts from independent artists. Licensed for your projects, downloaded instantly.",
  software: "Software, plugins and link-in-bio tools built by independent developers. Buy once, download immediately.",
  memberships:
    "Memberships and merch from creators worth following. Ongoing access to the work, the community and everything behind it.",
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params
  const found = getCategory(category)
  if (!found || category === "all") return { title: "Not Found" }

  const title = `${found.label} | Storelib`
  const description = CATEGORY_DESCRIPTIONS[category] ?? `Browse ${found.label.toLowerCase()} on Storelib.`

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `https://storelib.com${categoryPath(category)}` },
    openGraph: {
      title,
      description,
      type: "website",
      url: categoryPath(category),
      siteName: "Storelib",
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  }
}

type ExploreProduct = Parameters<typeof ProductCard>[0]["product"]

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category } = await params
  const { sub } = await searchParams
  const found = getCategory(category)

  // "all" is the browse page at /explore, so /explore/all would duplicate it.
  if (!found || category === "all") notFound()

  const { t } = await getServerT()
  const activeSub = sub && found.subcategories.some((s) => s.id === sub) ? sub : null

  let products: ExploreProduct[] = []
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("products")
      .select(
        "id, title, slug, description, price_cents, thumbnail_url, gallery_urls, image_variants, type, category, saves_count, reviews_count, reviews_average",
      )
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(60)

    // Filtered in JS, not SQL: products.category is free text holding three
    // generations of value, and normalizeCategoryToId is what reconciles them.
    // It cannot run inside a PostgREST filter.
    products = ((data ?? []) as ExploreProduct[]).filter(
      (p) => normalizeCategoryToId(p.category ?? null) === category,
    )
  } catch {
    // A category page that cannot reach the database still renders its heading,
    // its description and its subcategory links. Throwing would 500 a page that
    // is mostly static.
  }

  const label = t(`category.${category}`)
  const description = CATEGORY_DESCRIPTIONS[category] ?? ""

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `${found.label} | Storelib`,
            description,
            url: `https://storelib.com${categoryPath(category)}`,
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Explore", item: "https://storelib.com/explore" },
              { "@type": "ListItem", position: 2, name: found.label },
            ],
          }),
        }}
      />

      <nav className="text-[13px] text-neutral-400" aria-label="Breadcrumb">
        <Link href="/explore" className="hover:text-neutral-600">
          Explore
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-neutral-600">{label}</span>
      </nav>

      <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 md:text-3xl">
        {activeSub ? subcategoryLabel(activeSub) : label}
      </h1>
      {description && <p className="mt-1.5 max-w-2xl text-sm text-neutral-500">{description}</p>}

      {/* Sibling categories, so a crawler arriving here can reach the rest. */}
      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Categories">
        {CATEGORIES.filter((c) => c.id !== "all").map((c) => (
          <Link
            key={c.id}
            href={categoryPath(c.id)}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              c.id === category
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {t(`category.${c.id}`)}
          </Link>
        ))}
      </nav>

      {found.subcategories.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={categoryPath(category)}
            className={`rounded-full px-3 py-1.5 text-[13px] transition-colors ${
              activeSub ? "text-neutral-500 hover:bg-neutral-50" : "bg-neutral-100 font-medium text-neutral-900"
            }`}
          >
            {t("category.all")}
          </Link>
          {found.subcategories.map((s) => (
            <Link
              key={s.id}
              href={categoryPath(category, s.id)}
              className={`rounded-full px-3 py-1.5 text-[13px] transition-colors ${
                activeSub === s.id
                  ? "bg-neutral-100 font-medium text-neutral-900"
                  : "text-neutral-500 hover:bg-neutral-50"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      )}

      {products.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-neutral-200 bg-neutral-50 p-12 text-center">
          <p className="text-sm font-medium text-neutral-700">Nothing published here yet</p>
          <p className="mt-1 text-sm text-neutral-500">Products appear here as creators publish them.</p>
          <Link
            href="/signup"
            className="mt-5 inline-flex items-center rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6d28d9]"
          >
            Start selling
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 lg:grid-cols-4">
          {products.map((product, i) => (
            <ProductCard key={product.id} product={product} origin="category" priority={i < 4} />
          ))}
        </div>
      )}
    </div>
  )
}
