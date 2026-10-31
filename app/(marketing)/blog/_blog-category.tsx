import type { Metadata } from "next"
import BlogListing from "./_blog-listing"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { pageMetadata } from "@/lib/seo/page-metadata"
import { CATEGORY_SUBTITLES, slugToCategory } from "@/lib/blog-categories"
import { BLOG_FEED_ALTERNATE, BLOG_ORIGIN, blogPage } from "@/lib/blog/listing"
import { blogCategoryPath } from "@/lib/blog/article"
import { breadcrumbListJsonLd } from "@/lib/blog/structured-data"
import { readBlogPosts } from "@/lib/blog/read"

/*
  ONE CATEGORY OF THE BLOG: /blog/category/<slug>, and its older posts at
  /blog/category/<slug>/page/<n>, BLOG_PAGE_SIZE to a page like the index.
  Each page names itself canonical and is indexable; a category with no
  posts yet is a page with nothing on it, so it is noindex (and left out of
  the sitemap, lib/seo/sitemaps.ts) until its first post. It used to live
  at /blog/explore/categories/<slug>, which is now a 308 to here
  (./explore/categories/[category]/route.ts).
*/

export function categoryDescription(category: string): string {
  return CATEGORY_SUBTITLES[category] || `Storelib articles about ${category}.`
}

/** The category and page N of its posts, or null when either does not exist. */
export async function blogCategoryPage(slug: string, page: number) {
  const category = slugToCategory(slug)
  if (!category) return null
  const posts = await readBlogPosts(category)
  /* An empty category still has its first page (noindex); there is no page 2 of nothing. */
  if (!posts.length) return page === 1 ? { category, posts, page: 1, pages: 1 } : null
  const cut = blogPage(posts, page)
  return cut ? { category, ...cut } : null
}

export async function blogCategoryMetadata(slug: string, page: number): Promise<Metadata> {
  const found = await blogCategoryPage(slug, page)
  if (!found) return { title: "Not found", robots: { index: false, follow: true } }
  const { category, posts } = found
  return pageMetadata({
    path: blogCategoryPath(category, page),
    title: page > 1 ? `${category}, page ${page} | Storelib Blog` : `${category} | Storelib Blog`,
    absolute: true,
    description: categoryDescription(category),
    robots: posts.length > 0 ? { index: true, follow: true, googleBot: { index: true, follow: true } } : { index: false, follow: true },
    types: BLOG_FEED_ALTERNATE,
  })
}

export function BlogCategoryView({ category, posts, page, pages }: { category: string; posts: Awaited<ReturnType<typeof readBlogPosts>>; page: number; pages: number }) {
  const crumbs = [
    { name: "Blog", path: "/blog" },
    { name: category, path: blogCategoryPath(category) },
    ...(page > 1 ? [{ name: `Page ${page}`, path: blogCategoryPath(category, page) }] : []),
  ]
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `${category} | Storelib Blog`,
            description: categoryDescription(category),
            url: `${BLOG_ORIGIN}${blogCategoryPath(category, page)}`,
            isPartOf: { "@type": "Blog", name: "Storelib Blog", url: `${BLOG_ORIGIN}/blog` },
          }),
        }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbListJsonLd(crumbs)) }} />
      <BlogListing posts={posts} activeCategory={category} title={category} subtitle={categoryDescription(category)} pagination={{ page, pages }} pagePath={(n) => blogCategoryPath(category, n)} />
    </>
  )
}
