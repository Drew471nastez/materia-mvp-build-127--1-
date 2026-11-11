import { NextResponse } from "next/server"

import { routeUser } from "@/lib/auth/route-user"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { accountAttributionRow, isNewAccount, platformTouchesFrom } from "@/lib/attribution/account"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/auth/signup-attribution  { touches }
 *
 * Where a new Storelib account's visit came from, written once
 * (lib/attribution/account.ts says what is checked). Only for the signed in
 * account itself, only while it is new, only the first time: a second call
 * changes nothing. A database without part 346 refuses the write quietly
 * and the account is exactly as it was. Always answers 204: nothing here is
 * ever in the way of signing up, and the answer says nothing about anybody.
 */
export async function POST(request: Request) {
  const done = () => new NextResponse(null, { status: 204 })
  try {
    /* The request's one read, Supabase Auth first for created_at (round rel2-auth); not knowing is "nothing to record", as before. */
    const who = await routeUser({ full: true })
    const user = who.kind === "user" ? who.user : null
    if (!user || !isNewAccount(user.created_at)) return done()
    const text = await request.text()
    if (text.length > 4000) return done()
    let body: { touches?: unknown } = {}
    try {
      body = JSON.parse(text || "{}")
    } catch {
      body = {}
    }
    const row = accountAttributionRow(user, platformTouchesFrom(body.touches, getMainDomain()))
    const { error } = await createAdminClient().from("account_attribution").upsert(row, { onConflict: "user_id", ignoreDuplicates: true })
    if (error && !/does not exist|could not find|42P01|PGRST205/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) {
      console.error("[signup-attribution] write failed:", error.code ?? "")
    }
  } catch {
    /* never in the way of signing up */
  }
  return done()
}
