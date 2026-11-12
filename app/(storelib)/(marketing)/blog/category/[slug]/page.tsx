import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { readBlogCategories } from "@/lib/blog/categories"
import { BlogCategoryView, blogCategoryMetadata, blogCategoryPage } from "../../_blog-category"

/*
  HELD AT THE EDGE FOR A MINUTE, NOT RENDERED FOR EVERY READER (the owner:
  marketing pages served from the CDN). Nothing here depends on who is
  reading: the posts come from the admin client, which reads no cookie.
  Rebuilt in the background at most once a minute, the same minute
  next.config's `/blog/:path*` rule already gives the CDN.
*/
/* An hour (round 54, Vercel cost): saving, publishing and a post going live clear these at once (lib/blog/admin-http.ts, went-live.ts; the platform switch clears /help). */
export const revalidate = 3600

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return blogCategoryMetadata((await params).slug, 1)
}

export async function generateStaticParams() {
  return (await readBlogCategories()).map((c) => ({ slug: c.slug }))
}

export default async function BlogCategoryPage({ params }: Props) {
  const found = await blogCategoryPage((await params).slug, 1)
  if (!found) notFound()
  return <BlogCategoryView {...found} />
}
