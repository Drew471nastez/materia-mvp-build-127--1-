/**
 * ===========================================================================
 *  THE NATIVE ENGINE IN THE CLASSIC JOB (round R, R2)
 * ===========================================================================
 * Behind AI_NATIVE_ENGINE (./flag.ts; on unless set to 0, off or false), the
 * classic job's plan step asks ./generate.ts for the whole site as native
 * sections instead of a plan whose words are written later, section by
 * section. Everything after is the classic job as it was: the build places
 * the sections through the same applier (and writes the generated content
 * as logged operations, ./plan.ts nativeOps), the write step only writes
 * what the native site left empty, photos fill the briefed picture slots,
 * the check runs. Drafts are saved through the same SiteIO, so the editor's
 * progress, replay, backups and undo are unchanged.
 *
 * If the native call cannot give a placeable site (no key, a refusal, every
 * answer invalid), the plan step falls back to the classic planner, and the
 * job says so in its record (state.native.fallback), never silently.
 */
import { briefFrom, chooseDirection, directionForPrompt, type BriefCapabilities, type BriefOptions, type CreativeBrief } from "@/lib/storelib-ai/direction"
import { designBrainFor, type DesignBrainOptions } from "@/lib/storelib-ai/library/brain"
import type { DesignPreset } from "../../design-presets"
import type { Capabilities } from "../capabilities"
import type { ModelRef, Spend } from "../models"
import { nativeRegistry, type NativeRegistry } from "./registry"
import { generateNativeSite, readBrainHints, type NativeResult } from "./generate"
import { toSitePlan, type NativeSitePlan } from "./plan"
import type { NativeForm, NativeImage, NativeMapping } from "./types"

/** What the job's deps carry when the native engine is on. Every reader may fail on its own: none is "nothing". */
export interface NativeEngineDeps {
  images?: () => Promise<NativeImage[]>
  forms?: () => Promise<NativeForm[]>
  designMd?: () => Promise<string | null>
  /** R1's brain; default designBrainFor (lib/storelib-ai/library/brain). */
  brain?: (brief: CreativeBrief, opts: DesignBrainOptions) => unknown
  /** Recipe ids this creator's recent sites used, so the next one differs (R1's avoidRecipes). */
  recentRecipes?: () => Promise<string[]>
  registry?: NativeRegistry
  maxRepairs?: number
}

/** What the job keeps about its native generation, for the logs and the tests. Small. */
export interface NativeRecord {
  version: string
  promptVersion: string
  brainVersion: string | null
  /** The design brain's recipe this site was built on, read back as avoidRecipes for the creator's next site. */
  recipeId: string | null
  attempts: number
  sections: number
  /** Issues still found in the kept answer (their values were taken out). */
  issues: string[]
  mapped: NativeMapping[]
  /** Set when the native call failed and the classic planner planned instead. */
  fallback?: string
}

/** The Start with AI capabilities, as O2's brief reads them. Pure. */
export function briefCaps(caps: Capabilities): BriefCapabilities {
  return {
    store: { name: caps.brand.name || caps.facts?.storeName || null, brandImage: caps.brand.avatarUrl, tagline: caps.brand.tagline },
    products: (caps.facts?.products ?? []).filter((p) => p.published).map((p) => ({ kind: p.type })),
    collections: (caps.facts?.collections ?? []).filter((c) => c.published),
    communities: caps.communities,
    forms: Array.from({ length: Math.min(caps.forms.published, 20) }, (_, i) => ({ kind: "form", booking: i < caps.forms.bookings })),
    reviews: { count: caps.facts?.reviews?.count ?? 0 },
    blog: { posts: caps.blog.posts },
  }
}

async function quiet<T>(work: (() => Promise<T>) | undefined, fallback: T): Promise<T> {
  if (!work) return fallback
  try {
    return await work()
  } catch {
    return fallback
  }
}

export interface NativePlanInput {
  jobId: string
  creatorId: string
  installId: string
  /** The prompt with the creator's choices (job.ts jobBrief). */
  request: string
  options?: BriefOptions | null
  caps: Capabilities
  model: ModelRef
  presets: readonly DesignPreset[]
  deadline?: number
  now?: () => number
  signal?: AbortSignal
}

/** The native site as the classic job's plan, with its record and spend. Throws NativeGenerationError when nothing can be placed. */
export async function nativePlan(input: NativePlanInput, deps: NativeEngineDeps): Promise<{ plan: NativeSitePlan; record: NativeRecord; spend: Spend; result: NativeResult }> {
  const registry = deps.registry ?? nativeRegistry()
  const [images, forms, designMd, recent] = await Promise.all([quiet(deps.images, [] as NativeImage[]), quiet(deps.forms, [] as NativeForm[]), quiet(deps.designMd, null as string | null), quiet(deps.recentRecipes, [] as string[])])
  const brief = briefFrom(input.request, input.options ?? null, briefCaps(input.caps))
  const brainOf = deps.brain ?? designBrainFor
  const avoidRecipes = [...new Set(recent.filter((r) => typeof r === "string" && r))].slice(0, 6)
  /*
    As the agent engine does it (lib/ai-builder/agent/direction.ts planDirection): the brain's recipe names the
    directions and type system it realises, the direction is chosen preferring them, and the brain is asked again
    with that direction so its tokens use the direction's palette and fonts.
  */
  let brain: unknown = null
  let prefer: { prefer?: string[]; preferType?: string } = {}
  try {
    const first = brainOf(brief, { avoidRecipes }) as { directions?: unknown; typeSystem?: unknown } | null
    prefer = { prefer: Array.isArray(first?.directions) ? first!.directions.filter((d): d is string => typeof d === "string") : [], ...(typeof first?.typeSystem === "string" ? { preferType: first.typeSystem } : {}) }
  } catch {
    prefer = {}
  }
  const choice = chooseDirection(brief, [], { seed: `${input.creatorId}:${input.installId}`, ...prefer })
  try {
    brain = brainOf(brief, { direction: choice, avoidRecipes })
  } catch {
    brain = null
  }
  const seed = input.jobId.replace(/-/g, "").slice(0, 8)
  const result = await generateNativeSite(
    {
      request: input.request,
      ctx: { registry, caps: input.caps, images, forms, prompt: input.request, seed },
      brain: brain && typeof brain === "object" ? (brain as { version?: unknown; block?: unknown; hints?: unknown }) : null,
      direction: directionForPrompt(brief, choice),
      designMd,
    },
    { model: input.model, signal: input.signal, deadline: input.deadline, now: input.now, maxRepairs: deps.maxRepairs },
  )
  const corrections = result.mapped.map((m) => `${m.path}: ${m.from} ${m.to ? `became ${m.to}` : "left out"} (${m.why})`)
  const hints = readBrainHints((brain as { hints?: unknown } | null)?.hints)
  const plan = toSitePlan(result.site, registry, input.presets, corrections, hints?.tokens ?? null)
  const record: NativeRecord = {
    version: result.site.version,
    promptVersion: result.promptVersion,
    brainVersion: result.brainVersion,
    recipeId: hints?.recipeId || null,
    attempts: result.attempts,
    sections: result.site.pages.reduce((n, p) => n + p.sections.length, 0),
    issues: result.issues.slice(0, 20).map((i) => `${i.path}: ${i.message}`.slice(0, 240)),
    mapped: result.mapped.slice(0, 30),
  }
  return { plan, record, spend: result.spend, result }
}
