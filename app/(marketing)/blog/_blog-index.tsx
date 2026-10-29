import type { Metadata } from "next"
import BlogListing from "./_blog-listing"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { pageMetadata, breadcrumbJsonLd } from "@/lib/seo/page-metadata"
import { BLOG_FEED_ALTERNATE, BLOG_URL, blogPage, blogPagePath, type BlogPost } from "@/lib/blog/listing"
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
    title: first ? "Storelib Blog: guides for selling digital products" : `Storelib Blog, page ${page}`,
    absolute: true,
    description: first ? DESCRIPTION : `Older posts from the Storelib Blog, page ${page}. ${DESCRIPTION}`,
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
    types: BLOG_FEED_ALTERNATE,
  })
}

export function BlogIndex({ posts, page, pages }: { posts: BlogPost[]; page: number; pages: number }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "Storelib Blog",
            description: "Practical advice for digital product creators.",
            url: BLOG_URL,
            publisher: { "@type": "Organization", name: "Storelib", url: "https://storelib.com" },
          }),
        }}
      />
      {page > 1 ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd([{ name: "Blog", path: "/blog" }, { name: `Page ${page}`, path: blogPagePath(page) }])) }} />
      ) : null}
      <BlogListing
        posts={posts}
        activeCategory={null}
        title="Blog"
        subtitle="The latest from Storelib: tips, platform news, and strategies to grow your business."
        pagination={{ page, pages }}
      />
    </>
  )
}

/** Page `page`, or null when the blog has no such page. */
export async function blogIndexPage(page: number) {
  return blogPage(await readBlogPosts(), page)
}
