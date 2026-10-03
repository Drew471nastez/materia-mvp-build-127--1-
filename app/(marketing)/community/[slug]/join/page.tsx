import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"
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
export const metadata: Metadata = { title: "Join", robots: { index: false, follow: false } }

export default async function CommunityJoinPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ invite?: string }> }) {
  await connection()
  const { slug } = await params
  const { invite } = await searchParams
  const page = await memberPage(slug)
  if (page.state === "off" || page.state === "missing" || !page.community) notFound()
  const c = page.community
  if (page.state === "member") redirect(`/community/${c.slug}`)
  const token = typeof invite === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(invite) ? invite : null
  const here = `/community/${c.slug}/join${token ? `?invite=${encodeURIComponent(token)}` : ""}`
  return (
    <InviteLanding
      community={{ id: c.id, slug: c.slug, name: c.name, tagline: c.tagline, logoUrl: c.logo_url, memberCount: c.member_count }}
      token={token}
      state={page.state}
      loginHref={`/login?next=${encodeURIComponent(here)}`}
    />
  )
}
