import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { BlogAuthorView, blogAuthorMetadata, blogAuthorPage } from "../../_blog-author"

/*
  One author's page (../../_blog-author). Nothing here depends on who is
  reading, so it is held at the edge and rebuilt at most once a minute, as
  the category pages are. Drawn on first request: no list of authors is
  read at build time.
*/
/* An hour (round 54, Vercel cost): saving, publishing and a post going live clear these at once (lib/blog/admin-http.ts, went-live.ts; the platform switch clears /help). */
export const revalidate = 3600

export function generateStaticParams() {
  return [] as { slug: string }[]
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return blogAuthorMetadata((await params).slug, 1)
}

export default async function BlogAuthorPage({ params }: Props) {
  const found = await blogAuthorPage((await params).slug, 1)
  if (!found) notFound()
  return <BlogAuthorView {...found} />
}
