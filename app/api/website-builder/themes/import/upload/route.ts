import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIBRARY_FULL_CODE, LIBRARY_FULL_MESSAGE, librarySlotsLeft } from "@/lib/website-builder/library-limit"
import { IMPORT_BUCKET, importPathFor, importSizeProblem, IMPORT_TOO_LARGE } from "@/lib/website-builder/theme-import"
import { rateLimit } from "@/lib/api/rate-limit"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

const THEME_IMPORT_WINDOWS = [
  { limit: 5, seconds: 60 },
  { limit: 30, seconds: 3600 },
] as const

export const runtime = "nodejs"

/**
 * POST /api/website-builder/themes/import/upload   body: { size }
 *
 * The first step of an import: a place in storage for the package, so the
 * file goes there straight from the browser and never through a function's
 * 4.5 MB body limit (lib/website-builder/theme-import.ts). Answers with a
 * signed upload URL for one path under the signed in person's own id, with
 * a name this route chose. Nothing the request sends becomes part of a path.
 *
 * A full library and a file over the limit are refused here, before a byte
 * is uploaded. The import route checks both again, from storage's own record
 * of the file, because a size the page declares is only a promise.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  /* A package is up to 50 MB and a library holds five: a few a minute is
     somebody importing, more is somebody filling the bucket. */
  const limited = await rateLimit({
    bucket: "theme-import",
    subjects: [`user:${user.id}`],
    windows: THEME_IMPORT_WINDOWS,
    message: "That is a lot of imports in a short time. Wait a minute and try again.",
  })
  if (limited) return limited

  const body = (await req.json().catch(() => null)) as { size?: unknown } | null
  const problem = importSizeProblem(body?.size)
  if (problem) return NextResponse.json({ error: problem }, { status: problem === IMPORT_TOO_LARGE ? 413 : 400 })

  if ((await librarySlotsLeft(supabase, creator.id)) === 0) {
    return NextResponse.json({ error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE }, { status: 400 })
  }

  const path = importPathFor(user.id, randomUUID())
  const { data, error } = await createAdminClient().storage.from(IMPORT_BUCKET).createSignedUploadUrl(path)
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Could not start the upload. Try again." }, { status: 500 })
  }
  return NextResponse.json({ url: data.signedUrl, path })
}
