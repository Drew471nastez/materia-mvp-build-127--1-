/**
 * ===========================================================================
 *  FIXING A FILE THAT WILL NOT COMPILE
 * ===========================================================================
 * Writing a section from a sentence and repairing one that is already written
 * are different jobs. The first invents; this one must change as little as
 * possible, because the file belongs to somebody who has been working on it
 * and a "fix" that rewrites their section is a loss, not a help.
 *
 * So the model is given the whole file, the compiler's own errors with their
 * line numbers, and one instruction: return the same file with those errors
 * gone. What comes back is compiled before it is handed to anybody, and a
 * result that still does not compile is refused rather than shown — one
 * repair attempt, like write-section, because a second is usually the same
 * failure and the person is sitting there waiting.
 *
 * NOTHING IS SAVED HERE. The fixed text goes back to the code editor, into
 * the buffer, for the person to read and save. A file that did not compile
 * was never stored, and an assistant that silently replaced it would be
 * taking the review away from the one place that exists for it.
 */
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { MAX_REPAIR_ATTEMPTS, checkSectionQuality, describeQuality, editSectionRules, qualityErrors } from "@/lib/storelib-ai"
import { unfence } from "@/lib/website-builder/agent/write-section"
import type { AgentProvider } from "@/lib/sites/agent/types"
import type { ThemeError } from "@/lib/storelib-theme/types"

const say = (errors: ThemeError[]) =>
  errors.map((e) => `${e.line ? `line ${e.line}: ` : ""}${e.message}`).join("\n")

export type FixResult =
  | { ok: true; value: { source: string } }
  | { ok: false; error: string; errors?: ThemeError[]; source?: string }

export async function fixSection(opts: {
  provider: AgentProvider
  model: string
  /** The file being repaired, for the compiler's messages. */
  path: string
  /** What is in the editor right now, errors and all. */
  source: string
  /** What the compiler said about it. */
  errors: ThemeError[]
  /** Types already in use, so a repair cannot rename itself onto one. */
  takenTypes?: string[]
  signal?: AbortSignal
}): Promise<FixResult> {
  /**
   * The same page of rules the writer gets, so a repair cannot invent syntax
   * the compiler does not have, plus the one rule that separates the two jobs.
   */
  const system = [
    editSectionRules(),
    "",
    "YOU ARE REPAIRING AN EXISTING FILE, not writing a new one.",
    "Change only what the errors are about. Keep the section's type, its name,",
    "its settings, its markup and its wording exactly as they are wherever the",
    "errors do not force a change. Send the WHOLE file back, nothing else: no",
    "explanation, no code fence, no diff.",
    (opts.takenTypes ?? []).length ? `Types already taken, do not rename onto one: ${(opts.takenTypes ?? []).join(", ")}` : "",
  ].filter(Boolean).join("\n")

  const first = [
    `This is ${opts.path}. It does not compile.`,
    "",
    "The compiler said:",
    say(opts.errors),
    "",
    "The file:",
    opts.source,
  ].join("\n")

  const turns: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: first }]

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
      if (turn.stop === "refusal") return { ok: false, error: "The assistant declined to change that file." }
      text = unfence(turn.text ?? "")
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "The assistant could not be reached." }
    }

    if (!text) return { ok: false, error: "The assistant sent nothing back." }

    const compiled = compileSection(text, { file: opts.path })
    if (compiled.ok === false) {
      if (last) {
        return { ok: false, error: "The repair still does not compile.", errors: compiled.errors, source: text }
      }
      turns.push({ role: "assistant", content: text })
      turns.push({ role: "user", content: `That still does not compile:\n${say(compiled.errors)}\n\nFix it and send the whole file again.` })
      continue
    }

    /**
     * A REPAIR IS NOT ALLOWED TO INTRODUCE A NEW DEFECT.
     *
     * Only what the repair ADDED counts. The file arrived here broken and
     * usually carries other problems with it; holding somebody's compile fix
     * hostage to an unrelated finding would mean the file never compiles
     * again, which is the opposite of the button they pressed.
     */
    const had = new Set(qualityErrors(checkSectionQuality(opts.source)).map((f) => f.id))
    const introduced = qualityErrors(checkSectionQuality(text)).filter((f) => !had.has(f.id))
    if (introduced.length && !last) {
      turns.push({ role: "assistant", content: text })
      turns.push({
        role: "user",
        content: `It compiles now, but the repair introduced something that would be wrong on a real page:\n${describeQuality(introduced)}\n\nFix that too and send the whole file again.`,
      })
      continue
    }

    return { ok: true, value: { source: text } }
  }

  return { ok: false, error: "The assistant could not produce a file that compiles." }
}
