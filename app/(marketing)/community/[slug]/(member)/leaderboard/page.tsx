import { notFound } from "next/navigation"
import { admin } from "@/lib/communities/server/db"
import { leaderboardRows, levelNames } from "@/lib/communities/server/directory"
import { leaderboard } from "@/lib/communities/server/points"
import { memberPage } from "@/components/community/member/data"
import { Leaderboard } from "@/components/community/member/leaderboard"

/** /community/<slug>/leaderboard: points earned in the last 30 days by default, 7 days or all time. Only with points on. */
export default async function CommunityLeaderboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = await memberPage(slug)
  if (page.state !== "member" || !page.community || !page.viewer) notFound()
  const { community, viewer } = page
  if (!community.gamification_enabled) notFound()
  const db = admin()
  const [entries, names] = await Promise.all([leaderboard(db, community.id, "30d", 25).then((e) => leaderboardRows(db, community.id, e)), levelNames(db, community.id)])
  const levels = [...names.entries()].sort((a, b) => a[0] - b[0]).map(([level, name]) => ({ level, name }))
  return (
    <Leaderboard
      communityId={community.id}
      slug={community.slug}
      initial={entries}
      me={{ userId: viewer.userId, points: viewer.points, level: viewer.level }}
      levels={levels}
    />
  )
}
