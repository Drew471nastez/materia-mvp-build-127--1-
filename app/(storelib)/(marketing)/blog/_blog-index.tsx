import type { Metadata } from "next"
import { BlogLists } from "./_components/blog-lists"
import { blogIndexTitle } from "./_components/blog-titles"
import { readBlogCategories } from "@/lib/blog/categories"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { pageMetadata } from "@/lib/seo/page-metadata"
import { BLOG_FEED_ALTERNATE, BLOG_ORIGIN, blogPage, blogPagePath, type BlogPost } from "@/lib/blog/listing"
import { blogJsonLd, breadcrumbListJsonLd } from "@/lib/blog/structured-data"
import { readBlogPosts } from "@/lib/blog/read"

/*
  ONE PAGE OF THE BLOG'S INDEX, for /blog (page 1) and /blog/page/<n>. Every
  published post is read (the blog is written by hand in /admin, hundreds at
  most), merged with the four written in code and cut into pages
  (lib/blog/listing), so each post is a real link on exactly one page.
*/

const DESCRIPTION = "Practical advice for digital product creators. Learn how to start selling, grow your audience, price your products, and build a sustainable creator business."

export function blogIndexMetadata(page: number): Metadata {
  const first = page <= 1
  return pageMetadata({
    path: blogPagePath(page),
    title: blogIndexTitle(page),
    absolute: true,
    description: first ? DESCRIPTION : `Older posts from the Storelib Blog, page ${page}. ${DESCRIPTION}`,
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
    types: BLOG_FEED_ALTERNATE,
  })
}

export async function BlogIndex({ posts, page }: { posts: BlogPost[]; page: number; pages: number }) {
  /* Every post and category, so a pill redraws the list in the browser (./_components/blog-lists.tsx). Both reads are the layout's own, cached for the request. */
  const [all, categories] = await Promise.all([readBlogPosts(), readBlogCategories()])
  const crumbs = [{ name: "Blog", path: "/blog" }, ...(page > 1 ? [{ name: `Page ${page}`, path: blogPagePath(page) }] : [])]
  return (
    <>
      {/* The Blog with this page's posts as its blogPost items, and where the page sits. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(blogJsonLd(posts, { url: `${BLOG_ORIGIN}${blogPagePath(page)}`, description: DESCRIPTION })) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbListJsonLd(crumbs)) }} />
      {/* The title, its line and the category pills are the blog's layout (./layout.tsx), the same on every list. This page's posts, drawn from all of them by its address. */}
      <BlogLists posts={all} categories={categories.map(({ slug, name }) => ({ slug, name }))} />
    </>
  )
}

/** Page `page`, or null when the blog has no such page. */
export async function blogIndexPage(page: number) {
  return blogPage(await readBlogPosts(), page)
}
