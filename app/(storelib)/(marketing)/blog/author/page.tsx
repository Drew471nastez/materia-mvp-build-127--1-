import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { BlogAuthorsIndexView, blogAuthorsIndex, blogAuthorsIndexMetadata } from "../_blog-author"

/* The blog's authors with a live post (../_blog-author). A 404 before SQL part 345 runs; held at the edge for a minute like the rest of the blog. */
/* An hour (round 54, Vercel cost): saving, publishing and a post going live clear these at once (lib/blog/admin-http.ts, went-live.ts; the platform switch clears /help). */
export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  return blogAuthorsIndexMetadata(await blogAuthorsIndex())
}

export default async function BlogAuthorsPage() {
  const authors = await blogAuthorsIndex()
  if (!authors) notFound()
  return <BlogAuthorsIndexView authors={authors} />
}
