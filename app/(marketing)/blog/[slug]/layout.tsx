import type React from "react"
import { notFound } from "next/navigation"
import { blogPostExists } from "@/lib/blog/post"

/*
  A post that does not exist is a 404, decided before anything is drawn.
  Measured on the built site (round 44): with the blog's loading.tsx
  skeletons in place, a notFound() came after the 200 had been sent, so a
  missing post was a "Post not found" page answering 200, which search
  engines read as a soft 404. The skeletons are gone (the blog is served
  from the cache, so they were seldom seen), and nothing under /blog may
  bring one back. The read is the page's own, deduped for the request.
*/
export default async function BlogPostLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!(await blogPostExists(slug))) notFound()
  return children
}
