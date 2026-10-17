/**
 * ===========================================================================
 *  WHICH AGENT TAKES THIS MESSAGE
 * ===========================================================================
 * Ask Storelib has one box and no modes. Before a message goes anywhere the
 * chat asks here, with the words, how many pictures, the selection and
 * whether the "Editing: <Name>" chip is on, and is told which agent answers
 * (the page assistant, or the section writer), how far the change reaches,
 * and whether it goes into the selected section's code. The decision is
 * lib/website-builder/agent/router.ts: rules first, then a small fast model
 * only when they cannot tell.
 *
 * Owner checked like every route under this install; nothing is written.
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { agentMayWrite } from "@/lib/agent-access/protected"
import { routeRequest, type RouteSelection } from "@/lib/website-builder/agent/router"
import { routerClassifier } from "@/lib/website-builder/agent/router-model"
import { SECTION_TYPE } from "@/lib/website-builder/agent/selected-section"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import { isConfigured } from "@/lib/sites/agent/provider"
import { readKeys } from "@/lib/ai-keys/store"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const BodySchema = z.object({
  prompt: z.string().max(2_000),
  images: z.number().int().min(0).max(16).optional(),
  sections: z
    .array(z.object({ id: z.string().min(1).max(128), type: z.string().min(1).max(64), name: z.string().max(256).optional(), group: z.string().max(16).optional() }))
    .max(500),
  selectedSectionId: z.string().max(128).optional(),
  selectedBlockId: z.string().max(400).optional(),
  selectedBlockType: z.string().max(64).optional(),
  /** The chip is on. */
  scoped: z.boolean().optional(),
  hasHistory: z.boolean().optional(),
})

export async function POST(request: NextRequest, context: { params: Promise<{ installId: string }> }) {
  const { installId } = await context.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 })
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Only creators can edit themes." }, { status: 403 })
  const creatorId = (creator as { id: string }).id
  const { data: install } = await supabase.from("store_theme_installs").select("id").eq("id", installId).eq("creator_id", creatorId).maybeSingle()
  if (!install) return NextResponse.json({ error: "Theme not found." }, { status: 404 })

  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Describe what you want changed." }, { status: 400 })
  const body = parsed.data

  /* Which section types this install has its own file for: the paths only, through the creator's own client. */
  const own = new Set<string>()
  try {
    const { data } = await supabase.from("store_theme_custom_files").select("path").eq("install_id", installId).like("path", "sections/%.storelib")
    for (const row of (data ?? []) as { path: string }[]) own.add(row.path)
  } catch {
    /* without it a selection reads as Storelib's own, which only matters for whether its code is offered */
  }

  const found = body.selectedSectionId ? body.sections.find((s) => s.id === body.selectedSectionId) : undefined
  let selection: RouteSelection | null = null
  if (found) {
    const path = `sections/${found.type}.storelib`
    const origin =
      found.type === "header" || found.type === "footer"
        ? "chrome"
        : !SECTION_TYPE.test(found.type)
          ? "product"
          : own.has(path) && agentMayWrite(path).ok
            ? "own"
            : own.has(path) || DEFAULT_THEME_SOURCES[path] !== undefined
              ? "builtin"
              : "product"
    selection = {
      sectionId: found.id,
      sectionType: found.type,
      sectionName: found.name,
      blockId: body.selectedBlockId ?? null,
      blockType: body.selectedBlockType ?? null,
      origin,
    }
  }

  const addable = [
    ...ADDABLE_SECTIONS.map((type) => ({ type, name: SECTION_SCHEMAS[type]?.name })),
    ...[...own].map((path) => ({ type: path.slice("sections/".length, -".storelib".length) })),
  ]
  const keys = await readKeys(creatorId).catch(() => ({}) as Awaited<ReturnType<typeof readKeys>>)
  const canClassify = isConfigured("anthropic") || !!keys.anthropic

  const decision = await routeRequest(
    {
      prompt: body.prompt,
      images: body.images ?? 0,
      selection,
      scoped: body.scoped === true,
      bodySections: body.sections.filter((s) => s.type !== "header" && s.type !== "footer" && !s.group).length,
      addable,
      hasHistory: body.hasHistory,
    },
    canClassify ? routerClassifier(creatorId) : undefined,
  )
  return NextResponse.json(decision, { headers: { "Cache-Control": "no-store" } })
}
