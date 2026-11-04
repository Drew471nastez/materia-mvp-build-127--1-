/**
 * Where an answer to the agent's question lands.
 *
 * The run that asked is blocked inside a different request, polling a row.
 * This writes the row. The two never speak directly and cannot: on a
 * serverless platform they are not the same process, and often not the same
 * machine — see lib/sites/agent/asking.ts.
 */

import { type NextRequest, NextResponse } from "next/server"

import { recordAnswer } from "@/lib/sites/agent/asking"
import { getSite } from "@/lib/sites/projects"
import { routeCreatorId } from "@/lib/creators/current"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Long enough for a sentence. The column is capped again on the way in. */
const MAX_ANSWER = 2_000

export async function POST(request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params

  /* Asked fresh, with a ceiling: a 503 with Try again when Supabase Auth did not answer, never "sign in" (lib/auth/route-user). */
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const creatorId = who.kind === "user" ? await routeCreatorId(who.user.id) : null
  if (creatorId === "unavailable") return authUnavailableResponse()
  if (!creatorId) {
    return NextResponse.json({ error: "Only creators can edit sites." }, { status: 403 })
  }

  /**
   * RLS decides, through the user's own client. A site somebody else owns
   * reads as absent, which is the right answer to both "does not exist" and
   * "not yours" — and it is the ONLY ownership check here, deliberately: the
   * write below uses the service role, so this is what stands between one
   * creator and another creator's run.
   */
  const site = await getSite(siteId)
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 })

  let body: { questionId?: unknown; answer?: unknown; skipped?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const questionId = typeof body.questionId === "string" ? body.questionId : ""
  if (!questionId) return NextResponse.json({ error: "Which question?" }, { status: 400 })

  const skipped = body.skipped === true
  const answer = typeof body.answer === "string" ? body.answer.trim().slice(0, MAX_ANSWER) : ""

  if (!skipped && !answer) {
    return NextResponse.json({ error: "Write an answer, or skip it." }, { status: 400 })
  }

  const result = await recordAnswer({ siteId, questionId, answer, skipped })
  if (!result.ok) {
    /**
     * 409, not 400. Nothing was malformed — the run stopped waiting, which
     * happens when somebody answers twice or comes back after the timeout.
     * The editor says so rather than showing "invalid request".
     */
    return NextResponse.json({ error: result.reason }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
