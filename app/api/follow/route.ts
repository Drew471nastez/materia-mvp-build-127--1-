/**
 * Follow / unfollow a creator.
 *
 * A follow points at a PROFILE, not a creator row — see the comment on the
 * `follows` table. A person is the thing you follow, so a seller who later
 * gains or changes a creator row keeps their followers.
 *
 * AUTHORISATION IS THE ROW-LEVEL POLICY, not this file. `follower_id` is taken
 * from the session and never from the request body, and the table's policies
 * only allow a user to insert or delete their own rows — so even if this
 * handler were wrong, one account could not make another follow anybody.
 */
import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // Not an error worth shouting about: the caller decides whether to send
    // the visitor to sign in or to quietly do nothing.
    return NextResponse.json({ error: "Not signed in", following: false }, { status: 401 })
  }

  let body: { creatorUserId?: unknown; follow?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const target = typeof body.creatorUserId === "string" ? body.creatorUserId : null
  if (!target) return NextResponse.json({ error: "Missing creator" }, { status: 400 })

  // The table has a CHECK for this too; refusing here saves a round trip and
  // gives a sensible message instead of a constraint violation.
  if (target === user.id) {
    return NextResponse.json({ error: "You cannot follow yourself", following: false }, { status: 400 })
  }

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
      console.error("[follow] insert failed", error.code, error.message)
      return NextResponse.json({ error: "Could not follow" }, { status: 500 })
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
