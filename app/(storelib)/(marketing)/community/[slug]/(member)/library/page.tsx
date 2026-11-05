import type { Metadata } from "next"
import { PlacePage } from "@/components/community/member/place-page"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Library", robots: { index: false, follow: false } }

/**
 * /community/<slug>/library (round 39): the community's Library, while an admin has it on. Like every place, the page
 * seeds the community's shell with the place and its data (place-page.tsx); moving here from inside the community never
 * comes back to this page (lib/communities/server/places.ts is the one loader both use).
 */
export default async function LibraryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <PlacePage slug={slug} place={{ kind: "library" }} />
}
