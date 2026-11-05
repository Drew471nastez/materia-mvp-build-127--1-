import type React from "react"
import { readBlogCategories } from "@/lib/blog/categories"
import { readBlogPosts } from "@/lib/blog/read"
import { categoryDescription } from "./_blog-category"
import { BlogNav } from "./_components/blog-nav"

/*
  THE BLOG'S OWN LAYOUT (round 47): the title and the category pills of its
  lists, kept mounted while a reader moves between /blog and its categories,
  so only the list changes (./_components/blog-nav.tsx). On an article or an
  author page BlogNav draws nothing of its own.

  Nothing here asks who is reading, so every page under it stays held at the
  edge. Both reads are the pages' own (cache()), one query each per render.
  No loading.tsx goes with it: the post, category and page layouts below
  still decide their 404s and 308s before anything is sent.
*/
const BLOG_LINE = "Guides for creators who sell online: products, courses, communities, websites and what is new in Storelib."

export default async function BlogLayout({ children }: { children: React.ReactNode }) {
  const [categories, posts] = await Promise.all([readBlogCategories(), readBlogPosts()])
  const live = new Set(posts.map((p) => p.category))
  const nav = categories.map((c) => ({ slug: c.slug, name: c.name, description: categoryDescription(c), hasPosts: live.has(c.name) }))
  return (
    <BlogNav categories={nav} description={BLOG_LINE}>
      {children}
    </BlogNav>
  )
}
