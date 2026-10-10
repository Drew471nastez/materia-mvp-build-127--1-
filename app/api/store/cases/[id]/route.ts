import { NextResponse } from "next/server"
import { isUuid, physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { appUrl } from "@/lib/notify/urls"
import { readCaseReply } from "@/lib/support/cases"
import { getCaseForStore, storeAct } from "@/lib/support/cases-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * One of the store's buyer cases.
 *
 *   GET                                  the case and its thread
 *   POST { action: "reply", body }       a reply to the buyer (emailed)
 *   POST { action: "escalate", body? }   ask Storelib to step in
 *   POST { action: "resolve" }           it's sorted
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const { id } = await ctx.params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const out = await getCaseForStore(c.db, c.creatorId, id)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  return physicalJson({ case: out.case, messages: out.messages })
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const { id } = await ctx.params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  const origin = appUrl("/").replace(/\/$/, "")
  let out
  if (body?.action === "reply") {
    const words = readCaseReply(body.body)
    if (!words) return physicalJson({ error: "Write your reply first." }, 400)
    out = await storeAct(c.db, c.creatorId, id, { kind: "reply", body: words }, origin)
  } else if (body?.action === "escalate") {
    out = await storeAct(c.db, c.creatorId, id, { kind: "escalate", body: readCaseReply(body.body) }, origin)
  } else if (body?.action === "resolve") {
    out = await storeAct(c.db, c.creatorId, id, { kind: "resolve" }, origin)
  } else return physicalJson({ error: "Bad request." }, 400)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  const again = await getCaseForStore(c.db, c.creatorId, id)
  return again.ok ? physicalJson({ case: again.case, messages: again.messages }) : physicalJson({ ok: true })
}
