import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
/* Round 52: the token's verified signature, with no Supabase Auth round trip (lib/auth/route-user). */
import { readerForRequest } from "@/lib/auth/route-user"
import { rateLimit } from "@/lib/api/rate-limit"
import { cleanName } from "@/lib/profile/display-name"
import { JOIN_STEP_KEY, JOIN_STEP_PROFILE, JOIN_STEP_USERNAME, WELCOMED_KEY, cleanBio } from "@/lib/account/welcome"

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
 *   { name, bio? }  the profile slide: the name goes on the profile
 *                   (cleaned by lib/profile/display-name, never a
 *                   placeholder word, never an address). bio, when sent,
 *                   is the optional short line (lib/account/welcome
 *                   cleanBio). A database without profiles.bio saves the
 *                   name anyway.
 *   { done: true }  the last step: the question is not asked again
 *   { skip: true }  "Not now": the same, nothing else changes
 *
 * The handle is saved through /api/profile/username, the one rule for a
 * handle. Signed in only, the user from the session, rate limited.
 */
function socialHandle(raw: unknown): string {
  if (typeof raw !== "string") return ""
  let v = raw.trim().replace(/^https?:\/\/(www\.)?/i, "")
  v = v.replace(/^(instagram\.com|tiktok\.com|youtube\.com|youtu\.be|linkedin\.com\/in|bsky\.app\/profile|twitter\.com|x\.com)\//i, "")
  v = v.replace(/^@+/, "").split(/[/?#]/)[0] ?? ""
  return v.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 60)
}

function socialUrl(kind: "instagram" | "tiktok" | "youtube" | "linkedin" | "bluesky" | "twitter", handle: string): string | null {
  if (!handle) return null
  if (kind === "instagram") return `https://instagram.com/${handle}`
  if (kind === "tiktok") return `https://www.tiktok.com/@${handle}`
  if (kind === "linkedin") return `https://www.linkedin.com/in/${handle}`
  if (kind === "bluesky") return `https://bsky.app/profile/${handle}`
  if (kind === "twitter") return `https://x.com/${handle}`
  return `https://youtube.com/@${handle}`
}

export async function POST(request: NextRequest) {
  let body: { name?: unknown; bio?: unknown; skip?: unknown; done?: unknown; socials?: unknown; progress?: unknown } | null
  try {
    body = await request.json()
  } catch {
    body = null
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Bad request" }, { status: 400, headers: NO_STORE })

  const supabase = await createClient()
  const current = await readerForRequest()
  if (current.state === "indeterminate") {
    return NextResponse.json({ error: "Could not reach Storelib. Check your connection and try again." }, { status: 503, headers: NO_STORE })
  }
  const user = current.user
  if (!user) return NextResponse.json({ error: "Your session ended. Sign in again." }, { status: 401, headers: NO_STORE })

  const limited = await rateLimit({ bucket: "account-welcome", subjects: [`user:${user.id}`], windows: [{ limit: 20, seconds: 600 }] })
  if (limited) return limited

  if (body.progress !== undefined) {
    const step = body.progress && typeof body.progress === "object" ? (body.progress as { step?: unknown }).step : null
    if (step === JOIN_STEP_PROFILE || step === JOIN_STEP_USERNAME) {
      await supabase.auth.updateUser({ data: { [JOIN_STEP_KEY]: step } })
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  }

  if (body.socials !== undefined) {
    const raw = body.socials && typeof body.socials === "object" ? (body.socials as Record<string, unknown>) : {}
    const instagram = socialHandle(raw.instagram)
    const tiktok = socialHandle(raw.tiktok)
    const youtube = socialHandle(raw.youtube)
    const linkedin = socialHandle(raw.linkedin)
    const bluesky = socialHandle(raw.bluesky)
    const twitter = socialHandle(raw.twitter)
    const urls = {
      instagram_url: socialUrl("instagram", instagram),
      tiktok_url: socialUrl("tiktok", tiktok),
      youtube_url: socialUrl("youtube", youtube),
      linkedin_url: socialUrl("linkedin", linkedin),
      bluesky_url: socialUrl("bluesky", bluesky),
      twitter_url: socialUrl("twitter", twitter),
    }
    const { error: metaError } = await supabase.auth.updateUser({
      data: { storelib_socials: { instagram, tiktok, youtube, linkedin, bluesky, twitter } },
    })
    if (metaError) console.error("[welcome] socials not marked", metaError.message)
    const db = createAdminClient()
    let { error } = await db.from("profiles").update(urls).eq("id", user.id)
    if (error && /linkedin|bluesky/i.test(`${error.message} ${error.code ?? ""}`)) {
      const { linkedin_url: _l, bluesky_url: _b, ...rest } = urls
      ;({ error } = await db.from("profiles").update(rest).eq("id", user.id))
    }
    /* Those columns are not on every database. The handles are already on the account. */
    if (error && !/column|schema cache|42703|PGRST204/i.test(`${error.message} ${error.code ?? ""}`)) {
      console.error("[welcome] socials not saved", error.code, error.message)
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  }

  if (body.name !== undefined) {
    const name = cleanName(body.name)
    if (!name || name.includes("@")) {
      return NextResponse.json({ error: "Type the name you go by." }, { status: 400, headers: NO_STORE })
    }
    /* The service role, for this person's own row only: the profile is theirs, the id is the session's. */
    const patch: { display_name: string; bio?: string | null } = { display_name: name }
    if (body.bio !== undefined) {
      if (body.bio !== null && typeof body.bio !== "string") {
        return NextResponse.json({ error: "That bio is not a line of text." }, { status: 400, headers: NO_STORE })
      }
      patch.bio = cleanBio(body.bio)
    }
    const db = createAdminClient()
    let { error } = await db.from("profiles").update(patch).eq("id", user.id)
    /* profiles.bio is added by RUN_PROFILE_COVER_BIO. Without it, the name still saves. */
    if (error && patch.bio !== undefined && /bio/i.test(`${error.message} ${error.code ?? ""}`)) {
      ;({ error } = await db.from("profiles").update({ display_name: name }).eq("id", user.id))
    }
    if (error) {
      console.error("[welcome] name not saved", error.code, error.message)
      return NextResponse.json({ error: "That did not save. Try again in a moment." }, { status: 500, headers: NO_STORE })
    }
    return NextResponse.json({ ok: true, name }, { headers: NO_STORE })
  }

  if (body.skip === true || body.done === true) {
    if (user.user_metadata?.[WELCOMED_KEY] !== true) {
      const { error } = await supabase.auth.updateUser({ data: { [WELCOMED_KEY]: true, [JOIN_STEP_KEY]: null } })
      if (error) console.error("[welcome] not marked", error.message)
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  }

  return NextResponse.json({ error: "Bad request" }, { status: 400, headers: NO_STORE })
}
