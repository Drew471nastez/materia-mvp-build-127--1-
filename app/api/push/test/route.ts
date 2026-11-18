import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { pushRequestUser } from "@/lib/push/request-user"
import { authUnavailableResponse } from "@/lib/auth/route-user"
import { sendPushToUser } from "@/lib/push/sender"
import { testAnswer } from "@/lib/push/test-result"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "private, no-store" }

/**
 * POST /api/push/test
 *
 * Settings, Notifications, Send a test notification. Sends one push to the
 * signed in person's own phones and browsers, through the same sender a sale
 * uses (lib/push/sender.ts, so the same devices and the same Firebase key),
 * and answers what happened (lib/push/test-result.ts):
 *
 *   { outcome, message, result }   outcome: sent, partly, no_devices,
 *                                  not_configured, failed
 *
 * Only ever the caller's own devices: the user comes from the session, never
 * from the body. Rate limited so it cannot be used to buzz a phone.
 */
export async function POST(req: Request) {
  const { user, unavailable } = await pushRequestUser(req)
  if (!user && unavailable) return authUnavailableResponse()
  if (!user) return NextResponse.json({ error: "sign_in" }, { status: 401, headers: NO_STORE })
  const limited = await rateLimit({ bucket: "push-test", subjects: [`user:${user.id}`], windows: [{ limit: 5, seconds: 60 }, { limit: 40, seconds: 86400 }], message: "That is a lot of tests. Try again in a minute." })
  if (limited) return limited

  const result = await sendPushToUser(user.id, {
    title: "Test notification",
    body: "Sales and orders will show up like this.",
    /* A tap opens Sales, where a real sale's tap goes. */
    data: { type: "notification", kind: "test", url: "/app/sales" },
    collapseKey: "push-test",
  })
  const answer = testAnswer(result)
  console.log(`[push/test] ${user.id.slice(0, 8)}: ${answer.outcome}: ${answer.message}`)
  return NextResponse.json(answer, { headers: NO_STORE })
}
