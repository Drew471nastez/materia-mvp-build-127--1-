/**
 * A person's own cover: PATCH { coverUrl?: string | null, crop?: { x, y, zoom } } -> { coverUrl, crop }.
 * The picture was already uploaded by the shared upload control to the
 * `covers` bucket; this saves its address on the signed in person's own row
 * (the id is the session's), after lib/profile/cover.ts has checked it is
 * their own upload. null removes it. `crop` is where the picture sits in
 * the band (lib/profile/cover.ts): sent with a new picture, or on its own to
 * move the one that is there. It is kept on the stored address's fragment,
 * so no column is needed. Rate limited. Where
 * profiles.cover_url has not been added it answers 503 not_set_up and
 * Settings does not offer a cover.
 */
import { creatorPagesChanged } from "@/lib/storefront/creator-page-purge"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { cropFromBody, missingCoverColumn, ownCoverUrl, parseProfileCover, profileCoverValue, supabaseStorageHost } from "@/lib/profile/cover"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const NO_STORE = { "Cache-Control": "no-store" }

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401, headers: NO_STORE })
  /* A crop is saved once per gesture, so placing a cover is a few saves, not one: the window allows for that. */
  const limited = await rateLimit({ bucket: "profile-cover", subjects: [`user:${user.id}`], windows: [{ limit: 60, seconds: 600 }] })
  if (limited) return limited
  let body: Record<string, unknown> = {}
  try {
    const parsed = await request.json()
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>
  } catch {
    body = {}
  }
  const hasUrl = "coverUrl" in body
  const crop = "crop" in body ? cropFromBody(body.crop) : null
  if (!hasUrl && !crop) return NextResponse.json({ error: "Nothing to change" }, { status: 400, headers: NO_STORE })
  const admin = createAdminClient()
  let picture: string | null
  if (hasUrl) {
    picture = body.coverUrl === null ? null : ownCoverUrl(body.coverUrl, user.id, supabaseStorageHost())
    if (body.coverUrl !== null && !picture) return NextResponse.json({ error: "That picture did not upload. Try again." }, { status: 400, headers: NO_STORE })
  } else {
    /* Only the crop: it moves the picture that is there now, read from the person's own row. */
    const { data, error } = await admin.from("profiles").select("cover_url").eq("id", user.id).maybeSingle()
    if (error) {
      if (missingCoverColumn(error)) return NextResponse.json({ error: "not_set_up" }, { status: 503, headers: NO_STORE })
      return NextResponse.json({ error: "That did not save. Try again in a moment." }, { status: 500, headers: NO_STORE })
    }
    picture = parseProfileCover((data as { cover_url?: string | null } | null)?.cover_url).url
    if (!picture || !/^https:\/\//.test(picture)) return NextResponse.json({ error: "Add a cover first." }, { status: 409, headers: NO_STORE })
  }
  const coverUrl = picture ? profileCoverValue(picture, crop) : null
  const { error } = await admin.from("profiles").update({ cover_url: coverUrl }).eq("id", user.id)
  if (error) {
    if (missingCoverColumn(error)) return NextResponse.json({ error: "not_set_up" }, { status: 503, headers: NO_STORE })
    console.error("[profile] cover save failed", error.code, error.message)
    return NextResponse.json({ error: "That did not save. Try again in a moment." }, { status: 500, headers: NO_STORE })
  }
  /* The cover is on the creator page: the CDN's minute-long copy goes with it (round 48). */
  await creatorPagesChanged({ userId: user.id })
  return NextResponse.json({ coverUrl: picture, crop: parseProfileCover(coverUrl).crop }, { headers: NO_STORE })
}
