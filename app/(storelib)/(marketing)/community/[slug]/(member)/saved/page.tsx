import { PlacePage } from "@/components/community/member/place-page"

/**
 * /community/<slug>/saved: the posts this member saved here, newest saved first. The same feed as the community's home,
 * arriving on Saved (one slot with All and every feed space, place-host.tsx). Round 15: seeds the shell.
 */
export default async function CommunitySavedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <PlacePage slug={slug} place={{ kind: "saved" }} />
}
