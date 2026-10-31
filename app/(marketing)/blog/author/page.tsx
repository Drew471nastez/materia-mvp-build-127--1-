import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { BlogAuthorsIndexView, blogAuthorsIndex, blogAuthorsIndexMetadata } from "../_blog-author"

/* The blog's authors with a live post (../_blog-author). A 404 before SQL part 345 runs; held at the edge for a minute like the rest of the blog. */
export const revalidate = 60

export async function generateMetadata(): Promise<Metadata> {
  return blogAuthorsIndexMetadata(await blogAuthorsIndex())
}

export default async function BlogAuthorsPage() {
  const authors = await blogAuthorsIndex()
  if (!authors) notFound()
  return <BlogAuthorsIndexView authors={authors} />
}
