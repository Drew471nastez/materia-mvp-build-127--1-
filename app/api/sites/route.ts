/**
 * Creating a site.
 *
 * The plan gate lives in `createSite`, not here, so it applies to every caller
 * — this route, a future agent action, an import. A check written in a route
 * handler is a check the next entry point forgets.
 */

import { type NextRequest, NextResponse } from "next/server"

import { createSite } from "@/lib/sites/projects"
import { routeCreatorId } from "@/lib/creators/current"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"
import { creatorSitePlan } from "@/lib/sites/plan-server"
import { blankProject } from "@/lib/sites/starter"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_PROMPT = 2000

export async function POST(request: NextRequest) {
  /* Asked fresh, with a ceiling: a 503 with Try again when Supabase Auth did not answer, never "sign in" (lib/auth/route-user). */
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const creatorId = who.kind === "user" ? await routeCreatorId(who.user.id) : null
  if (creatorId === "unavailable") return authUnavailableResponse()
  if (!creatorId) {
    return NextResponse.json({ error: "Only creators can build sites." }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) return NextResponse.json({ error: "Give your site a name." }, { status: 400 })

  /**
   * The prompt is accepted and stored on the site's settings, but nothing
   * generates from it yet — the agent is Phase 1's last step. Taking it now
   * means the create flow does not change shape when generation lands, and a
   * site created today still knows what it was asked to be.
   */
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT) : ""

  const plan = await creatorSitePlan(creatorId)
  const result = await createSite(
    {
      name,
      templateId: typeof body.templateId === "string" ? body.templateId : null,
      files: blankProject(name),
    },
    plan,
  )

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  if (prompt) {
    const { createClient } = await import("@/lib/supabase/server")
    const supabase = await createClient()
    await supabase
      .from("sites")
      .update({ settings: { ...result.site.settings, brief: prompt } })
      .eq("id", result.site.id)
  }

  return NextResponse.json({ ok: true, site: result.site })
}
