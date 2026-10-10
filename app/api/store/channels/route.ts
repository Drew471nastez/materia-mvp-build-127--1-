import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { createChannel, deleteChannel, loadChannels, setDefaultChannel, updateChannel } from "@/lib/store/channels-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Sales channels (lib/store/channels-server.ts). Every store
 * sells somewhere, so the owner check alone.
 *
 *   GET                                         the channels and New products
 *   POST    { name, description, enabled }      make a channel of the store's own
 *   PUT     { id, name, description, enabled }  change one of the store's own
 *   PATCH   { defaultKey }                      New products: one channel, or null for every one
 *   DELETE  { id }                              remove one of the store's own
 */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  return physicalJson(await loadChannels(c.db, c.creatorId))
}

type Run = (body: Record<string, unknown>, db: unknown, creatorId: string) => Promise<{ ok: true; setup: unknown } | { ok: false; error: string; status: number }>
async function write(request: Request, run: Run) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const out = await run(body, c.db, c.creatorId)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  return physicalJson(out.setup as Record<string, unknown>)
}

export const POST = (request: Request) => write(request, (body, db, id) => createChannel(db, id, body))
export const PUT = (request: Request) => write(request, (body, db, id) => updateChannel(db, id, body.id, body))
export const PATCH = (request: Request) => write(request, (body, db, id) => setDefaultChannel(db, id, body.defaultKey ?? null))
export const DELETE = (request: Request) => write(request, (body, db, id) => deleteChannel(db, id, body.id))
