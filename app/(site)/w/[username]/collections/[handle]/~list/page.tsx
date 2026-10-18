import type { Metadata } from "next"
import { CollectionPage, collectionMetadata } from "../collection-page"

/**
 * A COLLECTION WITH FILTERS, A SORT OR A PAGE NUMBER FROM THE ADDRESS, drawn
 * per request. The proxy sends `/collections/<handle>?sort=…` here and the
 * address alone to the held page (lib/website-builder/held-list.ts); the
 * visitor's address stays as it was.
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string; handle: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { username, handle } = await params
  return collectionMetadata(username, handle, await searchParams.catch(() => ({})))
}

export default async function SiteCollectionListPage({ params, searchParams }: PageProps) {
  const { username, handle } = await params
  return CollectionPage({ segment: username, rawHandle: handle, asked: await searchParams.catch(() => ({})) })
}
