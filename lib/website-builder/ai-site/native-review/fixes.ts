/**
 * ===========================================================================
 *  EACH DEFECT, AS THE SMALLEST CHANGE TO THE DRAFT THAT FIXES IT (round R, R3)
 * ===========================================================================
 * The review's findings are facts about one section at one width. Each is
 * mapped here to a patch on that section's own editable settings (./patch.ts),
 * found by what the section's schema declares, never by guessing a name:
 *
 *   overflow, heading-wrap,   the heading size steps down (font_size_heading
 *   text-clipped              or the like), a fixed height lets go, a full
 *                             height turns off
 *   contrast                  a section's own text or background colour is
 *                             taken off, else the colour scheme becomes the
 *                             one whose text reads best on its background
 *   image-broken, -missing    the picture setting that holds the address is
 *                             emptied (the section draws its words alone), a
 *                             gallery item with nothing else is removed, and
 *                             a section that is only that picture is hidden
 *   empty-section             hidden
 *   no-cta                    the hero's button gets the site's primary action
 *   dead-cta, broken-link     the link setting gets a page the site has; a
 *                             menu item to nowhere is removed
 *   overlap (the header)      the header stops being transparent over the page
 *   font-families             a section's own font choice goes back to the theme's
 *   type-scale                headings that set their own size go back to the theme's
 *   reduced-motion            the section's animation turns off
 *   repetition                the third of a run moves after the next different
 *                             section, or the middle one takes another layout
 *   rhythm                    each padding snaps to the page's common values
 *
 * A defect this cannot place on a setting is left as a finding, said plainly;
 * nothing is regenerated. Pure.
 */
import type { Defect } from "@/lib/ai-builder/visual-critic/types"
import { contrastRatio } from "../../agent/review"
import { resolveSectionColors, themeColorSchemes } from "@/lib/storelib-theme/color-schemes"
import type { SchemaMap } from "../../agent/schemas"
import type { SchemaField, SectionInstance } from "../../types"
import type { SiteState } from "../apply"
import { sectionPath, type NativePatch } from "./patch"
import { bodySections, paddingValues, repeatedRuns, RHYTHM_MAX_VALUES } from "./checks"

export interface FixContext {
  site: SiteState
  schemas?: SchemaMap
  /** Where the site's main action goes and what it says (the contact page, the shop). */
  primaryAction?: { label: string; href: string }
}

export interface PlannedFix {
  defect: Defect
  patches: NativePatch[]
}

const isChrome = (s: SectionInstance) => s.type === "header" || s.type === "footer" || !!s.group

function fieldsOf(ctx: FixContext, type: string): SchemaField[] {
  return (ctx.schemas?.[type]?.fields ?? []) as SchemaField[]
}

function blockFieldsOf(ctx: FixContext, type: string, blockType: string): SchemaField[] {
  return (ctx.schemas?.[type]?.blocks?.find((b) => b.type === blockType)?.fields ?? []) as SchemaField[]
}

const numberOf = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : fallback)

/** The section a defect is about: by id, else the page's section of that type (the header has no box of its own). */
function sectionFor(ctx: FixContext, d: Defect): SectionInstance | null {
  const sections = ctx.site.pages[d.page] ?? []
  if (d.sectionId) {
    const s = sections.find((x) => x.id === d.sectionId)
    if (s) return s
  }
  if (d.sectionType) return sections.find((x) => x.type === d.sectionType) ?? null
  return null
}

const HEADING_SIZE = /^(font_size_heading|heading_size|title_size|heading_font_size|headline_size|size)$/

/** A heading that is too big for the screen: one step down its own size setting. */
function smallerHeading(ctx: FixContext, page: string, s: SectionInstance, factor: number): NativePatch[] {
  const out: NativePatch[] = []
  for (const f of fieldsOf(ctx, s.type)) {
    if (!HEADING_SIZE.test(f.id)) continue
    if (f.type === "range" || f.type === "number") {
      const now = numberOf(s.settings?.[f.id], numberOf(f.default, 0))
      const min = typeof f.min === "number" ? f.min : 0
      if (!now || now <= min) continue
      const next = Math.max(min, Math.round(now * factor))
      if (next < now) out.push({ op: "set", path: sectionPath(page, s.id, "settings", f.id), value: next })
    } else if ((f.type === "select" || f.type === "radio") && f.options?.length) {
      const values = f.options.map((o) => String((o as { value: unknown }).value))
      const at = values.indexOf(String(s.settings?.[f.id] ?? f.default ?? ""))
      if (at > 0) out.push({ op: "set", path: sectionPath(page, s.id, "settings", f.id), value: values[at - 1] })
    }
    if (out.length) break
  }
  return out
}

const EFFECT = /(mockup|effect|tilt|perspective|3d|transform|style)/
const PLAIN = ["flat", "none", "simple", "static", "plain", "default"]

/** A decorative effect (a 3D mockup, a tilt) set to the section's plain option: what most often sticks out of a phone. */
function flatten(ctx: FixContext, page: string, s: SectionInstance): NativePatch[] {
  for (const f of fieldsOf(ctx, s.type)) {
    if (!EFFECT.test(f.id) || (f.type !== "select" && f.type !== "radio") || !f.options?.length) continue
    const values = f.options.map((o) => String((o as { value: unknown }).value))
    const plain = PLAIN.find((p) => values.includes(p))
    const now = String(s.settings?.[f.id] ?? f.default ?? "")
    if (plain && now !== plain) return [{ op: "set", path: sectionPath(page, s.id, "settings", f.id), value: plain }]
  }
  return []
}

function letGo(ctx: FixContext, page: string, s: SectionInstance): NativePatch[] {
  const out: NativePatch[] = []
  for (const f of fieldsOf(ctx, s.type)) {
    const v = s.settings?.[f.id]
    if ((f.id === "full_height" || f.id === "fixed_height") && v === true) out.push({ op: "set", path: sectionPath(page, s.id, "settings", f.id), value: false })
    else if (/^(min_height|height)$/.test(f.id) && numberOf(v, 0) > 0) out.push({ op: "remove", path: sectionPath(page, s.id, "settings", f.id) })
    else if (/aspect_ratio$/.test(f.id) && f.options?.some((o) => String((o as { value: unknown }).value) === "auto") && v !== "auto" && v !== undefined) out.push({ op: "set", path: sectionPath(page, s.id, "settings", f.id), value: "auto" })
  }
  return out
}

/** The section's text colour against its background, as the theme resolves it, for a scheme key. */
function schemeContrast(ctx: FixContext, key: string): number {
  const r = resolveSectionColors(ctx.site.settings, { color_scheme: key })
  const text = contrastRatio(r.scheme.text, r.scheme.background) ?? 1
  const heading = contrastRatio(r.scheme.heading, r.scheme.background) ?? 1
  return Math.min(text, heading)
}

function readable(ctx: FixContext, page: string, s: SectionInstance): NativePatch[] {
  const fields = fieldsOf(ctx, s.type)
  const has = (id: string) => fields.some((f) => f.id === id)
  const set = (id: string) => typeof s.settings?.[id] === "string" && (s.settings[id] as string).trim() !== ""
  /* The section's own colours over its scheme are the usual cause: back to the scheme's. */
  const own = ["text_color", "heading_color", "bg_color", "background_color", "overlay_color"].filter((id) => has(id) && set(id))
  if (own.length) return own.slice(0, 2).map((id) => ({ op: "remove", path: sectionPath(page, s.id, "settings", id) }))
  const scheme = fields.find((f) => f.id === "color_scheme")
  if (!scheme) return []
  const options = scheme.options?.length ? scheme.options.map((o) => String((o as { value: unknown }).value)) : Object.keys(themeColorSchemes(ctx.site.settings))
  const now = String(s.settings?.color_scheme ?? scheme.default ?? "")
  const ranked = options.map((k) => ({ k, c: schemeContrast(ctx, k) })).filter((x) => x.k !== now && x.c >= 4.5).sort((a, b) => b.c - a.c)
  return ranked[0] ? [{ op: "set", path: sectionPath(page, s.id, "settings", "color_scheme"), value: ranked[0].k }] : []
}

const isImageField = (f: SchemaField) => f.type === "image" || f.type === "image_picker"

function srcMatches(value: unknown, src: string | undefined): boolean {
  if (typeof value !== "string" || !value) return false
  if (!src) return false
  const a = value.trim()
  return a === src || src.includes(a) || a.includes(src.replace(/\.\.\.$/, ""))
}

/** Words or other pictures the section still draws once a picture is gone. */
function hasOtherContent(ctx: FixContext, s: SectionInstance, except: string): boolean {
  for (const f of fieldsOf(ctx, s.type)) {
    if (f.id === except) continue
    const v = s.settings?.[f.id]
    if (typeof v !== "string" || !v.trim()) continue
    if (f.type === "text" || f.type === "textarea" || f.type === "richtext" || isImageField(f)) return true
  }
  return (s.blocks ?? []).some((b) => !b.hidden)
}

function noPicture(ctx: FixContext, page: string, s: SectionInstance, src: string | undefined, missing: boolean): NativePatch[] {
  const out: NativePatch[] = []
  for (const f of fieldsOf(ctx, s.type).filter(isImageField)) {
    const v = s.settings?.[f.id]
    if (missing ? false : srcMatches(v, src)) {
      out.push({ op: "set", path: sectionPath(page, s.id, "settings", f.id), value: "" })
      if (!hasOtherContent(ctx, s, f.id)) out.push({ op: "set", path: sectionPath(page, s.id, "hidden"), value: true })
      return out
    }
  }
  for (const b of s.blocks ?? []) {
    const fields = blockFieldsOf(ctx, s.type, b.type)
    for (const f of fields.filter(isImageField)) {
      if (!srcMatches(b.settings?.[f.id], src)) continue
      const words = fields.some((x) => (x.type === "text" || x.type === "textarea") && typeof b.settings?.[x.id] === "string" && (b.settings[x.id] as string).trim())
      out.push(words ? { op: "remove", path: sectionPath(page, s.id, "blocks", b.id, "settings", f.id) } : { op: "remove", path: sectionPath(page, s.id, "blocks", b.id) })
      return out
    }
  }
  return out
}

const BUTTON_PAIRS: [string, string][] = [
  ["button_text", "button_url"],
  ["btn_primary_text", "btn_primary_url"],
  ["cta_text", "cta_url"],
  ["button_label", "button_link"],
  ["button_text", "button_link"],
]

function addAction(ctx: FixContext, page: string): NativePatch[] {
  const action = ctx.primaryAction
  if (!action) return []
  for (const s of bodySections(ctx.site.pages[page] ?? []).slice(0, 2)) {
    const ids = new Set(fieldsOf(ctx, s.type).map((f) => f.id))
    for (const [text, url] of BUTTON_PAIRS) {
      if (!ids.has(text) || !ids.has(url)) continue
      const out: NativePatch[] = []
      if (!String(s.settings?.[text] ?? "").trim()) out.push({ op: "set", path: sectionPath(page, s.id, "settings", text), value: action.label })
      const href = String(s.settings?.[url] ?? "").trim()
      if (!href || href === "#") out.push({ op: "set", path: sectionPath(page, s.id, "settings", url), value: action.href })
      if (out.length) return out
    }
  }
  return []
}

/**
 * A call to action drawn from a label and a link setting whose link is empty (a renderer's "#" fallback): found by
 * its label, then given the site's main action, label and link together (a "Shop Now" that goes to the contact page
 * would be a lie). With no main action known, its own show toggle turns it off.
 */
function labelledAction(ctx: FixContext, page: string, s: SectionInstance, text: string): NativePatch[] {
  if (!text) return []
  const fields = fieldsOf(ctx, s.type)
  for (const f of fields) {
    if (f.type !== "text" || !/_(text|label)$/.test(f.id)) continue
    const shown = String(s.settings?.[f.id] ?? f.default ?? "").trim()
    if (shown !== text) continue
    const stem = f.id.replace(/_(text|label)$/, "")
    const url = fields.find((x) => (x.type === "link" || x.type === "url") && (x.id === `${stem}_url` || x.id === `${stem}_link`))
    if (!url) continue
    if (ctx.primaryAction) return [{ op: "set", path: sectionPath(page, s.id, "settings", f.id), value: ctx.primaryAction.label }, { op: "set", path: sectionPath(page, s.id, "settings", url.id), value: ctx.primaryAction.href }]
    const toggle = fields.find((x) => x.type === "toggle" && x.id === `show_${stem}_button`) ?? fields.find((x) => x.type === "toggle" && x.id.startsWith("show_") && x.id.includes(stem))
    return toggle ? [{ op: "set", path: sectionPath(page, s.id, "settings", toggle.id), value: false }] : []
  }
  return []
}

function relink(ctx: FixContext, page: string, s: SectionInstance, href: string): NativePatch[] {
  const target = ctx.primaryAction?.href ?? "/"
  const isLink = (f: SchemaField) => f.type === "link" || f.type === "url"
  const same = (v: unknown) => typeof v === "string" && (v.trim() === href || (href === "" && v.trim() === "#"))
  for (const f of fieldsOf(ctx, s.type).filter(isLink)) {
    if (same(s.settings?.[f.id])) return [{ op: "set", path: sectionPath(page, s.id, "settings", f.id), value: target }]
  }
  for (const b of s.blocks ?? []) {
    for (const f of blockFieldsOf(ctx, s.type, b.type).filter(isLink)) {
      if (!same(b.settings?.[f.id])) continue
      /* A menu item to nowhere is taken out of the menu; any other link goes to the site's main action. */
      if (isChrome(s) || /nav|menu|link/.test(b.type)) return [{ op: "remove", path: sectionPath(page, s.id, "blocks", b.id) }]
      return [{ op: "set", path: sectionPath(page, s.id, "blocks", b.id, "settings", f.id), value: target }]
    }
  }
  return []
}

function solidHeader(ctx: FixContext, page: string): NativePatch[] {
  const header = (ctx.site.pages[page] ?? []).find((s) => s.type === "header")
  if (!header) return []
  const fields = fieldsOf(ctx, header.type)
  for (const f of fields) {
    if (/transparent|overlay/.test(f.id) && (f.type === "toggle" || f.type === "checkbox") && header.settings?.[f.id] === true) return [{ op: "set", path: sectionPath(page, header.id, "settings", f.id), value: false }]
  }
  return []
}

function themeFonts(ctx: FixContext, page: string): NativePatch[] {
  const out: NativePatch[] = []
  for (const s of ctx.site.pages[page] ?? []) {
    for (const f of fieldsOf(ctx, s.type)) {
      if (f.type !== "font" && f.type !== "font_picker" && !/(^|_)font(_family)?$/.test(f.id)) continue
      const v = s.settings?.[f.id]
      if (typeof v !== "string" || !v || v === "inherit") continue
      const inherit = f.options?.some((o) => String((o as { value: unknown }).value) === "inherit")
      out.push(inherit ? { op: "set", path: sectionPath(page, s.id, "settings", f.id), value: "inherit" } : { op: "remove", path: sectionPath(page, s.id, "settings", f.id) })
    }
  }
  return out.slice(0, 6)
}

function sharedScale(ctx: FixContext, page: string): NativePatch[] {
  const out: NativePatch[] = []
  for (const s of bodySections(ctx.site.pages[page] ?? [])) {
    for (const f of fieldsOf(ctx, s.type)) {
      if (!HEADING_SIZE.test(f.id) || s.settings?.[f.id] === undefined) continue
      if (s.settings[f.id] === f.default) continue
      out.push({ op: "remove", path: sectionPath(page, s.id, "settings", f.id) })
    }
  }
  return out.slice(0, 6)
}

function stillSection(ctx: FixContext, page: string, s: SectionInstance): NativePatch[] {
  const out: NativePatch[] = []
  for (const f of fieldsOf(ctx, s.type)) {
    const v = s.settings?.[f.id]
    if (/^(animate_heading|autoplay|animate|marquee)$/.test(f.id) && v === true) out.push({ op: "set", path: sectionPath(page, s.id, "settings", f.id), value: false })
    else if (/^(animation|entrance|motion)$/.test(f.id) && f.options?.some((o) => String((o as { value: unknown }).value) === "none") && v !== "none") out.push({ op: "set", path: sectionPath(page, s.id, "settings", f.id), value: "none" })
  }
  return out
}

const VARIANT = /^(layout|style|image_position|image_side|card_style|alignment|align)$/

function breakRun(ctx: FixContext, page: string): NativePatch[] {
  const sections = ctx.site.pages[page] ?? []
  for (const run of repeatedRuns(sections)) {
    const third = run.ids[2]
    const after = sections.findIndex((s, i) => i > sections.findIndex((x) => x.id === run.ids[run.ids.length - 1]) && !isChrome(s) && !s.hidden && s.type !== run.type)
    if (after >= 0) return [{ op: "reorder", path: sectionPath(page, third), to: after }]
    /* Nothing different further down: the middle one takes another of its own layouts. */
    const middle = sections.find((s) => s.id === run.ids[1])
    if (!middle) continue
    for (const f of fieldsOf(ctx, middle.type)) {
      if (!VARIANT.test(f.id) || !(f.options?.length ?? 0)) continue
      const values = f.options!.map((o) => String((o as { value: unknown }).value))
      const now = String(middle.settings?.[f.id] ?? f.default ?? values[0])
      const other = values.find((v) => v !== now)
      if (other) return [{ op: "set", path: sectionPath(page, middle.id, "settings", f.id), value: other }]
    }
  }
  return []
}

function snapPadding(ctx: FixContext, page: string): NativePatch[] {
  const counts = paddingValues(ctx.site.pages[page] ?? [])
  if (counts.size <= RHYTHM_MAX_VALUES) return []
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]).slice(0, 2).map(([v]) => v)
  const out: NativePatch[] = []
  for (const s of bodySections(ctx.site.pages[page] ?? [])) {
    for (const key of ["padding_top", "padding_bottom"]) {
      const v = s.settings?.[key]
      if (typeof v !== "number" || common.includes(v)) continue
      const nearest = common.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a))
      if (fieldsOf(ctx, s.type).some((f) => f.id === key)) out.push({ op: "set", path: sectionPath(page, s.id, "settings", key), value: nearest })
    }
  }
  return out.slice(0, 12)
}

const REMOVABLE_COPY = /^(eyebrow|subheading|caption|badge_text|note|label|tagline|kicker)$/

function dropPlaceholder(ctx: FixContext, page: string, s: SectionInstance, text: string): NativePatch[] {
  const needle = text.trim().toLowerCase().slice(0, 40)
  for (const f of fieldsOf(ctx, s.type)) {
    const v = s.settings?.[f.id]
    if (typeof v === "string" && v.toLowerCase().includes(needle) && REMOVABLE_COPY.test(f.id)) return [{ op: "set", path: sectionPath(page, s.id, "settings", f.id), value: "" }]
  }
  return []
}

/** The patches for one defect, or none when it is not a setting's to fix. */
export function fixFor(d: Defect, ctx: FixContext): NativePatch[] {
  const s = sectionFor(ctx, d)
  const page = d.page
  switch (d.kind) {
    case "heading-wrap":
      return s ? smallerHeading(ctx, page, s, 0.75) : []
    case "overflow": {
      if (!s) return []
      /* A headline that sticks out is made smaller; anything else, a decorative effect is flattened first. */
      if (/^h[1-3]\b/.test(d.selector ?? "")) return [...smallerHeading(ctx, page, s, 0.6), ...letGo(ctx, page, s)]
      const flat = flatten(ctx, page, s)
      return flat.length ? flat : [...letGo(ctx, page, s), ...smallerHeading(ctx, page, s, 0.6)]
    }
    case "text-clipped":
      return s ? [...letGo(ctx, page, s), ...smallerHeading(ctx, page, s, 0.8)] : []
    case "contrast":
      return s ? readable(ctx, page, s) : []
    case "image-broken":
      return s ? noPicture(ctx, page, s, /\(([^)]+)\)/.exec(d.what)?.[1], false) : []
    case "image-missing":
    case "image-slot-empty":
    case "empty-section":
      return s && !isChrome(s) && !hasVisibleWords(ctx, s) ? [{ op: "set", path: sectionPath(page, s.id, "hidden"), value: true }] : []
    case "no-cta":
      return addAction(ctx, page)
    case "dead-cta":
    case "broken-link": {
      const href = /href "([^"]*)"/.exec(d.what)?.[1] ?? /links to (\S+)/.exec(d.what)?.[1] ?? ""
      if (!s) return []
      const linked = relink(ctx, page, s, href)
      return linked.length ? linked : labelledAction(ctx, page, s, /call to action "([^"]*)"/.exec(d.what)?.[1] ?? "")
    }
    case "overlap":
      return d.what.startsWith("The header") ? solidHeader(ctx, page) : s ? smallerHeading(ctx, page, s, 0.8) : []
    case "font-families":
      return themeFonts(ctx, page)
    case "type-scale":
      return sharedScale(ctx, page)
    case "reduced-motion":
      return s ? stillSection(ctx, page, s) : []
    case "repetition":
      return breakRun(ctx, page)
    case "rhythm":
      return snapPadding(ctx, page)
    case "placeholder-copy":
      return s ? dropPlaceholder(ctx, page, s, /"(.+)"\.?$/.exec(d.what)?.[1] ?? "") : []
    default:
      return []
  }
}

function hasVisibleWords(ctx: FixContext, s: SectionInstance): boolean {
  return fieldsOf(ctx, s.type).some((f) => (f.type === "text" || f.type === "textarea" || f.type === "richtext") && typeof s.settings?.[f.id] === "string" && (s.settings[f.id] as string).trim().length > 1)
}

/** Most patches one round applies: a review refines, it does not redo. */
export const MAX_PATCHES_PER_ROUND = 16

/**
 * The round's patches: the gates first, then by severity, one change per setting (the first defect to claim a
 * setting keeps it), at most MAX_PATCHES_PER_ROUND. Pure.
 */
export function planFixes(defects: Defect[], ctx: FixContext): { fixes: PlannedFix[]; patches: NativePatch[]; unplaced: Defect[] } {
  const rank = { critical: 0, high: 1, medium: 2, low: 3 }
  const ordered = [...defects].sort((a, b) => Number(b.gate) - Number(a.gate) || rank[a.severity] - rank[b.severity])
  const claimed = new Set<string>()
  const fixes: PlannedFix[] = []
  const patches: NativePatch[] = []
  const unplaced: Defect[] = []
  for (const d of ordered) {
    if (d.kind === "review") continue
    const mine = fixFor(d, ctx).filter((p) => !claimed.has(p.path))
    if (!mine.length) {
      unplaced.push(d)
      continue
    }
    if (patches.length + mine.length > MAX_PATCHES_PER_ROUND) break
    for (const p of mine) {
      claimed.add(p.path)
      patches.push({ ...p, why: `${d.kind}: ${d.what}`.slice(0, 200) })
    }
    fixes.push({ defect: d, patches: mine })
  }
  return { fixes, patches, unplaced }
}
