import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requestUser, signedOutAnswer } from "@/lib/businesses/server"
import { TEAM_STORE_COOKIE } from "@/lib/team/server"

/**
 * POST { store: creatorId | null }: work in a store you are on, or go back
 * to your own account. Only a store this account is an active member of is
 * set; every page asks the database again anyway (lib/team/server.ts).
 */
export async function POST(req: Request) {
  const user = await requestUser(req)
  if (!user) return signedOutAnswer(req, NextResponse.json({ error: "Sign in again." }, { status: 401 }))
  const body = (await req.json().catch(() => null)) as { store?: unknown } | null
  const store = body?.store
  if (store === null || store === undefined) {
    const res = NextResponse.json({ ok: true, store: null })
    res.cookies.delete(TEAM_STORE_COOKIE)
    return res
  }
  if (typeof store !== "string" || !/^[0-9a-f-]{36}$/i.test(store)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const { data } = await createAdminClient().from("store_team_members").select("id").eq("creator_id", store).eq("user_id", user.id).eq("status", "active").maybeSingle()
  if (!data) return NextResponse.json({ error: "You are not on that store's team." }, { status: 403 })
  const res = NextResponse.json({ ok: true, store })
  res.cookies.set(TEAM_STORE_COOKIE, store, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 90 })
  return res
}
