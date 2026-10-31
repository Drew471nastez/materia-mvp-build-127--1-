import type React from "react"
import { notFound } from "next/navigation"
import { slugToCategory } from "@/lib/blog-categories"

/* A category that does not exist is a 404, decided before anything streams (see ../../[slug]/layout.tsx). */
export default async function BlogCategoryLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  if (!slugToCategory((await params).slug)) notFound()
  return children
}
