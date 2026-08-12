import type { Metadata } from "next"

import { MemberScreen, memberMetadata } from "../_member-screen"

/**
 * /member/[username]/saved — the profile, opened on Salvate.
 *
 * THE TAB HAS AN ADDRESS, and that is the whole of this file. Without one the
 * bookmark in the site header had nowhere to point but /wishlist, which is a
 * different page with different chrome; the back button after a switch took you
 * off the profile instead of back to the tab you were on; and "my saved things"
 * could not be linked to at all.
 *
 * Signed out, or signed in as somebody else, this redirects to the profile —
 * the tab draws the reader's own wishlist and there is no version of it that
 * makes sense on a stranger's page. See the guard in _member-screen.tsx.
 */

export const dynamic = "force-dynamic"

interface SavedPageProps {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: SavedPageProps): Promise<Metadata> {
  const { username } = await params
  const base = await memberMetadata(username)
  // Signed-in-and-yours only, so there is nothing here for a crawler. The
  // canonical still points at the bare profile — see memberMetadata.
  return { ...base, robots: { index: false, follow: false } }
}

export default async function MemberSavedPage({ params }: SavedPageProps) {
  const { username } = await params
  return <MemberScreen username={username} initialTab="saved" />
}
