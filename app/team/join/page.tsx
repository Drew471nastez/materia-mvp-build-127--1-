import type { Metadata } from "next"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { JOIN_BTN_PRIMARY, JOIN_BTN_QUIET } from "@/components/team/join-actions"
import { Frame, Plain, StateCard } from "@/components/team/join-card"
import { readInvite } from "@/lib/team/server"

/**
 * ===========================================================================
 *  A TEAM INVITE, OPENED
 * ===========================================================================
 * The page the invite email links to. It used to be HTML drawn by an API
 * route (/api/team/join, which now sends old links here). Every way an
 * invite can be has its own card with the next step (lib/team/invite-state):
 *
 *   ready          the store, the role and what it can do; Join and Decline
 *   signed_out     Log in as the invited email (or Create account when there
 *                  is none), which comes back here
 *   wrong_account  signed in with another email: Join with this account
 *                  (the invited email is named), or Switch account
 *   accepted, expired, gone, seats_full, own_store, store_gone, invalid:
 *                  what happened and where to go
 *
 * Opening it changes nothing: Join and Decline are presses on this page.
 */
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Team invite",
  robots: { index: false, follow: false },
  /*
    same-origin, not no-referrer: the token still never leaves in a Referer to
    another site, and the page's own Join keeps its Origin. Under no-referrer
    a browser sends a form post's Origin as "null" (lib/team/own-page.ts).
  */
  referrer: "same-origin",
}

type Search = Promise<{ token?: string | string[]; note?: string | string[]; declined?: string | string[] }>

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

export default async function TeamJoinPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams
  const token = one(sp.token)
  const note = one(sp.note)
  if (one(sp.declined)) {
    return (
      <Frame>
        <Plain title="Invite declined" body="The store's owner has been told. If you change your mind, ask them to send a new invite.">
          <Link href="/" className={JOIN_BTN_QUIET}>Go to Storelib</Link>
        </Plain>
      </Frame>
    )
  }

  let user: { id: string; email: string | null } | null = null
  try {
    const { data } = await (await createClient()).auth.getUser()
    user = data.user ? { id: data.user.id, email: data.user.email ?? null } : null
  } catch {
    user = null
  }
  const read = await readInvite(createAdminClient(), token, user).catch(() => null)
  if (!read || read.ok === false) {
    return (
      <Frame>
        <Plain title="This invite can't be opened right now" body={read && read.ok === false ? read.error : "Something went wrong on our side. Try again in a moment."}>
          <Link href={token ? `/team/join?token=${encodeURIComponent(token)}` : "/"} className={JOIN_BTN_PRIMARY}>Try again</Link>
        </Plain>
      </Frame>
    )
  }
  return (
    <Frame>
      <StateCard state={read.state} token={token} note={note} signedIn={!!user} />
    </Frame>
  )
}

