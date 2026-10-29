import type { Metadata } from "next"
import { notFound } from "next/navigation"
import {
  STORELIB_CATEGORIES,
  CATEGORY_SUBTITLES,
  categoryToSlug,
  slugToCategory,
} from "@/lib/blog-categories"
import BlogListing from "../../../_blog-listing"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { pageMetadata } from "@/lib/seo/page-metadata"
import { BLOG_FEED_ALTERNATE } from "@/lib/blog/listing"
import { readBlogPosts } from "@/lib/blog/read"

/*
  HELD AT THE EDGE FOR A MINUTE, NOT RENDERED FOR EVERY READER (the owner:
  marketing pages served from the CDN). Nothing here depends on who is
  reading: the posts come from the admin client, which reads no cookie. It
  was force-dynamic, so every visit ran a function and the same database
  reads for the same page. Rebuilt in the background at most once a minute,
  the same minute next.config's `/blog/:path*` rule already gives the CDN.
*/
export const revalidate = 60

/*
  THE TITLE NAMES THE CATEGORY ONCE AND THE BLOG ONCE. It was
  "Growth — Storelib Blog", which the root template turned into
  "Growth — Storelib Blog | Storelib". A category with no posts yet is a page
  with nothing on it: noindex, and left out of the sitemap
  (lib/seo/sitemaps.ts pagesSitemap), until its first post.
*/
export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>
}): Promise<Metadata> {
  const { category: slug } = await params
  const category = slugToCategory(slug)
  if (!category) return { title: "Not Found" }

  const description = CATEGORY_SUBTITLES[category] || `Browse all Storelib articles about ${category}.`
  const hasPosts = (await readBlogPosts(category)).length > 0

  return pageMetadata({
    path: `/blog/explore/categories/${slug}`,
    title: `${category} | Storelib Blog`,
    absolute: true,
    description,
    robots: hasPosts ? { index: true, follow: true, googleBot: { index: true, follow: true } } : { index: false, follow: true },
    types: BLOG_FEED_ALTERNATE,
  })
}

export async function generateStaticParams() {
  return STORELIB_CATEGORIES.map(cat => ({ category: categoryToSlug(cat) }))
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category: slug } = await params
  const category = slugToCategory(slug)
  if (!category) notFound()

  /* Every published post in the category with the code-written ones, newest first (lib/blog/listing). */
  const posts = await readBlogPosts(category)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `${category} | Storelib Blog`,
            description: CATEGORY_SUBTITLES[category] || `Browse all Storelib articles about ${category}.`,
            url: `https://storelib.com/blog/explore/categories/${categoryToSlug(category)}`,
            isPartOf: { "@type": "Blog", name: "Storelib Blog", url: "https://storelib.com/blog" },
            breadcrumb: {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Blog", item: "https://storelib.com/blog" },
                { "@type": "ListItem", position: 2, name: category, item: `https://storelib.com/blog/explore/categories/${categoryToSlug(category)}` },
              ],
            },
          }),
        }}
      />
      <BlogListing
        posts={posts}
        activeCategory={category}
        title={category}
        subtitle={CATEGORY_SUBTITLES[category] || `Browse all articles about ${category}.`}
      />
    </>
  )
}
