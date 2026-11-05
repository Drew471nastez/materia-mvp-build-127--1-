import type { Metadata } from "next"
import { BlogPostPage, blogPostMetadata } from "../../blog-route"

/**
 * One post, /blogs/<handle>/<slug>, drawn with the Blog post template
 * (../../blog-route.tsx). A slug the post had before it was renamed, or the
 * blog's old handle, answers 308 to its address now. The blog's own words
 * (page, tagged, category, ~preview) are folders beside this one, and no
 * post may take one as its slug (lib/site-blog/slug.ts RESERVED_POST_SLUGS).
 */
/** Held a minute like every published page; a publish expires the blog and the site's pages (lib/site-blog/cache.ts). */
export const revalidate = 3600

/** Every blog may be drawn on demand and then kept (see ../../../page.tsx). */
export function generateStaticParams() {
  return []
}

interface PageProps {
  params: Promise<{ username: string; blog: string; article: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const p = await params
  return blogPostMetadata(p.username, p.blog, p.article)
}

export default async function SiteBlogPostPage({ params }: PageProps) {
  const p = await params
  return BlogPostPage({ segment: p.username, rawHandle: p.blog, rawSlug: p.article })
}
