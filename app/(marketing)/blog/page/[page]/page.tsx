import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import { blogPageParam } from "@/lib/blog/listing"
import { BlogIndex, blogIndexMetadata, blogIndexPage } from "../../_blog-index"

/*
  /blog/page/<n>: the older posts, BLOG_PAGE_SIZE to a page, each page its
  own canonical and linked from the one before it with a real <a href>.
  /blog/page/1 is /blog (a 308); a page past the last, or anything that is
  not a page number, is a real 404. Rebuilt at most once a minute, like /blog.
*/
export const revalidate = 60

/* None built ahead: each page is rendered the first time it is asked for, then held like the others. */
export function generateStaticParams() {
  return [] as { page: string }[]
}

type Props = { params: Promise<{ page: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const n = blogPageParam((await params).page)
  return n && n > 1 ? blogIndexMetadata(n) : { title: "Not found", robots: { index: false, follow: true } }
}

export default async function BlogOlderPage({ params }: Props) {
  const n = blogPageParam((await params).page)
  if (n === 1) permanentRedirect("/blog")
  const page = n ? await blogIndexPage(n) : null
  if (!page) notFound()
  return <BlogIndex posts={page.posts} page={page.page} pages={page.pages} />
}
