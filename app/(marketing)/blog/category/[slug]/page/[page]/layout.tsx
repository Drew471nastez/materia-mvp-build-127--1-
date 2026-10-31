import type React from "react"
import { notFound, permanentRedirect } from "next/navigation"
import { blogPageParam } from "@/lib/blog/listing"
import { blogCategoryPage } from "../../../../_blog-category"

/* Page 1 is the category's own address (a 308); a page past the last, or not a page number, a 404. Both before the stream. */
export default async function BlogCategoryOlderLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string; page: string }> }) {
  const { slug, page } = await params
  const n = blogPageParam(page)
  if (n === 1) permanentRedirect(`/blog/category/${slug}`)
  if (!n || !(await blogCategoryPage(slug, n))) notFound()
  return children
}
