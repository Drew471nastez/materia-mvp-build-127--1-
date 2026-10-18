import type { Metadata } from "next"
import { ShopPage, shopMetadata } from "../shop-page"

/**
 * THE SHOP WITH FILTERS, A SORT OR A PAGE NUMBER FROM THE ADDRESS, drawn per
 * request. The proxy sends `/products?sort=…` here and `/products` alone to
 * the held page (lib/website-builder/held-list.ts); the visitor's address
 * stays `/products?…`.
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string }>
  /** The filters and the sort, as the filter form sends them: lib/products/catalog-filters.ts. */
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { username } = await params
  return shopMetadata(username, await searchParams.catch(() => ({})))
}

export default async function SiteShopListPage({ params, searchParams }: PageProps) {
  const { username } = await params
  return ShopPage({ segment: username, asked: await searchParams.catch(() => ({})) })
}
