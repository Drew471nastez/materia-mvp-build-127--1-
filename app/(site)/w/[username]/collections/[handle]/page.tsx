import type { Metadata } from "next"
import { CollectionPage, collectionMetadata } from "./collection-page"

/**
 * THE COLLECTION AS A STRANGER FIRST SEES IT, HELD A MINUTE LIKE THE FRONT
 * PAGE. The address with no filter, sort or page number is the same page
 * for every visitor (../../page.tsx has the reasoning; a product or a
 * collection saved purges every rendered page of the site). The proxy sends
 * one that asks for a filter, a sort or a page to ./~list/page.tsx, drawn
 * per request (lib/website-builder/held-list.ts).
 */
export const revalidate = 3600

/** Every name and collection may be drawn on demand and then kept (see ../../page.tsx). */
export function generateStaticParams() {
  return []
}

interface PageProps {
  params: Promise<{ username: string; handle: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username, handle } = await params
  return collectionMetadata(username, handle, {})
}

export default async function SiteCollectionPage({ params }: PageProps) {
  const { username, handle } = await params
  return CollectionPage({ segment: username, rawHandle: handle, asked: {} })
}
