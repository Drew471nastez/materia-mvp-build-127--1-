import type { Metadata } from "next"
import { unstable_noStore } from "next/cache"
import { BlogPreviewPage, blogPreviewMetadata } from "../../../blog-route"

/**
 * A post's draft by its signed preview link, /blogs/<handle>/~preview/<token>
 * (lib/site-blog/preview-token.ts, signed by the Blog manager's Preview).
 * One person looking at unpublished words: drawn per request, never held,
 * sent no-store, and kept out of search (robots noindex here, and
 * the blogs' preview rule in the site's robots.txt, lib/seo/indexing.ts SITE_DISALLOW).
 */
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

interface PageProps {
  params: Promise<{ username: string; blog: string; token: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  unstable_noStore()
  const p = await params
  const meta = await blogPreviewMetadata(p.username, p.token)
  return { ...meta, robots: { index: false, follow: false } }
}

export default async function SiteBlogPreviewPage({ params }: PageProps) {
  unstable_noStore()
  const p = await params
  return BlogPreviewPage({ segment: p.username, rawToken: p.token })
}
