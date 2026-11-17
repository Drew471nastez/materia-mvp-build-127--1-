"use client"

/**
 * THE POSTS OF A BLOG LIST, CHOSEN IN THE BROWSER (landing round 15, the
 * owner: switching categories flashed, and the title and its line changed).
 *
 * Every list page (/blog, /blog/page/N, /blog/category/<slug> and its pages)
 * hands this every live post once. It reads the address and draws that
 * list's page from them, the same cut the server makes (lib/blog/listing
 * blogPage), so the server's HTML and the first paint are the same markup.
 *
 * A pill (./blog-nav.tsx) does not load a page any more: it writes the
 * category's address with history.pushState, which Next's router follows
 * (usePathname updates), and this redraws from the posts it already has.
 * Nothing is fetched, so nothing goes blank in between; the new list fades
 * in rising 6px (globals.css .blog-list-swap, opacity and transform only).
 * Back and forward walk the same entries. Each address is still a real page
 * with its own metadata, canonical and JSON-LD when it is loaded or crawled.
 */
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import BlogListing from "../_blog-listing"
import { blogPage, blogPagePath, type BlogPost } from "@/lib/blog/listing"
import { blogListOf } from "./blog-nav"
import { blogCategoryTitle, blogIndexTitle } from "./blog-titles"

export interface BlogListsCategory {
  slug: string
  name: string
}

export function BlogLists({ posts, categories }: { posts: BlogPost[]; categories: BlogListsCategory[] }) {
  const pathname = usePathname() ?? "/blog"
  const { slug, page } = blogListOf(pathname)
  const category = slug ? categories.find((c) => c.slug === slug) : undefined
  const mine = category ? posts.filter((p) => p.category === category.name) : posts
  const cut = blogPage(mine, page) ?? { posts: [], page: 1, pages: 1 }
  const pagePath = (n: number) => (category ? (n <= 1 ? `/blog/category/${category.slug}` : `/blog/category/${category.slug}/page/${n}`) : blogPagePath(n))

  /* The list fades in only once the reader has moved, never on the first load. */
  const [first] = useState(pathname)
  const [moved, setMoved] = useState(false)
  if (!moved && pathname !== first) setMoved(true)

  /* The tab's title follows the list; the server's own metadata is untouched. */
  useEffect(() => {
    if (!moved) return
    document.title = category ? blogCategoryTitle(category.name, cut.page) : blogIndexTitle(cut.page)
  }, [moved, category, cut.page])

  return (
    <div key={pathname} className={moved ? "blog-list-swap" : undefined} data-blog-client-list="">
      <BlogListing posts={cut.posts} activeCategory={category?.name ?? null} pagination={{ page: cut.page, pages: cut.pages }} pagePath={pagePath} featured={!category && cut.page === 1} />
    </div>
  )
}
