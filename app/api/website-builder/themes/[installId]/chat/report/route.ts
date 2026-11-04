/**
 * Report one Ask Storelib answer: "I can report the prompt."
 *
 * POST { messageId, reason?, engine? }. The message is the question or the
 * reply of one exchange in the signed in creator's own conversation on this
 * website. Ownership of the install is proved against their own client, the
 * message is found through that same client (so somebody else's is simply
 * not found), and the report is written by the server alone: no client can
 * read or write the reports table. See reportThemeExchange.
 *
 * Nothing about the report, the reason or the words is logged.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { rateLimit } from "@/lib/api/rate-limit"
import { ownThemeInstall, REPORT_REASON_MAX, reportThemeExchange } from "@/lib/website-builder/agent/chat"
import { authUnavailableResponse } from "@/lib/auth/route-user"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const BodySchema = z.object({
  messageId: z.string().uuid(),
  reason: z.string().max(REPORT_REASON_MAX * 2).nullable().optional(),
  engine: z.string().max(120).nullable().optional(),
})

export async function POST(request: Request, context: { params: Promise<{ installId: string }> }) {
  const { installId } = await context.params

  /* JSON only: a cross site form can post text/plain, never this. */
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return NextResponse.json({ error: "Send the report as JSON." }, { status: 415 })
  }

  const owned = await ownThemeInstall(installId)
  if (!owned.ok && owned.status === 503) return authUnavailableResponse()
  if (!owned.ok) {
    return NextResponse.json(
      { error: owned.status === 401 ? "Sign in to report an answer." : "Website not found." },
      { status: owned.status },
    )
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "That answer could not be reported." }, { status: 400 })

  const limited = await rateLimit({
    bucket: "ask-report",
    subjects: [`creator:${owned.creatorId}`],
    windows: [
      { limit: 10, seconds: 60 },
      { limit: 60, seconds: 86400 },
    ],
    message: "That is a lot of reports at once. Try again in a minute.",
  })
  if (limited) return limited

  const result = await reportThemeExchange({
    installId,
    creatorId: owned.creatorId,
    messageId: parsed.data.messageId,
    reason: parsed.data.reason ?? null,
    engine: parsed.data.engine ?? null,
  })
  if (result.ok) return NextResponse.json({ reported: true })
  return NextResponse.json(
    {
      error:
        result.reason === "not_found"
          ? "That answer is not in a conversation on this website."
          : result.reason === "not_set_up"
            ? "Reports turn on once the database update is run."
            : "The report could not be sent. Try again in a moment.",
      reason: result.reason,
    },
    { status: result.status },
  )
}
