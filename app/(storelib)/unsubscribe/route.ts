import { type NextRequest } from "next/server"

import { answerUnsubscribeLink } from "@/lib/subscriber-unsubscribe-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The unsubscribe link at the foot of a creator's email. A route, not a
 * React page: the answer is one small HTML document with no script, drawn
 * by lib/subscriber-unsubscribe-page.ts, the same page the button posts to
 * and gets back. Opening it only asks; see lib/subscriber-unsubscribe-server.ts.
 */
export async function GET(request: NextRequest) {
  return answerUnsubscribeLink(request)
}
