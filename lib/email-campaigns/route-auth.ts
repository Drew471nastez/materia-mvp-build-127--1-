/**
 * The store a campaign route acts for, read on the server from the session
 * cookie: the signed in owner's own, or (round 40) the store a team member
 * works in when their permissions cover the route's area (lib/team,
 * requireTeamPermission). Every route checks ownership again with the
 * creator id this returns before it touches a campaign with the service role.
 */
import "server-only"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTeamPermission } from "@/lib/team/server"
import type { TeamArea } from "@/lib/team/permissions"

export interface CreatorContext {
  userId: string
  userEmail: string | null
  creatorId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
}

/**
 * `area`: the part of the store the route is (lib/team/permissions): email is
 * Marketing; a community route says Community, a membership Products. A
 * member without it is answered 403; signed out 401; no store 404.
 */
export async function requireCreator(area: TeamArea = "marketing"): Promise<CreatorContext | NextResponse> {
  const gate = await requireTeamPermission(area)
  if (gate instanceof NextResponse) {
    if (gate.status === 401) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 })
    const body = (await gate.clone().json().catch(() => ({}))) as { error?: string }
    return gate.status === 403 && body.error === "Set up your store first." ? NextResponse.json({ error: "Set up your store before sending email." }, { status: 404 }) : gate
  }
  /* `user` is the signed in person's own client: for a member it reads their own account, never the store's, so nothing here reads the store with it. */
  return { userId: gate.userId, userEmail: gate.userEmail, creatorId: gate.creatorId, user: await createClient(), admin: gate.db ?? createAdminClient() }
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
