/**
 * A person's own cover: PATCH { coverUrl: string | null } -> { coverUrl }.
 * The picture was already uploaded by the shared upload control to the
 * `covers` bucket; this saves its address on the signed in person's own row
 * (the id is the session's), after lib/profile/cover.ts has checked it is
 * their own upload. null removes it. Rate limited. Where
 * profiles.cover_url has not been added it answers 503 not_set_up and
 * Settings does not offer a cover.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { missingCoverColumn, ownCoverUrl, supabaseStorageHost } from "@/lib/profile/cover"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const NO_STORE = { "Cache-Control": "no-store" }

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401, headers: NO_STORE })
  const limited = await rateLimit({ bucket: "profile-cover", subjects: [`user:${user.id}`], windows: [{ limit: 20, seconds: 600 }] })
  if (limited) return limited
  let body: Record<string, unknown> = {}
  try {
    const parsed = await request.json()
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>
  } catch {
    body = {}
  }
  if (!("coverUrl" in body)) return NextResponse.json({ error: "Nothing to change" }, { status: 400, headers: NO_STORE })
  const coverUrl = body.coverUrl === null ? null : ownCoverUrl(body.coverUrl, user.id, supabaseStorageHost())
  if (body.coverUrl !== null && !coverUrl) return NextResponse.json({ error: "That picture did not upload. Try again." }, { status: 400, headers: NO_STORE })
  const { error } = await createAdminClient().from("profiles").update({ cover_url: coverUrl }).eq("id", user.id)
  if (error) {
    if (missingCoverColumn(error)) return NextResponse.json({ error: "not_set_up" }, { status: 503, headers: NO_STORE })
    console.error("[profile] cover save failed", error.code, error.message)
    return NextResponse.json({ error: "That did not save. Try again in a moment." }, { status: 500, headers: NO_STORE })
  }
  return NextResponse.json({ coverUrl }, { headers: NO_STORE })
}
