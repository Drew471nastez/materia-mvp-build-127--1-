import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { ownerDownload } from "@/lib/storage/owner-download"
import { routeUser, signedOutOrRetry } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/products/files/<assetId>/download?name=<name shown in the editor>
 *
 * A creator's own file, for the product editor's Download: a signed storage
 * URL for that one file, good for two minutes, saved under its real name.
 * The decision is lib/storage/owner-download.ts (401 signed out, 404 missing
 * or someone else's, 403 flagged by the virus scan). The storage path and
 * bucket never leave the server, and the log line names the file id only.
 */

/** Far above a creator saving their files, far below a script walking ids. */
const OWNER_DOWNLOAD_WINDOWS = [
  { limit: 30, seconds: 60 },
  { limit: 300, seconds: 3600 },
] as const

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params

  let userId: string | null = null
  try {
    const supabase = await createClient()
    const who = await routeUser()
    const user = who.kind === "user" ? who.user : null
    userId = user?.id ?? null
  } catch {
    userId = null
  }
  if (!userId) {
    return signedOutOrRetry(NextResponse.json({ error: "Sign in to download this file." }, { status: 401, headers: NO_STORE }))
  }

  const limited = await rateLimit({
    bucket: "owner-download",
    subjects: [`user:${userId}`, addressSubject(request)],
    windows: OWNER_DOWNLOAD_WINDOWS,
    message: "That is a lot of downloads at once. Wait a minute and try again.",
  })
  if (limited) return limited

  try {
    const name = new URL(request.url).searchParams.get("name")
    const answer = await ownerDownload({ admin: createAdminClient() }, { userId, assetId, name })
    if (answer.status === 200) console.info("[owner-download] link issued for asset", assetId)
    else if (answer.status >= 500) console.error("[owner-download] could not sign asset", assetId)
    return NextResponse.json(answer.body, { status: answer.status, headers: NO_STORE })
  } catch {
    /* The id only: an error's message can carry a path or a row. */
    console.error("[owner-download] failed for asset", assetId)
    return NextResponse.json({ error: "Download failed. Try again." }, { status: 500, headers: NO_STORE })
  }
}
