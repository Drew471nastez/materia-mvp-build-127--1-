import type React from "react"
import { notFound } from "next/navigation"
import { blogPostExists } from "@/lib/blog/post"

/*
  A post that does not exist is a 404 here, before anything is streamed.
  The page sits inside loading.tsx's boundary, so a notFound() there came
  after the 200 had been sent: a missing post was a "Post not found" page
  that answered 200, which search engines read as a soft 404. A layout is
  outside that boundary (as app/(marketing)/community/[slug]/layout.tsx).
  The read is the page's own, deduped for the request.
*/
export default async function BlogPostLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!(await blogPostExists(slug))) notFound()
  return children
}
