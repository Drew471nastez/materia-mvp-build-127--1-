import type { Metadata } from "next"
import { ShopPage, shopMetadata } from "./shop-page"

/**
 * THE SHOP AS A STRANGER FIRST SEES IT, HELD A MINUTE LIKE THE FRONT PAGE.
 *
 * It was drawn per request because it read the filters from the address.
 * The address with no filter, sort or page number is the same page for
 * every visitor, so it is held the way ../page.tsx is (its reasoning
 * applies: nothing here reads a cookie or a header, and a product saved
 * purges every rendered page of the site, revalidatePublishedPages). The
 * proxy sends an address that asks for a filter, a sort or a page to
 * ./~list/page.tsx, drawn per request (lib/website-builder/held-list.ts).
 */
export const revalidate = 3600

/** Every name may be drawn on demand and then kept (see ../page.tsx). */
export function generateStaticParams() {
  return []
}

interface PageProps {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  return shopMetadata(username, {})
}

export default async function SiteShopPage({ params }: PageProps) {
  const { username } = await params
  return ShopPage({ segment: username, asked: {} })
}
