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

/** True when this listing's seller is the person reading. */
export function useIsMyListing(sellerUsername: string | null | undefined): boolean {
  const mine = useMyUsername()
  return !!mine && !!sellerUsername && mine === sellerUsername
}
