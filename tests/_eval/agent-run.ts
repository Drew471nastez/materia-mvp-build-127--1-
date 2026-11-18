/**
 * Round R (R4): one scenario through the AGENT engine, the real way.
 *
 * Start with AI's create route (AI_BUILDER_AGENT=1, From scratch, the
 * scenario's words and chip), then the run route's turns chained on the fake
 * clock: the real loop, the real brief phase (O2's direction, P2's template
 * chosen and applied), the real tools on the Supabase project store, the
 * real finish gate. Only the model is scripted (tests/ai-builder-e2e-kit.ts),
 * and it does what a careful model does with a starting template:
 *
 *   1. looks (list_capabilities, list_pages)
 *   2. hands in the concept (the direction it was given: palette and type as
 *      the template was applied with them; its own name, mood and moves) and
 *      the site plan, every page as the template laid it out
 *   3. finds a picture for every slot of the template (find_photo)
 *   4. rewrites every component's words for this business (write_file)
 *   5. puts the pages back with their words rewritten and the pictures in
 *      their slots (set_page_sections), binds the real products
 *   6. validate, render_check, finish
 *
 * With no template close enough (consulting), the job starts from zero: the
 * script writes the components itself (the closest template's components,
 * renamed and rewritten, standing in for what a model would write), adds the
 * pages, sets the direction's tokens, places everything, and finishes.
 *
 * A model can (and here may) be refused at finish; the loop's repair turns
 * then run on, and what the job ends as is what the eval reports.
 */
import { writeFileSync } from "node:fs"
import type { AiWorld, Script, ScriptStep } from "../ai-builder-e2e-kit"
import { driveTurns, installFiles, installPages, installSettings, jobEvents, jobRow, scriptModels, seller } from "../ai-builder-e2e-kit"
import { DECKS } from "./decks"
import { CopyWriter, adaptFile, adaptSections, guardProductMedia } from "./adapt"
import { evalImageService } from "./images"
import type { EvalScenario } from "@/lib/ai-builder/eval/scenarios"
import type { EvalSite } from "@/lib/ai-builder/eval/types"
import type { SectionInstance } from "@/lib/website-builder/types"
import type { AgentModels } from "@/lib/ai-builder/agent/ports"

type Call = [string, Record<string, unknown>]

/**
 * What a careful model does with finish's render.action_mismatch (round 56):
 * "Book an intro call" kept a template's /products address. On the page and
 * section type finish names, every pair of settings (<x>_label or <x>_text
 * with <x>_url) whose words are the ones named and whose address is the shop
 * is pointed at the page finish suggests.
 */
export function actionRepairs(said: string, pages: { key: string; sections: SectionInstance[] }[]): Call[] {
  const calls: Call[] = []
  const seen = new Set<string>()
  for (const m of said.matchAll(/sections\/(ai_[a-z0-9_]+)\.storelib: ([a-z0-9-]+): (?:The call to action "[^"]*"|A menu link|A link): "([^"]+)" asks the visitor to book or get in touch, and it goes to (\/[^\s,]+), the shop\. Point it at the site's (\/[a-z0-9-]+) page/g)) {
    const [, type, pageKey, words, from, to] = m
    const page = pages.find((p) => p.key === pageKey)
    for (const s of page?.sections ?? []) {
      if (s.type !== type) continue
      const holders = [{ blockId: undefined as string | undefined, settings: s.settings ?? {} }, ...(s.blocks ?? []).map((b) => ({ blockId: b.id as string | undefined, settings: b.settings ?? {} }))]
      for (const h of holders) {
        const set: Record<string, unknown> = {}
        for (const [id, v] of Object.entries(h.settings)) {
          const base = /^(.*)_url$/.exec(id)?.[1]
          if (!base || v !== from) continue
          const label = h.settings[`${base}_label`] ?? h.settings[`${base}_text`] ?? (base === "cta" ? h.settings.button_label : undefined)
          if (typeof label === "string" && label.trim() === words.trim()) set[id] = to
        }
        const key = `${pageKey} ${s.id} ${h.blockId ?? ""} ${JSON.stringify(set)}`
        if (Object.keys(set).length && !seen.has(key)) {
          seen.add(key)
          calls.push(["set_section_settings", { page: pageKey, sectionId: s.id, settings: set, ...(h.blockId ? { blockId: h.blockId } : {}) }])
        }
      }
    }
  }
  return calls
}

/** The picture service per job, so the agent's deps for a job can find theirs (set before its first turn). */
export const JOB_IMAGES = new Map<string, ReturnType<typeof evalImageService>>()

export function agentExtraDeps(job: { id: string }) {
  const images = JOB_IMAGES.get(job.id)
  return images ? { images, imageProvider: () => true } : {}
}

const URL_RE = /https:\/\/media\.eval\.storelib\.test\/[^"\\\s]+?\.jpg/g

export interface AgentRunOptions {
  /** Live mode: real models instead of the script (scripts/ai-builder/eval.ts --live). */
  models?: AgentModels
  /** Before the job's second turn (the template as applied), the harness may look at the site. */
  afterFirstTurn?: (state: { installId: string; jobId: string }) => Promise<void>
  maxTurns?: number
}

export async function runAgentScenario(w: AiWorld, sc: EvalScenario, opts: AgentRunOptions = {}): Promise<EvalSite & { person: Awaited<ReturnType<typeof seller>>["person"] }> {
  const deck = DECKS[sc.id]
  const slug = `eval${sc.id}agent`
  const owner = await seller(w, slug, sc.products[0])
  for (const extra of sc.products.slice(1)) w.j.db.insert("products", { creator_id: owner.creatorId, title: extra.title, slug: extra.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), status: "published", type: extra.type, price_cents: extra.priceCents }, {})
  const productIds = w.j.rows("products").filter((p) => p.creator_id === owner.creatorId).map((p) => String(p.id))

  process.env.AI_BUILDER_AGENT = "1"
  const key = `0b7c1e2a-0000-4000-8000-${String(100000000000 + sc.id.length * 1000 + sc.id.charCodeAt(0)).slice(-12)}`
  const options = { generation: "blank", ...(sc.category ? { category: sc.category } : {}) }
  const made = await w.j.call("POST /api/website-builder/themes/create", { as: owner.person, body: { mode: "ai", prompt: sc.prompt, key, options } })
  if (made.status !== 200 || !made.json?.job?.id) throw new Error(`${sc.id}: create answered ${made.status} ${JSON.stringify(made.json).slice(0, 300)}`)
  const installId = String(made.json.install.id)
  const jobId = String(made.json.job.id)
  const images = evalImageService(sc.id)
  JOB_IMAGES.set(jobId, images)

  const { templateById } = await import("@/lib/storelib-ai/templates")
  const { schemaInfo } = await import("@/lib/ai-builder/agent/validate")
  const { readCheckpoint } = await import("@/lib/ai-builder/agent/state")
  const { choiceOf } = await import("@/lib/ai-builder/agent/direction")
  const { themeSettingsToTokens } = await import("@/lib/ai-builder/tokens")
  const writer = new CopyWriter(deck)
  const checkpoint = () => readCheckpoint(jobRow(w, jobId).checkpoint)
  const template = () => {
    const id = checkpoint()?.template?.id
    return id ? templateById(id) ?? null : null
  }

  /* No template: the components the model writes itself (the closest template's, renamed to ai_<brand>_* and rewritten). */
  const FROM_ZERO_BASE = "course-coach"
  const zeroPrefix = `ai_${deck.brand.toLowerCase().replace(/[^a-z]/g, "").slice(0, 6)}_`
  /* Its own names for its own components: what each does for this business, not the course template's words. */
  const OWN_NAMES: Record<string, string> = { hero: "opening", outcomes: "work", curriculum: "engagement", coach: "partners", format: "approach", reviews: "notes", pricing: "diagnostic", dates: "schedule", faq: "questions", closing: "intro_call" }
  const renameType = (t: string) => {
    const rest = t.replace(/^ai_[a-z0-9]+?_/, "")
    return `${zeroPrefix}${OWN_NAMES[rest] ?? rest}`
  }
  const zero = () => {
    const base = templateById(FROM_ZERO_BASE)!
    const files: Record<string, string> = {}
    for (const [path, text] of Object.entries(base.files)) {
      const type = path.replace(/^sections\//, "").replace(/\.storelib$/, "")
      /* Written the way the finish gate asks (a product with no picture draws no empty frame): the base template's product media is not guarded, which this run reports. */
      const adapted = adaptFile(text, writer, { renameType })
      files[`sections/${renameType(type)}.storelib`] = guardProductMedia(adapted) ?? adapted
    }
    /* No reviews in this store, so the reviews band is not placed (the brief says: no testimonials). */
    const pages = base.pages.map((p) => ({ key: p.key, title: p.title ?? p.key, sections: p.sections.filter((s) => !/_reviews$/.test(s.type)).map((s) => ({ ...s, type: renameType(s.type) })) as SectionInstance[] }))
    return { base, files, pages }
  }
  let fromZero: ReturnType<typeof zero> | null = null

  const sourcesNow = () => Object.fromEntries(Object.entries(installFiles(w, installId)).map(([p, f]) => [p, f.draft ?? f.content ?? ""]))
  const fieldsFor = (sources: Record<string, string>) => (type: string) => {
    const info = schemaInfo(type, sources)
    return info ? { settings: info.settings, blocks: info.blocks } : null
  }

  const concept = () => {
    const settings = installSettings(w, installId).draft ?? installSettings(w, installId).settings
    const cp = checkpoint()
    const choice = cp ? choiceOf(cp) : null
    const t = themeSettingsToTokens(settings)
    const fromTemplate = !!cp?.template
    const palette = fromTemplate || !choice ? { background: t.colors.background, text: t.colors.text, accent: t.colors.accent, muted: t.colors.muted, surface: t.colors.surface } : { background: choice.palette.background, text: choice.palette.text, accent: choice.palette.accent, muted: choice.palette.muted, surface: choice.palette.surface }
    const fonts = fromTemplate || !choice ? { display: t.fonts.heading, body: t.fonts.body } : { display: choice.fonts.display, body: choice.fonts.body }
    const dark = /^#?[0-3]/.test(palette.background.replace("#", ""))
    return {
      name: deck.concept.name,
      mood: deck.concept.mood,
      styles: choice?.primary.styles.slice(0, 2) ?? ["minimal"],
      typeSystem: { display: fonts.display, body: fonts.body, scaleRatio: 1.333, rule: deck.concept.rule },
      palette: { mode: dark ? "dark" : "light", ...palette, accentUse: deck.concept.accentUse },
      layout: { principles: deck.concept.principles, density: "balanced", radius: choice?.radius ?? 4 },
      motion: { stance: "subtle", moves: deck.concept.moves },
      imagery: { direction: deck.concept.imagery, avoid: ["stock smiles", "text in pictures"] },
      signatureMoves: deck.concept.signatureMoves,
    }
  }

  /** The site plan from the pages as they stand (the template's), every template page with sections or a reason. */
  const plan = () => {
    const pages = fromZero ? Object.fromEntries(fromZero.pages.map((p) => [p.key, { sections: p.sections, draft: null }])) : installPages(w, installId)
    const out: { key: string; sections: string[]; reason?: string }[] = []
    for (const [key, p] of Object.entries(pages)) {
      const list = ((p.draft ?? p.sections) as SectionInstance[]).filter((s) => !s.group)
      const short = list.length > 0 && list.length < 6 && key !== "home" ? { reason: "A short page on purpose: it does one job and points to the intro call." } : {}
      out.push(list.length ? { key, sections: list.map((s, i) => `${s.type}: ${fromZero ? deck.headings[i % deck.headings.length] : s.name || s.type}`), ...short } : { key, sections: [], reason: "The platform's working layout in the site's tokens is enough here." })
    }
    for (const key of ["cart", "404"]) if (!out.some((p) => p.key === key)) out.push({ key, sections: [], reason: "The platform's working layout in the site's tokens is enough here." })
    out.sort((a, b) => (a.key === "home" ? -1 : b.key === "home" ? 1 : 0))
    return out
  }

  const slotCalls = (): Call[] => {
    const t = template() ?? fromZero?.base
    return (t?.imageSlots ?? []).map((slot) => {
      const pic = deck.pictures.find((p) => p.match.test(slot.key)) ?? deck.pictures[deck.pictures.length - 1]
      const aspect = /16:9|4:3|3:2|21:9/.test(slot.aspect) ? "landscape" : /1:1/.test(slot.aspect) ? "square" : "portrait"
      return ["find_photo", { query: `${pic.prompt} (${slot.key})`, aspect, purpose: slot.key, alt: pic.alt }] as Call
    })
  }

  const fileCalls = (part: 0 | 1): Call[] => {
    const t = template()
    const files = t ? Object.fromEntries(Object.entries(t.files).map(([p, text]) => [p, adaptFile(text, writer)])) : fromZero!.files
    const entries = Object.entries(files)
    const half = Math.ceil(entries.length / 2)
    return entries.slice(part ? half : 0, part ? undefined : half).map(([path, content]) => ["write_file", { path, content }] as Call)
  }

  /** The pages with their words rewritten and every picture slot filled from the pictures found. */
  const pageCalls = (req: { turns: unknown[] }): Call[] => {
    const urls = [...new Set(JSON.stringify(req.turns).match(URL_RE) ?? [])]
    const t = template() ?? fromZero?.base ?? null
    const sources = sourcesNow()
    const fields = fieldsFor(sources)
    const pages: Record<string, SectionInstance[]> = fromZero
      ? Object.fromEntries(fromZero.pages.map((p) => [p.key, p.sections]))
      : Object.fromEntries(Object.entries(installPages(w, installId)).map(([k, p]) => [k, (p.draft ?? p.sections) as SectionInstance[]]))
    const rename = fromZero ? renameType : (x: string) => x
    for (const [n, slot] of (t?.imageSlots ?? []).entries()) {
      const url = urls[n]
      if (!url) continue
      for (const target of slot.targets) {
        const section = pages[target.page]?.find((s) => s.id === target.section)
        const holder = target.block ? section?.blocks?.find((b) => b.id === target.block) : section
        if (holder) holder.settings = { ...holder.settings, [target.setting]: url }
      }
    }
    const calls: Call[] = []
    for (const [page, sections] of Object.entries(pages)) {
      /* From zero there is no template menu "footer": its own footer lists the site's main menu (add_page fills it). */
      const menus = (o: Record<string, unknown>) => (fromZero ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, /menu/.test(k) && v === "footer" ? "main-menu" : v])) : o)
      const adapted = adaptSections(sections.map((s) => ({ ...s, type: rename(s.type), settings: menus(s.settings ?? {}), blocks: (s.blocks ?? []).map((b) => ({ ...b, settings: menus(b.settings ?? {}) })) })), fields, writer)
      calls.push(["set_page_sections", { page, sections: adapted }])
    }
    /* The template's bindings, pointed at this store's real products. */
    for (const b of t?.bindings ?? []) {
      if (b.kind !== "product" && b.kind !== "products") continue
      const section = pages[b.page]?.find((s) => s.id === b.section)
      if (!section) continue
      calls.push(["bind_data", { page: b.page, sectionId: b.section, prop: b.setting, kind: b.kind, ids: b.kind === "product" ? [productIds[0]] : productIds.slice(0, 4) }])
    }
    return calls
  }

  const step = (f: (req: { turns: unknown[] }) => ScriptStep) => (req: { turns: unknown[] }) => f(req)
  const script: Script = [
    { text: "Looking at what is real first.", calls: [["list_capabilities", {}], ["list_pages", {}]] },
    step(() => {
      if (!checkpoint()?.template) fromZero = zero()
      return { text: "The concept and the plan.", calls: [["report_progress", { phase: "plan", label: "Concept", concept: concept(), pages: plan(), tasks: ["Pictures for every slot", "Every component's words", "Pages and bindings", "Check and finish"] }]] }
    }),
    step(() => {
      const calls: Call[] = []
      if (fromZero) {
        const c = concept()
        const choice = (() => {
          const cp = checkpoint()
          return cp ? choiceOf(cp) : null
        })()
        const p = choice?.palette
        calls.push(["set_tokens", { tokens: { colors: { background: c.palette.background, surface: p?.surface ?? c.palette.surface, text: c.palette.text, muted: p?.muted ?? c.palette.muted, accent: c.palette.accent, accentText: p?.accentText ?? "#ffffff", border: p?.border ?? "#d0d0d0", ...(p?.inverse ? { inverse: p.inverse } : {}) }, fonts: { heading: c.typeSystem.display, body: c.typeSystem.body }, radius: { small: c.layout.radius, medium: c.layout.radius, large: c.layout.radius } } }])
        for (const p2 of fromZero.pages) if (!["home", "product", "collection", "products", "search", "cart", "404", "contact"].includes(p2.key)) calls.push(["add_page", { key: p2.key, title: p2.title }])
      }
      return { text: "Pictures for every slot.", calls: [...calls, ...slotCalls()] }
    }),
    step(() => ({ text: "Reading the components before rewriting them.", calls: Object.keys((template() ?? { files: {} }).files).map((path) => ["read_file", { path }] as Call) })),
    step(() => ({ text: "Rewriting the components for this business.", calls: fileCalls(0) })),
    step(() => ({ calls: fileCalls(1) })),
    step((req) => ({ text: "Placing the pages.", calls: pageCalls(req) })),
    { calls: [["validate", {}], ["render_check", { page: "home" }]] },
    { calls: [["finish", { summary: `${deck.brand}: the whole site, adapted from its starting point, every picture slot filled and the products bound.` }]] },
    /* Refused? A careful model fixes what finish names that it knows how to: an empty product frame. */
    step((req) => {
      const said = JSON.stringify(req.turns.slice(-1))
      const paths = [...new Set([...said.matchAll(/(sections\/ai_[a-z0-9_]+\.storelib): [a-z0-9-]+: The section draws an empty <div class/g)].map((m) => m[1]))]
      const files = sourcesNow()
      const calls: Call[] = paths.flatMap((path) => {
        const fixed = files[path] ? guardProductMedia(files[path]) : null
        return fixed ? [["write_file", { path, content: fixed }] as Call] : []
      })
      /* Round 56: a booking or enquiry button that goes to the shop (render.action_mismatch) goes to the page finish names. */
      calls.push(...actionRepairs(said.replace(/\\"/g, '"'), Object.entries(installPages(w, installId)).map(([key, p]) => ({ key, sections: (p.draft ?? p.sections) as SectionInstance[] }))))
      return { text: calls.length ? "Fixing what finish found." : "", calls: [...calls, ["finish", { summary: `${deck.brand}: the whole site, adapted, checked again.` }]] }
    }),
  ]
  const scripted = opts.models ? null : scriptModels(script, { clock: w.clock })
  w.scripts.set(jobId, scripted ?? { models: opts.models!, run: { calls: 0, requests: [], asked: [] } })

  let first = true
  await driveTurns(w, jobId, opts.maxTurns ?? 24, () => {
    if (first) {
      first = false
      return true
    }
    return false
  })
  if (opts.afterFirstTurn) await opts.afterFirstTurn({ installId, jobId })
  await driveTurns(w, jobId, opts.maxTurns ?? 24)

  const row = jobRow(w, jobId)
  const events = jobEvents(w, jobId)
  const pages = Object.entries(installPages(w, installId)).map(([key, p]) => ({ key, sections: (p.draft ?? p.sections) as SectionInstance[] }))
  const settings = installSettings(w, installId).draft ?? installSettings(w, installId).settings
  const caps = await (await import("@/lib/ai-builder/capabilities")).readRuntimeCapabilities((await import("@/lib/supabase/admin")).createAdminClient() as never, { creatorId: owner.creatorId, ownerUserId: owner.person.id, installId })
  const cp = checkpoint()
  const lastValidation = events.filter((e) => e.kind === "validation").pop()?.payload
  const status = row.status === "complete" ? "complete" : row.status === "failed" ? "failed" : "partial"
  /* What the loop last told the model when it refused (the words a model would repair from). */
  const lastTurns = scripted?.run.requests[scripted.run.requests.length - 1]?.turns ?? []
  const refusal = JSON.stringify(lastTurns.slice(-1)).match(/Not finished[^"]{0,1200}|The checks still fail[^"]{0,1200}/)?.[0]
  const notes = [
    cp?.template ? `started from the ${cp.template.name} template (${cp.template.id})` : "no template close enough: built from zero",
    `${events.filter((e) => e.kind === "file").length} file writes, ${images.made.length} pictures found`,
    ...(lastValidation ? [`last validation: ${lastValidation.errors ?? 0} errors, ${lastValidation.warnings ?? 0} warnings`] : []),
    ...(status !== "complete" ? [`ended ${row.status}: ${String(row.error ?? "").slice(0, 300)}`, ...(refusal ? [refusal.replace(/\\n/g, " ")] : []), ...events.filter((e) => e.kind === "validation").slice(-1).map((e) => JSON.stringify(e.payload).slice(0, 600))] : []),
  ]
  if (process.env.R4_DEBUG && scripted) writeFileSync(`${process.env.R4_DEBUG}/${sc.id}-turns.json`, JSON.stringify(scripted.run.requests.map((r) => r.turns[r.turns.length - 1]), null, 1))
  return {
    person: owner.person,
    engine: "agent",
    engineLabel: opts.models ? "agent (live model)" : "agent, template first (scripted model)",
    scenario: sc,
    status,
    installId,
    jobId,
    pages,
    sources: sourcesNow(),
    settings,
    concept: (cp?.concept as never) ?? null,
    template: cp?.template?.id ?? null,
    capabilities: caps,
    mode: "blank",
    costUsd: Number(row.cost_usd ?? 0),
    modelCalls: scripted?.run.calls ?? row.state?.agent?.usage?.iterations,
    notes,
  }
}
