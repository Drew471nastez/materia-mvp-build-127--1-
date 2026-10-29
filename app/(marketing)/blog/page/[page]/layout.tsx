import type React from "react"
import { notFound, permanentRedirect } from "next/navigation"
import { blogPageParam } from "@/lib/blog/listing"
import { blogIndexPage } from "../../_blog-index"

/*
  /blog/page/1 is /blog, and a page past the last one is a 404, both decided
  here before anything is streamed. The page sits inside the blog's
  loading.tsx boundary, so the same calls there came after a 200 had been
  sent (a soft 404, and a redirect that was a 200). The read is the page's
  own, deduped for the request.
*/
export default async function BlogOlderPageLayout({ children, params }: { children: React.ReactNode; params: Promise<{ page: string }> }) {
  const n = blogPageParam((await params).page)
  if (n === 1) permanentRedirect("/blog")
  if (!n || !(await blogIndexPage(n))) notFound()
  return children
}
