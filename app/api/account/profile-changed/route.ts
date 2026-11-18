import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
/* Round 52: the token's verified signature, with no Supabase Auth round trip (lib/auth/route-user). */
import { readerForRequest } from "@/lib/auth/route-user"
import { followProfileIdentity, type FollowClient } from "@/lib/account/profile-follow"
import { identityChanged } from "@/lib/account/identity-caches"
import { createAdminClient } from "@/lib/supabase/admin"
import { creatorPagesChanged } from "@/lib/storefront/creator-page-purge"
import { onePageChangedFor } from "@/lib/onepage/public-cache"
import { exactIlike } from "@/lib/onepage/username"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  THE NAME CHANGED IN SETTINGS, AND EVERY COPY OF IT FOLLOWS
 * ===========================================================================
 * Settings › General saves the profile straight from the browser, on the
 * person's own client, through row level security (components/app/
 * settings-form-new.tsx). That is fine for the profile itself and no help at
 * all to the five other rows that keep a copy of the name: the OnePage's
 * title, the copy taken when it was published, the SEO card's Meta title,
 * the creator row and the creator page's store name. Renaming yourself left
 * the old name in the tab of your own OnePage.
 *
 * So the form calls this straight after it has saved, with the name it was
 * showing before. The server reads the name the profile holds NOW, and moves
 * only the copies that still hold the old one (lib/account/profile-follow) —
 * a page title somebody typed is never touched. Then the caches the public
 * pages read the profile through are expired, the creator page's and the live
 * website's, so the new name is on the next view.
 *
 * `previous` comes from the caller and decides nothing but WHICH of this
 * person's own copies move; every row it can reach belongs to the signed in
 * user and is written on their own client.
 */
const NO_STORE = { "Cache-Control": "no-store" }

export async function POST(request: NextRequest) {
  let body: { previousName?: unknown; previousPhoto?: unknown; previousHandle?: unknown }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const supabase = await createClient()
  const current = await readerForRequest()
  if (current.state === "indeterminate") {
    return NextResponse.json({ error: "Could not reach Storelib." }, { status: 503, headers: NO_STORE })
  }
  if (!current.user) return NextResponse.json({ error: "Your session ended." }, { status: 401, headers: NO_STORE })
  const user = current.user

  const { data: profile } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle()
  if (!profile) return NextResponse.json({ ok: true, followed: null }, { headers: NO_STORE })

  const previousName = typeof body.previousName === "string" ? body.previousName : undefined
  const previousPhoto = typeof body.previousPhoto === "string" || body.previousPhoto === null ? (body.previousPhoto as string | null) : undefined

  const followed = await followProfileIdentity(supabase as unknown as FollowClient, user.id, {
    ...(previousName !== undefined ? { name: { before: previousName, after: profile.display_name } } : {}),
    ...(previousPhoto !== undefined ? { photo: { before: previousPhoto, after: profile.avatar_url } } : {}),
  })

  /* The creator page's cache and the live website's, expired: the next view has the new name (lib/account/identity-caches). */
  await identityChanged({ userId: user.id, creatorId: followed.creatorId })

  /*
    AND A NEW HANDLE, BOTH ADDRESSES (round AW). Settings renamed the handle and purged nothing: the CDN went on
    serving the "not found" it held for the new address (storelib.com/<new>, storelib.me/<new>) for minutes, and the
    old address's page. identityChanged above clears the addresses of the handle the profile holds now; the old one
    is cleared here, and only when it is one this account really gave up (username_history), so a caller can never
    make Storelib purge somebody else's pages.
  */
  const previousHandle = typeof body.previousHandle === "string" ? body.previousHandle.trim().slice(0, 64) : ""
  if (previousHandle) {
    try {
      const { data: gaveUp } = await createAdminClient()
        .from("username_history")
        .select("old_username")
        .eq("user_id", user.id)
        .ilike("old_username", exactIlike(previousHandle.toLowerCase()))
        .limit(1)
        .maybeSingle()
      const old = (gaveUp as { old_username?: string | null } | null)?.old_username
      if (old) {
        await creatorPagesChanged({ userId: user.id, handles: [old] })
        await onePageChangedFor(user.id, [old])
      }
    } catch {
      /* Not read: the CDN's own minutes do it. */
    }
  }

  return NextResponse.json({ ok: true, followed }, { headers: NO_STORE })
}
