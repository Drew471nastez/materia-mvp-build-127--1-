import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { readCurrentUser } from "@/lib/auth/current-user"
import { rateLimit } from "@/lib/api/rate-limit"
import { rememberAppOpen, safeAppOpenPath } from "@/lib/account/app-open"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

/**
 * POST /api/account/app-open { path }
 * The signed-in person tapped Open in the app, or just joined. The path is
 * remembered on the account (lib/account/app-open) so signing in on the
 * phone opens it. A path the app will not open is ignored.
 */
export async function POST(request: NextRequest) {
  let body: { path?: unknown } | null
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const path = safeAppOpenPath(body?.path)
  if (!path) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: NO_STORE })

  const supabase = await createClient()
  const current = await readCurrentUser(supabase)
  if (current.state === "indeterminate") {
    return NextResponse.json({ error: "Could not reach Storelib. Check your connection and try again." }, { status: 503, headers: NO_STORE })
  }
  const user = current.user
  if (!user) return NextResponse.json({ error: "Your session ended. Sign in again." }, { status: 401, headers: NO_STORE })

  const limited = await rateLimit({ bucket: "account-app-open", subjects: [`user:${user.id}`], windows: [{ limit: 30, seconds: 600 }] })
  if (limited) return limited

  try {
    await rememberAppOpen(user.id, path)
  } catch {
    return NextResponse.json({ error: "That did not save. Try again in a moment." }, { status: 500, headers: NO_STORE })
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
