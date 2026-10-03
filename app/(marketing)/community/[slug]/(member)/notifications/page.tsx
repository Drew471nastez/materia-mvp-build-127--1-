import { notFound } from "next/navigation"
import { listNotifications } from "@/lib/communities/server/mentions"
import { admin } from "@/lib/communities/server/db"
import { memberPage } from "@/components/community/member/data"
import { NotificationsList } from "@/components/community/member/notifications"

/** /community/<slug>/notifications: the member's inbox for this community, live. */
export default async function CommunityNotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = await memberPage(slug)
  if (page.state !== "member" || !page.community || !page.viewer?.userId) notFound()
  const { community, viewer } = page
  const first = await listNotifications(admin(), community, viewer.userId!, null)
  return <NotificationsList communityId={community.id} slug={community.slug} userId={viewer.userId!} initial={first} notifyLevel={viewer.member?.notify_level ?? "important"} />
}
