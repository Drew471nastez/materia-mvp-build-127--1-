import { type NextRequest, NextResponse } from "next/server"
import { uploadStore } from "@/lib/team/uploads"

import { checkDirectUpload, isDirectUploadBucket, ownedDirectPath } from "@/lib/security/uploads/direct"
import { runAfterResponse } from "@/lib/security/uploads/pipeline"
import { UPLOAD_HEADERS } from "@/lib/storage/upload-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * POST /api/storage/uploaded   { bucket, path }
 *
 * "That upload finished." Every place in Storelib where a browser writes
 * straight into a public bucket says this when it is done, and gets `{ ok:
 * true }` back at once. Nothing on the page waits for it, nothing on the page
 * changes because of it, and nothing on the page is told what it found.
 *
 * What it does happens after the answer has gone (next/server after()): the
 * central check reads the file's first and last bytes out of storage and,
 * if the file is not what that bucket is for, deletes it and writes a row to
 * the security log (lib/security/uploads/direct.ts). That is the only way a
 * signed upload URL can be held to what was declared when it was handed out,
 * because the URL itself cannot limit what is sent through it.
 *
 * It is not the only way: the hourly picture pass catches what never got
 * here. This one makes it seconds instead of an hour.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401, headers: UPLOAD_HEADERS })

    const body = (await request.json().catch(() => null)) as { bucket?: unknown; path?: unknown } | null
    const bucket = body?.bucket
    const path = body?.path
    if (!isDirectUploadBucket(bucket) || typeof path !== "string") {
      return NextResponse.json({ ok: false }, { status: 400, headers: UPLOAD_HEADERS })
    }

    const admin = createAdminClient()
    const [{ data: own }, store] = await Promise.all([admin.from("creators").select("id").eq("user_id", user.id).maybeSingle(), uploadStore(admin, user.id)])
    const creator = own as { id: string } | null
    /* Round 41: a team member working in a store, with an area that uploads (lib/team/uploads), writes into that store's folders (its id, and its owner's account for the Files library and videos). */
    const team = store.kind === "store" ? [store.acting.creatorId, store.acting.ownerUserId] : []
    /* Their own folder only: the id a page builds a path from is either the
       signed in user's or their creator row's (or the store's they work in), and nothing else is theirs. */
    if (!ownedDirectPath(path, [user.id, creator?.id, ...team])) {
      return NextResponse.json({ ok: false }, { status: 403, headers: UPLOAD_HEADERS })
    }

    runAfterResponse(() => checkDirectUpload(admin, { bucket, path }, { userId: user.id, creatorId: store.kind === "store" ? store.acting.creatorId : (creator?.id ?? null) }))
    return NextResponse.json({ ok: true }, { headers: UPLOAD_HEADERS })
  } catch {
    /* This is a note to the server, not a step in anybody's upload. */
    return NextResponse.json({ ok: false }, { status: 200, headers: UPLOAD_HEADERS })
  }
}
