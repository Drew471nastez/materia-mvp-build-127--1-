/**
 * ===========================================================================
 *  THE THEME EDITOR'S AGENT
 * ===========================================================================
 * A separate loop from lib/sites/agent, and deliberately so.
 *
 * That one edits FILES: it reads a project, writes TypeScript, bundles it,
 * typechecks it and renders it before it will admit to being finished. None of
 * that applies here. A theme is a list of sections with settings, validated by
 * a JSON schema — there is nothing to compile and nothing that can fail to
 * build. Reusing that loop would have meant carrying a workspace, a bundler
 * and four verification stages through a code path where every one of them is
 * a no-op, and the first person to change either would have had to understand
 * both.
 *
 * What IS shared is the provider: the same `AgentProvider` interface, the same
 * key handling, the same token accounting. The expensive, dangerous part is
 * common; the part that differs is small and is written twice honestly.
 *
 * ---------------------------------------------------------------------------
 *  IT DOES NOT WRITE TO THE DATABASE
 * ---------------------------------------------------------------------------
 * The editor holds unsaved work: a draft, an undo stack, a dirty flag. An
 * agent that wrote sections straight to Postgres would silently diverge from
 * what the person is looking at, and the next Save would overwrite one with
 * the other depending on which happened to go last.
 *
 * So this takes the state the browser sent, edits a copy, and streams back the
 * operations. The browser applies them to the state the panels are already
 * editing — see ./operations. Saving stays exactly what it was: the Save
 * button, writing what is on screen.
 */

import {
  applyOp,
  describeSectionTypes,
  describeTheme,
  fieldIds,
  type ThemeOp,
  type ThemeState,
} from "./operations"
import { SECTION_SCHEMAS } from "../section-schemas"
import type {
  AgentProvider,
  AgentTurn,
  ToolSpec,
  TokenUsage,
} from "@/lib/sites/agent/types"
import { addUsage, ZERO_USAGE } from "@/lib/sites/agent/types"

/**
 * Ten. A theme edit is a handful of operations and a sentence, not an
 * investigation: there is no build to fix and no test to re-run, so a model
 * still going at eleven is looping rather than working.
 */
export const MAX_TURNS = 10

/** Input plus output for the whole run. A ceiling, not a target. */
export const MAX_TOKENS = 300_000

export type ThemeAgentEvent =
  | { type: "thinking"; text: string }
  /** One change, the moment it is made, so the preview moves as it happens. */
  | { type: "op"; op: ThemeOp; label: string }
  | { type: "message"; text: string }
  | { type: "error"; message: string }

export interface ThemeAgentResult {
  status: "succeeded" | "failed" | "refused"
  message: string
  error: string | null
  usage: TokenUsage
  ops: ThemeOp[]
}

const SYSTEM_PROMPT = `You edit a website in a visual theme editor. The page is a list of SECTIONS, each with settings defined by a schema. You change the page by calling tools; there is no code and no file to write.

Rules:
- Address a section by the id shown in square brackets. Never invent an id.
- read_section before you change one. You are shown the page's structure, not every setting, so writing a field you have not read is guessing.
- update_section MERGES the settings you send. Send only the fields you are changing; everything you leave out keeps its value.
- Only use field ids that the section's schema actually has. A field that does not exist is silently ignored, so the change would appear to work and do nothing. If you are unsure, call read_section — it lists them.
- The header and footer cannot be moved, removed, or inserted around. They are the same on every page.
- Make the change that was asked for and nothing else. Do not restyle things nobody mentioned, do not "improve" copy that was not the subject, and do not add sections to fill space.
- If the request is broad — "make this look better", "build out this page" — then look at what is there, decide what is genuinely missing, and do it properly with several operations.
- Write real copy for this business, never "Lorem ipsum" and never "Your headline here".
- When you are done, reply with one plain sentence saying what you changed. No preamble, no markdown, no lists.`

function toolSpecs(addable: string[]): ToolSpec<string>[] {
  return [
    {
      name: "read_section",
      description:
        "Read one section's current settings and the full list of field ids its schema allows. Do this before changing a section.",
      parameters: {
        type: "object",
        properties: { id: { type: "string", description: "The section id, from the page listing." } },
        required: ["id"],
        additionalProperties: false,
      },
    },
    {
      name: "update_section",
      description:
        "Change settings on one section. MERGES: send only the fields you are changing. Field ids must exist in that section's schema.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The section id." },
          settings: {
            type: "object",
            description: "Field id → new value. Only the fields you are changing.",
            additionalProperties: true,
          },
        },
        required: ["id", "settings"],
        additionalProperties: false,
      },
    },
    {
      name: "add_section",
      description: `Add a section to the page. Available types:\n${describeSectionTypes(addable)}`,
      parameters: {
        type: "object",
        properties: {
          sectionType: { type: "string", description: "One of the types listed above." },
          index: {
            type: "number",
            description:
              "Position in the list. Omit to put it at the end, above the footer. Clamped so it can never land above the header or below the footer.",
          },
          settings: {
            type: "object",
            description: "Optional starting settings, merged over the section's defaults.",
            additionalProperties: true,
          },
        },
        required: ["sectionType", "index", "settings"],
        additionalProperties: false,
      },
    },
    {
      name: "move_section",
      description: "Move a section to a different position. The header and footer cannot be moved.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          index: { type: "number", description: "The position to move it to." },
        },
        required: ["id", "index"],
        additionalProperties: false,
      },
    },
    {
      name: "remove_section",
      description: "Delete a section from the page. The header and footer cannot be removed.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
    {
      name: "rename_section",
      description:
        "Rename a section in the editor's list. This is the label the creator sees in the sidebar, not anything on the page.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" }, name: { type: "string" } },
        required: ["id", "name"],
        additionalProperties: false,
      },
    },
    {
      name: "update_theme",
      description:
        "Change whole-theme settings — colours, fonts, corner radius, container width. These apply to every page, so use them when the request is about the site as a whole rather than one section.",
      parameters: {
        type: "object",
        properties: {
          settings: {
            type: "object",
            description: "Theme setting id → new value.",
            additionalProperties: true,
          },
        },
        required: ["settings"],
        additionalProperties: false,
      },
    },
  ]
}

/** A short line for the chat: "Added a pricing section", not "add_section". */
function labelFor(op: ThemeOp, state: ThemeState): string {
  const nameOf = (id: string) => {
    const section = state.sections.find((s) => s.id === id)
    return section ? SECTION_SCHEMAS[section.type]?.name ?? section.type : "a section"
  }
  switch (op.kind) {
    case "add_section":
      return `Added ${SECTION_SCHEMAS[op.sectionType]?.name ?? op.sectionType}`
    case "update_section":
      return `Updated ${nameOf(op.id)}`
    case "rename_section":
      return `Renamed to ${op.name}`
    case "move_section":
      return `Moved ${nameOf(op.id)}`
    case "remove_section":
      return `Removed ${nameOf(op.id)}`
    case "update_theme":
      return "Updated the theme"
    default:
      return "Changed the page"
  }
}

export interface ThemeAgentInput {
  provider: AgentProvider
  model: string
  prompt: string
  state: ThemeState
  page: string
  addable: string[]
  /** Groups this theme's requests for the provider's prompt cache. */
  cacheKey?: string
  signal?: AbortSignal
  maxTurns?: number
  /** Ids for new sections. Injected so a test gets stable ones. */
  newId?: (type: string) => string
}

export async function* themeAgent(
  input: ThemeAgentInput,
): AsyncGenerator<ThemeAgentEvent, ThemeAgentResult> {
  const { provider, model, prompt, page, addable, signal } = input
  const maxTurns = input.maxTurns ?? MAX_TURNS
  const newId = input.newId ?? ((type: string) => `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)

  let state: ThemeState = { sections: [...input.state.sections], settings: { ...input.state.settings } }
  const ops: ThemeOp[] = []
  let usage: TokenUsage = ZERO_USAGE
  let message = ""
  let status: ThemeAgentResult["status"] = "failed"
  let error: string | null = "The edit did not finish."

  const turns: AgentTurn[] = [
    {
      role: "user",
      content: `${describeTheme(state, page)}\n\nTHEME SETTINGS\n${JSON.stringify(state.settings, null, 2).slice(0, 4_000)}\n\nREQUEST\n${prompt}`,
    },
  ]

  try {
    for (let attempt = 1; attempt <= maxTurns; attempt++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError")

      if (usage.inputTokens + usage.outputTokens > MAX_TOKENS) {
        error = "This edit reached its token budget."
        break
      }

      const turn = await provider.complete({
        model,
        system: SYSTEM_PROMPT,
        turns: [...turns],
        tools: toolSpecs(addable),
        maxOutputTokens: 8_000,
        cacheKey: input.cacheKey,
        signal,
      })

      // Accumulated FIRST: a turn that then throws still cost money.
      usage = addUsage(usage, turn.usage)

      if (turn.stop === "refusal") {
        status = "refused"
        message = turn.text || "I can't help with that."
        error = null
        break
      }

      turns.push({ role: "assistant", content: turn.text, toolCalls: turn.toolCalls, raw: turn.raw })

      if (turn.toolCalls.length === 0) {
        message = turn.text.trim()
        status = "succeeded"
        error = null
        break
      }

      if (turn.text.trim()) yield { type: "thinking", text: turn.text.trim() }

      const results: Array<{ id: string; output: string }> = []
      for (const call of turn.toolCalls) {
        const { output, op } = execute(call.name, call.argumentsJson, state, newId)
        if (op) {
          /**
           * Labelled against the state BEFORE the operation, so "Removed FAQ"
           * can still name the section it removed.
           */
          const label = labelFor(op, state)
          state = applyOp(state, op)
          ops.push(op)
          yield { type: "op", op, label }
        }
        results.push({ id: call.id, output })
      }
      turns.push({ role: "tool", results })
    }
  } catch (thrown) {
    status = "failed"
    error =
      thrown instanceof Error && thrown.name === "AbortError"
        ? "Cancelled."
        : thrown instanceof Error
          ? thrown.message
          : "The edit failed."
  }

  /**
   * A run that changed nothing and said nothing did not do the thing that was
   * asked, whatever the model believes. Reported as a failure so the editor
   * says so rather than showing an empty success.
   */
  if (status === "succeeded" && ops.length === 0 && !message) {
    status = "failed"
    error = "Nothing was changed."
  }

  return { status, message, error, usage, ops }
}

/**
 * One tool call. Returns what the model reads and, when the call changes the
 * page, the operation to apply.
 *
 * Errors are RESULTS, not exceptions: a bad id or an unknown field is
 * something the model can correct on its next turn, and throwing would end a
 * run over a typo.
 */
function execute(
  name: string,
  argumentsJson: string,
  state: ThemeState,
  newId: (type: string) => string,
): { output: string; op?: ThemeOp } {
  let args: Record<string, unknown>
  try {
    args = argumentsJson.trim() ? JSON.parse(argumentsJson) : {}
  } catch {
    return { output: "Your arguments were not valid JSON. Send them again as a JSON object." }
  }

  const id = typeof args.id === "string" ? args.id : ""
  const found = state.sections.find((s) => s.id === id)

  switch (name) {
    case "read_section": {
      if (!found) return { output: notFound(id, state) }
      const allowed = fieldIds(found.type)
      return {
        output: [
          `${found.type} [${found.id}] "${found.name}"`,
          `FIELDS THIS SECTION ACCEPTS: ${allowed.join(", ") || "none"}`,
          `CURRENT SETTINGS\n${JSON.stringify(found.settings, null, 2).slice(0, 6_000)}`,
          found.blocks?.length ? `BLOCKS: ${found.blocks.length}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      }
    }

    case "update_section": {
      if (!found) return { output: notFound(id, state) }
      const settings = plainObject(args.settings)
      if (!settings) return { output: "Send `settings` as an object of field id → value." }

      /**
       * THE FAILURE THIS CATCHES IS A SILENT ONE.
       *
       * An unknown field id is merged into the settings and then ignored by
       * the renderer, so the tool reports success, the model reports success,
       * and nothing on the page changes. Refusing it here is the only place
       * anybody finds out.
       */
      const allowed = fieldIds(found.type)
      const unknown = Object.keys(settings).filter((key) => !allowed.includes(key))
      if (unknown.length > 0) {
        return {
          output: `${found.type} has no field${unknown.length === 1 ? "" : "s"} called ${unknown
            .map((u) => `"${u}"`)
            .join(", ")}. It accepts: ${allowed.join(", ")}. Nothing was changed — send the change again using those ids.`,
        }
      }

      return {
        output: `Updated ${found.type} [${id}]: ${Object.keys(settings).join(", ")}.`,
        op: { kind: "update_section", id, settings },
      }
    }

    case "add_section": {
      const sectionType = typeof args.sectionType === "string" ? args.sectionType : ""
      if (!SECTION_SCHEMAS[sectionType]) {
        return { output: `There is no section type "${sectionType}". Use one of the types listed on this tool.` }
      }
      const settings = plainObject(args.settings) ?? undefined
      if (settings) {
        const allowed = fieldIds(sectionType)
        const unknown = Object.keys(settings).filter((key) => !allowed.includes(key))
        if (unknown.length > 0) {
          return {
            output: `${sectionType} has no field${unknown.length === 1 ? "" : "s"} called ${unknown
              .map((u) => `"${u}"`)
              .join(", ")}. It accepts: ${allowed.join(", ")}. Nothing was added — send it again using those ids.`,
          }
        }
      }
      const index = typeof args.index === "number" ? args.index : undefined
      const fresh = newId(sectionType)
      return {
        output: `Added ${sectionType} as [${fresh}].`,
        op: { kind: "add_section", id: fresh, sectionType, index, settings },
      }
    }

    case "move_section": {
      if (!found) return { output: notFound(id, state) }
      if (found.type === "header" || found.type === "footer") {
        return { output: `The ${found.type} is fixed and cannot be moved. It is the same on every page.` }
      }
      const index = typeof args.index === "number" ? args.index : NaN
      if (!Number.isFinite(index)) return { output: "Send `index` as a number." }
      return { output: `Moved [${id}] to position ${index}.`, op: { kind: "move_section", id, index } }
    }

    case "remove_section": {
      if (!found) return { output: notFound(id, state) }
      if (found.type === "header" || found.type === "footer") {
        return { output: `The ${found.type} cannot be removed. A page without one is not a page.` }
      }
      return { output: `Removed ${found.type} [${id}].`, op: { kind: "remove_section", id } }
    }

    case "rename_section": {
      if (!found) return { output: notFound(id, state) }
      const label = typeof args.name === "string" ? args.name.trim().slice(0, 60) : ""
      if (!label) return { output: "Send `name` as a short label." }
      return { output: `Renamed [${id}] to "${label}".`, op: { kind: "rename_section", id, name: label } }
    }

    case "update_theme": {
      const settings = plainObject(args.settings)
      if (!settings) return { output: "Send `settings` as an object of setting id → value." }
      return {
        output: `Updated the theme: ${Object.keys(settings).join(", ")}.`,
        op: { kind: "update_theme", settings },
      }
    }

    default:
      return { output: `There is no tool called ${name}.` }
  }
}

/** The id was wrong. Listing the real ones is what lets the model recover. */
function notFound(id: string, state: ThemeState): string {
  const list = state.sections.map((s) => `[${s.id}] ${s.type}`).join(", ")
  return `There is no section with id "${id}" on this page. The sections are: ${list}`
}

function plainObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}
