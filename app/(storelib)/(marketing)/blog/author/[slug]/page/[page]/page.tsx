import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import { blogPageParam } from "@/lib/blog/listing"
import { BlogAuthorView, blogAuthorMetadata, blogAuthorPage } from "../../../../_blog-author"

/* An author's older posts: its own canonical, linked from the page before it with a real <a href>. */
export const revalidate = 60

export function generateStaticParams() {
  return [] as { slug: string; page: string }[]
}

type Props = { params: Promise<{ slug: string; page: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, page } = await params
  const n = blogPageParam(page)
  return n && n > 1 ? blogAuthorMetadata(slug, n) : { title: "Not found", robots: { index: false, follow: true } }
}

export default async function BlogAuthorOlderPage({ params }: Props) {
  const { slug, page } = await params
  const n = blogPageParam(page)
  if (n === 1) permanentRedirect(`/blog/author/${slug}`)
  const found = n ? await blogAuthorPage(slug, n) : null
  if (!found) notFound()
  return <BlogAuthorView {...found} />
}
