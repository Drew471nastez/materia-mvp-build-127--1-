import type { Metadata } from "next"
import Link from "next/link"

import { createAdminClient } from "@/lib/supabase/admin"
import { CATEGORIES, categoryPath, normalizeCategoryToId } from "@/lib/marketplace/categories"
import { ProductCard } from "@/components/explore/product-card"
import { getServerT } from "@/lib/i18n/server"

/**
 * ===========================================================================
 *  /explore — BROWSE THE DIGITAL PRODUCTS PEOPLE HAVE PUBLISHED
 * ===========================================================================
 *
 * This route spent the marketplace era as a redirect to "/", because "/" WAS
 * the feed and two URLs for one page is a canonical problem. "/" is the
 * landing page again, so a redirect here would now send somebody who asked to
 * browse to a marketing page instead. It is a real page again.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS DELIBERATELY MODEST
 * ---------------------------------------------------------------------------
 * What was here before -- an infinite feed, a filter sheet, facet counts, a
 * reels pager, department rails -- was fourteen thousand lines built to sort
 * second-hand clothing by size and condition. None of those questions has an
 * answer for a font or a course, so it came out rather than being retuned.
 *
 * What replaces it is the part that was always true: a grid of what is for
 * sale, and the six categories as a way in. It reads `products` directly, the
 * same table the storefronts and product pages read, and it filters on
 * `status = published` so an unfinished draft is never on a public shelf.
 *
 * The category pages at /explore/<id> are listed in the sitemap and are the
 * next thing to build; until they exist this page is what those links resolve
 * through, so the taxonomy is rendered here rather than being invisible.
 */

export const dynamic = "force-dynamic"

const TITLE = "Explore Digital Products | Storelib"
const DESCRIPTION =
  "Browse digital products from independent creators: templates, courses, e-books, music, fonts, software and more."

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "https://storelib.com/explore" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: "/explore", siteName: "Storelib" },
  robots: { index: true, follow: true },
}

type ExploreProduct = Parameters<typeof ProductCard>[0]["product"]

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { t } = await getServerT()
  const params = await searchParams
  const raw = typeof params.category === "string" ? params.category : ""
  const active = raw ? normalizeCategoryToId(raw) : "all"

  let products: ExploreProduct[] = []
  try {
    const admin = createAdminClient()
    let query = admin
      .from("products")
      .select(
        "id, title, slug, description, price_cents, thumbnail_url, gallery_urls, image_variants, type, category, saves_count, reviews_count, reviews_average",
      )
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(60)

    // Filtering happens in JS rather than SQL because `products.category` is
    // free text holding three generations of value -- normalizeCategoryToId is
    // what reconciles them, and it cannot run inside a PostgREST filter.
    const { data } = await query
    products = (data ?? []) as ExploreProduct[]
    if (active !== "all") {
      products = products.filter((p) => normalizeCategoryToId(p.category ?? null) === active)
    }
  } catch {
    // A browse page that cannot reach the database renders its categories and
    // an empty shelf. Throwing would take the whole route down over a shelf.
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: TITLE,
            description: DESCRIPTION,
            url: "https://storelib.com/explore",
          }),
        }}
      />

      <h1 className="text-2xl font-bold tracking-tight text-neutral-900 md:text-3xl">
        Explore digital products
      </h1>
      <p className="mt-1.5 max-w-2xl text-sm text-neutral-500">{DESCRIPTION}</p>

      {/* The six categories, plus All. Links rather than client state so each
          one is a URL a crawler can follow and a person can share. */}
      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Categories">
        {CATEGORIES.map((c) => {
          const on = c.id === active
          return (
            <Link
              key={c.id}
              href={c.id === "all" ? "/explore" : `/explore?category=${c.id}`}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                on
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {t(`category.${c.id}`)}
            </Link>
          )
        })}
      </nav>

      {products.length === 0 ? (
        <div className="mt-16 rounded-2xl border border-neutral-200 bg-neutral-50 p-12 text-center">
          <p className="text-sm font-medium text-neutral-700">Nothing published here yet</p>
          <p className="mt-1 text-sm text-neutral-500">
            {active === "all"
              ? "Products appear here as creators publish them."
              : "Try another category, or check back soon."}
          </p>
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

      {/* Subcategory links for the active category, so /explore/<id>?sub=<id>
          in the sitemap has something pointing at it from inside the app. */}
      {active !== "all" && (
        <div className="mt-10 border-t border-neutral-100 pt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">In this category</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(CATEGORIES.find((c) => c.id === active)?.subcategories ?? []).map((s) => (
              <Link
                key={s.id}
                href={categoryPath(active, s.id)}
                className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[13px] text-neutral-600 hover:bg-neutral-50"
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
