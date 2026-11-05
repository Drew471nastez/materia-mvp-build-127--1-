import { PlacePage } from "@/components/community/member/place-page"

/** /community/<slug>/notifications: the member's inbox for this community, live. Round 15: seeds the shell. */
export default async function CommunityNotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <PlacePage slug={slug} place={{ kind: "notifications" }} />
}
