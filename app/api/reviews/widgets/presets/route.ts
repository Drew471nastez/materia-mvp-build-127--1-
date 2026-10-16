import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { checkPresetInput, createPreset, listPresets } from "@/lib/reviews/widget-presets-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Reviews › Widgets: the store's saved widget settings. GET lists them
 * (`ready: false` before run-now part 190), POST saves one under a name:
 * `{ widget, name, settings }`, the settings checked against that widget's
 * section (lib/reviews/widgets.ts). The signed in owner's store only.
 */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  return physicalJson(await listPresets(c.db, c.creatorId))
}

export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const input = checkPresetInput(body)
  if (input.ok === false) return physicalJson({ error: input.error }, 400)
  if (!input.name) return physicalJson({ error: "Give it a name." }, 400)
  const saved = await createPreset(c.db, c.creatorId, { widget: input.widget, name: input.name, settings: input.settings ?? {} })
  if (saved.ok === false) return physicalJson({ error: saved.error }, saved.status)
  return physicalJson({ preset: saved.preset })
}
