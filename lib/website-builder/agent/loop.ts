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
  blockFieldsFor,
  blockSpecs,
  buildSection,
  checkSettings,
  describeFields,
  describeSection,
  describeSectionTypes,
  describeStore,
  describeTheme,
  describeThemeSettings,
  fieldsFor,
  maxBlocks,
  themeFieldsFor,
  type StoreFacts,
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
- EVERY SETTING IS A CONTROL, and the control decides what it will take. A select takes one of its listed choices and nothing else. A toggle takes true or false. A slider takes a number inside its range. A colour takes a hex value like "#1a1a1a". A field id that does not exist, and a value the control cannot take, are BOTH silently ignored by the renderer — the change would look like it worked and do nothing. read_section lists every control on a section and what each one accepts; read_section_type does the same for a type you have not added yet.
- The header and footer cannot be moved, removed, or inserted around. They are the same on every page.
- PREFER HIDING TO DELETING. "Take this off for now", "hide it until launch", "I don't want this here yet" all mean set_section_visibility, not remove_section. A hidden section keeps its settings and its content and comes back in one call; a removed one is gone, and whoever wrote that content wrote it once. Remove only when somebody clearly wants it gone for good.
- WHEN A SECTION IS SELECTED, act on it. "Make this section better" means that section, and it is not a question — look at what it is, decide what is weak about it, and change it. A FAQ with five thin questions gets better questions and better answers; a hero with a generic headline gets a specific one; a pricing table with unnamed tiers gets named tiers.
- MOST SECTIONS KEEP THEIR CONTENT IN BLOCKS, not in settings. A FAQ's questions, a pricing table's tiers, a testimonial's quotes, a gallery's images are all blocks. Changing a section's settings alone will not touch any of them, so if a request is about content, use the block tools. read_section lists the block types a section takes and the blocks it currently has.
- ALWAYS CHANGE SOMETHING VISIBLE. A run that reads a section and then replies without a single operation has not done what was asked. If a request is broad, decide what would genuinely improve the thing in front of you and do it.
- Make the change that was asked for and nothing else. Do not restyle things nobody mentioned, do not "improve" copy that was not the subject, and do not add sections to fill space.
- If the request is broad — "make this look better", "build out this page" — then look at what is there, decide what is genuinely missing, and do it properly with several operations.
- BUILDING A SECTION IS MORE THAN ADDING IT. A section added from its preset is somebody else's placeholder copy. Adding one properly means: add it, then set its controls, then write its blocks — the real questions, the real tiers, the real quotes. An FAQ with the preset's three generic questions still in it is not a section anybody asked for.
- WRITE COPY ABOUT THE REAL BUSINESS. Call read_store before you write anything that mentions what they sell, what it costs, or who it is for — the catalogue is there and inventing one produces a page that contradicts the shop behind it. Never "Lorem ipsum" and never "Your headline here".
- Do not add a product section to a store with no products. It renders empty, which looks broken rather than new.
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
          settingsJson: {
            type: "string",
            description:
              'A JSON OBJECT AS A STRING: field id → new value, only the fields you are changing. e.g. {"heading":"Questions, answered","style":"boxed"}',
          },
        },
        required: ["id", "settingsJson"],
        additionalProperties: false,
      },
    },
    {
      name: "read_section_type",
      description:
        "Look up what a KIND of section can do before you add one — every control it has, what each control accepts, and the blocks it takes. Use this when you are planning something and the section is not on the page yet.",
      parameters: {
        type: "object",
        properties: {
          sectionType: { type: "string", description: "A section type, e.g. \"pricing\"." },
        },
        required: ["sectionType"],
        additionalProperties: false,
      },
    },
    {
      name: "add_section",
      description: `Add a section to the page. It arrives filled from its preset and this tool hands back every control it has, so you can follow up with update_section and add_block to make it this store's. Available types:\n${describeSectionTypes(addable)}`,
      parameters: {
        type: "object",
        properties: {
          sectionType: { type: "string", description: "One of the types listed above." },
          index: {
            type: "number",
            description:
              "Position in the list. Omit to put it at the end, above the footer. Clamped so it can never land above the header or below the footer.",
          },
          settingsJson: {
            type: "string",
            description:
              'A JSON OBJECT AS A STRING, merged over the section\'s defaults. Send "{}" for none.',
          },
        },
        required: ["sectionType", "index", "settingsJson"],
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
      name: "set_section_visibility",
      description:
        "Hide a section from the page, or show a hidden one again. HIDING IS HOW YOU TAKE SOMETHING OFF A PAGE WITHOUT DESTROYING IT — the section keeps every setting and every block, and one call brings it back. Use this, not remove_section, whenever the request sounds temporary: \"take this off for now\", \"hide it until launch\", \"I don't want this on the page yet\". Only remove a section when somebody clearly wants it gone for good.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The section id." },
          hidden: {
            type: "boolean",
            description: "true hides it from the page, false shows it again.",
          },
        },
        required: ["id", "hidden"],
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
      name: "add_block",
      description:
        "Add a block to a section — one FAQ question, one pricing tier, one testimonial, one gallery image. THIS IS WHERE THE CONTENT LIVES for most sections: half the library keeps its real content in blocks, and changing a section's settings alone will not touch it. Call read_section first to see which block types it takes.",
      parameters: {
        type: "object",
        properties: {
          sectionId: { type: "string", description: "The section to add it to." },
          blockType: { type: "string", description: "A block type that section accepts." },
          index: { type: "number", description: "Position among the blocks. -1 for the end." },
          settingsJson: {
            type: "string",
            description:
              'A JSON OBJECT AS A STRING: block field id → value. e.g. {"question":"Do you ship worldwide?","answer":"<p>Yes.</p>"}',
          },
        },
        required: ["sectionId", "blockType", "index", "settingsJson"],
        additionalProperties: false,
      },
    },
    {
      name: "update_block",
      description:
        "Change one block's settings. MERGES: send only the fields you are changing. This is how you edit an existing FAQ answer, a tier's price, a testimonial's quote.",
      parameters: {
        type: "object",
        properties: {
          sectionId: { type: "string" },
          blockId: { type: "string", description: "The block id, from read_section." },
          settingsJson: {
            type: "string",
            description: "A JSON OBJECT AS A STRING: block field id → new value.",
          },
        },
        required: ["sectionId", "blockId", "settingsJson"],
        additionalProperties: false,
      },
    },
    {
      name: "move_block",
      description: "Reorder a block within its section.",
      parameters: {
        type: "object",
        properties: {
          sectionId: { type: "string" },
          blockId: { type: "string" },
          index: { type: "number" },
        },
        required: ["sectionId", "blockId", "index"],
        additionalProperties: false,
      },
    },
    {
      name: "remove_block",
      description: "Delete one block from a section.",
      parameters: {
        type: "object",
        properties: { sectionId: { type: "string" }, blockId: { type: "string" } },
        required: ["sectionId", "blockId"],
        additionalProperties: false,
      },
    },
    {
      name: "read_store",
      description:
        "Read what this store actually sells — its name, whether it is live, and its products with their kinds and prices. Do this before writing copy that mentions the business or its catalogue, and before adding a product section: a store with no products renders one empty.",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
    {
      name: "update_theme",
      description: `Change whole-theme settings — colours, fonts, buttons, layout, animation. These apply to EVERY page, so use them when the request is about the site as a whole rather than one section. The ids you may write, by group:\n${describeThemeSettings()}`,
      parameters: {
        type: "object",
        properties: {
          settingsJson: {
            type: "string",
            description: 'A JSON OBJECT AS A STRING: theme setting id → new value.',
          },
        },
        required: ["settingsJson"],
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
    case "set_section_visibility":
      return `${op.hidden ? "Hid" : "Showed"} ${nameOf(op.id)}`
    case "update_theme":
      return "Updated the theme"
    case "add_block":
      return `Added to ${nameOf(op.sectionId)}`
    case "update_block":
      return `Edited ${nameOf(op.sectionId)}`
    case "move_block":
      return `Reordered ${nameOf(op.sectionId)}`
    case "remove_block":
      return `Removed an item from ${nameOf(op.sectionId)}`
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
  /**
   * THE SECTION THE CREATOR HAS OPEN, if any.
   *
   * "Make this section better" is the most natural thing somebody types, and
   * without this it has no referent at all — the model is handed a list of
   * nine sections and a demonstrative pronoun. It either picks one at random,
   * asks a question it should not have to ask, or does nothing. All three
   * happened.
   */
  selectedSectionId?: string
  /**
   * Reads what the store sells. Injected for the same reason everything else
   * is: the loop has no database, and a test needs a store it can write.
   * Absent means the agent is told it cannot see the catalogue rather than
   * being left to invent one.
   */
  readStore?: () => Promise<StoreFacts | null>
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

  /**
   * The selected section is sent IN FULL up front — settings and blocks —
   * rather than left for a read_section call.
   *
   * It is what the request is about far more often than not, so paying for it
   * once is cheaper than a round trip, and it removes the failure where the
   * model edits a section's settings without ever having seen that its content
   * lives in blocks.
   */
  const selected = input.selectedSectionId
    ? state.sections.find((s) => s.id === input.selectedSectionId)
    : undefined

  const turns: AgentTurn[] = [
    {
      role: "user",
      content: [
        describeTheme(state, page),
        `THEME SETTINGS\n${JSON.stringify(state.settings, null, 2).slice(0, 3_000)}`,
        selected
          ? `THE CREATOR HAS THIS SECTION SELECTED AND OPEN. "this section", "this", "it" and "here" all mean THIS one unless they clearly name another.\n\n${describeSection(selected)}`
          : "",
        `REQUEST\n${prompt}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
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
        /**
         * The one tool that has to wait on something. `execute` is synchronous
         * on purpose — every other tool is a pure function of the theme — so
         * this is handled here rather than making the whole executor async for
         * one caller.
         */
        if (call.name === "read_store") {
          const facts = input.readStore ? await input.readStore() : null
          results.push({
            id: call.id,
            output: facts
              ? describeStore(facts)
              : "The catalogue is not available from here. Write copy that does not depend on knowing the products, and say so in your reply.",
          })
          continue
        }

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
      return { output: describeSection(found) }
    }

    case "update_section": {
      if (!found) return { output: notFound(id, state) }
      const settings = parseSettings(args.settingsJson)
      if (!settings) {
        return {
          output:
            'Send `settingsJson` as a JSON object in a string, e.g. {"heading":"New heading"}.',
        }
      }

      /**
       * THE FAILURE THIS CATCHES IS A SILENT ONE, and it has two levels.
       *
       * An unknown field id merges into the settings and is then ignored by
       * the renderer. So does a value the control cannot take — "rounded" in a
       * select whose choices are simple | boxed | bordered, 500 in a slider
       * that stops at 16. Both report success and move nothing. Refusing them
       * here, with the control's own description, is the only place anybody
       * finds out.
       */
      const checked = checkSettings(fieldsFor(found.type), settings, found.type)
      if (checked.error) return { output: checked.error }

      return {
        output: `Updated ${found.type} [${id}]: ${Object.keys(checked.settings!).join(", ")}.${
          checked.notes.length > 0 ? ` (${checked.notes.join("; ")})` : ""
        }`,
        op: { kind: "update_section", id, settings: checked.settings! },
      }
    }

    case "read_section_type": {
      const wanted = typeof args.sectionType === "string" ? args.sectionType : ""
      const schema = SECTION_SCHEMAS[wanted]
      if (!schema) {
        return { output: `There is no section type "${wanted}". The types are listed on add_section.` }
      }
      const specimen = buildSection(`preview-${wanted}`, wanted)
      return {
        output: [
          `${wanted} — ${schema.name}${schema.description ? `: ${schema.description}` : ""}`,
          `CONTROLS\n${describeFields(wanted)}`,
          specimen
            ? `WHAT IT LOOKS LIKE WHEN ADDED (its preset)\n${JSON.stringify(
                { settings: specimen.settings, blocks: specimen.blocks },
              ).slice(0, 2_000)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      }
    }

    case "add_section": {
      const sectionType = typeof args.sectionType === "string" ? args.sectionType : ""
      if (!SECTION_SCHEMAS[sectionType]) {
        return { output: `There is no section type "${sectionType}". Use one of the types listed on this tool.` }
      }
      let settings = parseSettings(args.settingsJson) ?? undefined
      let notes: string[] = []
      if (settings && Object.keys(settings).length > 0) {
        const checked = checkSettings(fieldsFor(sectionType), settings, sectionType)
        if (checked.error) return { output: `${checked.error}\n\nNothing was added.` }
        settings = checked.settings
        notes = checked.notes
      }
      const index = typeof args.index === "number" ? args.index : undefined
      const fresh = newId(sectionType)
      const op: ThemeOp = { kind: "add_section", id: fresh, sectionType, index, settings }

      /**
       * The new section is handed back IN FULL — every control it has, the
       * blocks it takes, and the values its preset started it with.
       *
       * A section arrives filled from a preset, and the whole point of adding
       * one is then to make it this store's. Without this the model has an id
       * and no idea what it can set, so it either calls read_section (a whole
       * round trip for something already known here) or, far worse, writes
       * from memory and gets refused.
       */
      const created = applyOp(state, op).sections.find((s) => s.id === fresh)
      return {
        output: [
          `Added ${sectionType} as [${fresh}].${notes.length > 0 ? ` (${notes.join("; ")})` : ""}`,
          created ? describeSection(created) : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        op,
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

    case "set_section_visibility": {
      if (!found) return { output: notFound(id, state) }
      if (typeof args.hidden !== "boolean") {
        return { output: "Send `hidden` as true to hide the section or false to show it." }
      }
      /**
       * Already in that state is reported, not applied. An operation that
       * changes nothing would still stream to the browser and land in the
       * transcript as a change somebody made, and the run's "did anything
       * happen" check would count it — a run that hid a hidden section would
       * report success with nothing to show for it.
       */
      if ((found.hidden ?? false) === args.hidden) {
        return {
          output: `${found.type} [${id}] is already ${args.hidden ? "hidden" : "visible"}. Nothing to do.`,
        }
      }
      return {
        output: `${args.hidden ? "Hid" : "Showed"} ${found.type} [${id}]. Everything in it is kept${
          args.hidden ? " and set_section_visibility with hidden false brings it back" : ""
        }.`,
        op: { kind: "set_section_visibility", id, hidden: args.hidden },
      }
    }

    case "rename_section": {
      if (!found) return { output: notFound(id, state) }
      const label = typeof args.name === "string" ? args.name.trim().slice(0, 60) : ""
      if (!label) return { output: "Send `name` as a short label." }
      return { output: `Renamed [${id}] to "${label}".`, op: { kind: "rename_section", id, name: label } }
    }

    case "add_block": {
      const sectionId = typeof args.sectionId === "string" ? args.sectionId : ""
      const section = state.sections.find((s) => s.id === sectionId)
      if (!section) return { output: notFound(sectionId, state) }

      const blockType = typeof args.blockType === "string" ? args.blockType : ""
      const specs = blockSpecs(section.type)
      if (!specs.some((b) => b.type === blockType)) {
        return {
          output: `${section.type} does not take a "${blockType}" block. It takes: ${
            specs.map((b) => b.type).join(", ") || "no blocks at all"
          }.`,
        }
      }

      /**
       * The schema's own ceiling. A slideshow that declares four slides means
       * four; a fifth is a section that renders wrong rather than a section
       * with more in it.
       */
      const cap = maxBlocks(section.type)
      if (cap !== undefined && (section.blocks?.length ?? 0) >= cap) {
        return {
          output: `${section.type} takes at most ${cap} blocks and already has ${section.blocks?.length ?? 0}. Change one of the existing ones, or remove one first.`,
        }
      }

      const settings = parseSettings(args.settingsJson)
      if (!settings) {
        return { output: 'Send `settingsJson` as a JSON object in a string, e.g. {"question":"…"}.' }
      }
      const checked = checkSettings(
        blockFieldsFor(section.type, blockType),
        settings,
        `a ${blockType} block`,
      )
      if (checked.error) return { output: `${checked.error}\n\nNothing was added.` }

      const index = typeof args.index === "number" && args.index >= 0 ? args.index : undefined
      const blockId = newId(blockType)
      return {
        output: `Added a ${blockType} block [${blockId}] to ${section.type}.${
          checked.notes.length > 0 ? ` (${checked.notes.join("; ")})` : ""
        }`,
        op: { kind: "add_block", sectionId, blockId, blockType, index, settings: checked.settings! },
      }
    }

    case "update_block": {
      const sectionId = typeof args.sectionId === "string" ? args.sectionId : ""
      const section = state.sections.find((s) => s.id === sectionId)
      if (!section) return { output: notFound(sectionId, state) }

      const blockId = typeof args.blockId === "string" ? args.blockId : ""
      const block = (section.blocks ?? []).find((b) => b.id === blockId)
      if (!block) {
        return {
          output: `${section.type} has no block "${blockId}". Its blocks are: ${
            (section.blocks ?? []).map((b) => `[${b.id}] ${b.type}`).join(", ") || "none"
          }`,
        }
      }

      const settings = parseSettings(args.settingsJson)
      if (!settings) {
        return { output: 'Send `settingsJson` as a JSON object in a string.' }
      }
      const checked = checkSettings(
        blockFieldsFor(section.type, block.type),
        settings,
        `a ${block.type} block`,
      )
      if (checked.error) return { output: checked.error }

      return {
        output: `Updated block [${blockId}]: ${Object.keys(checked.settings!).join(", ")}.${
          checked.notes.length > 0 ? ` (${checked.notes.join("; ")})` : ""
        }`,
        op: { kind: "update_block", sectionId, blockId, settings: checked.settings! },
      }
    }

    case "move_block": {
      const sectionId = typeof args.sectionId === "string" ? args.sectionId : ""
      const section = state.sections.find((s) => s.id === sectionId)
      if (!section) return { output: notFound(sectionId, state) }
      const blockId = typeof args.blockId === "string" ? args.blockId : ""
      if (!(section.blocks ?? []).some((b) => b.id === blockId)) {
        return { output: `${section.type} has no block "${blockId}".` }
      }
      const index = typeof args.index === "number" ? args.index : NaN
      if (!Number.isFinite(index)) return { output: "Send `index` as a number." }
      return {
        output: `Moved block [${blockId}] to position ${index}.`,
        op: { kind: "move_block", sectionId, blockId, index },
      }
    }

    case "remove_block": {
      const sectionId = typeof args.sectionId === "string" ? args.sectionId : ""
      const section = state.sections.find((s) => s.id === sectionId)
      if (!section) return { output: notFound(sectionId, state) }
      const blockId = typeof args.blockId === "string" ? args.blockId : ""
      if (!(section.blocks ?? []).some((b) => b.id === blockId)) {
        return { output: `${section.type} has no block "${blockId}".` }
      }
      return {
        output: `Removed block [${blockId}] from ${section.type}.`,
        op: { kind: "remove_block", sectionId, blockId },
      }
    }

    case "update_theme": {
      const settings = parseSettings(args.settingsJson)
      if (!settings) {
        return { output: 'Send `settingsJson` as a JSON object in a string, e.g. {"radius":12}.' }
      }

      /**
       * The same refusal the section and block writes make, for the same
       * reason: an id the theme does not have — or a value its control cannot
       * take — merges into the settings and is then ignored by the renderer.
       * Success reported, nothing changed.
       */
      const checked = checkSettings(themeFieldsFor(), settings, "The theme")
      if (checked.error) return { output: checked.error }

      return {
        output: `Updated the theme: ${Object.keys(checked.settings!).join(", ")}.${
          checked.notes.length > 0 ? ` (${checked.notes.join("; ")})` : ""
        }`,
        op: { kind: "update_theme", settings: checked.settings! },
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

/**
 * Settings arrive as a JSON STRING, not as a nested object, and that is not a
 * stylistic choice.
 *
 * The provider sends every tool with strict: true, and strict mode requires
 * `additionalProperties: false` on EVERY object in a schema. A settings map is
 * free-form by definition — its keys are whichever fields that section happens
 * to have — so there is no way to declare it as an object and stay legal.
 * Declaring it anyway is what produced, on the very first prompt:
 *
 *   400 Invalid schema for function 'update_section':
 *   In context=('properties', 'settings'), 'additionalProperties' is required
 *   to be supplied and to be false.
 *
 * A string is legal, carries JSON's types intact — numbers stay numbers,
 * booleans stay booleans — and costs one parse.
 */
function parseSettings(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}
