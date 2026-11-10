/**
 * ===========================================================================
 *  THE JOB'S DESIGN BRIEF (round O): WHAT CHANGES FROM JOB TO JOB
 * ===========================================================================
 * The agent's system prompt (./prompts.ts AGENT_SYSTEM) is the same bytes
 * for every job, so the provider caches it. Everything the round O lanes
 * work out for ONE job goes in the first user turn instead, through this
 * file:
 *
 *   O2  the creative brief and the chosen direction    lib/storelib-ai/direction
 *   O1  the matching references, as text               lib/storelib-ai/references
 *       (their images go in the plan turn as content blocks: `referenceIds`,
 *       read back by the loop with referenceImagesFor)
 *   O5  the motion tier and the industry layout story  lib/storelib-ai/motion
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
import { briefFrom, chooseDirection, directionForPrompt, type CreativeBrief } from "@/lib/storelib-ai/direction"
import { referencesForPrompt, searchReferences } from "@/lib/storelib-ai/references"
import { layoutStoryFor, motionForPrompt } from "@/lib/storelib-ai/motion"
import { designContractBlock, findDesignContract } from "@/lib/storelib-ai/surfaces"

export interface JobDesignBrief {
  /** The text for the first user turn (several blocks, already headed). */
  text: string
  /** References whose images ride on the plan turn. */
  referenceIds: string[]
}

/** References a job's brief carries at most. */
export const MAX_REFERENCES = 4
/** The design brief stays a small part of a turn the checkpoint keeps (20,000 characters). */
export const MAX_DESIGN_BRIEF_CHARS = 7_000

function briefLines(b: CreativeBrief): string {
  return [
    `Business: ${b.business}`,
    b.primaryAction ? `The one action: ${b.primaryAction}` : "",
    b.requestedStyle.length ? `Style the creator asked for (outranks any default): ${b.requestedStyle.join(", ")}` : "",
    b.colors.length ? `Their colours: ${b.colors.join(", ")}` : "",
    b.uncertainties.length ? `Not known yet (leave out or make editable, never invent): ${b.uncertainties.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * The job's design brief. Deterministic for the same job and store (the
 * direction is seeded by the brief). Never throws: a lane's module failing
 * leaves its block out, not the job.
 */
export async function jobDesignBrief(input: { job: AgentJobInput; caps: RuntimeCapabilities | null; files: StoredFile[] }): Promise<JobDesignBrief> {
  const { job } = input
  const scoped = !!job.edit || job.redesign === "changes"
  const contract = findDesignContract(input.files.map((f) => ({ path: f.path, text: f.text })))
  const blocks: string[] = []
  let referenceIds: string[] = []

  /* An edit of an existing site: its own design is the direction, said by briefMessage (editDesignContext). No new direction, no references. */
  if (!scoped) {
    try {
      const brief = briefFrom(job.prompt, job.options ?? null, input.caps)
      const refs = await Promise.resolve(searchReferences(brief, { limit: MAX_REFERENCES })).catch(() => [])
      const list = Array.isArray(refs) ? refs.slice(0, MAX_REFERENCES) : []
      referenceIds = list.map((r) => r.id)
      const choice = chooseDirection(brief, list)
      blocks.push(`CREATIVE BRIEF\n${briefLines(brief)}`)
      blocks.push(`DIRECTION FOR THIS SITE (fit the business: adapt it to this creator's material; a different direction only with a reason you can say)\n${directionForPrompt(choice)}`)
      const refText = referencesForPrompt(list)
      if (refText) blocks.push(`REFERENCES${list.length ? " (their pictures are attached to this message while you plan)" : ""}\n${refText}`)
      const motion = motionForPrompt(brief)
      if (motion) blocks.push(`MOTION\n${motion}`)
      const story = layoutStoryFor(brief)
      if (story) blocks.push(`SITE STORY\n${story}`)
    } catch {
      /* A lane's module failed: the job keeps its rules and goes on without that block. */
    }
    /* A full redesign keeps the content and replaces the look: the old contract is what is being replaced, said as context. */
    if (job.redesign === "full" && contract) blocks.push(`${designContractBlock(contract, { editing: false })}\nThis is the design being replaced: keep the content it describes, write a new look.`)
  }

  const text = blocks.join("\n\n")
  return { text: text.length > MAX_DESIGN_BRIEF_CHARS ? `${text.slice(0, MAX_DESIGN_BRIEF_CHARS)}\n[shortened]` : text, referenceIds }
}
