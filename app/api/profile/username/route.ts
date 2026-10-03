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
 * The old handle goes into username_history, so an old /@link still finds
 * them (app/(marketing)/member/[username]).
 *
 * Signed in only, the user from the session, rate limited.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { isValidUsername } from "@/lib/reserved-words"
import { handleAvailable } from "@/lib/profile/ensure-username"
import { normalizeHandle } from "@/lib/profile/username-rules"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const NO_STORE = { "Cache-Control": "no-store" }

/* The signed in person, from the session the auth server confirms; never an id from the request. */
async function signedIn() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ?? null
}

export async function GET(request: Request) {
  const user = await signedIn()
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401, headers: NO_STORE })
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
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401, headers: NO_STORE })
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
  let body: { username?: unknown } | null = null
  try {
    body = await request.json()
  } catch {
    body = null
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
