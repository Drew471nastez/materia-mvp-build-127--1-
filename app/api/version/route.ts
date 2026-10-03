/**
 * Which deploy is live: the id of the deploy that answered this request.
 *
 * A tab compares it with the id its own code was built with (lib/ui/
 * new-deploy.ts) when it comes back into view, and a tab that is behind
 * loads its next page fully instead of asking for code that may be gone.
 *
 * Asked with a plain fetch, which carries no deployment header, so skew
 * protection does not pin it to the tab's own deploy. Never cached: an
 * answer from a cache is an answer about an older deploy.
 */

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export function GET() {
  /* The same value Next writes into the client build, and Vercel's own name for it. */
  const built = process.env.NEXT_DEPLOYMENT_ID as unknown
  const deploymentId = (typeof built === "string" && built) || process.env.VERCEL_DEPLOYMENT_ID || null
  return NextResponse.json({ deploymentId }, { headers: { "Cache-Control": "no-store, max-age=0" } })
}
