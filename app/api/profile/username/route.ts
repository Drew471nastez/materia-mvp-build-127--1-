/**
 * ===========================================================================
 *  THE HANDLE, CHECKED AS IT IS TYPED AND SAVED FROM ACCOUNT SETTINGS
 * ===========================================================================
 * GET  ?handle=<typed>  -> { handle, available, error? }   the live check
 * PATCH { username }    -> { username }                    the save
 *
 * The same rule everywhere a handle is set (isValidUsername: length, the
 * characters, reserved words, the link farm score) and the same meaning of
 * taken (lib/profile/ensure-username.ts handleAvailable).
 *
 * THIS SAVES A BUYER'S HANDLE. A creator's handle is also their store's
 * address, their website's and their OnePage's, and those move together
 * from /app Settings (components/app/settings-form-new.tsx); somebody with
 * a store or a OnePage is sent there instead of half a rename here.
 *
 * { username, store: true } is that move (lib/profile/move-handle.ts), the
 * only way /app Settings renames a store; { username, store: true,
 * claim: true } is the seller onboarding's, which falls back to a free name
 * rather than stopping. The browser cannot write profiles.username or
 * creators.slug itself any more (supabase/sql/run-now/462).
 * The old handle goes into username_history, so an old /@link still finds
 * them (app/(marketing)/member/[username]).
 *
 * Signed in only, the user from the session, rate limited.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { isValidUsername } from "@/lib/reserved-words"
import { handleAvailable } from "@/lib/profile/ensure-username"
import { normalizeHandle } from "@/lib/profile/username-rules"
import { routeUser, signedOutOrRetry } from "@/lib/auth/route-user"
import { claimStoreHandle, moveStoreHandle } from "@/lib/profile/move-handle"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const NO_STORE = { "Cache-Control": "no-store" }

/* The signed in person, from the session the auth server confirms; never an id from the request. */
async function signedIn() {
  const who = await routeUser({ fresh: true })
  const user = who.kind === "user" ? who.user : null
  return user ?? null
}

export async function GET(request: Request) {
  const user = await signedIn()
  if (!user) return signedOutOrRetry(NextResponse.json({ error: "Sign in first" }, { status: 401, headers: NO_STORE }))
  const limited = await rateLimit({ bucket: "username-check", subjects: [`user:${user.id}`], windows: [{ limit: 90, seconds: 60 }] })
  if (limited) return limited
  const handle = normalizeHandle(new URL(request.url).searchParams.get("handle"))
  const valid = isValidUsername(handle)
  if (!valid.valid) return NextResponse.json({ handle, available: false, error: valid.error }, { headers: NO_STORE })
  const available = await handleAvailable(createAdminClient(), handle, user.id)
  return NextResponse.json({ handle, available, error: available ? undefined : "This username is taken" }, { headers: NO_STORE })
}

export async function PATCH(request: Request) {
  const user = await signedIn()
  if (!user) return signedOutOrRetry(NextResponse.json({ error: "Sign in first" }, { status: 401, headers: NO_STORE }))
  const limited = await rateLimit({
    bucket: "username-save",
    subjects: [`user:${user.id}`],
    windows: [
      { limit: 5, seconds: 600 },
      { limit: 20, seconds: 86400 },
    ],
    message: "You have changed your username a few times just now. Try again later.",
  })
  if (limited) return limited
  let body: { username?: unknown; store?: unknown; claim?: unknown } | null = null
  try {
    body = await request.json()
  } catch {
    body = null
  }
  if (body?.store === true) {
    const db = createAdminClient()
    const moved = body.claim === true ? await claimStoreHandle(db, user.id, body.username) : await moveStoreHandle(db, user.id, body.username)
    if (!moved.ok) return NextResponse.json({ error: moved.error }, { status: moved.status, headers: NO_STORE })
    return NextResponse.json({ username: moved.username, previous: moved.previous, onepageMoved: moved.onepageMoved }, { headers: NO_STORE })
  }
  const handle = normalizeHandle(body?.username)
  const valid = isValidUsername(handle)
  if (!valid.valid) return NextResponse.json({ error: valid.error }, { status: 400, headers: NO_STORE })

  const db = createAdminClient()
  const [{ data: profile }, { data: creator }, { data: page }] = await Promise.all([
    db.from("profiles").select("username").eq("id", user.id).maybeSingle(),
    db.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
    db.from("onepages").select("id").eq("owner_id", user.id).limit(1).maybeSingle(),
  ])
  if (creator || page) {
    return NextResponse.json({ error: "Your username is also your store's address. Change it in your store settings.", settings: "/app/settings" }, { status: 409, headers: NO_STORE })
  }
  const old = ((profile as { username?: string | null } | null)?.username || "").trim()
  if (old.toLowerCase() === handle) return NextResponse.json({ username: old }, { headers: NO_STORE })
  if (!(await handleAvailable(db, handle, user.id))) return NextResponse.json({ error: "This username is taken" }, { status: 409, headers: NO_STORE })

  const { error } = await db.from("profiles").update({ username: handle }).eq("id", user.id)
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "This username is taken" }, { status: 409, headers: NO_STORE })
    console.error("[profile] username save failed", error.code, error.message)
    return NextResponse.json({ error: "That did not save. Try again in a moment." }, { status: 500, headers: NO_STORE })
  }
  if (old) {
    const { error: historyError } = await db.from("username_history").insert({ user_id: user.id, old_username: old, new_username: handle })
    if (historyError) console.error("[profile] username_history insert failed", historyError.message)
  }
  return NextResponse.json({ username: handle }, { headers: NO_STORE })
}
