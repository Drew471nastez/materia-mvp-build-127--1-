import type React from "react"
import { ProductPageFrame } from "@/components/platform/product-page-frame"

interface ProductLayoutProps {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export default async function ProductLayout({ children, params }: ProductLayoutProps) {
  const { slug } = await params
  /* Called, not drawn as a tag: an async server component. */
  return ProductPageFrame({ slug, children })
}
