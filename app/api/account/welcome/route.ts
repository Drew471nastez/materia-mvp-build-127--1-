import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readCurrentUser } from "@/lib/auth/current-user"
import { rateLimit } from "@/lib/api/rate-limit"
import { cleanName } from "@/lib/profile/display-name"
import { WELCOMED_KEY } from "@/lib/account/welcome"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

/**
 * ===========================================================================
 *  POST /api/account/welcome { name } | { skip: true } | { done: true }
 * ===========================================================================
 * The join branch of a new account's first steps (/onboarding/start,
 * lib/account/welcome.ts):
 *
 *   { name }        "What should we call you?": the name goes on the
 *                   profile (cleaned by lib/profile/display-name, never a
 *                   placeholder word, never an address)
 *   { done: true }  the last step: the question is not asked again
 *   { skip: true }  "Not now": the same, nothing else changes
 *
 * The handle is saved through /api/profile/username, the one rule for a
 * handle. Signed in only, the user from the session, rate limited.
 */
export async function POST(request: NextRequest) {
  let body: { name?: unknown; skip?: unknown; done?: unknown } | null
  try {
    body = await request.json()
  } catch {
    body = null
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Bad request" }, { status: 400, headers: NO_STORE })

  const supabase = await createClient()
  const current = await readCurrentUser(supabase)
  if (current.state === "indeterminate") {
    return NextResponse.json({ error: "Could not reach Storelib. Check your connection and try again." }, { status: 503, headers: NO_STORE })
  }
  const user = current.user
  if (!user) return NextResponse.json({ error: "Your session ended. Sign in again." }, { status: 401, headers: NO_STORE })

  const limited = await rateLimit({ bucket: "account-welcome", subjects: [`user:${user.id}`], windows: [{ limit: 20, seconds: 600 }] })
  if (limited) return limited

  if (body.name !== undefined) {
    const name = cleanName(body.name)
    if (!name || name.includes("@")) {
      return NextResponse.json({ error: "Type the name you go by." }, { status: 400, headers: NO_STORE })
    }
    /* The service role, for this person's own row only: the profile is theirs, the id is the session's. */
    const { error } = await createAdminClient().from("profiles").update({ display_name: name }).eq("id", user.id)
    if (error) {
      console.error("[welcome] name not saved", error.code, error.message)
      return NextResponse.json({ error: "That did not save. Try again in a moment." }, { status: 500, headers: NO_STORE })
    }
    return NextResponse.json({ ok: true, name }, { headers: NO_STORE })
  }

  if (body.skip === true || body.done === true) {
    if (user.user_metadata?.[WELCOMED_KEY] !== true) {
      const { error } = await supabase.auth.updateUser({ data: { [WELCOMED_KEY]: true } })
      if (error) console.error("[welcome] not marked", error.message)
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  }

  return NextResponse.json({ error: "Bad request" }, { status: 400, headers: NO_STORE })
}
