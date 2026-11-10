/**
 * The native site, handed to the classic job's own build (../apply.ts): ONE
 * way a plan becomes pages. The site becomes a SitePlan (the preset, the
 * palette, the fonts, every page's sections in order with their layout
 * choices and picture briefs), buildSite places the sections, the theme
 * tokens and the header and footer exactly as for a planned site, and then
 * `nativeOps` writes each placed section's generated words, links, bindings
 * and blocks onto it as ordinary editor operations (logged, replayed on the
 * canvas, undoable), with the store's real data bound by fill.ts bindOps.
 */
import type { ThemeOp } from "../../agent/operations"
import type { SitePlan, SitePlanSection } from "../../agent/site-plan"
import type { DesignPreset } from "../../design-presets"
import { DESIGN_PRESETS } from "../../design-presets"
import type { SchemaMap } from "../../agent/schemas"
import type { SectionInstance } from "../../types"
import type { Capabilities } from "../capabilities"
import type { PlacedSection, SiteState } from "../apply"
import { applyOp } from "../../agent/operations"
import { bindOps } from "../fill"
import type { NativeRegistry } from "./registry"
import type { NativeSection, NativeSite } from "./types"
import type { DesignTokens } from "@/lib/ai-builder/types"
import { tokensToThemeSettings } from "@/lib/ai-builder/tokens"

/**
 * A SitePlan that carries the native site it was made from, and the design brain's tokens with the native site's own
 * palette and fonts laid over them (`tokens`, null without a brain): what the build writes to Theme settings.
 */
export type NativeSitePlan = SitePlan & { native: NativeSite; tokens?: DesignTokens | null }

export function isNativePlan(plan: SitePlan | null | undefined): plan is NativeSitePlan {
  return !!plan && !!(plan as { native?: unknown }).native && typeof (plan as { native?: unknown }).native === "object"
}

/** The settings buildSite applies at placement: the layout and spacing choices. */
function layoutOf(s: NativeSection, reg: NativeRegistry): Record<string, unknown> {
  const def = reg.sections[s.type]
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s.settings)) {
    const role = def?.settings.find((x) => x.id === k)?.role
    if (role === "layout" || role === "spacing") out[k] = v
  }
  return out
}

function contentOf(s: NativeSection): string {
  const h = typeof s.settings.heading === "string" ? s.settings.heading : ""
  return [h && `Heading: ${h}`, s.blocks.length ? `${s.blocks.length} items` : ""].filter(Boolean).join(". ") || s.purpose
}

/** The native site as the classic job's plan. Pure. */
export function toSitePlan(site: NativeSite, reg: NativeRegistry, presets: readonly DesignPreset[] = DESIGN_PRESETS, corrections: string[] = [], brainTokens: DesignTokens | null = null): NativeSitePlan {
  const preset = presets.find((p) => p.id === site.theme.preset) ?? presets[0]
  const ps = (preset?.settings ?? {}) as Record<string, unknown>
  const heading = site.theme.fonts.heading || (typeof ps.font_heading === "string" ? ps.font_heading : "Inter")
  const body = site.theme.fonts.body || (typeof ps.font_body === "string" ? ps.font_body : "Inter")
  return {
    preset: preset?.id ?? site.theme.preset,
    adjustments: { ...site.theme.settings },
    brand: { ...site.brand },
    voice: { tone: site.voice, use: [], avoid: [] },
    audience: site.audience,
    conversion: site.conversion,
    palette: { direction: "", colors: { ...site.theme.palette } },
    typography: { heading, body },
    imagery: site.imagery,
    pages: site.pages.map((p) => ({
      key: p.key,
      title: p.title,
      purpose: p.purpose,
      sections: p.sections.map(
        (s): SitePlanSection => ({ type: s.type, name: "", purpose: s.purpose, content: contentOf(s), scheme: s.scheme, layout: layoutOf(s, reg), images: s.images.map((i) => ({ ...i })) }),
      ),
    })),
    chrome: null,
    corrections,
    native: site,
    tokens: brainTokens ? mergeTokens(brainTokens, site) : null,
  }
}

/**
 * The brain's tokens with what the native site chose laid over them: its palette (when it gave one, the brain's
 * contrast band is dropped so a band never fights the new palette) and its fonts. Pure.
 */
export function mergeTokens(brain: DesignTokens, site: NativeSite): DesignTokens {
  const t: DesignTokens = JSON.parse(JSON.stringify(brain))
  const p = site.theme.palette
  if (p.background) {
    t.colors = {
      ...t.colors,
      background: p.background,
      surface: p.surface || t.colors.surface,
      text: p.text || t.colors.text,
      accent: p.accent || p.button || t.colors.accent,
      accentText: p.button_text || t.colors.accentText,
    }
    delete t.colors.inverse
  }
  if (site.theme.fonts.heading) t.fonts = { ...t.fonts, heading: site.theme.fonts.heading }
  if (site.theme.fonts.body) t.fonts = { ...t.fonts, body: site.theme.fonts.body }
  return t
}

/**
 * The plan's tokens as ONE Theme settings write (lib/ai-builder/tokens.ts tokensToThemeSettings, the agent engine's
 * own mapping), with the native site's checked Theme settings over them: its explicit choices win. Null without tokens.
 */
export function tokenThemeOp(plan: NativeSitePlan, current: Record<string, unknown>): ThemeOp | null {
  if (!plan.tokens) return null
  return { kind: "update_theme", settings: { ...tokensToThemeSettings(plan.tokens, current), ...plan.native.theme.settings } }
}

export interface NativePlacement {
  ops: { page: string; op: ThemeOp }[]
  /** Sections whose words the native site wrote: the write step leaves them. */
  filled: string[]
  written: Record<string, string[]>
}

const hasWords = (s: NativeSection, reg: NativeRegistry) =>
  Object.keys(s.settings).some((k) => reg.sections[s.type]?.settings.find((x) => x.id === k)?.role === "copy") || s.blocks.length > 0

/**
 * The operations that write each placed section's generated content: its
 * settings, its blocks in place of the preset's (ids stable from the placed
 * section's id), then the store's real data (bindOps). Pure.
 */
export function nativeOps(input: { site: SiteState; placed: PlacedSection[]; plan: NativeSitePlan; reg: NativeRegistry; caps: Capabilities; schemas?: SchemaMap }): NativePlacement {
  const { site, placed, plan, reg } = input
  const ops: NativePlacement["ops"] = []
  const filled: string[] = []
  const written: Record<string, string[]> = {}
  for (const p of placed) {
    const native = plan.native.pages.find((x) => x.key === p.page)?.sections[p.plan]
    let section: SectionInstance | undefined = site.pages[p.page]?.find((s) => s.id === p.id)
    if (!native || !section || native.type !== section.type) continue
    const mine: ThemeOp[] = []
    if (Object.keys(native.settings).length) mine.push({ kind: "update_section", id: section.id, settings: { ...native.settings } })
    if (native.blocks.length) {
      for (const b of section.blocks ?? []) mine.push({ kind: "remove_block", sectionId: section.id, blockId: b.id })
      native.blocks.forEach((b, i) => mine.push({ kind: "add_block", sectionId: section!.id, blockId: `${b.type}-${section!.id}-n${i.toString(36)}`, blockType: b.type, settings: { ...b.settings } }))
    }
    /* The section as these leave it, so the store's data is bound onto what is really there. */
    let state = { sections: site.pages[p.page] ?? [], settings: site.settings }
    for (const op of mine) state = applyOp(state, op, input.schemas)
    section = state.sections.find((s) => s.id === p.id) ?? section
    const bound = bindOps(section, input.caps, input.schemas)
    mine.push(...bound.ops)
    ops.push(...mine.map((op) => ({ page: p.page, op })))
    if (hasWords(native, reg)) {
      filled.push(p.id)
      written[p.id] = Object.keys(native.settings)
    }
  }
  return { ops, filled, written }
}
