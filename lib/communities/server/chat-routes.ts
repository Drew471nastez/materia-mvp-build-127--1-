import "server-only"

/**
 * WHAT EVERY ROUND 37 CHAT ROUTE SHARES. Each route checks, in its own
 * body so tests/communities-security.test.ts can read it: communities on,
 * a signed in active member of this community (requireMember, with "view"
 * to read and "chat" to write, so a muted or banned member is refused
 * there), then the member's rate limit for the kind of call (chatLimit).
 * A route then checks the chat itself (a group the member is in, a
 * conversation they are part of).
 */
import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { RATE_LIMITS, rateBucket, type RateBucket } from "../limits"
import type { requireMember } from "./context"
import { NO_STORE, memberSubject } from "./feed"

export type ChatRouteGate = Exclude<Awaited<ReturnType<typeof requireMember>>, NextResponse>

/** The member's rate limit for one kind of chat call; null when within it, or the 429 to return. */
export async function chatLimit(gate: ChatRouteGate, bucket: RateBucket): Promise<NextResponse | null> {
  return rateLimit({ bucket: rateBucket(bucket), subjects: [memberSubject(String(gate.viewer.userId))], windows: RATE_LIMITS[bucket], message: "Slow down a little. Try again in a moment." })
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
