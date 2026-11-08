/**
 * ===========================================================================
 *  START WITH AI: PHOTOGRAPHS, FOUND, COPIED AND CREDITED
 * ===========================================================================
 * A generated site with grey boxes where its pictures should be reads as
 * unfinished. Each picture slot the plan briefed ("hand thrown ceramic
 * bowls, landscape") is searched on Openverse (openly licensed photos, no key
 * needed), one photo is picked by size and shape, and it is COPIED into the
 * creator's own media (store-builder-images/<owner>/sections/, the folder the
 * editor's own image picker uploads to), so the site never hot-links someone
 * else's server and the creator can replace it like any upload.
 *
 * THE DOWNLOAD takes every rule of Copy to Storelib (lib/blog/copy-image.ts
 * downloadExternalImage): https only, public addresses only (checked when the
 * name resolves and again as the socket connects), at most three redirects,
 * 10 MB, 10 seconds, a raster picture by its bytes, location and camera data
 * removed. A photo that fails any of them is skipped, never stored.
 *
 * LICENCES. Only CC0, Public Domain Mark, CC BY and CC BY-SA, all usable
 * commercially and none of them "no derivatives" (the site crops photos).
 * Attribution is kept twice, the least intrusive way that still complies:
 * the photo's alt text describes it, and a "Photo credits" page lists every
 * photo with its title, author, licence and source, linked from the footer
 * (./apply.ts footerLinks). Nothing is printed over the photos themselves.
 *
 * NO GREY BOXES. A slot with no photo is not left empty on the live site:
 * a background goes back to its colour, a feature list to numbers, a gallery
 * item is taken out, and a section that is a picture first becomes its own
 * words-only sibling (`fallbackFor`), or is left off when it has none.
 */
import type { ThemeOp } from "../agent/operations"
import { fieldsFor, blockSpecs } from "../agent/operations"
import { schemaOf, type SchemaMap } from "../agent/schemas"
import { imageSlots, type ImageAspect, type ImageBrief, type SitePlanSection } from "../agent/site-plan"
import type { SectionInstance } from "../types"

export const OPENVERSE_API = "https://api.openverse.org/v1/images/"
/** Licences a generated site may use: commercial, and adaptable (photos are cropped). */
export const OPENVERSE_LICENSES = ["cc0", "pdm", "by", "by-sa"] as const

export interface OpenverseImage {
  id: string
  title: string
  url: string
  width: number
  height: number
  creator: string
  license: string
  license_version: string
  license_url: string
  foreign_landing_url: string
  filetype?: string | null
}

export interface PhotoCredit {
  title: string
  creator: string
  license: string
  licenseUrl: string
  source: string
  page: string
}

export interface ImageDeps {
  search: (query: string, aspect: ImageAspect) => Promise<OpenverseImage[]>
  /** Download under the SSRF rules and store in the creator's media: the stored address, or why not. */
  copy: (url: string) => Promise<{ ok: true; url: string } | { ok: false; error: string }>
}

/** The search address for one brief. Pure, so a test can read it. */
export function openverseUrl(query: string, aspect: ImageAspect, pageSize = 20): string {
  const q = new URLSearchParams({
    q: query.slice(0, 120),
    license: OPENVERSE_LICENSES.join(","),
    license_type: "commercial",
    page_size: String(pageSize),
    mature: "false",
    aspect_ratio: aspect === "portrait" ? "tall" : aspect === "square" ? "square" : "wide",
    size: "large",
  })
  return `${OPENVERSE_API}?${q.toString()}`
}

/** Searches Openverse with `fetchImpl` (server side, a deadline each). An optional OPENVERSE_API_TOKEN raises the anonymous rate limit. */
export function openverseSearch(fetchImpl: typeof fetch = fetch, token = process.env.OPENVERSE_API_TOKEN): ImageDeps["search"] {
  return async (query, aspect) => {
    const res = await fetchImpl(openverseUrl(query, aspect), {
      headers: { accept: "application/json", "user-agent": "Storelib website builder (+https://storelib.com)", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []
    const data = (await res.json().catch(() => null)) as { results?: unknown[] } | null
    return (Array.isArray(data?.results) ? data!.results : []).map(readResult).filter((r): r is OpenverseImage => r !== null)
  }
}

function readResult(raw: unknown): OpenverseImage | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "")
  const n = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : 0)
  if (!s("url").startsWith("https://") || !(OPENVERSE_LICENSES as readonly string[]).includes(s("license").toLowerCase())) return null
  return {
    id: s("id"),
    title: s("title").slice(0, 160),
    url: s("url"),
    width: n("width"),
    height: n("height"),
    creator: s("creator").slice(0, 120),
    license: s("license").toLowerCase(),
    license_version: s("license_version"),
    license_url: s("license_url"),
    foreign_landing_url: s("foreign_landing_url"),
    filetype: s("filetype") || null,
  }
}

/**
 * The best photos for one slot, best first: big enough, the right shape, a
 * photo format, and not already used elsewhere on the site.
 */
export function rankImages(results: OpenverseImage[], aspect: ImageAspect, used: Set<string>, minWidth = 1000): OpenverseImage[] {
  const want = aspect === "portrait" ? 0.8 : aspect === "square" ? 1 : 1.5
  return results
    .filter((r) => !used.has(r.id) && !used.has(r.url) && r.width >= minWidth && r.height >= 500 && (!r.filetype || /^(jpe?g|png|webp)$/i.test(r.filetype)))
    .map((r) => ({ r, score: Math.abs(Math.log(r.width / r.height / want)) - Math.min(r.width, 3000) / 30000 }))
    .sort((a, b) => a.score - b.score)
    .map((x) => x.r)
}

function licenceName(img: OpenverseImage): string {
  if (img.license === "cc0") return "CC0"
  if (img.license === "pdm") return "Public Domain Mark"
  return `CC ${img.license.toUpperCase()}${img.license_version ? ` ${img.license_version}` : ""}`
}

export function creditOf(img: OpenverseImage, page: string): PhotoCredit {
  return { title: img.title || "Untitled", creator: img.creator || "Unknown", license: licenceName(img), licenseUrl: img.license_url, source: img.foreign_landing_url, page }
}

/** A short description for alt text: the brief's subject, said plainly. */
function altFor(brief: ImageBrief, img: OpenverseImage): string {
  const title = img.title && !/^(img|dsc|photo|image)[\s_-]?\d*/i.test(img.title) && img.title.length < 90 ? img.title : ""
  return (title || brief.query).replace(/\s+/g, " ").trim().slice(0, 120)
}

/* ── which slots a section really needs ─────────────────────────────────── */

/** A picture field that is only drawn when a setting asks for it (a hero over a colour, a newsletter background). */
function slotNeeded(section: SectionInstance, slot: string, planned: SitePlanSection, schemas?: SchemaMap): boolean {
  const s = section.settings ?? {}
  const ids = new Set(fieldsFor(section.type, schemas).map((f) => f.id))
  if (slot === "block:point" || slot === "block:card") return s.marker === "image"
  if (slot.startsWith("block:")) return true
  if (ids.has("background") && slot === "image") return s.background === "image"
  if (/^bg_|background/.test(slot)) return planned.images.some((i) => i.slot === slot)
  return true
}

export interface SlotJob {
  page: string
  section: SectionInstance
  planned: SitePlanSection
  slot: string
  brief: ImageBrief
}

/** Every picture slot a section on the page needs, with its brief (the plan's, or one made from the site's imagery). */
export function slotsFor(page: string, section: SectionInstance, planned: SitePlanSection, fallbackQuery: string, schemas?: SchemaMap): SlotJob[] {
  const slots = imageSlots(section.type, schemas)
  const all = [...slots.fields, ...slots.blocks.map((b) => `block:${b}`)]
  return all
    .filter((slot) => slotNeeded(section, slot, planned, schemas))
    .map((slot) => {
      const brief = planned.images.find((i) => i.slot === slot) ?? { slot, query: fallbackQuery, aspect: (slot.startsWith("block:") ? "square" : "landscape") as ImageAspect }
      return { page, section, planned, slot, brief }
    })
    .filter((j) => j.brief.query.trim().length > 0)
}

const altField = (ids: Set<string>, slot: string) => [`${slot}_alt`, slot === "image" ? "image_alt" : "", "alt"].find((a) => a && ids.has(a)) ?? null

export interface SlotResult {
  ops: ThemeOp[]
  credits: PhotoCredit[]
  /** Slots that got no photo: the fallback decides what the section becomes. */
  missing: string[]
}

/** One slot: searched, copied, written (with alt text), credited. Never throws. */
export async function fillSlot(job: SlotJob, deps: ImageDeps, used: Set<string>, schemas?: SchemaMap): Promise<SlotResult> {
  const out: SlotResult = { ops: [], credits: [], missing: [] }
  const { section, slot, brief } = job
  let results: OpenverseImage[] = []
  try {
    results = await deps.search(brief.query, brief.aspect)
  } catch {
    results = []
  }
  if (slot.startsWith("block:")) {
    const type = slot.slice(6)
    const blocks = (section.blocks ?? []).filter((b) => b.type === type)
    const spec = blockSpecs(section.type, schemas).find((b) => b.type === type)
    const imageId = spec?.fields.find((f) => f.type === "image_picker")?.id ?? "image"
    const blockIds = new Set((spec?.fields ?? []).map((f) => f.id))
    const ranked = rankImages(results, brief.aspect, used, 700)
    for (const block of blocks) {
      let placed = false
      while (ranked.length && !placed) {
        const img = ranked.shift()!
        used.add(img.id)
        const copied = await deps.copy(img.url).catch(() => ({ ok: false as const, error: "copy failed" }))
        if (!copied.ok) continue
        const settings: Record<string, unknown> = { [imageId]: copied.url }
        const alt = altField(blockIds, imageId)
        if (alt) settings[alt] = altFor(brief, img)
        out.ops.push({ kind: "update_block", sectionId: section.id, blockId: block.id, settings })
        out.credits.push(creditOf(img, job.page))
        placed = true
      }
      if (!placed) out.missing.push(`${slot}#${block.id}`)
    }
    return out
  }
  const ids = new Set(fieldsFor(section.type, schemas).map((f) => f.id))
  const ranked = rankImages(results, brief.aspect, used, brief.aspect === "landscape" ? 1200 : 800)
  for (const img of ranked.slice(0, 3)) {
    used.add(img.id)
    const copied = await deps.copy(img.url).catch(() => ({ ok: false as const, error: "copy failed" }))
    if (!copied.ok) continue
    const settings: Record<string, unknown> = { [slot]: copied.url }
    const alt = altField(ids, slot)
    if (alt) settings[alt] = altFor(brief, img)
    out.ops.push({ kind: "update_section", id: section.id, settings })
    out.credits.push(creditOf(img, job.page))
    return out
  }
  out.missing.push(slot)
  return out
}

/* ── no grey boxes ──────────────────────────────────────────────────────── */

/** Words-only siblings for sections that are a picture first, tried in order; the first this site has is used. */
const WORDS_ONLY: [RegExp, string[]][] = [
  [/^hero_/, ["hero_editorial", "hero_centered"]],
  [/^cta_/, ["cta_simple"]],
  [/^(about_|text_image$)/, ["text_rich"]],
  [/^features_image$/, ["features_grid"]],
  [/^product_spotlight$/, ["product_featured"]],
]

export interface Fallback {
  ops: ThemeOp[]
  /** What happened, for the job's report. */
  note: string
}

/**
 * What a section becomes when some of its pictures could not be found.
 * `missing` are the slots fillSlot reported; `newId` mints the replacement's
 * id. Pure.
 */
export function fallbackFor(section: SectionInstance, missing: string[], index: number, ctx: { schemas?: SchemaMap; addable: string[]; newId: (type: string) => string }): Fallback | null {
  if (!missing.length) return null
  const name = (type: string) => `${schemaOf(ctx.schemas, type)?.name ?? type.replace(/_/g, " ")} section`
  const ids = new Set(fieldsFor(section.type, ctx.schemas).map((f) => f.id))
  const s = section.settings ?? {}
  const ops: ThemeOp[] = []
  const field = missing.filter((m) => !m.startsWith("block:"))
  const blockMissing = missing.filter((m) => m.startsWith("block:"))

  /* Items with no photo: features go back to numbers; picture items (a gallery, a collage, rows) are taken out. */
  if (blockMissing.length) {
    if (ids.has("marker") && s.marker === "image") ops.push({ kind: "update_section", id: section.id, settings: { marker: "number" } })
    else {
      const gone = new Set(blockMissing.map((m) => m.split("#")[1]).filter(Boolean))
      const left = (section.blocks ?? []).filter((b) => !gone.has(b.id))
      const pictureLed = /gallery|collage|multirow|lookbook|scroll|bento/.test(section.type)
      if (pictureLed && left.length < 2) return { ops: [{ kind: "remove_section", id: section.id }], note: `The ${name(section.type)} was left out: no photos were found for it` }
      for (const id of gone) ops.push({ kind: "remove_block", sectionId: section.id, blockId: id })
    }
  }
  if (!field.length) return { ops, note: "" }

  /* A picture behind words: back to the colour. */
  if (ids.has("background") && field.includes("image")) {
    ops.push({ kind: "update_section", id: section.id, settings: { background: "colour" } })
    return { ops, note: "" }
  }
  /* An optional background picture: nothing to do, it was never drawn without one. */
  if (field.every((f) => /^bg_|background/.test(f))) return { ops, note: "" }

  /* A section that is a picture first: its words-only sibling, with the same words, in the same place. */
  const sibling = WORDS_ONLY.find(([re]) => re.test(section.type))?.[1].find((t) => t !== section.type && ctx.addable.includes(t) && schemaOf(ctx.schemas, t))
  if (!sibling) return { ops: [{ kind: "remove_section", id: section.id }], note: `The ${name(section.type)} was left out: no photo was found for it` }
  const theirs = new Set(fieldsFor(sibling, ctx.schemas).map((f) => f.id))
  const carried: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s)) if (theirs.has(k) && !/image|_alt$|^background$/.test(k)) carried[k] = v
  /* A rich text sibling takes the old supporting line as its body. */
  if (theirs.has("body") && !carried.body && typeof s.subheading === "string" && s.subheading) carried.body = `<p>${s.subheading}</p>`
  if (theirs.has("background") && sibling.startsWith("hero")) carried.background = "colour"
  const id = ctx.newId(sibling)
  return {
    ops: [
      { kind: "remove_section", id: section.id },
      { kind: "add_section", id, sectionType: sibling, index, settings: carried },
    ],
    note: `The ${name(section.type)} became a ${name(sibling)}, without a photo: none was found for it`,
  }
}

/* ── the credits page ──────────────────────────────────────────────────── */

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const safeHref = (u: string) => (/^https:\/\//.test(u) ? esc(u) : "")

/** The Photo credits page's words: every photo, its author, its licence and where it came from. */
export function creditsHtml(credits: PhotoCredit[]): string {
  const items = credits.map((c) => {
    const title = safeHref(c.source) ? `<a href="${safeHref(c.source)}">${esc(c.title)}</a>` : esc(c.title)
    const licence = safeHref(c.licenseUrl) ? `<a href="${safeHref(c.licenseUrl)}">${esc(c.license)}</a>` : esc(c.license)
    return `<li>${title} by ${esc(c.creator)}, ${licence}, via Openverse</li>`
  })
  return `<p>The photographs on this site are openly licensed. Thank you to the photographers.</p><ul>${items.join("")}</ul>`
}

export const CREDITS_PAGE = "photo-credits"
