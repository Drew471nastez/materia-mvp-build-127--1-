/**
 * ===========================================================================
 *  ONE BOX, AND THE SERVER SAYS WHERE A MESSAGE GOES
 * ===========================================================================
 * The chat's side of lib/website-builder/agent/router.ts. Before a message
 * goes, it is sent with the selection and the chip's state to
 * /api/website-builder/themes/<id>/agent/decide, which answers which agent
 * takes it (the page assistant or the section writer), whether only the
 * selection may change, and whether the change goes into its code. A route
 * that cannot be reached (an older deployment, a dropped connection) is the
 * page assistant with the chip as it is, which is what the box always did.
 *
 * And the chip's words: "Editing: Hero", or with a block selected inside it,
 * "Editing: Heading in Hero".
 *
 * Pure apart from the one fetch, which is injected in the tests.
 */

import { routeByRules } from "@/lib/website-builder/agent/router"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"

export interface AskRoute {
  agent: "page" | "writer"
  target: "element" | "block" | "section" | "page" | "theme"
  lock: boolean
  codeFocus: boolean
}

export interface RouteAsk {
  prompt: string
  images: number
  sections: { id: string; type: string; name?: string; group?: string }[]
  selectedSectionId?: string
  selectedBlockId?: string
  selectedBlockType?: string
  scoped: boolean
  hasHistory: boolean
}

/**
 * THE WRITER, KNOWN AT ENTER (round 18, the owner: "as soon as I send the
 * prompt, it should smoothly close the modal and take me to the section
 * that's coding"). The server's rules (agent/router.ts routeByRules) run here
 * first, on what the browser has: a request the rules alone send to the
 * writer starts the writer's spot and the glide at once, while the server is
 * still asked. Only a clear answer counts; one the rules leave to the small
 * model waits for the server. What the browser does not know is the theme's
 * own section files, so the kinds already on the page stand in for them: a
 * guess that turns out wrong is put back (theme-chat.tsx, onWriteCancel).
 */
export function writerAtOnce(ask: RouteAsk): boolean {
  const body = ask.sections.filter((s) => !s.group && s.type !== "header" && s.type !== "footer")
  const found = ask.selectedSectionId ? ask.sections.find((s) => s.id === ask.selectedSectionId) : undefined
  try {
    const ruled = routeByRules({
      prompt: ask.prompt,
      images: ask.images,
      selection: found ? { sectionId: found.id, sectionType: found.type, sectionName: found.name, blockId: ask.selectedBlockId ?? null, blockType: ask.selectedBlockType ?? null, origin: "builtin" } : null,
      scoped: ask.scoped,
      bodySections: body.length,
      addable: [...ADDABLE_SECTIONS.map((type) => ({ type, name: SECTION_SCHEMAS[type]?.name })), ...body.map((s) => ({ type: s.type }))],
      onPage: body.map((s) => ({ type: s.type, name: s.name || undefined })),
      hasHistory: ask.hasHistory,
    })
    return ruled.agent === "writer" && !ruled.ambiguous
  } catch {
    return false
  }
}

/** What the box does when the router cannot be asked. */
export function routeFallback(scoped: boolean): AskRoute {
  return { agent: "page", target: scoped ? "section" : "page", lock: scoped, codeFocus: false }
}

function readRoute(body: unknown): AskRoute | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  if (b.agent !== "page" && b.agent !== "writer") return null
  const targets = ["element", "block", "section", "page", "theme"]
  return {
    agent: b.agent,
    target: (targets.includes(String(b.target)) ? b.target : "page") as AskRoute["target"],
    lock: b.lock === true,
    codeFocus: b.codeFocus === true,
  }
}

export async function decideRoute(installId: string, ask: RouteAsk, fetcher: typeof fetch = fetch, timeoutMs = 6_000): Promise<AskRoute> {
  try {
    const res = await fetcher(`/api/website-builder/themes/${encodeURIComponent(installId)}/agent/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: ask.prompt.slice(0, 2_000),
        images: Math.min(16, ask.images),
        sections: ask.sections.slice(0, 500).map((s) => ({ id: s.id, type: s.type, name: s.name?.slice(0, 256), ...(s.group ? { group: s.group } : {}) })),
        selectedSectionId: ask.selectedSectionId,
        selectedBlockId: ask.selectedBlockId,
        selectedBlockType: ask.selectedBlockType,
        scoped: ask.scoped,
        hasHistory: ask.hasHistory,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return routeFallback(ask.scoped)
    return readRoute(await res.json().catch(() => null)) ?? routeFallback(ask.scoped)
  } catch {
    return routeFallback(ask.scoped)
  }
}

type BlockLike = { id: string; type?: string; settings?: Record<string, unknown>; blocks?: BlockLike[] }

/** The selected block, by its path key ("a/b": a block inside a block), or null. */
export function blockAtKey(blocks: BlockLike[] | undefined, key: string | null | undefined): BlockLike | null {
  if (!key) return null
  let list = blocks ?? []
  let found: BlockLike | null = null
  for (const id of key.split("/").filter(Boolean)) {
    found = list.find((b) => b.id === id) ?? null
    if (!found) return null
    list = found.blocks ?? []
  }
  return found
}

/** A block type in words: "rich_text" is "Rich text". */
export function blockName(type: string | undefined): string {
  const words = String(type ?? "").replace(/[_-]+/g, " ").trim()
  return words ? words[0].toUpperCase() + words.slice(1) : ""
}

/** What the chip says the next message changes. */
export function scopeName(section: { name?: string; type: string; blocks?: BlockLike[] }, blockKey?: string | null): string {
  const name = (section.name ?? "").trim() || blockName(section.type)
  const block = blockAtKey(section.blocks, blockKey)
  const label = block ? blockName(block.type) : ""
  return label ? `${label} in ${name}` : name
}
