"use client"

import { useEffect, useState } from "react"

import { readAuthSnapshot } from "@/lib/auth/auth-snapshot"

/**
 * ===========================================================================
 *  WHOSE LISTING IS THIS, ON A PAGE THAT DOES NOT KNOW WHO YOU ARE
 * ===========================================================================
 *
 * The feed is cached and auth-free on purpose — that is most of why it opens
 * instantly — so the server cannot mark your own cards. It has to be answered
 * on the client, and the cheapest true answer is the username: the auth
 * snapshot already carries it, every card already carries its seller's, and
 * comparing two strings costs nothing sixty times over.
 *
 * `null` on the first render and on the server, so nothing depends on this
 * during hydration. The only visible consequence is that the save control on
 * YOUR OWN card exists for one frame before it goes — which is a frame nobody
 * else ever sees, on the one card where the control was meaningless anyway.
 *
 * A localStorage read, not a request. Deliberately not the Supabase session
 * here: the listing PAGE pays for that because getting ownership wrong there
 * shows a Buy button on your own item, and a grid card only decides whether to
 * draw a heart.
 */
export function useMyUsername(): string | null {
  const [username, setUsername] = useState<string | null>(null)
  useEffect(() => {
    const snap = readAuthSnapshot()
    if (snap?.signedIn && snap.username) setUsername(snap.username)
  }, [])
  return username
}

/**
 * Who you are, by both names the snapshot knows.
 *
 * The username alone was not enough, and that is why the heart was still on
 * your own cards after it had supposedly been removed: `profiles.username` is
 * nullable, the snapshot copies it as `profile?.username ?? null`, and an
 * account without one compares `null === "loudliba"` — false — on every card it
 * owns. The control then rendered exactly as if the listing belonged to
 * somebody else, and no error was raised anywhere, because a false answer to
 * "is this mine" is a perfectly ordinary thing for that function to return.
 *
 * `userId` is the identifier that always exists. The feed already carries the
 * seller's — `_explore-feed.tsx` selects `id, user_id, slug` off creators and
 * hangs it on each product — so nothing new has to be fetched to use it.
 */
function useMyIdentity(): { userId: string | null; username: string | null } {
  const [me, setMe] = useState<{ userId: string | null; username: string | null }>({
    userId: null,
    username: null,
  })
  useEffect(() => {
    const snap = readAuthSnapshot()
    if (!snap?.signedIn) return
    setMe({ userId: snap.userId ?? null, username: snap.username ?? null })
  }, [])
  return me
}

/**
 * True when this listing's seller is the person reading.
 *
 * Either identifier is sufficient and the id is preferred, because it cannot be
 * absent for a signed-in account the way a username can. Callers that have only
 * one may pass only that one.
 */
export function useIsMyListing(
  sellerUsername: string | null | undefined,
  sellerUserId?: string | null,
): boolean {
  const me = useMyIdentity()
  if (me.userId && sellerUserId && me.userId === sellerUserId) return true
  return !!me.username && !!sellerUsername && me.username === sellerUsername
}
