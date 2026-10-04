import { notFound, redirect } from "next/navigation"
import { admin } from "@/lib/communities/server/db"
import { authorViews } from "@/lib/communities/server/directory"
import { personHref } from "@/lib/profile/person-href"
import { memberPage } from "@/components/community/member/data"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * /community/<slug>/members/<userId>: THERE IS NO MEMBER PAGE INSIDE A
 * COMMUNITY ANY MORE. A person is one page across Storelib: their creator
 * page /<handle> when they have a storefront, their profile /@handle
 * otherwise (lib/profile/person-href.ts). Old links to this address, in
 * notifications, reports, bookmarks and other people's posts, are sent there.
 *
 * Only a member of this community gets this far (the (member) layout sends
 * everybody else to the community's about page), so a link never tells a
 * stranger who is in a private community. ?message=1 was how a profile's
 * Message button used to land here: it now opens that conversation in this
 * community instead (/community/<slug>?dm=<userId>). Somebody without a
 * handle is given one on the way (authorViews), so the link always has a
 * page to open; nobody known here goes to the member list.
 */
export default async function CommunityMemberRedirect({ params, searchParams }: { params: Promise<{ slug: string; userId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug, userId }, query] = await Promise.all([params, searchParams])
  const page = await memberPage(slug)
  if (page.state !== "member" || !page.community || !page.viewer) notFound()
  const base = `/community/${page.community.slug}`
  if (!UUID.test(userId)) redirect(`${base}/members`)
  if (query.message === "1" && userId !== page.viewer.userId) redirect(`${base}?dm=${userId}`)
  const person = (await authorViews(admin(), page.community.id, [userId])).get(userId)
  const href = person ? personHref({ username: person.username, hasStorefront: !!person.hasStorefront }) : "/"
  redirect(href === "/" ? `${base}/members` : href)
}
