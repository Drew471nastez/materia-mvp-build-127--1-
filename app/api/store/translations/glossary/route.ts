import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { recordActivity } from "@/lib/activity/log-server"
import { rateLimit } from "@/lib/api/rate-limit"
import { glossaryOf, saveGlossary } from "@/lib/markets/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Languages & Currency › Words not to translate (lib/markets/
 * glossary.ts, SQL part 203), for the store's owner.
 *
 * GET  { ready, glossary: [{ term, as? }] }   `ready` false before part 203
 * PUT  { glossary }   the whole list, checked and saved. Storelib AI's
 *      translations of texts with a word whose rule changed are written
 *      again by the next run; the merchant's own are never touched.
 */
export async function GET() {
  const c = await shopCaller("website")
  if (c instanceof NextResponse) return c
  const { ready, glossary } = await glossaryOf(c.db, c.creatorId)
  return physicalJson({ ready, glossary })
}

export async function PUT(request: Request) {
  const c = await shopCaller("website")
  if (c instanceof NextResponse) return c
  const limited = await rateLimit({ bucket: "translation-glossary", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 60, seconds: 600 }], message: "That is a lot of saves at once. Wait a minute and try again." })
  if (limited) return limited
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const saved = await saveGlossary(c.db, c.creatorId, body.glossary)
  if (saved.ok === false) return physicalJson({ error: saved.error }, saved.status)
  await recordActivity(c.db, c, { action: "website.translations", meta: { glossary: saved.value.length, refreshed: saved.refreshed } })
  return physicalJson({ glossary: saved.value, refreshed: saved.refreshed })
}
