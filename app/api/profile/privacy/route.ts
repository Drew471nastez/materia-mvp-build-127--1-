/**
 * The two profile switches in account settings: PATCH { showActivity?,
 * showCommunities? } -> { showActivity, showCommunities }. Only those two
 * columns, only the signed in person's own row (the id is the session's),
 * rate limited. Before run-now part 85 the columns are not there and this
 * answers 503 not_set_up, and Settings does not draw the switches.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { missingPrivacyColumn, privacyPatch } from "@/lib/profile/privacy"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const NO_STORE = { "Cache-Control": "no-store" }

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401, headers: NO_STORE })
  const limited = await rateLimit({ bucket: "profile-privacy", subjects: [`user:${user.id}`], windows: [{ limit: 30, seconds: 60 }] })
  if (limited) return limited
  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const patch = privacyPatch(body)
  if (!patch) return NextResponse.json({ error: "Nothing to change" }, { status: 400, headers: NO_STORE })
  const { data, error } = await createAdminClient().from("profiles").update(patch).eq("id", user.id).select("show_activity, show_communities").maybeSingle()
  if (error) {
    if (missingPrivacyColumn(error)) return NextResponse.json({ error: "not_set_up" }, { status: 503, headers: NO_STORE })
    console.error("[profile] privacy save failed", error.code, error.message)
    return NextResponse.json({ error: "That did not save. Try again in a moment." }, { status: 500, headers: NO_STORE })
  }
  const row = (data ?? {}) as { show_activity?: boolean; show_communities?: boolean }
  return NextResponse.json({ showActivity: row.show_activity !== false, showCommunities: row.show_communities !== false }, { headers: NO_STORE })
}
