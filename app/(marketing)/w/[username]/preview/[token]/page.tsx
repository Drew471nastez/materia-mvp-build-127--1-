import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { previewTokenFrom } from "@/lib/website-builder/preview-link"
import { pageKeyFromSegment } from "@/lib/website-builder/site-pages"
import { renderSite, siteMetadata } from "../../render-site"

/**
 * ===========================================================================
 *  THE PREVIEW HAS AN ADDRESS OF ITS OWN
 * ===========================================================================
 * It used to be `?preview=<token>` on the site's own URL, which meant the
 * public routes had to read a query string — and a route that reads one is a
 * route rendered for each visitor, so the published site could never be
 * cached for everybody.
 *
 * The token is a path segment now. The public routes read nothing per
 * request and can be held at the edge; this one is dynamic, uncached and
 * never indexed, which is what a preview should be.
 *
 * `?preview=` still works on the public route, so links already shared keep
 * working.
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string; token: string }>
}

/** Only a token-shaped string is a token. Anything else is not a page. */
function tokenOf(raw: string): string | null {
  return previewTokenFrom(new URLSearchParams([["preview", decodeURIComponent(raw)]]))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params
  if (!tokenOf(token)) return { title: "Not Found", robots: { index: false, follow: false } }
  return siteMetadata((await params).username, undefined, "home", token)
}

export default async function PreviewRoute({ params }: PageProps) {
  const { username, token } = await params
  const clean = tokenOf(token)
  if (!clean) notFound()

  return renderSite(username, undefined, "home", clean)
}
