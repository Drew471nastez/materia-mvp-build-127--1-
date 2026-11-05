import type React from "react"
import { notFound } from "next/navigation"
import { CATEGORY_PAGES } from "@/lib/explore/category-pages"

/*
  A CATEGORY THAT IS NOT ONE IS A 404, DECIDED BEFORE ANYTHING STREAMS
  (round 45). The page's own notFound() came after ./loading.tsx had sent a
  200, so storelib.com/explore/nope answered 200 with a not found page in
  it: a soft 404, measured live. A layout runs before the loading boundary,
  as /blog/page/N's does.
*/
export default async function ExploreCategoryLayout({ children, params }: { children: React.ReactNode; params: Promise<{ category: string }> }) {
  if (!(CATEGORY_PAGES as readonly string[]).includes((await params).category)) notFound()
  return children
}
