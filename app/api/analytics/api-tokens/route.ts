import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { createApiToken, listApiTokens, revokeApiToken } from "@/lib/analytics/destinations/api-tokens-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The store's read only keys for GET /api/v1/analytics
 * (lib/analytics/destinations/api-tokens-server). GET lists them by name
 * and first characters; POST { name } makes one and answers the key once;
 * DELETE ?id= revokes one. The owner's alone: a key reads the store's
 * figures from anywhere.
 */
async function owner() {
  const c = await shopCaller("analytics")
  if (c instanceof NextResponse) return c
  if (c.isOwner === false) return physicalJson({ error: "Only the store's owner can manage API keys." }, 403)
  return c
}

export async function GET() {
  const c = await owner()
  if (c instanceof NextResponse) return c
  return physicalJson(await listApiTokens(c.db, c.creatorId))
}

export async function POST(request: Request) {
  const c = await owner()
  if (c instanceof NextResponse) return c
  const limited = await rateLimit({ bucket: "analytics-api-token", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 10, seconds: 3600 }] })
  if (limited) return limited
  const body = (await readBody(request)) ?? {}
  const made = await createApiToken(c.db, c.creatorId, c.userId, body.name)
  if (made.ok === false) return physicalJson({ error: made.error }, made.status)
  return physicalJson({ ...(await listApiTokens(c.db, c.creatorId)), token: made.token })
}

export async function DELETE(request: Request) {
  const c = await owner()
  if (c instanceof NextResponse) return c
  const id = new URL(request.url).searchParams.get("id")
  if (!(await revokeApiToken(c.db, c.creatorId, id))) return physicalJson({ error: "That key could not be revoked. Try again." }, 400)
  return physicalJson(await listApiTokens(c.db, c.creatorId))
}
