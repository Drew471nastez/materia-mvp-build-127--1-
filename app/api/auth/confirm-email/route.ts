import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { routeUser } from "@/lib/auth/route-user"
import { confirmAccountCode, type CodeDb, type Limiter } from "@/lib/auth/email-code"

export const runtime = "nodejs"

/**
 * POST /api/auth/confirm-email  { userId, code }
 *
 * Marks the account verified only for a code that is this account's AND was
 * mailed to its current address, with five wrong codes allowed before every
 * live one is burned (lib/auth/email-code.ts, lib/auth/code-guard.ts).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const who = await routeUser({ fresh: false })
    const limit: Limiter = async (bucket, subjects, windows) => !!(await rateLimit({ bucket, subjects, windows }))
    const answer = await confirmAccountCode(
      { userId: body?.userId, code: body?.code, sessionUserId: who.kind === "user" ? who.user.id : null, addressSubject: addressSubject(request) },
      { db: createAdminClient() as unknown as CodeDb, limit },
    )
    return NextResponse.json(answer.body, { status: answer.status, headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[confirm-email] Error in confirm-email:", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
