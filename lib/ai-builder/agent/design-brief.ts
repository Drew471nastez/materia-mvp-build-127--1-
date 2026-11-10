/**
 * ===========================================================================
 *  THE JOB'S DESIGN BRIEF (round O): WHAT CHANGES FROM JOB TO JOB
 * ===========================================================================
 * The agent's system prompt (./prompts.ts AGENT_SYSTEM) is the same bytes
 * for every job, so the provider caches it. Everything the round O lanes
 * work out for ONE job goes in the first user turn instead, through this
 * file, in this order:
 *
 *   O2  the creative brief and the chosen art direction   lib/storelib-ai/direction
 *   O1  the matching references, as text                  lib/storelib-ai/references
 *       (their pictures ride on the plan turn as content blocks; O1 wires
 *       those in ./loop.ts through AgentDeps.references)
 *   (O5's site story and motion tier are their own line in briefMessage,
 *   motionAndLayoutBrief, for a new website)
 *
 * An edit (job.edit, redesign "changes") gets none of it: its direction is
 * the site's own DESIGN.md and tokens, which briefMessage adds itself with
 * the keep-the-brand rule (lib/storelib-ai/surfaces.ts editDesignContext).
 *
 * This is the ONE place the agent calls those modules. If a lane's real
 * module lands with a different shape, adjust it here.
 */
import type { RuntimeCapabilities } from "../runtime-contract"
import type { AgentJobInput, StoredFile } from "./ports"
import { briefFrom, chooseDirection, directionForPrompt, type CreativeBrief, type DirectionChoice } from "@/lib/storelib-ai/direction"
import { referencesForPrompt, searchReferences, type DesignReference } from "@/lib/storelib-ai/references"
import { designContractBlock, findDesignContract, KEEP_BRAND_TOKENS } from "@/lib/storelib-ai/surfaces"

export interface JobDesignBrief {
  /** The text for the first user turn (several blocks, each with its heading). */
  text: string
  /** The references the brief names, in order. */
  referenceIds: string[]
}

/** References a job's brief carries at most. */
export const MAX_REFERENCES = 4
/** The design brief stays a modest part of the first turn, which the checkpoint keeps up to 20,000 characters. */
export const MAX_DESIGN_BRIEF_CHARS = 9_000

/**
 * The job's design brief. Deterministic for the same job and store (the
 * direction is seeded by the brief). Never throws: a lane's module failing
 * leaves its block out, not the job.
 *
 * `references`: the references the caller already chose (O1's loop picks
 * them once, with the admin's screenshots, and knows which have a picture
 * attached); without it the built in library is searched here.
 * `direction`: the brief and choice the caller already made (O2's
 * planDirection, kept in the checkpoint so the concept is checked against
 * the same direction the model was shown); without it they are made here
 * with the same seed O2 uses.
 * `contract`: on an edit, the site's contract as O2 says it for a prompt
 * (its DESIGN.md with the creator's overrides); without it briefMessage
 * reads the DESIGN.md from the files itself.
 */
export async function jobDesignBrief(input: {
  job: AgentJobInput
  caps: RuntimeCapabilities | null
  files: StoredFile[]
  references?: { list: readonly DesignReference[]; withImages?: readonly string[] }
  direction?: { brief: CreativeBrief; choice: DirectionChoice }
  contract?: string
}): Promise<JobDesignBrief> {
  const { job } = input
  const scoped = !!job.edit || job.redesign === "changes"
  if (scoped) return { text: input.contract?.trim() ? `${input.contract.trim()}\n\n${KEEP_BRAND_TOKENS}` : "", referenceIds: [] }
  const blocks: string[] = []
  let referenceIds: string[] = []
  const industry = job.options?.category?.replace(/_/g, " ")
  try {
    const brief = input.direction?.brief ?? briefFrom(job.prompt, job.options ?? null, input.caps)
    const found = input.references?.list ?? (await Promise.resolve(searchReferences({ text: job.prompt.slice(0, 1_000), industry }, { limit: MAX_REFERENCES })).catch(() => []))
    const list = [...found].slice(0, MAX_REFERENCES)
    referenceIds = list.map((r) => r.id)
    const choice = input.direction?.choice ?? chooseDirection(brief, list.map((r) => ({ id: r.id, styles: r.styleTags, industries: r.industries })), { seed: `${job.creatorId}:${job.installId}` })
    blocks.push(directionForPrompt(brief, choice))
    const refs = referencesForPrompt(list, { withImages: input.references?.withImages ?? [] })
    if (refs) blocks.push(refs)
  } catch {
    /* A lane's module failed: the job keeps its rules and goes on without that block. */
  }
  /* A full redesign keeps the content and replaces the look: the old contract is said as the design being replaced. */
  const contract = job.redesign === "full" ? findDesignContract(input.files.map((f) => ({ path: f.path, text: f.text }))) : null
  if (contract) blocks.push(`${designContractBlock(contract, { editing: false })}\nThis is the design being replaced: keep the content it describes, write a new look.`)

  const text = blocks.filter(Boolean).join("\n\n")
  return { text: text.length > MAX_DESIGN_BRIEF_CHARS ? `${text.slice(0, MAX_DESIGN_BRIEF_CHARS)}\n[shortened]` : text, referenceIds }
}
