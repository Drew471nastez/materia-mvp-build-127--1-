import "server-only"

/**
 * THE START OF EVERY ROUND 37 CHAT ROUTE, IN ONE PLACE: communities on, a
 * signed in active member of this community (requireMember, with "view" to
 * read and "chat" to write, so a muted or banned member is refused there),
 * and the member's rate limit for the kind of call. A route then checks the
 * chat itself (a group the member is in, a conversation they are part of).
 */
import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "../flag"
import { RATE_LIMITS, rateBucket, type RateBucket } from "../limits"
import { requireMember } from "./context"
import { admin, type Db } from "./db"
import { NO_STORE, memberSubject, sessionUserId } from "./feed"

export type ChatRouteGate = Exclude<Awaited<ReturnType<typeof requireMember>>, NextResponse>

export async function chatRoute(communityId: string, action: "view" | "chat", bucket?: RateBucket): Promise<{ db: Db; gate: ChatRouteGate } | NextResponse> {
  const off = await requireCommunitiesOn()
  if (off) return off
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), action)
  if (gate instanceof NextResponse) return gate
  if (bucket) {
    const limited = await rateLimit({ bucket: rateBucket(bucket), subjects: [memberSubject(String(gate.viewer.userId))], windows: RATE_LIMITS[bucket], message: "Slow down a little. Try again in a moment." })
    if (limited) return limited
  }
  return { db, gate }
}

export function notFound(): NextResponse {
  return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
}

/** A refusal as JSON, its code (rules, chat_muted, ...) with it so the page can answer it. */
export function refusal(r: { error: string; status?: number; code?: string }): NextResponse {
  return NextResponse.json({ error: r.error, ...(r.code ? { code: r.code } : {}) }, { status: r.status ?? 400, headers: NO_STORE })
}

export function ok(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}
