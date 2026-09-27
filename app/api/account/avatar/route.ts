import { NextResponse, type NextRequest } from "next/server"
import { revalidateTag } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { readCurrentUser } from "@/lib/auth/current-user"
import { saveProfilePhoto, type PhotoClient } from "@/lib/account/avatar-save"
import { followProfileIdentity, type FollowClient } from "@/lib/account/profile-follow"
import { sweepReplacedAvatar } from "@/lib/account/avatar-files"
import { creatorTag } from "@/lib/commerce/product-page-cache"

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
 * Either way the account is marked as having chosen (AVATAR_CHOSEN), first,
 * so the sign in callback never puts the Google picture back over a removal,
 * the profile is written and read back on the person's own client (row level
 * security decides, as for every other profile field), and the creator page
 * header follows it. The order and the reasons are lib/account/avatar-save.
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

  const saved = await saveProfilePhoto(supabase as unknown as PhotoClient, user, url)
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status, headers: NO_STORE })

  /*
    EVERY COPY OF THE OLD PHOTO FOLLOWS IT. The OnePage keeps one in its row
    and another in the copy taken at publish, and that second one is what the
    tab's icon is built from — so removing the photo here used to leave the
    old face on the OnePage's tab until the page was republished
    (lib/account/profile-follow). A copy somebody chose in the OnePage editor
    is left alone.
  */
  const followed = await followProfileIdentity(supabase as unknown as FollowClient, user.id, {
    photo: { before: saved.previous, after: url },
  })

  /* And the file itself, once no row names it (lib/account/avatar-files). */
  if (saved.previous && saved.previous !== url) {
    await sweepReplacedAvatar(user.id, saved.previous, saved.creatorId ?? followed.creatorId)
  }

  /* The public creator page reads the profile and its header through a
     cache shared between visitors (lib/commerce/product-page-cache): it
     shows the new photo on its next view, not a minute later. */
  try {
    revalidateTag(creatorTag(user.id), "max")
    if (saved.creatorId) revalidateTag(creatorTag(saved.creatorId), "max")
  } catch {
    /* Outside a request that can revalidate: the cache's own minute does it. */
  }

  return NextResponse.json({ ok: true, url }, { headers: NO_STORE })
}
