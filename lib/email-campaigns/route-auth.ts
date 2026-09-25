/**
 * The signed-in creator a campaign route acts for, read on the server from
 * the session cookie. Every route checks ownership again with the creator id
 * this returns before it touches a campaign with the service role.
 */
import "server-only"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export interface CreatorContext {
  userId: string
  userEmail: string | null
  creatorId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
}

export async function requireCreator(): Promise<CreatorContext | NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 })
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Set up your store before sending email." }, { status: 404 })
  return { userId: user.id, userEmail: user.email ?? null, creatorId: creator.id, user: supabase, admin: createAdminClient() }
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse
}

/** A JSON body, or an empty object when there is none or it is not JSON. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const noStore = { "Cache-Control": "no-store" }
