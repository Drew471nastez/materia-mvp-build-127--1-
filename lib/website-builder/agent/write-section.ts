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
import { INTEGRATION_CONTRACT } from "@/lib/storelib-ai/integration"
import {
  MAX_REPAIR_ATTEMPTS,
  describeThemeForAuthoring,
  knowledgeBlock,
  validateSection,
  writeSectionRules,
  type ThemeContextInput,
} from "@/lib/storelib-ai"
import { writerReference } from "@/lib/storelib-ai/reference"
import type { AgentProvider } from "@/lib/sites/agent/types"
import { describeImages, type AgentImage } from "@/lib/sites/agent/attachments"
import type { ThemeError } from "@/lib/storelib-theme/types"

/**
 * What the model is told about the format and about taste, and shown of it:
 * the framework, a checklist and three of Storelib's own sections
 * (lib/storelib-ai/reference.ts).
 *
 * STABLE, EVERY WORD OF IT, because it is the cached prefix on both
 * providers and the same on every website. The names already taken on this
 * website used to end it, which made the prefix one per website; they go in
 * the turn now (takenNote), with everything else about THIS site
 * (describeThemeForAuthoring).
 */
export function writeSectionSystem(): string {
  return [
    "You write one Storelib section and nothing else.",
    writeSectionRules(),
    INTEGRATION_CONTRACT,
    "PADDING AND SPACING ARE SETTINGS (a range, in px), not fixed numbers in the CSS.",
    writerReference(),
    [
      "Answer with the file ONLY. No markdown fence, no explanation, no preamble.",
      "The first characters of your answer are `{#` or `<template>`.",
    ].join("\n"),
    [
      "THE ONE EXCEPTION. If the message is not a description of a section to build (a greeting, a question, a request",
      "to change something already on the page, or too vague to design from), do not write a file. Answer with `REPLY:`",
      "followed by one to three plain sentences: answer the question, or say what you need to know, with one example of",
      "a request that would work (\"A pricing section with three plans and a monthly or yearly switch\").",
    ].join("\n"),
  ].join("\n\n")
}

/**
 * The types and names this website already has, which the new section may
 * not take. Per website, so it is part of the request, not the prefix.
 */
export function takenNote(existingNames: string[], existingTypes: string[]): string {
  return [
    existingTypes.length ? `Types already taken, pick a different one: ${existingTypes.join(", ")}` : "",
    existingNames.length ? `Names already taken, pick a different one: ${existingNames.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

/** What the writer is doing, for a panel that wants to say so while it waits. */
export type WriteStage = "thinking" | "checking" | "fixing"

/** A cut-off answer is a file that stops mid-way; asking for the same again gets the same again. */
const TOO_LONG =
  "Your answer was cut off at the length limit before the file ended, so it cannot compile. Send the whole file again, complete and shorter: the same design, with less CSS, fewer settings and no comments."

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
  /**
   * `reply` is set when the model answered rather than wrote: the message was
   * a question, or too unclear to build. It is a conversation, not a failure,
   * and the panel shows it as one.
   */
  | { ok: false; error: string; errors?: ThemeError[]; source?: string; reply?: string }

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
  /** Told each time the work moves on, so a waiting panel can say what is happening. */
  onStage?: (stage: WriteStage, attempt: number) => void
}): Promise<WriteResult> {
  const system = writeSectionSystem()
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
    describeImages(images, asked.length > 0, {
      ask: "answer REPLY: with one short question",
      content: "the site described above and the creator's own business",
    }),
    knowledgeBlock(asked),
    takenNote(opts.takenNames, opts.takenTypes),
    asked && `REQUEST\n${asked}`,
  ]
    .filter(Boolean)
    .join("\n\n")
  const turns: { role: "user" | "assistant"; content: string; images?: AgentImage[] }[] = [
    { role: "user", content: opening, images: images.length ? images : undefined },
  ]

  for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS; attempt++) {
    const last = attempt === MAX_REPAIR_ATTEMPTS - 1
    opts.onStage?.(attempt === 0 ? "thinking" : "fixing", attempt)
    let text: string
    let cutOff = false
    try {
      const turn = await opts.provider.complete({
        model: opts.model,
        system,
        turns: turns as never,
        tools: [],
        /**
         * ROOM FOR A WHOLE FILE. At 8000 a long section was cut off mid-way,
         * so it ended inside its <schema> and "never closed" came back from
         * the compiler on every attempt: each repair was asked for the same
         * whole file and ran out of room at the same place.
         */
        maxOutputTokens: 16000,
        signal: opts.signal,
      })
      if (turn.stop === "refusal") return { ok: false, error: "The assistant declined to write that." }
      text = unfence(turn.text ?? "")
      cutOff = turn.stop === "length"
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "The assistant could not be reached." }
    }

    if (!text) return { ok: false, error: "The assistant sent nothing back." }

    /* An answer instead of a file: the message was not something to build. */
    const reply = text.match(/^REPLY:\s*([\s\S]+)$/)
    if (reply) {
      const said = reply[1].trim().slice(0, 600)
      return { ok: false, error: said, reply: said }
    }

    opts.onStage?.("checking", attempt)

    if (cutOff) {
      if (last) return { ok: false, error: "The section was too long to finish.", source: text }
      turns.push({ role: "assistant", content: text })
      turns.push({ role: "user", content: TOO_LONG })
      continue
    }

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
    const checked = validateSection(text, { path, expectType: type, strict: true })
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
