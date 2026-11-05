import { notFound, redirect } from "next/navigation"
import { admin } from "@/lib/communities/server/db"
import { profileRef } from "@/lib/communities/server/places"
import { memberPage } from "@/components/community/member/data"
import { placeHref } from "@/lib/communities/client/places"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * /community/<slug>/members/<userId>: THE OLD ADDRESS OF A PERSON INSIDE A COMMUNITY. Round 15, the owner: a person's
 * profile inside the community is /community/<slug>?profile=<handle> (and ?profile=me), drawn by the community's own shell
 * with no page load. Old links to this address (notifications, reports, bookmarks, other people's posts) are sent there,
 * the id read back to the member's handle (lib/communities/server/places.ts profileRef, only somebody in this community).
 *
 * Only a member of this community gets this far (the (member) layout sends everybody else to About), so a link never tells
 * a stranger who is in a private community. ?message=1, how a profile's Message button used to land here, opens that
 * conversation in this community instead (/community/<slug>?dm=<userId>). Somebody not known here goes to the members.
 */
export default async function CommunityMemberRedirect({ params, searchParams }: { params: Promise<{ slug: string; userId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug, userId }, query] = await Promise.all([params, searchParams])
  const page = await memberPage(slug)
  if (page.state !== "member" || !page.community || !page.viewer) notFound()
  const base = `/community/${page.community.slug}`
  if (!UUID.test(userId)) redirect(`${base}/members`)
  if (query.message === "1" && userId !== page.viewer.userId) redirect(`${base}?dm=${userId}`)
  const ref = await profileRef(admin(), page.community, page.viewer, userId)
  redirect(ref ? placeHref(page.community.slug, { kind: "profile", ref }) : `${base}/members`)
}
