import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { readCurrentUser } from "@/lib/auth/current-user"
import { AVATAR_CHOSEN } from "@/lib/account/avatar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  THE PROFILE PHOTO, SAVED (Settings, General)
 * ===========================================================================
 *   POST { url }    the photo just uploaded to the person's own folder in
 *                   the avatars bucket (components/app/settings/profile-photo)
 *   POST { url: null }   removes it: the app shows the initials everywhere
 *
 * Either way the account is marked as having chosen (AVATAR_CHOSEN), so the
 * sign in callback never puts the Google picture back over a removal
 * (lib/account/avatar.ts). The profile row is written with the person's own
 * client, so row level security decides as for every other profile field.
 */

const NO_STORE = { "Cache-Control": "no-store" }

/** Only a public address inside this person's own folder of the avatars bucket. */
function ownPhoto(url: string, userId: string): boolean {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
  if (!base) return false
  return url.startsWith(`${base}/storage/v1/object/public/avatars/${userId}/`) && url.length < 1024 && !/[\s"'<>]/.test(url)
}

export async function POST(request: NextRequest) {
  let body: { url?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: NO_STORE })
  }
  if (body.url !== null && typeof body.url !== "string") {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: NO_STORE })
  }

  const supabase = await createClient()
  const current = await readCurrentUser(supabase)
  if (current.state === "indeterminate") {
    return NextResponse.json({ error: "Could not reach Storelib. Check your connection and try again." }, { status: 503, headers: NO_STORE })
  }
  if (!current.user) return NextResponse.json({ error: "Your session ended. Sign in again to change this." }, { status: 401, headers: NO_STORE })
  const user = current.user

  const url = body.url as string | null
  if (url !== null && !ownPhoto(url, user.id)) {
    return NextResponse.json({ error: "That photo is not in your folder." }, { status: 400, headers: NO_STORE })
  }

  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id)
  if (error) {
    console.error(`[account/avatar] not saved (${error.code ?? "unknown"})`)
    return NextResponse.json({ error: url ? "The photo did not save. Try again in a moment." : "The photo was not removed. Try again in a moment." }, { status: 500, headers: NO_STORE })
  }

  /* Remembered on the account, so a later sign in with Google leaves the choice alone. */
  if (user.user_metadata?.[AVATAR_CHOSEN] !== true) {
    const { error: metaError } = await supabase.auth.updateUser({ data: { [AVATAR_CHOSEN]: true } })
    if (metaError) console.error(`[account/avatar] choice not kept on the account (${metaError.code ?? metaError.status ?? "unknown"})`)
  }

  return NextResponse.json({ ok: true, url }, { headers: NO_STORE })
}
