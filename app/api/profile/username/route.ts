import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { slugifyUsername, usernameSuggestions } from "@/lib/profile/username"
import { isValidUsername } from "@/lib/reserved-words"

/**
 * GET /api/profile/username?q=andrewrullz&name=Andrew%20Rullz
 *   → { username, valid, error?, available, suggestions[] }
 *
 * Is this handle free, and if not, what else. Called as somebody types, which
 * is the only way a handle field is bearable: the alternative is pressing save
 * and being told no, at which point you have to invent another one with no idea
 * which of them are taken.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT AN AUTHORITATIVE ANSWER, AND WHY THAT IS FINE
 * ---------------------------------------------------------------------------
 * Two people can be told "free" for the same handle a second apart. The write
 * is what settles it — PATCH /api/profile re-checks and the database has the
 * final say — so this is a courtesy, not a lock. Trying to make it authoritative
 * would mean reserving handles nobody ends up taking.
 *
 * Signed in only. Handle availability is a slow enumeration of who exists, and
 * there is no reason for it to be open to anyone who is not in the middle of
 * choosing one.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const url = new URL(req.url)
  const raw = (url.searchParams.get("q") ?? "").trim()
  const name = (url.searchParams.get("name") ?? "").trim()
  const username = slugifyUsername(raw)

  const verdict = isValidUsername(username)
  if (!verdict.valid) {
    return NextResponse.json({
      username,
      valid: false,
      error: verdict.error,
      available: false,
      // Still offer a way out. A field that says "too short" and nothing else
      // leaves somebody staring at their own name wondering what it wants.
      suggestions: name ? usernameSuggestions(username || name, name) : [],
    })
  }

  const admin = createAdminClient()

  /**
   * Case-insensitively, and excluding the caller.
   *
   * `ilike` rather than `eq` because handles are matched case-insensitively
   * everywhere they are READ — /member/[username] uses ilike — so treating
   * "Andrew" and "andrew" as different here would hand out a handle that
   * resolves to somebody else's profile.
   *
   * Excluding the caller matters for the ordinary case of saving a form without
   * changing the handle: without it, your own username is reported as taken and
   * the save is refused for a value that is already yours.
   */
  const { data: clash } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .neq("id", user.id)
    .limit(1)
    .maybeSingle()

  const available = !clash
  return NextResponse.json({
    username,
    valid: true,
    available,
    suggestions: available ? [] : await freeOnly(usernameSuggestions(username, name), user.id),
  })
}

/**
 * Offering a taken handle as the fix for a taken handle is the one thing this
 * must not do. One query for the whole set rather than one each, because this
 * runs on a keystroke.
 */
async function freeOnly(candidates: string[], selfId: string): Promise<string[]> {
  if (candidates.length === 0) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from("profiles")
    .select("username")
    .in("username", candidates)
    .neq("id", selfId)
  const taken = new Set((data ?? []).map((r: { username: string | null }) => (r.username ?? "").toLowerCase()))
  return candidates.filter((c) => !taken.has(c.toLowerCase())).slice(0, 3)
}
