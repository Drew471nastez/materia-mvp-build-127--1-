import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { looksLikeVisitor } from "@/lib/onepage/visit-gate"
import { POLL_VOTER_COOKIE, validVoterId } from "@/lib/onepage/poll"
import { castVote, pollStateFor } from "@/lib/onepage/poll-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }
const YEAR = 60 * 60 * 24 * 365

/**
 * A OnePage poll (lib/onepage/poll-server.ts).
 *
 * GET  ?onepage_id&block_id   -> { voted, tally, open }: this visitor's vote and,
 *                                once they voted and the creator shows them, the totals
 * POST { onepage_id, block_id, option_id } -> { voted, already, tally }
 *
 * ONE VOTE EACH. The visitor is a cookie of their own (sl_pv, http only,
 * random, a year), and the vote is kept under it, hashed, with a unique
 * index on page, poll and that key. Clearing cookies to vote again is held
 * back by a limit per address on every poll of the page: a handful of votes
 * a day from one address, which a household sharing a connection still
 * fits in. A robot, a prefetch or another site's request is never counted.
 */
async function voterIdOf(): Promise<string | null> {
  const raw = (await cookies()).get(POLL_VOTER_COOKIE)?.value
  return validVoterId(raw) ? raw : null
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const state = await pollStateFor(createAdminClient(), { onepageId: url.searchParams.get("onepage_id"), blockId: url.searchParams.get("block_id"), voterId: await voterIdOf() })
  return NextResponse.json(state, { headers: noStore })
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: noStore })
  }
  if (!looksLikeVisitor(request.headers)) return NextResponse.json({ error: "not_counted" }, { status: 403, headers: noStore })
  const limited = await rateLimit({
    bucket: "onepage-poll",
    subjects: [addressSubject(request)],
    windows: [{ limit: 8, seconds: 3600 }, { limit: 20, seconds: 86400 }],
    message: "That is a lot of votes from one connection. Try again tomorrow.",
  })
  if (limited) return limited
  let voterId = await voterIdOf()
  const fresh = !voterId
  if (!voterId) voterId = randomBytes(16).toString("hex")
  const answer = await castVote(createAdminClient(), { onepageId: body.onepage_id, blockId: body.block_id, optionId: body.option_id, voterId })
  const res = answer.ok === false ? NextResponse.json({ error: answer.code }, { status: answer.status, headers: noStore }) : NextResponse.json({ voted: answer.voted, already: answer.already, tally: answer.tally }, { headers: noStore })
  if (fresh && answer.ok) res.cookies.set(POLL_VOTER_COOKIE, voterId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: YEAR, path: "/" })
  return res
}
