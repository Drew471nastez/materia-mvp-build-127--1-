import type React from "react"
import { notFound } from "next/navigation"
import { readBlogAuthorBySlug } from "@/lib/blog/post"

/* An unknown author, or no blog_authors table yet (SQL part 345), is a 404, decided before anything streams (see ../../[slug]/layout.tsx). */
export default async function BlogAuthorLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  if (!(await readBlogAuthorBySlug((await params).slug))) notFound()
  return children
}
