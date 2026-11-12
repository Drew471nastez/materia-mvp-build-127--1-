import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requestUser, signedOutAnswer } from "@/lib/businesses/server"
import { TEAM_STORE_COOKIE, leaveStore } from "@/lib/team/server"

/** POST { store }: leave a store's team. Your own account is untouched. */
export async function POST(req: Request) {
  const user = await requestUser(req)
  if (!user) return signedOutAnswer(req, NextResponse.json({ error: "Sign in again." }, { status: 401 }))
  const body = (await req.json().catch(() => null)) as { store?: unknown } | null
  const store = body?.store
  if (typeof store !== "string" || !/^[0-9a-f-]{36}$/i.test(store)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!(await leaveStore(createAdminClient(), user.id, store))) return NextResponse.json({ error: "Could not leave the team. Try again." }, { status: 500 })
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(TEAM_STORE_COOKIE)
  return res
}
