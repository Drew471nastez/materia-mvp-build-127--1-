import type { Metadata } from "next"
import { PlacePage } from "@/components/community/member/place-page"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Learn", robots: { index: false, follow: false } }

/**
 * /community/<slug>/learn (round 13: the Classroom, renamed; its old addresses answer a 308 here from proxy.ts): the
 * community's programs. ROUND 15: the page seeds the community's shell with the place and its data (place-page.tsx); the
 * shell draws it, and moving to Learn from inside the community never comes here (lib/communities/server/places.ts is the
 * one loader both use).
 */
export default async function LearnPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <PlacePage slug={slug} place={{ kind: "learn" }} />
}
