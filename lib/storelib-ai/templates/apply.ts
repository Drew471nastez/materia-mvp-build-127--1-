/**
 * ===========================================================================
 *  STARTING A SITE FROM A TEMPLATE, AND KNOWING WHAT IS STILL THE TEMPLATE'S
 * ===========================================================================
 * applyTemplate writes a template into an install through the agent's
 * ProjectStore (lib/ai-builder/agent/ports.ts), every write a DRAFT:
 *
 *   files      sections/ai_<prefix>_*.storelib (author "ai", the job's id)
 *   pages      home, the other pages and the templates, blocks included,
 *              each framed by the template's header and footer
 *   settings   the tokens as Theme settings (the agent's own mapper, so
 *              the result is what set_tokens would have written), the
 *              menus, each page's search title, the motion feel, the
 *              design contract's metadata, and `ai_template` (which
 *              template, for the finish gate)
 *   DESIGN.md  the site's design contract (round O2's format)
 *
 * With a direction (`opts.choice`) the palette and the fonts are the
 * direction's, not the template's: the template brings the composition,
 * the direction brings the brand. Pictures already made (`opts.images`, by
 * slot key) are written into their settings; the rest come back as tasks
 * for P1's generate_image.
 *
 * Then the agent ADAPTS it: every word rewritten for the creator's real
 * business and products, pictures generated for each slot, sections
 * recomposed. untouchedTemplateParts says what is still the template's own,
 * so finish can refuse a home that is still the template copy (P5 wires it).
 *
 * No Supabase here: only the port.
 */
import type { CreativeBrief } from "@/lib/storelib-ai/direction/brief"
import type { DirectionChoice } from "@/lib/storelib-ai/direction/choose"
import { DESIGN_MD_PATH, renderDesignMd, type DesignMdSection } from "@/lib/storelib-ai/direction/design-md"
import { DESIGN_CONTRACT_SETTING, designMdTokensFrom, flatTokens } from "@/lib/ai-builder/design-contract"
import { tokensToThemeSettings } from "@/lib/ai-builder/agent/tokens"
import { versionOf } from "@/lib/ai-builder/agent/version"
import type { ProjectStore, StoredPage } from "@/lib/ai-builder/agent/ports"
import type { DesignTokens, FileAuthor } from "@/lib/ai-builder/types"
import type { SectionInstance } from "@/lib/website-builder/types"
import type { SiteTemplate, TemplateImageSlot } from "./types"

/** The Theme setting that remembers which template a site started from. */
export const TEMPLATE_SETTING = "ai_template"

export interface ApplyOptions {
  jobId: string
  author?: FileAuthor
  /** The job's direction: its palette and fonts replace the template's. */
  choice?: Pick<DirectionChoice, "palette" | "fonts" | "primary"> | null
  /** Pictures already made, by slot key. */
  images?: Record<string, { url: string; alt?: string }>
  /** Replace files that already exist with other text (a redesign). Default: an existing different file is left and reported. */
  overwrite?: boolean
}

export interface ImageTask {
  key: string
  prompt: string
  aspect: TemplateImageSlot["aspect"]
  style: TemplateImageSlot["style"]
  alt: string
  targets: TemplateImageSlot["targets"]
}

export interface ApplyResult {
  ok: boolean
  template: string
  files: string[]
  pages: string[]
  settings: string[]
  designMd: boolean
  /** Slots still without a picture: generate each (P1's generate_image) and write it into its targets. */
  images: ImageTask[]
  /** What could not be written, in plain words. */
  problems: string[]
  /** The adaptation work, for the agent's next turn. */
  next: string
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** The template's tokens, with the direction's palette and fonts when one is given. */
export function tokensFor(template: SiteTemplate, choice?: ApplyOptions["choice"]): DesignTokens {
  const t = clone(template.tokens)
  if (!choice) return t
  const p = choice.palette
  t.colors = { background: p.background, surface: p.surface, text: p.text, muted: p.muted, accent: p.accent, accentText: p.accentText, border: p.border, ...(p.inverse ? { inverse: { ...p.inverse } } : t.colors.inverse ? { inverse: t.colors.inverse } : {}) }
  t.fonts = { heading: choice.fonts.display, body: choice.fonts.body, ...(choice.fonts.mono ? { accent: choice.fonts.mono } : t.fonts.accent ? { accent: t.fonts.accent } : {}) }
  return t
}

/** A slot's prompt for this creator's business: the template's picture, said for them. */
export function slotPrompt(slot: TemplateImageSlot, brief: Pick<CreativeBrief, "business" | "prompt"> | null): string {
  if (!brief) return slot.prompt
  const who = brief.business.name ? `${brief.business.name}, a ${brief.business.label}` : `a ${brief.business.label}`
  const asked = brief.prompt.replace(/\s+/g, " ").trim().slice(0, 240)
  return `${slot.prompt}. For ${who}. What the owner said about the business: "${asked}". Photographic, believable, no text, no logos, no watermarks.`
}

/** Every slot's task, prompts said for this business. */
export function imageTasks(template: SiteTemplate, brief: Pick<CreativeBrief, "business" | "prompt"> | null): ImageTask[] {
  return template.imageSlots.map((slot) => ({ key: slot.key, prompt: slotPrompt(slot, brief), aspect: slot.aspect, style: slot.style, alt: slot.alt, targets: clone(slot.targets) }))
}

/** The pages with the given pictures written into their settings. */
export function pagesWithImages(template: SiteTemplate, images: ApplyOptions["images"] = {}): StoredPage[] {
  const pages = clone(template.pages)
  for (const slot of template.imageSlots) {
    const img = images[slot.key]
    if (!img?.url) continue
    for (const target of slot.targets) {
      const section = pages.find((p) => p.key === target.page)?.sections.find((s) => s.id === target.section)
      const holder = target.block ? section?.blocks?.find((b) => b.id === target.block) : section
      if (!holder) continue
      holder.settings[target.setting] = img.url
      const altKey = `${target.setting}_alt`
      if (altKey in holder.settings || target.setting === "image") holder.settings[target.setting === "image" ? "image_alt" : altKey] = img.alt ?? slot.alt
    }
  }
  return pages.map((p) => ({ key: p.key, sections: p.sections }))
}

/** The site plan report_progress expects (lib/ai-builder/agent/site-plan.ts readSitePlan), as the template lays it out. */
export function templatePlan(template: SiteTemplate): { key: string; sections: string[]; reason?: string }[] {
  const own = (sections: SectionInstance[]) => sections.filter((s) => s.group !== "header" && s.group !== "footer")
  const keep = "The platform's working layout in the site's tokens is enough here."
  const planned = template.pages.map((p) => ({ key: p.key, sections: own(p.sections).map((s) => `${s.type}: ${s.name}`) }))
  const have = new Set(planned.map((p) => p.key))
  for (const key of ["cart", "404"]) if (!have.has(key)) planned.push({ key, sections: [], reason: keep } as never)
  return planned
}

function designMdOf(template: SiteTemplate, tokens: DesignTokens, brief: Pick<CreativeBrief, "business"> | null): string {
  const d = template.design
  const sections: DesignMdSection[] = [
    { heading: "Overview", body: `${template.name}: ${d.thesis}\n\nStarted from the ${template.name} template for ${brief ? `a ${brief.business.label}` : "this business"}; every word, picture and section is the site's own once adapted.` },
    { heading: "Colors", body: `A ${template.summary.toLowerCase().includes("dark") ? "dark" : "considered"} palette with one accent.\n\n- **Ground (\`neutral\`):** the page background.\n- **Ink (\`on-surface\`):** headlines and text, at least 4.5:1 on the ground.\n- **Accent (\`primary\`):** actions and one signature detail. Never a background for long text.\n- **Contrast band (\`inverse-surface\`):** the bands that change the tempo.` },
    { heading: "Typography", body: `Display in **${tokens.fonts.heading}**, text in **${tokens.fonts.body}**${tokens.fonts.accent ? `, labels and figures in **${tokens.fonts.accent}**` : ""}.\n\n- Headlines fluid with clamp() between phone and desktop.\n- Prices, times and numbers use tabular figures.` },
    { heading: "Layout", body: [...d.layout.map((l) => `- ${l}`), "- Mobile first: designed at 390px wide, nothing scrolls sideways, tap targets at least 44px."].join("\n") },
    { heading: "Elevation & Depth", body: "Flat. Hierarchy comes from scale, colour bands and rules. Shadows only on what floats over the page (the cart, a menu)." },
    { heading: "Shapes", body: `${tokens.radius.small === 0 ? "Square" : `${tokens.radius.small}px`} corners on buttons and inputs, the same everywhere. Pictures keep one crop language across the site.` },
    { heading: "Components", body: "- **Header and footer:** the site's own, with the menu drawer, search window, cart drawer and language and currency switches on Storelib's hooks.\n- **Lists and cards:** only where items really repeat; products always come from the shop.\n- **Forms:** the creator's own form or booking form, else a contact form." },
    { heading: "Imagery", body: d.imagery },
    { heading: "Motion", body: `${d.motion} Everything stands still under prefers-reduced-motion. The level is set in Theme settings › Animations.` },
    { heading: "Do's and Don'ts", body: [...d.signature.map((x) => `- Do keep the ${x}.`), "- Do maintain WCAG AA contrast (4.5:1 for text).", ...d.avoid.map((a) => `- Don't use ${a}.`), "- Don't invent reviews, client numbers, awards or logos."].join("\n") },
  ]
  const md = designMdTokensFrom(tokens, { name: template.name, description: template.summary.replace(/—/g, ",") })
  return renderDesignMd({ tokens: md, title: `${template.name} design contract`, sections })
}

/** Writes the template into the install as drafts. Never throws: what failed is in `problems`. */
export async function applyTemplate(store: ProjectStore, template: SiteTemplate, brief: CreativeBrief | null, opts: ApplyOptions): Promise<ApplyResult> {
  const author: FileAuthor = opts.author ?? "ai"
  const problems: string[] = []
  const files: string[] = []
  for (const [path, text] of Object.entries(template.files)) {
    try {
      const existing = await store.readFile(path)
      if (existing && existing.text === text) {
        files.push(path)
        continue
      }
      if (existing && !opts.overwrite) {
        problems.push(`${path} already exists with other text, so it was left as it is.`)
        continue
      }
      const w = await store.writeFile(path, text, { expectedVersion: existing ? versionOf(existing.text) : null, author, jobId: opts.jobId })
      if (w.ok) files.push(path)
      else problems.push(`${path} was not written: ${w.error}`)
    } catch (e) {
      problems.push(`${path} was not written: ${e instanceof Error ? e.message : "the store failed"}`)
    }
  }

  const pages = pagesWithImages(template, opts.images)
  try {
    await store.writePages(pages)
  } catch (e) {
    problems.push(`The pages were not written: ${e instanceof Error ? e.message : "the store failed"}`)
  }

  const tokens = tokensFor(template, opts.choice)
  let settings: string[] = []
  let designMd = false
  try {
    const current = await store.readSettings()
    const mapped = tokensToThemeSettings(tokens, current)
    for (const i of mapped.issues) if (i.severity === "error") problems.push(i.message)
    const pageSeo = { ...((current.page_seo as Record<string, unknown>) ?? {}) }
    for (const p of template.pages) if (p.seo) pageSeo[p.key] = { title: p.seo.title.slice(0, 70), ...(p.seo.description ? { description: p.seo.description.slice(0, 160) } : {}) }
    const menus = { ...((current.menus as Record<string, unknown>) ?? {}), ...clone(template.menus) }
    const patch: Record<string, unknown> = {
      ...mapped.settings,
      menus,
      page_seo: pageSeo,
      [DESIGN_CONTRACT_SETTING]: { v: 1, direction: { primary: opts.choice?.primary.id ?? template.directionIds[0] ?? "", secondary: null }, ai: flatTokens(tokens) },
      [TEMPLATE_SETTING]: { id: template.id, v: 1 },
    }
    await store.writeSettings(patch)
    settings = Object.keys(patch)
  } catch (e) {
    problems.push(`Theme settings were not written: ${e instanceof Error ? e.message : "the store failed"}`)
  }

  try {
    const text = designMdOf(template, tokens, brief)
    const existing = await store.readFile(DESIGN_MD_PATH)
    if (!existing || existing.text !== text) {
      const w = await store.writeFile(DESIGN_MD_PATH, text, { expectedVersion: existing ? versionOf(existing.text) : null, author, jobId: opts.jobId })
      designMd = w.ok
      if (!w.ok) problems.push(`DESIGN.md was not written: ${w.error}`)
    } else designMd = true
  } catch {
    problems.push("DESIGN.md could not be written just now.")
  }

  const images = imageTasks(template, brief).filter((t) => !opts.images?.[t.key]?.url)
  return { ok: problems.length === 0, template: template.id, files, pages: pages.map((p) => p.key), settings, designMd, images, problems, next: adaptationBrief(template, brief, images) }
}

/** What the agent does next, in plain lines: the template is a start, never the site. */
export function adaptationBrief(template: SiteTemplate, brief: Pick<CreativeBrief, "business" | "cta" | "mustNotFabricate"> | null, images: ImageTask[] = imageTasks(template, null)): string {
  const lines = [
    `The ${template.name} template is written as drafts. It is a starting point: nothing of it ships as it is.`,
    `1. Words: rewrite every heading, text, button, block and FAQ for ${brief ? `this ${brief.business.label}` : "this business"}, in the owner's voice${brief ? `; the main action reads "${brief.cta}"` : ""}. Keep a block list full: change the blocks, never leave one empty.`,
    "2. Look: the palette and fonts are the direction's; adjust each component's CSS where the brand needs it, and recompose (reorder, remove, add) so the page tells this business's story.",
    `3. Pictures: ${images.length} slot${images.length === 1 ? "" : "s"} to fill with generate_image (prompt, aspect), each written into its section setting: ${images.map((i) => `${i.key} (${i.aspect})`).join(", ") || "none"}.`,
    `4. Data: bind the real products, collections and forms (${template.bindings.map((b) => `${b.page} › ${b.section}.${b.setting}`).join(", ")}).`,
    `5. Never invent proof: no reviews, client counts, awards or logos${brief?.mustNotFabricate.length ? `; and no ${brief.mustNotFabricate.join(", ")}` : ""}.`,
  ]
  return lines.join("\n")
}

/* ── what is still the template's ──────────────────────────────────────── */

export interface UntouchedParts {
  template: string
  /** Files still byte for byte the template's. */
  files: string[]
  /** Placed sections whose settings and blocks are still the template's, by page. */
  sections: { page: string; id: string; type: string }[]
  /** Home's own sections (header and footer aside) are all still the template's, in its order. */
  homeIdentical: boolean
  /** How many of home's own sections are still the template's, of how many it has. */
  home: { untouched: number; total: number }
  /** Image slots none of whose targets has a picture yet. */
  emptyImageSlots: string[]
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const body = (sections: SectionInstance[]) => sections.filter((s) => s.group !== "header" && s.group !== "footer" && !s.hidden)
const copyOf = (s: SectionInstance) => ({ type: s.type, settings: s.settings ?? {}, blocks: (s.blocks ?? []).map((b) => ({ type: b.type, settings: b.settings ?? {} })) })

/**
 * What of a site is still the template's own copy. `project` is the install
 * as the ProjectStore has it: files by path and the stored pages.
 */
export function untouchedTemplateParts(template: SiteTemplate, project: { files: Record<string, string>; pages: StoredPage[] }): UntouchedParts {
  const files = Object.entries(template.files)
    .filter(([path, text]) => project.files[path] === text)
    .map(([path]) => path)
  const sections: UntouchedParts["sections"] = []
  for (const tp of template.pages) {
    const page = project.pages.find((p) => p.key === tp.key)
    if (!page) continue
    for (const ts of body(tp.sections)) {
      const now = page.sections.find((s) => s.id === ts.id)
      if (now && same(copyOf(now), copyOf(ts)) && project.files[`sections/${ts.type}.storelib`] === template.files[`sections/${ts.type}.storelib`]) sections.push({ page: tp.key, id: ts.id, type: ts.type })
    }
  }
  const tHome = body(template.pages.find((p) => p.key === "home")?.sections ?? [])
  const nowHome = body(project.pages.find((p) => p.key === "home")?.sections ?? [])
  const homeUntouched = tHome.filter((ts) => sections.some((x) => x.page === "home" && x.id === ts.id)).length
  const homeIdentical = tHome.length > 0 && nowHome.length === tHome.length && nowHome.every((s, i) => s.id === tHome[i].id) && homeUntouched === tHome.length
  const valueAt = (target: TemplateImageSlot["targets"][number]): unknown => {
    const section = project.pages.find((p) => p.key === target.page)?.sections.find((s) => s.id === target.section)
    const holder = target.block ? section?.blocks?.find((b) => b.id === target.block) : section
    return holder?.settings?.[target.setting]
  }
  const emptyImageSlots = template.imageSlots.filter((slot) => slot.targets.every((t) => !valueAt(t))).map((s) => s.key)
  return { template: template.id, files, sections, homeIdentical, home: { untouched: homeUntouched, total: tHome.length }, emptyImageSlots }
}
