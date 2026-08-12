import type { Metadata } from "next"

import { MemberScreen, memberMetadata } from "./_member-screen"

/**
 * /member/[username] — the profile, opened on Anunțuri.
 *
 * The screen itself is `_member-screen.tsx`, shared with /member/[username]/saved.
 * See the note at the top of that file for why the tabs have addresses and why
 * there is one implementation behind the two routes rather than two.
 */

// Presence and listings must reflect right now, not a cached render.
export const dynamic = "force-dynamic"

interface MemberPageProps {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: MemberPageProps): Promise<Metadata> {
  const { username } = await params
  return memberMetadata(username)
}

export default async function MemberPage({ params }: MemberPageProps) {
  const { username } = await params
  return <MemberScreen username={username} />
}
