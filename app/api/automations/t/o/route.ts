import { NextResponse, after, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isToken } from "@/lib/automations/tracking"
import { recordOpen } from "@/lib/automations/track-events"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")

/**
 * The open pixel of an automated email (lib/automations/tracking.ts). The
 * image goes back at once; the first open is written after, and only the
 * first (lib/automations/track-events recordOpen).
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("k")
  if (isToken(token)) {
    after(async () => {
      try {
        await recordOpen(createAdminClient(), token)
      } catch {
        /* An open that is not counted is not worth an error. */
      }
    })
  }
  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  })
}
