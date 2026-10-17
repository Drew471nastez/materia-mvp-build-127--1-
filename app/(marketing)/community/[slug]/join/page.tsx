import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"
import { communitiesEnabled } from "@/lib/communities/flag"
import { communityBySlug, joinPrice, seoFacts, sharePreviewable } from "@/lib/communities/server/public"
import { communitySummary } from "@/lib/communities/server/community-summary"
import { admin } from "@/lib/communities/server/db"
import { communityMetadata, inviteMetadata } from "@/components/community/public/seo"
import { memberPage } from "@/components/community/member/data"
import { InviteLanding } from "@/components/community/member/invite-landing"

/**
 * /community/<slug>/join?invite=<token>: somebody followed an invite. It sits
 * outside the member route group on purpose (a person with an invite is not
 * a member yet). Signed out, they are asked to sign in and come back here;
 * already a member, they go straight in; otherwise one button accepts the
 * invite through the public side's redeem route, which checks the token.
 * Only the community's public face is shown (name, picture, tagline,
 * members); the token itself is never shown or stored by the page.
 */
/**
 * WHAT AN INVITE LINK SHOWS WHEN IT IS SHARED: the community's public face
 * (its name, line and the drawn picture with "You're invited", share.png
 * ?invite=1), never indexed, and nothing an invite lets in. The token is not
 * read here: a preview never learns whether it is valid.
 */
export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ invite?: string; event?: string; et?: string }> }): Promise<Metadata> {
  const plainJoin: Metadata = { title: "Join", robots: { index: false, follow: false } }
  await connection()
  if (!(await communitiesEnabled())) return plainJoin
  const [{ slug }, { invite }] = await Promise.all([params, searchParams])
  const community = await communityBySlug(slug)
  if (!community || !sharePreviewable(community)) return plainJoin
  const facts = { ...seoFacts(community), summary: await communitySummary(community.id) }
  return typeof invite === "string" && invite ? inviteMetadata(facts) : { ...communityMetadata(facts), title: { absolute: `Join ${community.name}` }, robots: { index: false, follow: false } }
}

export default async function CommunityJoinPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ invite?: string; event?: string; et?: string }> }) {
  await connection()
  const { slug } = await params
  const { invite, event, et } = await searchParams
  const page = await memberPage(slug)
  if (page.state === "off" || page.state === "missing" || !page.community) notFound()
  const c = page.community
  if (page.state === "member") redirect(`/community/${c.slug}`)
  /* A draft or a suspended community shows nobody outside it its name or picture, an invite included (round 26). */
  if (!sharePreviewable(c)) notFound()
  const token = typeof invite === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(invite) ? invite : null
  /*
    AN INVITE FOR ONE PAID EVENT carries the event and a signature over it
    and the token (lib/communities/server/jobs/event_ticket_invite.ts). Both
    travel on to the redeem route, which checks the signature, grants the
    free ticket and answers with the event's page.
  */
  const eventId = typeof event === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event) ? event : null
  const eventTag = eventId && typeof et === "string" && /^[0-9a-f]{32}$/.test(et) ? et : null
  const forEvent = eventId && eventTag ? `&event=${encodeURIComponent(eventId)}&et=${eventTag}` : ""
  const here = `/community/${c.slug}/join${token ? `?invite=${encodeURIComponent(token)}${forEvent}` : ""}`
  /* The price before they press, because a private community can charge now (lib/communities/access-model.ts). */
  const price = await joinPrice(admin(), c)
  return (
    <InviteLanding
      community={{ id: c.id, slug: c.slug, name: c.name, tagline: c.tagline, logoUrl: c.logo_url, memberCount: c.member_count, priceLine: price }}
      token={token}
      eventId={forEvent ? eventId : null}
      eventTag={eventTag}
      state={page.state}
      /* Back from signing in (or up) the invite is accepted on arrival (?accept=1, invite-landing), so they land in the community. */
      loginHref={`/login?next=${encodeURIComponent(token ? `${here}&accept=1` : here)}`}
    />
  )
}
