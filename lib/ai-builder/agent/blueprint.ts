/**
 * ===========================================================================
 *  THE SITE PLAN, WRITTEN BEFORE THE MODEL'S FIRST TURN (round 69)
 * ===========================================================================
 * A new website on Materia (lib/storelib-ai/materia/compose.ts) gets a
 * blueprint composed from every template for its business:
 *
 *   from a template   the template stays as the frame (header, footer, other
 *                     pages); its home is replaced by the blueprint's
 *                     sections (each with its preset items and the layout a
 *                     template gave it), and its fonts, schemes and motion by
 *                     the blueprint's. Its sample words, and the presets',
 *                     are recorded so finish can refuse a site that still
 *                     says them, and the site is held under
 *                     TEMPLATE_LIKENESS_MAX against the template.
 *   from scratch      nothing is placed (the AI writes the frame and every
 *                     page); the fonts, schemes and motion are set so a
 *                     Materia section it places is in the plan's look, and
 *                     the plan and the templates' knowledge are its guide.
 *
 * Deterministic: no model call. The seed is the brief and the job.
 */
import { blueprintHome, blueprintSettings, blueprintText, composeMateriaSite, materiaDesignKnowledge, schemeKeys, type SiteBlueprint } from "@/lib/storelib-ai/materia/compose"
import { materiaSection } from "@/lib/storelib-ai/materia/catalogue"
import { materiaTemplate } from "@/lib/storelib-ai/materia/reference"
import type { SectionInstance } from "@/lib/website-builder/types"
import { copyPhrases, materiaSignature, templateNoveltyIssues, templateSignature } from "../novelty"
import type { RuntimeCapabilities } from "../runtime-contract"
import type { ValidationIssue } from "../types"
import { presetParts } from "./content-check"
import type { AgentJobInput, ProjectStore, StoredFile, StoredPage } from "./ports"
import type { LoopCheckpoint } from "./state"

/** What the checkpoint keeps of the blueprint: short strings only. */
export interface BlueprintState {
  mode: "template" | "scratch"
  base: string
  baseName: string
  archetype: string
  types: string[]
  type: string
  palette: string
  /** Hashes of the template's and the presets' sample phrases (lib/ai-builder/novelty.ts copyPhrases). */
  samples: string[]
}

const MAX_SAMPLES = 900

/** Whether a job gets a blueprint: a new website (not an edit, not a redesign) on a Materia install. */
export function wantsBlueprint(job: AgentJobInput, materiaInstall: boolean): "template" | "scratch" | null {
  if (job.edit || job.redesign || !materiaInstall) return null
  return job.mode === "blank" ? "scratch" : "template"
}

/**
 * Compose the blueprint and write it: the theme values always, home only from a template. Returns the block for
 * the first turn and what the checkpoint keeps. Never throws: a store that refuses a write leaves the job as it was.
 */
export async function applyBlueprint(input: { job: AgentJobInput; store: ProjectStore; cp: LoopCheckpoint; caps: RuntimeCapabilities | null; files: readonly StoredFile[]; pages: readonly StoredPage[]; mode: "template" | "scratch" }): Promise<{ text: string; blueprint: SiteBlueprint; state: BlueprintState; pages: StoredPage[] } | null> {
  const { job, store, cp, caps, mode } = input
  const base = job.options?.template ?? cp.materia?.template ?? null
  const bp = composeMateriaSite({
    prompt: job.prompt,
    category: job.options?.category ?? null,
    ...(caps ? { products: caps.products.map((p) => ({ title: p.title, kind: p.kind })), reviews: caps.reviews.count } : {}),
    base,
    salt: job.jobId,
  })
  const baseName = materiaTemplate(bp.base)?.name ?? bp.base
  let pages = [...input.pages]
  /* The template's own words, before anything is replaced: what finish holds the site to. */
  const samples = new Set(copyPhrases(input.pages).map((c) => c.hash))
  try {
    const settings = await store.readSettings()
    const shopify = settings.shopify && typeof settings.shopify === "object" ? (settings.shopify as Record<string, unknown>) : null
    if (shopify) await store.writeSettings({ shopify: blueprintSettings(bp, shopify) })
    if (mode === "template") {
      const src: Record<string, string> = {}
      for (const f of input.files) if (f.path.startsWith("sections/")) src[f.path] = f.text
      const keys = schemeKeys(shopify ?? undefined)
      const mint = (type: string) => {
        cp.ids += 1
        return `${type.slice(0, 40)}-${job.jobId.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase()}-${cp.ids}`
      }
      const body: SectionInstance[] = []
      for (const p of blueprintHome(bp, keys)) {
        if (!src[`sections/${p.type}.storelib`]) continue
        const preset = presetParts(p.type, src, mint)
        body.push({ id: mint(p.type), type: p.type, name: materiaSection(p.type)?.name ?? p.type, settings: { ...(preset?.settings ?? {}), ...p.settings }, blocks: preset?.blocks ?? [] })
      }
      const home = pages.find((p) => p.key === "home")
      if (body.length && home) {
        const chrome = home.sections.filter((s) => !!s.group)
        const next: StoredPage = { key: "home", sections: [...chrome.filter((s) => s.group !== "footer"), ...body, ...chrome.filter((s) => s.group === "footer")] }
        await store.writePages([next])
        pages = pages.map((p) => (p.key === "home" ? next : p))
        for (const c of copyPhrases([next])) samples.add(c.hash)
      }
    }
  } catch {
    /* the plan is still the model's guide */
  }
  const state: BlueprintState = { mode, base: bp.base, baseName, archetype: bp.archetype, types: bp.home.map((s) => s.type), type: `${bp.type.display}/${bp.type.body}`, palette: bp.palette.id, samples: [...samples].slice(0, MAX_SAMPLES) }
  const text = [blueprintText(bp, { mode, baseName }), mode === "scratch" ? materiaDesignKnowledge() : ""].filter(Boolean).join("\n\n")
  return { text, blueprint: bp, state, pages }
}

/** FINISH: a site made from a template is its own (TEMPLATE_LIKENESS_MAX) and says none of the sample words. */
export function blueprintIssues(state: BlueprintState | undefined, pages: readonly StoredPage[], settings: Record<string, unknown>): ValidationIssue[] {
  if (!state || state.mode !== "template") return []
  const entry = materiaTemplate(state.base)
  if (!entry) return []
  const home = pages.find((p) => p.key === "home")?.sections ?? []
  const shopify = settings.shopify && typeof settings.shopify === "object" ? (settings.shopify as Record<string, unknown>) : null
  const site = materiaSignature({ home, shopify, pages: [...pages] })
  return templateNoveltyIssues({ site, source: templateSignature(entry, state.samples), pages: [...pages], samples: state.samples, templateName: state.baseName })
}
