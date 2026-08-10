"use client"

import { useEffect, useState } from "react"

import { readAuthSnapshot, subscribeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { createClient } from "@/lib/supabase/client"

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
type Identity = { userId: string | null; username: string | null }

const NOBODY: Identity = { userId: null, username: null }

/**
 * Resolved from the session when there is no snapshot to read.
 *
 * Module-level, and asked at most once, because a feed is sixty cards and each
 * of them calls this hook — sixty network round trips to answer one question
 * would be a worse bug than the one it fixes.
 */
let fromSession: Identity | null = null
let asking: Promise<unknown> | null = null
/** Every mounted card, so one answer reaches all of them. */
const watchers = new Set<() => void>()

function currentIdentity(): Identity {
  const snap = readAuthSnapshot()
  if (snap?.signedIn && (snap.userId || snap.username)) {
    return { userId: snap.userId ?? null, username: snap.username ?? null }
  }
  return fromSession ?? NOBODY
}

function askSessionOnce(): void {
  if (fromSession || asking) return
  const snap = readAuthSnapshot()
  if (snap?.signedIn && snap.userId) return
  asking = createClient()
    .auth.getUser()
    .then(({ data }: { data: { user: { id: string } | null } }) => {
      if (!data.user) return
      // No username from a session — the id is the identifier that always
      // exists, and it is the one that decides ownership anyway.
      fromSession = { userId: data.user.id, username: null }
      for (const w of watchers) w()
    })
    .catch(() => undefined)
    .finally(() => {
      asking = null
    })
}

/**
 * ===========================================================================
 *  IT HAS TO KEEP ASKING, NOT ASK ONCE
 * ===========================================================================
 *
 * This read the snapshot in a mount effect and never looked again, and that is
 * why the heart was STILL on your own listings after the identifier was fixed.
 *
 * The snapshot is written by the header, after a session check and a profile
 * query — two network round trips. Every card in the feed mounts long before
 * that lands. They each read "signed out", correctly, and then never found out
 * they were wrong: one `useEffect` with an empty dependency array is a question
 * asked exactly once, at the worst possible moment.
 *
 * There is no error in that, and nothing to see in a log. The card renders
 * precisely as it would for a stranger's listing, which is the failure the
 * previous two attempts at this both produced by different routes.
 *
 * So: read on mount, and re-read whenever the snapshot changes — in this tab
 * via the event `writeAuthSnapshot` fires, and in another via `storage`. And if
 * nothing ever writes one on this route, ask the session directly, once, for
 * the whole page.
 */
function useMyIdentity(): Identity {
  // Deliberately not a lazy initialiser reading localStorage: the server has no
  // localStorage, and a first client render that disagrees with the HTML is a
  // hydration mismatch.
  const [me, setMe] = useState<Identity>(NOBODY)

  useEffect(() => {
    let alive = true
    const read = () => {
      if (!alive) return
      const next = currentIdentity()
      // Compared by value — the identity is re-read on every announcement and
      // most announcements do not change it.
      setMe((prev) =>
        prev.userId === next.userId && prev.username === next.username ? prev : next,
      )
    }
    read()
    watchers.add(read)
    const stop = subscribeAuthSnapshot(read)
    askSessionOnce()
    return () => {
      alive = false
      watchers.delete(read)
      stop()
    }
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
