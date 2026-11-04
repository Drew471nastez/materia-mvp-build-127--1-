import { notFound, permanentRedirect } from "next/navigation"
import { blogsIndexTarget } from "./blog-route"

/**
 * /blogs on its own: Shopify's addresses put a blog under /blogs/<handle>,
 * so the bare folder answers 308 to the site's blog, and 404 while the site
 * has none with a live post (./blog-route.tsx).
 */
export const revalidate = 60

export function generateStaticParams() {
  return []
}

interface PageProps {
  params: Promise<{ username: string }>
}

export default async function SiteBlogsIndex({ params }: PageProps) {
  const { username } = await params
  const to = await blogsIndexTarget(username)
  if (!to) notFound()
  permanentRedirect(to)
}
