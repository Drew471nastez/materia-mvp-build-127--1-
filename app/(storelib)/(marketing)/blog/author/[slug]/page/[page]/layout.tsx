import type React from "react"
import { notFound, permanentRedirect } from "next/navigation"
import { blogPageParam } from "@/lib/blog/listing"
import { blogAuthorPage } from "../../../../_blog-author"

/* Page 1 is the author's own address (a 308); a page past the last, or not a page number, a 404. Both before the stream. */
export default async function BlogAuthorOlderLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string; page: string }> }) {
  const { slug, page } = await params
  const n = blogPageParam(page)
  if (n === 1) permanentRedirect(`/blog/author/${slug}`)
  if (!n || !(await blogAuthorPage(slug, n))) notFound()
  return children
}
