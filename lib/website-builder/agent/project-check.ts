/**
 * ===========================================================================
 *  THE LAST CHECK: THE WHOLE PAGE, AS IT WILL BE SAVED
 * ===========================================================================
 * Every write is already checked at the door: an unknown setting id is
 * refused, a value its control cannot take is refused, a section file that
 * does not compile is refused (./operations, ./compile-feedback). What those
 * checks cannot see is the page AFTER several writes have met:
 *
 *   - a section's code rewritten so a setting the page's instances still
 *     hold is no longer declared ("No setting called align exists");
 *   - a section pointed at a colour scheme that is not in the theme;
 *   - a font named that the theme cannot load, which draws as the fallback;
 *   - a picture setting holding an asset reference nothing uploaded, or a
 *     placeholder address;
 *   - a redesign that kept the old page and recoloured it, a plan half built,
 *     or the planned sections in the wrong order.
 *
 * So before a run may finish, the page as it will be saved is checked once
 * more, deterministically, and anything found goes back to the model the same
 * way a review finding does: plainly, with what would fix it. The run does
 * not get to call itself done while one of these stands, up to the review
 * budget; past that, what still stands is reported in the reply rather than
 * hidden (./loop.ts).
 *
 * ONLY WHAT THIS RUN DID. A setting somebody left behind two months ago is
 * not this run's to argue about: every check compares with the page as it
 * was when the run started.
 *
 * Pure, browser safe, no provider: tests/agent-intent.test.ts drives it.
 */

import { OFFERED_FAMILIES } from "../font-link"
import { themeColorSchemes } from "@/lib/storelib-theme/color-schemes"
import type { BlockInstance, SectionInstance } from "../types"
import { blockSpecFor, checkSettings, fieldsFor, blockFieldsFor, type ThemeState } from "./operations"
import { schemaOf, type SchemaMap } from "./schemas"
import type { Finding } from "./review"
import type { Intent } from "./intent"
import type { CreativePlan } from "./creative-plan"
import { plannedLabel } from "./creative-plan"
import { matchPlan } from "./project-state"

/** Findings about the theme as a whole, not one section, are filed under this id. */
export const THEME_FINDING = "theme"

export interface ProjectCheckInput {
  before: ThemeState
  after: ThemeState
  schemas: SchemaMap
  /** Section types whose source this run wrote. Their instances are checked against the new schema. */
  rewrittenTypes?: Iterable<string>
  /** Sections this run added or wrote to. */
  touched: Iterable<string>
  added: Iterable<string>
  intent?: Intent | null
  plan?: CreativePlan | null
}

const FONT_KEYS = ["font_heading", "font_body", "font_accent"] as const
const PLACEHOLDER_URL = /\b(example\.(com|org)|placeholder|placehold\.|via\.placeholder|picsum\.photos|lorempixel|dummyimage|your-?image|image-?url|path\/to)\b/i

const body = (s: SectionInstance) => s.type !== "header" && s.type !== "footer"

/** Every asset:// reference anywhere in a value tree. */
function assetRefs(node: unknown, out = new Set<string>()): Set<string> {
  if (typeof node === "string") {
    for (const m of node.matchAll(/asset:\/\/[A-Za-z0-9_.-]+/g)) out.add(m[0])
  } else if (Array.isArray(node)) node.forEach((n) => assetRefs(n, out))
  else if (node && typeof node === "object") Object.values(node).forEach((n) => assetRefs(n, out))
  return out
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Settings that this run set or changed on a section, compared with how it started. */
function changedKeys(after: Record<string, unknown>, before: Record<string, unknown> | undefined): string[] {
  return Object.keys(after).filter((k) => !before || !same(after[k], before[k]))
}

function walkBlocks(blocks: BlockInstance[] | undefined, visit: (block: BlockInstance, parentType: string | null) => void, parentType: string | null = null) {
  for (const b of blocks ?? []) {
    visit(b, parentType)
    walkBlocks(b.blocks, visit, b.type)
  }
}

function findBlock(blocks: BlockInstance[] | undefined, id: string): BlockInstance | undefined {
  for (const b of blocks ?? []) {
    if (b.id === id) return b
    const inner = findBlock(b.blocks, id)
    if (inner) return inner
  }
  return undefined
}

export function checkProject(input: ProjectCheckInput): Finding[] {
  const { before, after, schemas } = input
  const findings: Finding[] = []
  const touched = new Set(input.touched)
  const added = new Set(input.added)
  const rewritten = new Set(input.rewrittenTypes ?? [])
  const beforeById = new Map(before.sections.map((s) => [s.id, s]))
  const knownAssets = assetRefs(before)
  const schemes = themeColorSchemes(after.settings)

  /* ── every section this run touched, against its schema as it now stands ── */
  for (const section of after.sections) {
    const was = beforeById.get(section.id)
    const mine = touched.has(section.id) || added.has(section.id) || rewritten.has(section.type)
    if (!mine) continue
    const schema = schemaOf(schemas, section.type)
    if (!schema) {
      if (added.has(section.id) || (was && was.type !== section.type)) {
        findings.push({ sectionId: section.id, message: `There is no section type "${section.type}" in this theme, so this section draws nothing. Point it at a type that exists, or remove it.` })
      }
      continue
    }
    const fields = fieldsFor(section.type, schemas)
    const ids = new Set(fields.map((f) => f.id))
    /* A rewritten type is held to its new schema for every setting; anything else only for what this run changed. */
    const keys = rewritten.has(section.type) ? Object.keys(section.settings ?? {}) : changedKeys(section.settings ?? {}, was?.settings)
    const stray = keys.filter((k) => !ids.has(k) && k !== "color_overrides")
    if (stray.length) {
      findings.push({
        sectionId: section.id,
        message: `It holds ${stray.map((k) => `"${k}"`).join(", ")}, and ${section.type} has no setting called that${stray.length > 1 ? "" : ""}. ${rewritten.has(section.type) ? "Its code was changed this run: put the setting back in the schema, or move the value to the setting that replaced it and clear the old one with update_section sending null for it." : "Use the section's real setting ids (read_section lists them)."}`,
      })
    }
    /* Values only for what this run set: a preset's own "scheme.heading" is the editor's, not a mistake. */
    const checkable: Record<string, unknown> = {}
    for (const k of changedKeys(section.settings ?? {}, was?.settings)) {
      const v = section.settings[k]
      if (ids.has(k) && !(typeof v === "string" && v.startsWith("scheme."))) checkable[k] = v
    }
    if (Object.keys(checkable).length) {
      const checked = checkSettings(fields, checkable, section.type)
      if (checked.error) findings.push({ sectionId: section.id, message: checked.error.replace(/ Nothing was changed\./, "") })
    }
    const scheme = section.settings?.color_scheme
    if (typeof scheme === "string" && scheme && !schemes[scheme] && (!was || was.settings?.color_scheme !== scheme)) {
      findings.push({ sectionId: section.id, message: `Its color_scheme is "${scheme}", which is not one of the theme's schemes (${Object.keys(schemes).join(", ")}). Use one of those, or create it with set_color_scheme.` })
    }

    /* Blocks: the type is one this section (or its parent block) takes, and their settings are real. */
    walkBlocks(section.blocks, (block, parentType) => {
      const old = was ? findBlock(was.blocks, block.id) : undefined
      if (!block.static && !blockSpecFor(section.type, parentType, block.type, schemas) && (!old || old.type !== block.type || rewritten.has(section.type))) {
        findings.push({ sectionId: section.id, message: `Block [${block.id}] is a "${block.type}", which ${parentType ? `a ${parentType} block` : section.type} does not take. Remove it or use a block type it takes.` })
        return
      }
      const bf = blockFieldsFor(section.type, block.type, schemas)
      if (!bf.length) return
      const bids = new Set(bf.map((f) => f.id))
      const bkeys = rewritten.has(section.type) ? Object.keys(block.settings ?? {}) : changedKeys(block.settings ?? {}, old?.settings)
      const bstray = bkeys.filter((k) => !bids.has(k))
      if (bstray.length) findings.push({ sectionId: section.id, message: `Block [${block.id}] (${block.type}) holds ${bstray.map((k) => `"${k}"`).join(", ")}, which that block type does not have.` })
    })

    /* Pictures: an address or an upload that exists, never an invented asset or a placeholder. */
    const imageFields = fields.filter((f) => f.type === "image" || f.type === "image_picker" || f.type === "video")
    for (const f of imageFields) {
      const v = section.settings?.[f.id]
      if (typeof v !== "string" || !v || (was && was.settings?.[f.id] === v)) continue
      if (v.startsWith("asset://") && !knownAssets.has(v)) findings.push({ sectionId: section.id, message: `"${f.id}" points at ${v}, which is not an upload this site has. Leave it empty for the creator's own picture.` })
      else if (PLACEHOLDER_URL.test(v)) findings.push({ sectionId: section.id, message: `"${f.id}" is a placeholder address (${v.slice(0, 80)}). Leave it empty so the creator adds their own picture.` })
      else if (!/^(https?:\/\/|\/|asset:\/\/|data:image\/)/.test(v)) findings.push({ sectionId: section.id, message: `"${f.id}" is "${v.slice(0, 60)}", which is not an address a picture can load from. Leave it empty or use a real address.` })
    }
  }

  /* ── the theme ── */
  for (const key of FONT_KEYS) {
    const v = after.settings[key]
    if (typeof v === "string" && v.trim() && v !== before.settings[key] && !OFFERED_FAMILIES.has(v.trim())) {
      findings.push({ sectionId: THEME_FINDING, message: `${key} is "${v}", which the theme cannot load, so visitors see a fallback. Use one of: ${[...OFFERED_FAMILIES].join(", ")}.` })
    }
  }

  /* ── the shape of a redesign ── */
  const kind = input.intent?.kind
  const big = kind === "FULL_SITE_REDESIGN" || kind === "NEW_SITE_GENERATION" || kind === "PAGE_REDESIGN"
  if (big) findings.push(...redesignFindings(before, after, added, input.plan ?? null, schemas))
  return findings
}

/**
 * A redesign is held to the plan, and to not being the old page recoloured.
 *
 * The recolour test is structural, because it is the failure that was seen:
 * the same section types, in the same order, still showing. Changed colours
 * and words on them do not make it a new site.
 */
export function redesignFindings(before: ThemeState, after: ThemeState, added: Set<string>, plan: CreativePlan | null, schemas?: SchemaMap): Finding[] {
  const findings: Finding[] = []
  const oldVisible = before.sections.filter((s) => body(s) && !s.hidden)
  const nowVisible = after.sections.filter((s) => body(s) && !s.hidden)
  const keptIds = new Set(plan?.sections.filter((s) => s.use.startsWith("keep:")).map((s) => s.use.slice(5)) ?? [])

  if (plan) {
    const matched = matchPlan(plan.sections, after, added)
    const missing = plan.sections.filter((_, i) => !matched[i])
    if (missing.length) {
      findings.push({
        sectionId: THEME_FINDING,
        message: `The plan is not built yet. Missing, in order: ${missing.map((s) => `${plannedLabel(s, schemas)} (${s.use})`).join(", ")}. Build them now, in the planned positions.`,
      })
    }
    const placed = matched.filter((id): id is string => !!id)
    const order = placed.map((id) => after.sections.findIndex((s) => s.id === id))
    if (order.some((at, i) => i > 0 && at < order[i - 1])) {
      findings.push({ sectionId: THEME_FINDING, message: `The sections are not in the planned order. Planned: ${plan.sections.map((s) => plannedLabel(s, schemas)).join(", ")}. Use move_section to put them in that order.` })
    }
    const leftovers = oldVisible.filter((s) => !keptIds.has(s.id) && after.sections.some((x) => x.id === s.id && !x.hidden))
    if (leftovers.length) {
      findings.push({
        sectionId: THEME_FINDING,
        message: `Sections from the old page are still showing and are not in the plan: ${leftovers.map((s) => `[${s.id}] ${s.type}`).join(", ")}. Remove them (or hide one whose words the creator wrote), unless one truly belongs in the new site, in which case say why in your reply.`,
      })
    }
  } else if (oldVisible.length >= 2) {
    /* No plan (the planner failed or was off): still not allowed to be the old page recoloured. */
    const stillThere = oldVisible.filter((s) => nowVisible.some((x) => x.id === s.id))
    const sameShape = stillThere.length >= Math.ceil(oldVisible.length * 0.6) && added.size < 2
    if (sameShape) {
      findings.push({
        sectionId: THEME_FINDING,
        message: `This was asked to be a new site, and ${stillThere.length} of the ${oldVisible.length} old sections are still showing with nothing new around them. Decide what this business's site should contain, then remove what does not belong and build what is missing.`,
      })
    }
  }

  if (nowVisible.length < 4) {
    findings.push({ sectionId: THEME_FINDING, message: `The page has ${nowVisible.length} section${nowVisible.length === 1 ? "" : "s"} between the header and footer. A whole site for this brief needs more than that: build the rest of it.` })
  }
  return findings
}
