import type { Metadata } from "next"
import { BlogListPage, blogListMetadata } from "../blog-route"

/** The blog: its newest posts, /blogs/<handle>. Drawn by blogs/blog-route.tsx. */
/** Held a minute like every published page; a publish expires the blog and the site's pages (lib/site-blog/cache.ts). */
export const revalidate = 3600

/** Every blog may be drawn on demand and then kept (see ../../page.tsx). */
export function generateStaticParams() {
  return []
}

interface PageProps {
  params: Promise<{ username: string; blog: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const p = await params
  return blogListMetadata(p.username, { handle: p.blog })
}

export default async function SiteBlogListPage({ params }: PageProps) {
  const p = await params
  return BlogListPage({ segment: p.username, ask: { handle: p.blog } })
}
