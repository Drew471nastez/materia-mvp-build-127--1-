/**
 * A template put together: its components written out as files, every page
 * framed by the same header and footer instances (as add_page frames a new
 * page with home's), and the image slots checked against what is placed.
 *
 * Pure. Browser safe.
 */
import type { SectionInstance } from "@/lib/website-builder/types"
import type { GenerateAspect, GeneratePurpose, SiteTemplate, SlotGenerate, TemplateImageSlot, TemplatePage } from "../types"
import { filesOf, type ComponentDef } from "./schema"

export interface TemplateDraft extends Omit<SiteTemplate, "files" | "pages"> {
  components: ComponentDef[]
  header: SectionInstance
  footer: SectionInstance
  pages: { key: string; title: string; seo?: TemplatePage["seo"]; sections: SectionInstance[] }[]
}

export function assemble(d: TemplateDraft): SiteTemplate {
  const { components, header, footer, pages, ...rest } = d
  const framed: TemplatePage[] = pages.map((p) => ({ key: p.key, title: p.title, ...(p.seo ? { seo: p.seo } : {}), sections: [structuredCloneish(header), ...p.sections, structuredCloneish(footer)] }))
  const t: SiteTemplate = { ...rest, files: filesOf(components), pages: framed, imageSlots: withHeaderCards(rest.imageSlots, header, framed).map((s) => ({ ...s, generate: s.generate ?? generateFor(s) })) }
  /* A slot that points at nothing is a template bug: fail where it is defined, not when a picture is lost. */
  for (const slot of t.imageSlots) {
    for (const target of slot.targets) {
      const page = t.pages.find((p) => p.key === target.page)
      const section = page?.sections.find((x) => x.id === target.section)
      const ok = !!section && (target.block ? !!section.blocks?.some((b) => b.id === target.block) : true)
      if (!ok) throw new Error(`template ${t.id}: image slot ${slot.key} points at ${target.page} › ${target.section}${target.block ? ` › ${target.block}` : ""}, which is not placed`)
    }
  }
  return t
}

/**
 * Round Q2: the header's collection cards (its "feature" blocks, shown in the
 * mega panels and beside the full screen menu as the picture that follows
 * the pointer) take pictures the template already makes: each card is one
 * more target of an existing slot on every page, so the menu is never a
 * column of empty frames and no extra image is generated.
 */
function withHeaderCards(slots: TemplateImageSlot[], header: SectionInstance, pages: TemplatePage[]): TemplateImageSlot[] {
  const cards = (header.blocks ?? []).filter((b) => b.type === "feature" && !b.settings?.image)
  const pool = slots.filter((s) => s.style !== "product" && !/mobile/.test(s.key) && s.key !== "hero")
  if (!cards.length || !pool.length) return slots
  const extra = new Map<string, TemplateImageSlot["targets"]>()
  cards.forEach((card, i) => {
    const slot = pool[(i * 2 + 1) % pool.length]
    extra.set(slot.key, [...(extra.get(slot.key) ?? []), ...pages.map((p) => ({ page: p.key, section: header.id, block: card.id, setting: "image" }))])
  })
  return slots.map((s) => (extra.has(s.key) ? { ...s, targets: [...s.targets, ...extra.get(s.key)!] } : s))
}

/** The crop ratio as P1's three shapes: wider than 1.1 is landscape, narrower than 0.9 portrait. */
export function generateAspect(aspect: TemplateImageSlot["aspect"]): GenerateAspect {
  const [w, h] = aspect.split(":").map(Number)
  const r = w / h
  return r > 1.1 ? "landscape" : r < 0.9 ? "portrait" : "square"
}

/** What a slot is for and how it is made, for generate_image, from its key and style. */
export function generateFor(slot: TemplateImageSlot): SlotGenerate {
  const k = slot.key
  const purpose: GeneratePurpose = /^hero|cover/.test(k) ? (slot.style === "product" ? "product" : "hero") : slot.style === "product" ? "product" : slot.style === "portrait" || /coach|team/.test(k) ? "portrait" : /macro|detail|treatment|chapter|card/.test(k) ? "detail" : /about|room|bench|studio|street/.test(k) ? "place" : /look|format|day/.test(k) ? "people" : "gallery"
  return { aspect: generateAspect(slot.aspect), purpose, style: slot.style === "product" ? "studio" : "photo" }
}

function structuredCloneish<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}
