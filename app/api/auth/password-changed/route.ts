import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { readCurrentUser } from "@/lib/auth/current-user"
import { emit } from "@/lib/notify/outbox"

export const runtime = "nodejs"

/**
 * "Your Storelib password was changed", for a change made in the browser.
 *
 * Settings changes the password with supabase.auth.updateUser on the
 * person's own session, so no Storelib server code sees it. The auth.users
 * trigger raises user.password_changed in the same transaction as the
 * change; this route raises it too, after the browser's change succeeds,
 * for a database where that trigger could not be installed.
 *
 * SAME KEY AS THE TRIGGER: the user and the second auth.users.updated_at
 * moved to, read here from Supabase rather than from the browser. Whichever
 * of the two gets there first is the one told; the other is a no-op.
 *
 * Only a change that just happened counts: an updated_at older than two
 * minutes raises nothing, so calling this by hand cannot make up a change.
 */
const FRESH_MS = 2 * 60 * 1000

export async function POST(request: Request) {
  const supabase = await createClient()
  const current = await readCurrentUser(supabase)
  if (current.state === "indeterminate") {
    return NextResponse.json({ error: "Could not reach Storelib. Try again in a moment." }, { status: 503 })
  }
  const user = current.user
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 })

  const changedAt = Date.parse(user.updated_at ?? "")
  if (!Number.isFinite(changedAt) || Date.now() - changedAt > FRESH_MS) {
    return NextResponse.json({ ok: true, raised: false })
  }

  const { ok: raised } = await emit({
    name: "user.password_changed",
    key: `user.password_changed:${user.id}:${Math.floor(changedAt / 1000)}`,
    userId: user.id,
    entityType: "user",
    entityId: user.id,
    correlationId: request.headers.get("x-vercel-id"),
    payload: { userId: user.id, changedAt: new Date(changedAt).toISOString(), source: "settings" },
  })
  return NextResponse.json({ ok: true, raised })
}
