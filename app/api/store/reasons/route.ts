import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { addReason, deleteReason, loadAllReasons, orderReasons, readKind, updateReason } from "@/lib/store/reasons-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Returns and refunds: the store's return and refund reasons
 * (lib/store/reasons-server.ts). Every shop refunds, so the owner check
 * alone. A reason is named by its kind and value, which never change.
 *
 *   GET                                       both lists
 *   POST    { kind, label, description }      add one
 *   PUT     { kind, value, label, description } rename or describe one
 *   PATCH   { kind, order: [value, …] }       put them in order
 *   DELETE  { kind, value }                   remove one ("other" stays)
 */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  return physicalJson(await loadAllReasons(c.db, c.creatorId))
}

async function write(request: Request, run: (kind: "return" | "refund", body: Record<string, unknown>, db: unknown, creatorId: string) => Promise<{ ok: true; reasons: unknown } | { ok: false; error: string; status: number }>) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const kind = readKind(body?.kind)
  if (!body || !kind) return physicalJson({ error: "Bad request." }, 400)
  const out = await run(kind, body, c.db, c.creatorId)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  return physicalJson({ kind, reasons: out.reasons })
}

export const POST = (request: Request) => write(request, (kind, body, db, id) => addReason(db, id, kind, body))
export const PUT = (request: Request) => write(request, (kind, body, db, id) => updateReason(db, id, kind, body.value, body))
export const PATCH = (request: Request) => write(request, (kind, body, db, id) => orderReasons(db, id, kind, body.order))
export const DELETE = (request: Request) => write(request, (kind, body, db, id) => deleteReason(db, id, kind, body.value))
