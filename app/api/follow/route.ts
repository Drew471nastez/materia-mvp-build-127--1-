/**
 * Follow / unfollow a person: a buyer, a member or a creator.
 *
 * A follow points at a PROFILE, not a creator row — see the comment on the
 * `follows` table. A person is the thing you follow, so a seller who later
 * gains or changes a creator row keeps their followers, and a buyer can be
 * followed exactly the way a creator is.
 *
 * Body: { userId } (or { creatorUserId }, which older pages still send) and
 * an optional { follow: false } to unfollow. Answers { following, followers }.
 *
 * AUTHORISATION IS THE ROW-LEVEL POLICY, not this file. `follower_id` is taken
 * from the session and never from the request body, and the table's policies
 * only allow a user to insert or delete their own rows — so even if this
 * handler were wrong, one account could not make another follow anybody.
 *
 * RATE LIMITED per person (30 a minute, 300 a day): following and
 * unfollowing in a loop would otherwise be a way to send somebody a stream
 * of "followed you" notices. The notice itself is written once per pair
 * (lib/profile/notify-follow.ts), and only on a follow.
 *
 * IT ANSWERS FIRST. The button changes on the press and only syncs here in
 * the background, but a slow answer still held the next press's request
 * back by that long (one request at a time). The follower's handle and the
 * "followed you" notice took up to a dozen more round trips to the database
 * before the answer went, so they run after it now (after()), where they
 * cannot slow the person down and still cannot undo the follow.
 */
import { createClient } from "@/lib/supabase/server"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"
import { rateLimit } from "@/lib/api/rate-limit"
import { afterFollow } from "@/lib/profile/follow-effects"
import { after, type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FOLLOW_WINDOWS = [
  { limit: 30, seconds: 60 },
  { limit: 300, seconds: 86400 },
] as const

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  /* Supabase Auth not answering is 503 with Try again, never "Not signed in" (lib/auth/route-user). */
  const signIn = await routeUser()
  if (signIn.kind === "unavailable") return authUnavailableResponse()
  const user = signIn.kind === "user" ? signIn.user : null

  if (!user) {
    // Not an error worth shouting about: the caller decides whether to send
    // the visitor to sign in or to quietly do nothing.
    return NextResponse.json({ error: "Not signed in", following: false }, { status: 401 })
  }

  let body: { userId?: unknown; creatorUserId?: unknown; follow?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const raw = typeof body.userId === "string" ? body.userId : typeof body.creatorUserId === "string" ? body.creatorUserId : null
  const target = raw && UUID.test(raw) ? raw : null
  if (!target) return NextResponse.json({ error: "Missing person" }, { status: 400 })

  // The table has a CHECK for this too; refusing here saves a round trip and
  // gives a sensible message instead of a constraint violation.
  if (target === user.id) {
    return NextResponse.json({ error: "You cannot follow yourself", following: false }, { status: 400 })
  }

  const limited = await rateLimit({
    bucket: "follow",
    subjects: [`user:${user.id}`],
    windows: FOLLOW_WINDOWS,
    message: "You have followed a lot of people just now. Try again in a minute.",
  })
  if (limited) return limited

  const wantsToFollow = body.follow !== false

  if (wantsToFollow) {
    // Idempotent: the unique constraint means a double-tap is a no-op rather
    // than a duplicate row or a race.
    //
    // IGNORE, NOT MERGE. A plain upsert is INSERT ... ON CONFLICT DO UPDATE,
    // and when the follow already exists (a second tap, a button drawn
    // before the first one landed) Postgres takes the UPDATE path, which
    // row-level security checks against an UPDATE policy. `follows` has
    // none, on purpose: a follow is added or removed, never changed. So
    // every repeat was refused, 42501 "new row violates row-level security
    // policy (USING expression)". ignoreDuplicates is ON CONFLICT DO
    // NOTHING, which needs only the INSERT policy (auth.uid() =
    // follower_id). Measured on Postgres 16 with the table's own policies.
    const { error } = await supabase
      .from("follows")
      .upsert({ follower_id: user.id, following_id: target }, { onConflict: "follower_id,following_id", ignoreDuplicates: true })
    if (error) {
      /* 23503: nobody has that id. */
      if (error.code === "23503") return NextResponse.json({ error: "That person is not on Storelib" }, { status: 404 })
      console.error("[follow] insert failed", error.code, error.message)
      return NextResponse.json({ error: "Could not follow" }, { status: 500 })
    }
    /* The follower's handle and the "followed you" notice, once the answer has gone; neither can undo the follow. */
    const followerId = user.id
    try {
      after(() => afterFollow(followerId, target))
    } catch {
      /* Outside a request (a script, a test) there is no after(): now, then. */
      await afterFollow(followerId, target)
    }
  } else {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("following_id", target)
    if (error) {
      console.error("[follow] delete failed", error.code, error.message)
      return NextResponse.json({ error: "Could not unfollow" }, { status: 500 })
    }
  }

  const { count } = await supabase
    .from("follows")
    .select("id", { count: "exact", head: true })
    .eq("following_id", target)

  return NextResponse.json({ following: wantsToFollow, followers: count ?? 0 })
}
