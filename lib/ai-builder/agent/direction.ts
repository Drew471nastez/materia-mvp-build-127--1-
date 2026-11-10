/**
 * ===========================================================================
 *  CREATIVE DIRECTION IN THE AGENT (round O, O2)
 * ===========================================================================
 * Where the brief, the art direction and the design contract meet the
 * engine:
 *
 *   brief phase   `planDirection`: the CreativeBrief from the request, the
 *                 Describe your website choices and the store's real facts;
 *                 the chosen direction; the text block for the first turn
 *                 (directionForPrompt) and the seeds for STARTING DIRECTIONS.
 *                 An edit job gets `contractBlock` instead: the site's
 *                 DESIGN.md and the creator's overrides.
 *   plan phase    the concept is checked against the direction
 *                 (`conceptDirectionIssues`); once accepted the contract is
 *                 written as DESIGN.md (`writeContract`).
 *   set_tokens    the creator's overrides are kept (design-contract.ts
 *                 protectOverrides) and DESIGN.md follows the new settings
 *                 (`syncContractFile`).
 *
 * No Supabase here: everything goes through the ProjectStore port.
 */
import type { RuntimeCapabilities } from "../runtime-contract"
import type { AgentJobInput, ProjectStore } from "./ports"
import type { LoopCheckpoint } from "./state"
import type { VisualConcept } from "./concept"
import { briefFrom, refineBrief, type CreativeBrief } from "@/lib/storelib-ai/direction/brief"
import { checkConceptAgainstDirection, chooseDirection, directionForPrompt, directionSeeds, type DirectionChoice, type ReferenceHint } from "@/lib/storelib-ai/direction/choose"
import { DESIGN_CONTRACT_SETTING, DESIGN_MD_PATH, contractForPrompt, contractFromPlan, designMdFromSettings, readContractMeta, recordAiTokens, renderContract } from "../design-contract"
import { versionOf } from "./version"
import type { Direction } from "@/lib/storelib-ai/library/concept"

export { refineBrief }

/** The seed a job's direction is chosen with: stable for the job, different per site. */
export const directionSeed = (job: Pick<AgentJobInput, "creatorId" | "installId">) => `${job.creatorId}:${job.installId}`

/** The brief, the choice and what the first turn says about them. Deterministic. */
export function planDirection(job: AgentJobInput, caps: RuntimeCapabilities | null, references: ReferenceHint[] = []): { brief: CreativeBrief; choice: DirectionChoice; seeds: Direction[]; block: string } {
  const brief = briefFrom(job.prompt, job.options ?? null, caps)
  const choice = chooseDirection(brief, references, { seed: directionSeed(job) })
  return { brief, choice, seeds: directionSeeds(choice, brief), block: directionForPrompt(brief, choice) }
}

/** The choice a checkpoint was planned with, chosen again (deterministic from the brief and the seed). */
export function choiceOf(cp: Pick<LoopCheckpoint, "brief" | "direction">): DirectionChoice | null {
  if (!cp.brief || !cp.direction) return null
  return chooseDirection(cp.brief, cp.direction.refs ?? [], { seed: cp.direction.seed })
}

/** The direction's objections to a concept, as sentences (errors refuse it). */
export function conceptDirectionIssues(concept: VisualConcept, cp: Pick<LoopCheckpoint, "brief" | "direction">): { errors: string[]; warnings: string[] } {
  const choice = choiceOf(cp)
  if (!choice || !cp.brief) return { errors: [], warnings: [] }
  return checkConceptAgainstDirection(concept, choice, cp.brief)
}

/**
 * The accepted plan as the site's DESIGN.md (author "ai"), and the
 * direction in the contract metadata. A DESIGN.md the creator already has
 * is replaced only on a new website or a full redesign; its user overrides
 * are kept in the settings either way (set_tokens protects them).
 * Never throws: a contract that could not be written is a note.
 */
export async function writeContract(store: ProjectStore, job: AgentJobInput, cp: LoopCheckpoint, concept: VisualConcept): Promise<string | null> {
  const choice = choiceOf(cp)
  if (!choice || !cp.brief) return null
  try {
    const contract = contractFromPlan(cp.brief, choice, concept)
    const text = renderContract(contract)
    const existing = await store.readFile(DESIGN_MD_PATH)
    if (existing && existing.text === text) return null
    const w = await store.writeFile(DESIGN_MD_PATH, text, { expectedVersion: existing ? versionOf(existing.text) : null, author: "ai", jobId: job.jobId })
    if (w.ok === false) return `DESIGN.md was not written (${w.error}).`
    const settings = await store.readSettings()
    const meta = readContractMeta(settings)
    await store.writeSettings({ [DESIGN_CONTRACT_SETTING]: { v: 1, ai: meta?.ai ?? {}, direction: contract.meta.direction } })
    return null
  } catch {
    return "DESIGN.md could not be written just now."
  }
}

/** After the AI changed Theme settings: the metadata records its values, and DESIGN.md's front matter follows them. */
export async function syncContractFile(store: ProjectStore, job: AgentJobInput, settings: Record<string, unknown>): Promise<void> {
  try {
    const file = await store.readFile(DESIGN_MD_PATH)
    if (!file) return
    const next = designMdFromSettings(file.text, settings)
    if (next === null || next === file.text) return
    await store.writeFile(DESIGN_MD_PATH, next, { expectedVersion: versionOf(file.text), author: "ai", jobId: job.jobId })
  } catch {
    /* the contract follows on the next settings save */
  }
}

/** The metadata to store with an AI settings write: its values recorded, the creator's overrides left as overrides. */
export function contractMetaAfter(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  return { [DESIGN_CONTRACT_SETTING]: recordAiTokens(after, readContractMeta(before)) }
}

/** An existing site's contract for the first turn of an edit or a redesign, or "" when it has none. */
export async function contractBlock(store: ProjectStore): Promise<string> {
  try {
    const file = await store.readFile(DESIGN_MD_PATH)
    if (!file || !file.text.trim()) return ""
    return contractForPrompt(file.text, await store.readSettings())
  } catch {
    return ""
  }
}
