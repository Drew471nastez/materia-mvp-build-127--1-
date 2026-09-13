/**
 * ===========================================================================
 *  ASKING FOR A SECTION TO BE WRITTEN, RATHER THAN A PAGE TO BE CHANGED
 * ===========================================================================
 * The page assistant works in operations: add this section, set that setting,
 * put a block here. Every one of those names something that already exists.
 * Writing a NEW section type is a different act — it produces a FILE, and a
 * file either compiles or it does not — so it is not a tool inside that loop.
 * It is this: one request, one file, checked before it is kept.
 *
 * THE MODEL IS NEVER TRUSTED WITH THE RESULT. What comes back is compiled by
 * the same compiler the code editor saves through, and a file that does not
 * compile is not stored. It gets exactly one repair attempt, with the errors
 * quoted back at it, because a second failure is usually the same failure and
 * a creator waiting on a third round trip has been waiting too long.
 */
import {
  MAX_REPAIR_ATTEMPTS,
  describeThemeForAuthoring,
  knowledgeBlock,
  validateSection,
  writeSectionRules,
  type ThemeContextInput,
} from "@/lib/storelib-ai"
import type { AgentProvider } from "@/lib/sites/agent/types"
import { describeImages, type AgentImage } from "@/lib/sites/agent/attachments"
import type { ThemeError } from "@/lib/storelib-theme/types"

/**
 * What the model is told about the format and about taste.
 *
 * STABLE, because it is the cached prefix on both providers. The only thing
 * that varies is the list of names already taken, which is short and which
 * changes when the install changes rather than per request. Everything about
 * THIS site goes in the turn instead: see `describeThemeForAuthoring`.
 */
export function writeSectionSystem(existingNames: string[], existingTypes: string[]): string {
  return [
    "You write one Storelib section and nothing else.",
    "",
    writeSectionRules(),
    "",
    "PADDING AND SPACING ARE SETTINGS (a range, in px), not fixed numbers in the CSS.",
    "",
    existingTypes.length ? `Types already taken, pick a different one: ${existingTypes.join(", ")}` : "",
    existingNames.length ? `Names already taken, pick a different one: ${existingNames.join(", ")}` : "",
    "",
    "Answer with the file ONLY. No markdown fence, no explanation, no preamble.",
    "The first characters of your answer are `{#` or `<template>`.",
  ].filter(Boolean).join("\n")
}

/** Strip a fence if the model added one anyway, which they do. */
export function unfence(text: string): string {
  const t = text.trim()
  const fenced = t.match(/^```(?:[a-z]*)\n([\s\S]*?)\n```$/i)
  return (fenced ? fenced[1] : t).trim()
}

export interface WrittenSection {
  /** `sections/<type>.storelib` */
  path: string
  type: string
  name: string
  source: string
}

export type WriteResult =
  | { ok: true; value: WrittenSection }
  | { ok: false; error: string; errors?: ThemeError[]; source?: string }

/**
 * One request, up to three attempts, one answer. `taken` is every type and
 * name already in this install, so the model is told what it may not call the
 * section and the result is checked against the same list rather than
 * trusted.
 *
 * THREE, NOT TWO. The old second-and-last attempt was where the compiler's
 * message usually landed; there was nothing left for the case where a model
 * fixes the error it was shown and introduces another, which is the ordinary
 * way this goes when a file is 200 lines long. See MAX_REPAIR_ATTEMPTS.
 */
export async function writeSection(opts: {
  provider: AgentProvider
  model: string
  prompt: string
  /**
   * A picture of the section they want, if they attached one.
   *
   * This path used to take the words and nothing else, so a creator who
   * attached a screenshot and typed nothing sent an empty request and got
   * back "the assistant could not produce a section that compiles" — which
   * was true, and said nothing about why. See lib/sites/agent/attachments.ts.
   */
  images?: AgentImage[]
  takenTypes: string[]
  takenNames: string[]
  /**
   * The site this section is being written FOR: its colour schemes, its type,
   * its buttons, what it is already built out of.
   *
   * This path used to be given a sentence and nothing else, which is why a
   * section it produced compiled, worked, and looked like it came from a
   * different website. Optional, so a caller with no theme to hand still
   * works exactly as before.
   */
  theme?: ThemeContextInput
  signal?: AbortSignal
}): Promise<WriteResult> {
  const system = writeSectionSystem(opts.takenNames, opts.takenTypes)
  const images = opts.images ?? []
  const asked = opts.prompt.trim()
  /**
   * The instruction about the picture goes BEFORE the request, so what they
   * typed is read in the light of the image rather than the other way round.
   * With no words at all it carries the whole request on its own.
   */
  const opening = [
    /**
     * The site FIRST, because it is the frame the request is read in. A model
     * told afterwards what the colours are has already chosen them.
     */
    opts.theme ? describeThemeForAuthoring(opts.theme) : "",
    describeImages(images, asked.length > 0),
    knowledgeBlock(asked),
    asked && `REQUEST\n${asked}`,
  ]
    .filter(Boolean)
    .join("\n\n")
  const turns: { role: "user" | "assistant"; content: string; images?: AgentImage[] }[] = [
    { role: "user", content: opening, images: images.length ? images : undefined },
  ]

  for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS; attempt++) {
    const last = attempt === MAX_REPAIR_ATTEMPTS - 1
    let text: string
    try {
      const turn = await opts.provider.complete({
        model: opts.model,
        system,
        turns: turns as never,
        tools: [],
        maxOutputTokens: 8000,
        signal: opts.signal,
      })
      if (turn.stop === "refusal") return { ok: false, error: "The assistant declined to write that." }
      text = unfence(turn.text ?? "")
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "The assistant could not be reached." }
    }

    if (!text) return { ok: false, error: "The assistant sent nothing back." }

    /**
     * The type comes from the file's own schema, and the file name follows it
     * rather than the other way round: the compiler insists the two agree, so
     * deriving the name from anything else only invents a disagreement.
     */
    const declared = text.match(/"type"\s*:\s*"([a-z0-9_-]+)"/)
    if (!declared) {
      turns.push({ role: "assistant", content: text })
      turns.push({ role: "user", content: 'The schema needs a "type", lower case, letters, digits and underscores. Send the whole file again.' })
      continue
    }
    const type = declared[1]
    const path = `sections/${type}.storelib`

    if (opts.takenTypes.includes(type)) {
      turns.push({ role: "assistant", content: text })
      turns.push({ role: "user", content: `"${type}" is already a section here. Pick another type and send the whole file again.` })
      continue
    }

    /**
     * ONE GATE: it compiles AND it would be correct on a real page. The
     * quality half is what stops a section that compiles perfectly and then
     * breaks the moment somebody adds it twice, or animates at somebody who
     * asked for no animation. See lib/storelib-ai/quality.ts.
     */
    const checked = validateSection(text, { path, expectType: type })
    if (checked.ok === false) {
      if (last) {
        return checked.reason === "compile"
          ? { ok: false, error: "The section did not compile.", errors: checked.errors, source: text }
          : { ok: false, error: "The section compiled but would not be correct on a real page.", source: text }
      }
      turns.push({ role: "assistant", content: text })
      turns.push({ role: "user", content: checked.feedback })
      continue
    }

    const name = checked.name
    if (opts.takenNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
      if (last) return { ok: false, error: `Another section is already called "${name}".`, source: text }
      turns.push({ role: "assistant", content: text })
      turns.push({ role: "user", content: `Another section is already called "${name}". Give this one a different name and send the whole file again.` })
      continue
    }

    return { ok: true, value: { path, type, name, source: text } }
  }

  return { ok: false, error: "The assistant could not produce a section that compiles." }
}
