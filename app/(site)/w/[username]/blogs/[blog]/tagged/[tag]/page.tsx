import type { Metadata } from "next"
import { BlogListPage, blogListMetadata } from "../../../blog-route"

/** One tag's posts, /blogs/<handle>/tagged/<tag>: followed, never indexed. Drawn by blogs/blog-route.tsx. */
/** Held a minute like every published page; a publish expires the blog and the site's pages (lib/site-blog/cache.ts). */
export const revalidate = 3600

/** Every blog may be drawn on demand and then kept (see ../../../../page.tsx). */
export function generateStaticParams() {
  return []
}

interface PageProps {
  params: Promise<{ username: string; blog: string; tag: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const p = await params
  const meta = await blogListMetadata(p.username, { handle: p.blog, tag: p.tag })
  /* A tag's list is the blog's posts again, sorted by a word: its links are followed, and it is never a search result of its own. */
  const follow = !(meta.robots && typeof meta.robots === "object" && "follow" in meta.robots && meta.robots.follow === false)
  return { ...meta, robots: { index: false, follow } }
}

export default async function SiteBlogListPage({ params }: PageProps) {
  const p = await params
  return BlogListPage({ segment: p.username, ask: { handle: p.blog, tag: p.tag } })
}
