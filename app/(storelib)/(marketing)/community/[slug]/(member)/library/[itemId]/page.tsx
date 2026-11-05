import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PlacePage } from "@/components/community/member/place-page"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Library", robots: { index: false, follow: false } }

/**
 * /community/<slug>/library/<itemId> (round 39): one item of the Library, its description, and for a member who opens it
 * the files and links. Seeds the shell like every place (place-page.tsx); every file and link still goes through its own
 * route, which asks who is asking again (app/api/community/[communityId]/library/[itemId]/files), so this page is not the
 * only check.
 */
export default async function LibraryItemPage({ params }: { params: Promise<{ slug: string; itemId: string }> }) {
  const { slug, itemId } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) notFound()
  return <PlacePage slug={slug} place={{ kind: "resource", id: itemId.toLowerCase() }} />
}
