import { PlacePage } from "@/components/community/member/place-page"

/** /community/<slug>/leaderboard: points earned in the last 30 days by default, 7 days or all time. Only with points on. Round 15: seeds the shell. */
export default async function CommunityLeaderboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <PlacePage slug={slug} place={{ kind: "leaderboard" }} />
}
