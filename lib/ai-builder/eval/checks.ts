/**
 * ===========================================================================
 *  ROUND R (R4): THE CHECKS EVERY GENERATED WEBSITE IS HELD TO
 * ===========================================================================
 * One function per check over an EvalSite (./types.ts): what an engine made,
 * read back from the database it wrote to, plus what the harness saw when it
 * drew, opened, edited and published it. Each check uses the code the
 * product already trusts, never a second opinion of its own:
 *
 *   data.valid           validateSite (lib/ai-builder/agent/validate.ts) and
 *                        sanitizeSections (what every save runs) keeping
 *                        every section and item
 *   components.supported every placed type has a source: the site's own
 *                        file or one of Storelib's sections
 *   render.ok            the template engine's render check per page
 *   browser.*            O4's measurements in real Chromium (JS off), and
 *                        the real hooks with JS on (the harness's)
 *   images.ok            the browser's broken and empty pictures, picture
 *                        settings that are not https or the media library
 *   direction.fit        O2's brief and art direction for the words typed,
 *                        held to what the scenario says the business is
 *   sections.relevant    O5's story: the home page covers what the trade
 *                        needs, and is not the software skeleton
 *   novelty.distinct     O3's fingerprints across the six, plus palette and
 *                        type distance
 *   tokens.coherent      contrast of the token pairs, fonts named, the
 *                        DESIGN.md contract in step with Theme settings
 *   editor.saved,
 *   publish.ok           what the harness saw through the real routes
 *
 * Pure. Browser safe (no server-only module).
 */
import { validateSite, errorsOf, schemaInfo } from "@/lib/ai-builder/agent/validate"
import { emptyImageSlots } from "@/lib/ai-builder/agent/content-check"
import { sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { isStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { briefFrom, type CreativeBrief } from "@/lib/storelib-ai/direction/brief"
import { artDirection } from "@/lib/storelib-ai/direction/directions"
import { chooseDirection, isDisplaySerif } from "@/lib/storelib-ai/direction/choose"
import { parseDesignMd, DESIGN_MD_PATH } from "@/lib/storelib-ai/direction/design-md"
import { layoutStoryFor, skeletonMatch } from "@/lib/storelib-ai/layout/stories"
import { conceptClicheIssues, AI_DEFAULT_INDIGO } from "@/lib/ai-builder/slop"
import { siteFingerprint, fingerprintSimilarity, NOVELTY_THRESHOLD, type SiteFingerprint } from "@/lib/ai-builder/novelty"
import { contrastOf, themeSettingsToTokens } from "@/lib/ai-builder/tokens"
import { DESIGN_CONTRACT_SETTING } from "@/lib/ai-builder/design-contract"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import type { VisualConcept } from "@/lib/storelib-ai/library/concept"
import type { DesignTokens } from "@/lib/ai-builder/types"
import type { SectionInstance } from "@/lib/website-builder/types"
import { CHECKS, type CheckStatus, type EvalCheck, type EvalResult, type EvalSite, type CheckId } from "./types"

const ok = (id: CheckId, detail: string): EvalCheck => ({ id, status: "pass", detail })
const bad = (id: CheckId, detail: string): EvalCheck => ({ id, status: "fail", detail })
const warn = (id: CheckId, detail: string): EvalCheck => ({ id, status: "warn", detail })
const pending = (id: CheckId, detail: string): EvalCheck => ({ id, status: "pending", detail })
const CHROME_TYPES = new Set(["header", "footer"])

/** The page's sections the visitor meets (hidden ones aside). */
const shown = (sections: SectionInstance[]) => sections.filter((s) => !s.hidden)
const bodyOf = (sections: SectionInstance[]) => shown(sections).filter((s) => s.group !== "header" && s.group !== "footer" && !CHROME_TYPES.has(s.type))

/** The site's tokens as the editor's Theme settings hold them. */
export function siteTokens(site: Pick<EvalSite, "settings">): DesignTokens {
  return themeSettingsToTokens(site.settings)
}

/** The brief O2 makes of the scenario's words, as the engines do. */
export function scenarioBrief(site: Pick<EvalSite, "scenario">): CreativeBrief {
  return briefFrom(site.scenario.prompt, site.scenario.category ? { category: site.scenario.category } : null)
}

/** A concept read back from the tokens, for a site whose engine keeps none (native) or lost it. */
export function conceptFromTokens(tokens: DesignTokens): Pick<VisualConcept, "typeSystem" | "palette"> {
  const light = contrastOf(tokens.colors.background, "#ffffff") < contrastOf(tokens.colors.background, "#000000")
  return {
    typeSystem: { display: tokens.fonts.heading, body: tokens.fonts.body, scaleRatio: 1.25, ...(tokens.fonts.accent ? { mono: tokens.fonts.accent } : {}) },
    palette: { mode: light ? "light" : "dark", background: tokens.colors.background, text: tokens.colors.text, accent: tokens.colors.accent, muted: tokens.colors.muted, accentUse: "" },
  }
}

/* ── data ─────────────────────────────────────────────────────────────── */

export function checkData(site: EvalSite): EvalCheck {
  const issues = errorsOf(validateSite({ pages: site.pages, sources: site.sources, settings: site.settings, caps: site.capabilities, mode: site.mode }))
  const lost: string[] = []
  const changed: string[] = []
  for (const p of site.pages) {
    const clean = sanitizeSections(p.sections)
    const keyOf = (list: SectionInstance[]) => list.map((s) => `${s.id}:${s.type}:${(s.blocks ?? []).map((b) => b.id).join(",")}`).join("|")
    if (keyOf(clean) !== keyOf(p.sections)) lost.push(p.key)
    else if (JSON.stringify(clean.map((s) => s.settings)) !== JSON.stringify(p.sections.map((s) => s.settings))) changed.push(p.key)
  }
  if (issues.length || lost.length) return bad("data.valid", [issues.slice(0, 4).map((i) => i.message).join(" | "), lost.length ? `sanitizeSections drops sections or items on: ${lost.join(", ")}` : ""].filter(Boolean).join(" · "))
  const sections = site.pages.reduce((n, p) => n + p.sections.length, 0)
  if (changed.length) return warn("data.valid", `validateSite: 0 errors over ${site.pages.length} pages, ${sections} sections; a save would clean some settings on: ${changed.join(", ")}`)
  return ok("data.valid", `validateSite: 0 errors over ${site.pages.length} pages, ${sections} sections; sanitizeSections keeps every section, item and setting`)
}

export function checkComponents(site: EvalSite): EvalCheck {
  const missing: string[] = []
  for (const p of site.pages)
    for (const s of p.sections) {
      if (CHROME_TYPES.has(s.type) && site.mode === "theme") continue
      /* A theme site may also hold Storelib's built-in React sections (the product template's product, feature_grid...). */
      const builtIn = site.mode === "theme" && !!(SECTION_SCHEMAS as Record<string, unknown>)[s.type]
      if (!builtIn && (!isStorelibSection(s.type, site.sources) || !schemaInfo(s.type, site.sources))) missing.push(`${p.key} › ${s.type}`)
    }
  const own = new Set(site.pages.flatMap((p) => p.sections.map((s) => s.type)).filter((t) => site.sources[`sections/${t}.storelib`]))
  const native = new Set(site.pages.flatMap((p) => p.sections.map((s) => s.type)).filter((t) => !own.has(t) && (DEFAULT_THEME_SOURCES[`sections/${t}.storelib`] || (SECTION_SCHEMAS as Record<string, unknown>)[t])))
  if (missing.length) return bad("components.supported", `no source or schema for: ${[...new Set(missing)].slice(0, 8).join(", ")}`)
  return ok("components.supported", `${own.size} of the site's own components, ${native.size} of Storelib's sections, nothing unknown`)
}

export function checkRender(site: EvalSite): EvalCheck {
  if (!site.render) return pending("render.ok", "not drawn")
  const failed = site.render.filter((r) => !r.ok)
  if (failed.length) return bad("render.ok", failed.map((r) => `${r.page}: ${r.errors.slice(0, 2).join("; ")}`).join(" | "))
  return ok("render.ok", `${site.render.length} pages drawn by the template engine, no render errors`)
}

/* ── the browser ──────────────────────────────────────────────────────── */

export function checkBrowser(site: EvalSite, viewport: "desktop" | "mobile"): EvalCheck {
  const id: CheckId = viewport === "desktop" ? "browser.desktop" : "browser.mobile"
  const b = site.browser
  if (!b || b.unavailable) return pending(id, `not visually checked: ${b?.unavailable ?? "no browser run"}`)
  const defects = b.pages.flatMap((p) => p.defects.filter((d) => d.viewport === viewport || d.viewport === "both"))
  const gates = defects.filter((d) => d.gate)
  const overflow = viewport === "mobile" ? b.pages.filter((p) => p.mobile.scrollOverflow > 1) : []
  const heights = b.pages.map((p) => `${p.page} ${Math.round((viewport === "desktop" ? p.desktop : p.mobile).pageHeight)}px`).join(", ")
  if (gates.length || overflow.length) return bad(id, [...gates.slice(0, 3).map((d) => `${d.page}: ${d.what}`), ...overflow.map((p) => `${p.page} scrolls sideways by ${p.mobile.scrollOverflow}px`)].join(" | "))
  const minor = defects.filter((d) => d.severity === "high" || d.severity === "critical")
  if (minor.length) return warn(id, `${heights}; ${minor.length} high: ${minor.slice(0, 3).map((d) => `${d.page}: ${d.what}`).join(" | ")}`)
  return ok(id, `${heights}; no hard gate (O4 measure: overflow, contrast, dead CTA, empty sections)${defects.length ? `; ${defects.length} minor` : ""}`)
}

export function checkInteractive(site: EvalSite): EvalCheck {
  const b = site.browser
  if (!b || b.unavailable || !b.interactive) return pending("browser.interactive", `not run: ${b?.unavailable ?? "no browser"}`)
  const i = b.interactive
  if (i.errors.length) return bad("browser.interactive", `page errors with JS on: ${i.errors.slice(0, 3).join(" | ")}`)
  if (i.menu === "did-not-open") return bad("browser.interactive", `the phone menu did not open: ${i.detail}`)
  if (i.menu === "builtin") return i.errors.length ? bad("browser.interactive", i.errors.join(" | ")) : pending("browser.interactive", `no script errors; ${i.detail}`)
  if (i.menu === "no-menu") return warn("browser.interactive", `no menu button on the phone header (${i.detail})`)
  return ok("browser.interactive", `no script errors; the phone menu opened with ${i.menuLinks} links (${i.detail})`)
}

/* ── pictures ─────────────────────────────────────────────────────────── */

const IMAGE_KEY = /(?:^|_)(?:image|photo|picture|poster|background_image|logo|cover)(?:_mobile|_desktop|_\d+)?$/

function pictureValues(site: EvalSite): { where: string; value: string }[] {
  const out: { where: string; value: string }[] = []
  for (const p of site.pages)
    for (const s of p.sections) {
      for (const [k, v] of Object.entries(s.settings ?? {})) if (IMAGE_KEY.test(k) && typeof v === "string" && v) out.push({ where: `${p.key} › ${s.type}.${k}`, value: v })
      for (const b of s.blocks ?? []) for (const [k, v] of Object.entries(b.settings ?? {})) if (IMAGE_KEY.test(k) && typeof v === "string" && v) out.push({ where: `${p.key} › ${s.type}/${b.type}.${k}`, value: v })
    }
  return out
}

export function checkImages(site: EvalSite): EvalCheck {
  const values = pictureValues(site)
  const unsafe = values.filter((v) => !/^https:\/\//i.test(v.value) && !/^storelib:\/\//i.test(v.value) && !/^\/(?!\/)/.test(v.value))
  const broken = (site.browser?.pages ?? []).flatMap((p) => [...p.desktop.brokenImages, ...p.mobile.brokenImages].map((e) => `${p.page} › ${e.sectionType ?? "?"} ${e.selector}`))
  const empty = (site.browser?.pages ?? []).flatMap((p) => [...p.desktop.missingImages, ...p.mobile.missingImages].map((e) => `${p.page} › ${e.sectionType ?? "?"} ${e.selector}`))
  const slots = site.engine === "agent" ? emptyImageSlots({ pages: site.pages, sources: site.sources }) : []
  if (unsafe.length || broken.length || empty.length) return bad("images.ok", [unsafe.length ? `not https or the media library: ${unsafe.slice(0, 3).map((u) => `${u.where} = ${u.value.slice(0, 40)}`).join(", ")}` : "", broken.length ? `broken in Chromium: ${[...new Set(broken)].slice(0, 3).join(", ")}` : "", empty.length ? `<img> with no address: ${[...new Set(empty)].slice(0, 3).join(", ")}` : ""].filter(Boolean).join(" | "))
  if (!site.browser || site.browser.unavailable) return pending("images.ok", `${values.length} picture settings, all https or the media library; not loaded in a browser`)
  const named = [...new Set(slots.map((s) => `${s.page}/${s.type}.${s.setting}`))]
  if (slots.length) return warn("images.ok", `${values.length} pictures load; ${slots.length} optional picture settings left empty (drawn text-forward): ${named.slice(0, 4).join(", ")}`)
  return ok("images.ok", `${values.length} picture settings, every one https or the media library, all load in Chromium, no empty <img>`)
}

/* ── direction ────────────────────────────────────────────────────────── */

export function checkDirection(site: EvalSite): EvalCheck {
  const brief = scenarioBrief(site)
  const want = site.scenario.expect
  const problems: string[] = []
  const notes: string[] = []
  if (!want.kinds.includes(brief.business.kind)) problems.push(`the brief reads the business as "${brief.business.kind}" (wanted ${want.kinds.join(" or ")})`)
  if (!want.stories.includes(brief.story)) problems.push(`the site story is "${brief.story}" (wanted ${want.stories.join(" or ")})`)
  if (!want.objectives.includes(brief.objective as never)) problems.push(`the main action is "${brief.objective}: ${brief.primaryAction}" (wanted ${want.objectives.join(" or ")})`)
  const tokens = siteTokens(site)
  const concept = site.concept ?? (conceptFromTokens(tokens) as VisualConcept)
  const cliche = conceptClicheIssues(concept, site.scenario.prompt)
  if (cliche.length) problems.push(`the editorial-serif cliché: ${cliche[0].message.slice(0, 160)}`)
  const contract = site.settings[DESIGN_CONTRACT_SETTING] as { direction?: { primary?: string } } | undefined
  const direction = artDirection(contract?.direction?.primary ?? "") ?? chooseDirection(brief).primary
  const fits = [...direction.fits, ...direction.suits].includes(brief.business.kind)
  if (!fits) problems.push(`direction ${direction.name} is not made for ${brief.business.label}`)
  if (isDisplaySerif(tokens.fonts.heading) && !direction.serif) problems.push(`display serif ${tokens.fonts.heading} under ${direction.name}, which does not call for one`)
  notes.push(`${brief.business.kind} / ${brief.story} / ${brief.objective} ("${brief.cta}")`, `direction ${direction.name}${contract?.direction?.primary ? "" : " (O2's choice; the engine kept none)"}`, `${tokens.fonts.heading} + ${tokens.fonts.body} on ${tokens.colors.background}, accent ${tokens.colors.accent}`)
  if (problems.length) return bad("direction.fit", `${problems.join(" | ")} · ${notes.join("; ")}`)
  return ok("direction.fit", notes.join("; "))
}

/* ── sections ─────────────────────────────────────────────────────────── */

/** Home's words: section names and types, and every text setting and item, as a person reads them. */
export function homeText(site: EvalSite): { lines: string[]; text: string } {
  const home = site.pages.find((p) => p.key === "home")?.sections ?? []
  const lines = bodyOf(home).map((s) => {
    const name = s.name || s.type
    return `${s.type.replace(/^ai_[a-z0-9]+_/, "")}: ${name}`
  })
  const words: string[] = [...lines]
  const take = (v: unknown) => {
    if (typeof v === "string" && v.length > 1 && !/^(?:#|https?:|storelib:|\/)/.test(v)) words.push(v.replace(/<[^>]+>/g, " "))
  }
  for (const s of bodyOf(home)) {
    for (const v of Object.values(s.settings ?? {})) take(v)
    for (const b of s.blocks ?? []) for (const v of Object.values(b.settings ?? {})) take(v)
    /* A setting the placement leaves at its default reads the schema's default. */
    const src = site.sources[`sections/${s.type}.storelib`] ?? DEFAULT_THEME_SOURCES[`sections/${s.type}.storelib`]
    const schema = src ? /<schema>([\s\S]*?)<\/schema>/.exec(src)?.[1] ?? "" : ""
    for (const m of schema.matchAll(/"default"\s*:\s*"([^"]{2,200})"/g)) words.push(m[1])
  }
  return { lines, text: words.join("\n") }
}

export function checkSections(site: EvalSite): EvalCheck {
  const home = site.pages.find((p) => p.key === "home")
  if (!home) return bad("sections.relevant", "no home page")
  const body = bodyOf(home.sections)
  const { lines, text } = homeText(site)
  const covers = site.scenario.expect.covers
  const covered = covers.filter((c) => c.pattern.test(text))
  const missing = covers.filter((c) => !covered.includes(c)).map((c) => c.label)
  const brief = scenarioBrief(site)
  const story = layoutStoryFor(brief).story
  const essentials = story.essentials.filter((e) => e.pattern.test(text))
  /* O5's skeleton rule (planSkeletonIssue) over the FINISHED page: its section roles in order, its essentials over everything it says. */
  const skeleton = story.id !== "saas" && skeletonMatch(lines) >= 4 && essentials.length < Math.ceil(story.essentials.length / 2) ? `the generic Hero, Features, Pricing, FAQ, CTA skeleton of a software page, for a ${story.name.toLowerCase()} site` : null
  const pages = site.pages.filter((p) => bodyOf(p.sections).length > 0).map((p) => p.key)
  const detail = `home: ${body.length} sections; covers ${covered.length}/${covers.length} of the trade's needs${missing.length ? ` (missing ${missing.join(", ")})` : ""}; ${essentials.length}/${story.essentials.length} of the ${story.id} story's essentials; pages with content: ${pages.join(", ")}`
  if (skeleton) return bad("sections.relevant", `${detail} · ${skeleton.slice(0, 160)}`)
  if (covered.length < Math.ceil(covers.length / 2) || body.length < 5) return bad("sections.relevant", detail)
  if (missing.length || body.length < 8) return warn("sections.relevant", detail)
  return ok("sections.relevant", detail)
}

/* ── tokens ───────────────────────────────────────────────────────────── */

export function checkTokens(site: EvalSite): EvalCheck {
  const t = siteTokens(site)
  const c = t.colors
  const text = contrastOf(c.text, c.background)
  const button = contrastOf(c.accentText, c.accent)
  const muted = contrastOf(c.muted, c.background)
  const problems: string[] = []
  const notes = [`text ${text.toFixed(1)}:1`, `button ${button.toFixed(1)}:1`, `muted ${muted.toFixed(1)}:1`, `${t.fonts.heading} / ${t.fonts.body}`]
  if (text < 4.5) problems.push(`body text ${text.toFixed(2)}:1 on the background (under 4.5)`)
  if (button < 3) problems.push(`button text ${button.toFixed(2)}:1 on the accent (under 3)`)
  if (!t.fonts.heading || !t.fonts.body) problems.push("a font is not named")
  const md = site.sources[DESIGN_MD_PATH]
  if (md !== undefined) {
    const parsed = parseDesignMd(md)
    if (!parsed.ok) problems.push(`DESIGN.md does not read: ${parsed.errors[0]?.message ?? ""}`)
    else {
      const primary = String((parsed.doc.tokens.colors as Record<string, unknown> | undefined)?.primary ?? "").toLowerCase()
      if (primary && primary !== c.accent.toLowerCase()) problems.push(`DESIGN.md's primary ${primary} is not Theme settings' accent ${c.accent}`)
      else notes.push("DESIGN.md in step with Theme settings")
    }
  }
  if (problems.length) return bad("tokens.coherent", `${problems.join(" | ")} · ${notes.join(", ")}`)
  const soft: string[] = []
  if (button < 4.5) soft.push(`button text ${button.toFixed(2)}:1 (large text only)`)
  if (muted < 3) soft.push(`muted text ${muted.toFixed(2)}:1`)
  if (AI_DEFAULT_INDIGO.includes(c.accent.toLowerCase())) soft.push(`accent ${c.accent} is the AI default indigo`)
  if (soft.length) return warn("tokens.coherent", `${soft.join(" | ")} · ${notes.join(", ")}`)
  return ok("tokens.coherent", notes.join(", "))
}

/* ── novelty across the six ───────────────────────────────────────────── */

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

/** CIE76 ΔE between two colours (Lab, D65). */
export function deltaE(a: string, b: string): number {
  const lab = (hex: string) => {
    const c = rgb(hex)
    if (!c) return [0, 0, 0]
    const lin = c.map((v) => {
      const s = v / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    const [x, y, z] = [(lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047, lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722, (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883]
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
  }
  const [p, q] = [lab(a), lab(b)]
  return Math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2)
}

export function fingerprintOf(site: EvalSite): SiteFingerprint {
  const home = site.pages.find((p) => p.key === "home")?.sections ?? []
  const sources = { ...DEFAULT_THEME_SOURCES, ...site.sources }
  return siteFingerprint({ home: bodyOf(home), sources, tokens: siteTokens(site), concept: site.concept ?? null })
}

export interface NoveltyRow {
  scenario: string
  fingerprint: SiteFingerprint
  /** Most similar other site of the same engine, 0..1. */
  nearest: { scenario: string; similarity: number } | null
  /** Smallest palette distance (mean ΔE of background and accent) to another site. */
  palette: { scenario: string; deltaE: number } | null
  /** Others with the same display face. */
  sameDisplay: string[]
}

export function noveltyTable(sites: EvalSite[]): NoveltyRow[] {
  const live = sites.filter((s) => s.status !== "pending" && s.pages.length)
  const fps = live.map((s) => ({ s, fp: fingerprintOf(s), t: siteTokens(s) }))
  return fps.map(({ s, fp, t }) => {
    const others = fps.filter((o) => o.s !== s)
    const sims = others.map((o) => ({ scenario: o.s.scenario.id, similarity: Math.round(fingerprintSimilarity(fp, o.fp) * 100) / 100 })).sort((a, b) => b.similarity - a.similarity)
    const pals = others.map((o) => ({ scenario: o.s.scenario.id, deltaE: Math.round((deltaE(t.colors.background, o.t.colors.background) + deltaE(t.colors.accent, o.t.colors.accent)) / 2) })).sort((a, b) => a.deltaE - b.deltaE)
    const face = (f: string) => f.split(",")[0].replace(/["']/g, "").trim().toLowerCase()
    return { scenario: s.scenario.id, fingerprint: fp, nearest: sims[0] ?? null, palette: pals[0] ?? null, sameDisplay: others.filter((o) => face(o.t.fonts.heading) === face(t.fonts.heading)).map((o) => o.s.scenario.id) }
  })
}

export function checkNovelty(site: EvalSite, table: NoveltyRow[]): EvalCheck {
  const row = table.find((r) => r.scenario === site.scenario.id)
  if (!row || !row.nearest) return pending("novelty.distinct", "no other site of this engine to compare with")
  const fp = row.fingerprint
  const detail = `fingerprint ${fp.hero} · ${fp.palette} · ${fp.type}; nearest ${row.nearest.scenario} at ${row.nearest.similarity} (O3 threshold ${NOVELTY_THRESHOLD}); palette ΔE to nearest ${row.palette?.scenario} ${row.palette?.deltaE}${row.sameDisplay.length ? `; same display face as ${row.sameDisplay.join(", ")}` : ""}`
  if (row.nearest.similarity >= NOVELTY_THRESHOLD) return bad("novelty.distinct", detail)
  if ((row.palette?.deltaE ?? 99) < 12 || row.sameDisplay.length >= 2) return warn("novelty.distinct", detail)
  return ok("novelty.distinct", detail)
}

/* ── the harness's observations ───────────────────────────────────────── */

export function checkEditor(site: EvalSite): EvalCheck {
  if (!site.editor) return pending("editor.saved", "not driven")
  return site.editor.ok ? ok("editor.saved", site.editor.detail) : bad("editor.saved", site.editor.detail)
}

export function checkPublish(site: EvalSite): EvalCheck {
  if (!site.publish) return pending("publish.ok", "not driven")
  return site.publish.ok ? ok("publish.ok", site.publish.detail) : bad("publish.ok", site.publish.detail)
}

/* ── all of it ────────────────────────────────────────────────────────── */

/** Every check for every site; novelty is measured among the sites of the same engine. */
export function evaluateSites(sites: EvalSite[]): EvalResult[] {
  const tables = new Map<string, NoveltyRow[]>()
  for (const engine of new Set(sites.map((s) => s.engine))) tables.set(engine, noveltyTable(sites.filter((s) => s.engine === engine)))
  return sites.map((site) => {
    if (site.status === "pending") return { site, checks: CHECKS.map((c) => pending(c.id, site.why ?? "the engine is not here to run")) }
    const checks: EvalCheck[] = [
      checkData(site),
      checkComponents(site),
      checkRender(site),
      checkBrowser(site, "desktop"),
      checkBrowser(site, "mobile"),
      checkInteractive(site),
      checkImages(site),
      checkDirection(site),
      checkSections(site),
      checkNovelty(site, tables.get(site.engine) ?? []),
      checkTokens(site),
      checkEditor(site),
      checkPublish(site),
    ]
    return { site, checks }
  })
}

export function statusCounts(results: EvalResult[]): Record<CheckStatus, number> {
  const out: Record<CheckStatus, number> = { pass: 0, fail: 0, warn: 0, pending: 0, skip: 0 }
  for (const r of results) for (const c of r.checks) out[c.status]++
  return out
}
