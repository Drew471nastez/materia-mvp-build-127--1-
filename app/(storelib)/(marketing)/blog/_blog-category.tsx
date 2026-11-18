import type { Metadata } from "next"
import { BlogLists } from "./_components/blog-lists"
import { blogCategoryTitle } from "./_components/blog-titles"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { pageMetadata } from "@/lib/seo/page-metadata"
import { BLOG_FEED_ALTERNATE, BLOG_ORIGIN, blogPage } from "@/lib/blog/listing"
import { blogCategoryPath, type BlogCategory } from "@/lib/blog/article"
import { readBlogCategories } from "@/lib/blog/categories"
import { breadcrumbListJsonLd } from "@/lib/blog/structured-data"
import { readBlogPosts } from "@/lib/blog/read"

/*
  ONE CATEGORY OF THE BLOG: /blog/category/<slug>, and its older posts at
  /blog/category/<slug>/page/<n>, BLOG_PAGE_SIZE to a page like the index.
  Each page names itself canonical and is indexable; a category with no
  posts yet is a page with nothing on it, so it is noindex (and left out of
  the sitemap, lib/seo/sitemaps.ts) until its first post. It used to live
  at /blog/explore/categories/<slug>, which is now a 308 to here
  (./explore/categories/[category]/route.ts). The category's name and
  description come from blog_categories (lib/blog/categories), the code's
  eight while that table is missing; a renamed category keeps its slug.
*/

export function categoryDescription(category: BlogCategory): string {
  return category.description || `Storelib articles about ${category.name}.`
}

/** The category and page N of its posts, or null when either does not exist. */
export async function blogCategoryPage(slug: string, page: number) {
  const categories = await readBlogCategories()
  const category = categories.find((c) => c.slug === slug)
  if (!category) return null
  const posts = await readBlogPosts(category.name)
  /* An empty category still has its first page (noindex); there is no page 2 of nothing. */
  if (!posts.length) return page === 1 ? { category, categories, posts, page: 1, pages: 1 } : null
  const cut = blogPage(posts, page)
  return cut ? { category, categories, ...cut } : null
}

export async function blogCategoryMetadata(slug: string, page: number): Promise<Metadata> {
  const found = await blogCategoryPage(slug, page)
  if (!found) return { title: "Not found", robots: { index: false, follow: true } }
  const { category, posts, categories } = found
  return pageMetadata({
    path: blogCategoryPath(category.name, page, categories),
    title: blogCategoryTitle(category.name, page),
    absolute: true,
    description: categoryDescription(category),
    robots: posts.length > 0 ? { index: true, follow: true, googleBot: { index: true, follow: true } } : { index: false, follow: true },
    types: BLOG_FEED_ALTERNATE,
  })
}

export async function BlogCategoryView({ category, categories, page }: { category: BlogCategory; categories: BlogCategory[]; posts: Awaited<ReturnType<typeof readBlogPosts>>; page: number; pages: number }) {
  /* Every post, so a pill redraws the list in the browser (./_components/blog-lists.tsx); the layout's own read, cached for the request. */
  const all = await readBlogPosts()
  const path = (n: number) => blogCategoryPath(category.name, n, categories)
  const crumbs = [{ name: "Blog", path: "/blog" }, { name: category.name, path: path(1) }, ...(page > 1 ? [{ name: `Page ${page}`, path: path(page) }] : [])]
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `${category.name} | Storelib Blog`,
            description: categoryDescription(category),
            url: `${BLOG_ORIGIN}${path(page)}`,
            isPartOf: { "@type": "Blog", name: "Storelib Blog", url: `${BLOG_ORIGIN}/blog` },
          }),
        }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbListJsonLd(crumbs)) }} />
      {/* The blog's title, its line and the pills are the blog's layout (./layout.tsx). This category's posts, drawn from all of them by its address. */}
      <BlogLists posts={all} categories={categories.map(({ slug, name }) => ({ slug, name }))} />
    </>
  )
}
