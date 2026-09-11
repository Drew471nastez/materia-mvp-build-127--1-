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
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { CONTROL_TYPES } from "@/lib/storelib-theme/controls/registry"
import { FILTER_NAMES } from "@/lib/storelib-theme/storelib/template"
import type { AgentProvider } from "@/lib/sites/agent/types"
import type { ThemeError } from "@/lib/storelib-theme/types"

/** What the model is told about the format. Short on purpose: it is a page. */
export function writeSectionSystem(existingNames: string[], existingTypes: string[]): string {
  return [
    "You write one Storelib section and nothing else.",
    "",
    "A section is ONE file with four blocks, each tag on its own line:",
    "  <template> markup </template>",
    "  <style> CSS </style>",
    "  <script> optional, sandboxed </script>",
    "  <schema> JSON </schema>",
    "",
    "THE TEMPLATE LANGUAGE is not Vue, React or JSX. `v-if`, `@click`, `:class`",
    "and JSX braces are refused by the compiler. It is:",
    "  {{ settings.heading }}            print a value, HTML-escaped",
    "  {% if x %} … {% elsif y %} … {% else %} … {% endif %}",
    "  {% for block in blocks %} … {% else %} … {% endfor %}",
    "  {# a comment, which never reaches the page #}",
    "It can read: settings, blocks, section (.id .type .settings .blocks),",
    "theme, scheme, page (.template, .in_editor) and forloop inside a loop.",
    "`settings` and `section.settings` are the same thing.",
    "",
    "EVERY NAME MUST BE DECLARED. {{ settings.foo }} only compiles when the",
    "schema declares a setting with id \"foo\". The same for block settings.",
    "",
    "FILTERS, after a pipe, argument after a colon:",
    "  " + FILTER_NAMES.join(" "),
    "  `url` on every href. `raw` only on a richtext setting. `asset` on images.",
    "",
    "SETTING TYPES:",
    "  " + CONTROL_TYPES.join(" "),
    "",
    "REPEATED CONTENT IS BLOCKS, never question_1 / question_2. Declare a block",
    "type in the schema and loop over `blocks`. Give the preset two or three so",
    "the section arrives with something in it. Put data-block-id=\"{{ block.id }}\"",
    "on each one so clicking it in the builder selects it.",
    "",
    "IT MUST TAKE THE SITE'S COLOURS. Declare a color_scheme setting and read",
    "scheme.bg, scheme.text, scheme.heading, scheme.paragraph, scheme.border,",
    "scheme.accent, scheme.primary_btn_bg, scheme.primary_btn_text. Never",
    "hardcode a colour.",
    "",
    "IT MUST BE RESPONSIVE. Write the phone layout as the base rules, then",
    "@container (min-width: 640px) and @container (min-width: 1024px). Put",
    "container-type: inline-size on the outermost element. NOT @media: a section",
    "is as wide as the column it is in, which in the phone preview is not the",
    "width of the window.",
    "",
    "CSS is scoped to the section automatically. Do not write html, body or",
    ":root rules; they will be scoped and do nothing.",
    "",
    "AN EMPTY STATE belongs behind {% if page.in_editor %} so it prompts the",
    "creator and never reaches a visitor.",
    "",
    "NO JAVASCRIPT unless the platform genuinely cannot do it. <details> and",
    "<summary> are an accordion with no script at all.",
    "",
    "Padding must be settings (range, px), not fixed numbers.",
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

const say = (errors: ThemeError[]) =>
  errors.map((e) => `${e.line ? `line ${e.line}: ` : ""}${e.message}`).join("\n")

/**
 * One request, one repair, one answer. `taken` is every type and name already
 * in this install, so the model is told what it may not call the section and
 * the result is checked against the same list rather than trusted.
 */
export async function writeSection(opts: {
  provider: AgentProvider
  model: string
  prompt: string
  takenTypes: string[]
  takenNames: string[]
  signal?: AbortSignal
}): Promise<WriteResult> {
  const system = writeSectionSystem(opts.takenNames, opts.takenTypes)
  const turns: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: opts.prompt }]

  for (let attempt = 0; attempt < 2; attempt++) {
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

    const compiled = compileSection(text, { file: path, expectType: type })
    if (compiled.ok === false) {
      if (attempt === 1) return { ok: false, error: `The section did not compile.`, errors: compiled.errors, source: text }
      turns.push({ role: "assistant", content: text })
      turns.push({ role: "user", content: `That did not compile:\n${say(compiled.errors)}\n\nFix it and send the whole file again.` })
      continue
    }

    const name = compiled.value.schema.name.trim()
    if (opts.takenNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
      if (attempt === 1) return { ok: false, error: `Another section is already called "${name}".`, source: text }
      turns.push({ role: "assistant", content: text })
      turns.push({ role: "user", content: `Another section is already called "${name}". Give this one a different name and send the whole file again.` })
      continue
    }

    return { ok: true, value: { path, type, name, source: text } }
  }

  return { ok: false, error: "The assistant could not produce a section that compiles." }
}
