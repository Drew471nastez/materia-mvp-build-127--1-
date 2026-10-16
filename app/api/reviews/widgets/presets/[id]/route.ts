import { NextResponse } from "next/server"
import { isUuid, physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { checkPresetInput, deletePreset, readPreset, updatePreset } from "@/lib/reviews/widget-presets-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** One saved widget: GET reads it (the editor, placing it), PATCH renames it or saves new settings over it, DELETE removes it. No page changes with it. */
export async function GET(_request: Request, ctx: Ctx) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const { id } = await ctx.params
  if (!isUuid(id)) return physicalJson({ error: "That saved widget is gone." }, 404)
  const preset = await readPreset(c.db, c.creatorId, id)
  if (!preset) return physicalJson({ error: "That saved widget is gone." }, 404)
  return physicalJson({ preset })
}

export async function PATCH(request: Request, ctx: Ctx) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const { id } = await ctx.params
  if (!isUuid(id)) return physicalJson({ error: "That saved widget is gone." }, 404)
  const current = await readPreset(c.db, c.creatorId, id)
  if (!current) return physicalJson({ error: "That saved widget is gone." }, 404)
  const input = checkPresetInput(await readBody(request), { widget: current.widget })
  if (input.ok === false) return physicalJson({ error: input.error }, 400)
  const saved = await updatePreset(c.db, c.creatorId, id, { name: input.name, settings: input.settings })
  if (saved.ok === false) return physicalJson({ error: saved.error }, saved.status)
  return physicalJson({ preset: saved.preset })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const { id } = await ctx.params
  if (!isUuid(id)) return physicalJson({ ok: true })
  const done = await deletePreset(c.db, c.creatorId, id)
  if (done.ok === false) return physicalJson({ error: done.error }, done.status)
  return physicalJson({ ok: true })
}
