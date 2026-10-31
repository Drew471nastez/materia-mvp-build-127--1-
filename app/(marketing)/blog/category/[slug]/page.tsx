import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { STORELIB_CATEGORIES, categoryToSlug } from "@/lib/blog-categories"
import { BlogCategoryView, blogCategoryMetadata, blogCategoryPage } from "../../_blog-category"

/*
  HELD AT THE EDGE FOR A MINUTE, NOT RENDERED FOR EVERY READER (the owner:
  marketing pages served from the CDN). Nothing here depends on who is
  reading: the posts come from the admin client, which reads no cookie.
  Rebuilt in the background at most once a minute, the same minute
  next.config's `/blog/:path*` rule already gives the CDN.
*/
export const revalidate = 60

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return blogCategoryMetadata((await params).slug, 1)
}

export function generateStaticParams() {
  return STORELIB_CATEGORIES.map((c) => ({ slug: categoryToSlug(c) }))
}

export default async function BlogCategoryPage({ params }: Props) {
  const found = await blogCategoryPage((await params).slug, 1)
  if (!found) notFound()
  return <BlogCategoryView {...found} />
}
