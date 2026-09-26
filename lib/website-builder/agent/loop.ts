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

import { describeImages, type AgentImage } from "@/lib/sites/agent/attachments"
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
import { describeHouseStyle, readHouseStyle } from "./house-style"
import { describeFindings, reviewSections } from "./review"
import { nameOf as typeName, schemaMapFor, schemaOf, type SchemaMap } from "./schemas"
import { ASK_TOOL, questionText, readAsk } from "./ask"
import { applySourceEdits } from "./code-edits"
import { describeRecent, lastQuestion, type RecentMessage } from "./memory"
import { PROGRESS_LABELS, ProgressTrail, progress, savingLabel, writingLabel, type ProgressEvent } from "./progress"
import { checkSectionQuality, describeQuality, pageAgentRules, qualityErrors } from "@/lib/storelib-ai"
import { builderAgentRules } from "@/lib/agent-rules"
import { pageAgentReference } from "@/lib/storelib-ai/reference"
import { skillContext } from "@/lib/agent-skills"
import type { AgentQuestion } from "@/lib/sites/agent/questions"
import type {
  AgentProvider,
  AgentTurn,
  ToolSpec,
  TokenUsage,
} from "@/lib/sites/agent/types"
import { addUsage, ZERO_USAGE } from "@/lib/sites/agent/types"

/**
 * A theme edit is a handful of operations and a sentence, not an
 * investigation: there is no build to fix and no test to re-run.
 *
 * Sixteen, not ten. Ten was set before the block tools and before sections
 * were described control by control, and "build out this page properly" is now
 * genuinely a dozen calls: read the type, add it, set its controls, write four
 * blocks. Running out mid-edit is not a disaster any more — see the end of the
 * loop, where a run that ran out of room reports the work it did rather than
 * calling itself a failure — but it used to be, and the ceiling should not be
 * the thing shaping the work.
 */
export const MAX_TURNS = 16

/** Input plus output for the whole run. A ceiling, not a target. */
export const MAX_TOKENS = 300_000

/**
 * How many times the run may be handed its own work back.
 *
 * Two. One is enough for the ordinary case — a colour that came out at 2:1
 * gets fixed on the first pass — and the second exists for the fix that
 * introduces a different problem. Past that, a model that cannot satisfy the
 * checks is looping, and the creator is better served by the work it did plus
 * an honest sentence than by watching it try a fourth time.
 */
export const MAX_REVIEWS = 2

export type ThemeAgentEvent =
  /** Which conversation the run is recorded in, sent by the route before anything else. */
  | { type: "conversation"; id: string; title: string }
  | { type: "thinking"; text: string }
  /** One change, the moment it is made, so the preview moves as it happens. */
  | { type: "op"; op: ThemeOp; label: string }
  /**
   * WHAT IT SAID IT WAS GOING TO DO, before it did any of it.
   *
   * The model's opening turn, the one it writes before its first tool call.
   * It was being shown as another line of commentary that the next line
   * replaced; it is the only thing in a run that says what the whole run is
   * FOR, so it is worth keeping on screen until the run is over.
   */
  | { type: "plan"; text: string }
  /**
   * ONE STEP, TWICE: once when it starts and once when it ends.
   *
   * These are not a progress bar. Every one is a tool call the model actually
   * made, named against the page it was made on, so the list is a record of
   * the work rather than a decoration timed to look busy.
   */
  | { type: "step"; id: string; label: string; state: "running" | "done" | "failed" }
  /** A section's source, the moment it is written. */
  | { type: "code"; path: string; source: string }
  | { type: "message"; text: string }
  /** A section's source was rewritten: whoever is drawing it should reload. */
  | { type: "sources-changed" }
  | { type: "error"; message: string }
  /**
   * WHERE THE RUN IS: reading, products, planning, writing <section>,
   * checking, saving, done. One headline at a time, documented with the
   * phases in ./progress.ts. Draw `label`; on `done`, `detail` and `sections`.
   */
  | ProgressEvent
  /**
   * THE RUN STOPPED TO ASK. One short question and the choices to tap
   * (ask_creator, ./ask.ts). Nothing after it in this run but the closing
   * `message`, which carries the same question as text. The creator's answer
   * is their next message in the same conversation.
   */
  | { type: "question"; id: string; question: string; why?: string; options: string[] }

export interface ThemeAgentResult {
  status: "succeeded" | "failed" | "refused"
  message: string
  error: string | null
  usage: TokenUsage
  ops: ThemeOp[]
  /** A section's source was rewritten, so the editor reloads its files. */
  wroteCode?: boolean
  /** The question the run stopped on, when it asked one. */
  asked?: AgentQuestion | null
}

const SYSTEM_PROMPT = `You edit a website in a visual theme editor. The page is a list of SECTIONS, each with settings defined by a schema, and each KIND of section is a file you can read and rewrite: its markup, its CSS, its script and that schema. You change the page by calling tools.

Rules:
- Address a section by the id shown in square brackets. Never invent an id.
- read_section before you change one. You are shown the page's structure, not every setting, so writing a field you have not read is guessing.
- update_section MERGES the settings you send. Send only the fields you are changing; everything you leave out keeps its value.
- EVERY SETTING IS A CONTROL, and the control decides what it will take. A select takes one of its listed choices and nothing else. A toggle takes true or false. A slider takes a number inside its range. A colour takes a hex value like "#1a1a1a". A field id that does not exist, and a value the control cannot take, are BOTH silently ignored by the renderer — the change would look like it worked and do nothing. read_section lists every control on a section and what each one accepts; read_section_type does the same for a type you have not added yet.
- The header and footer cannot be moved, removed, or inserted around. They are the same on every page.
- PREFER HIDING TO DELETING. "Take this off for now", "hide it until launch", "I don't want this here yet" all mean set_section_visibility, not remove_section. A hidden section keeps its settings and its content and comes back in one call; a removed one is gone, and whoever wrote that content wrote it once. Remove only when somebody clearly wants it gone for good.
- WHEN A SECTION IS SELECTED, act on it. "Make this section better" means that section, and it is not a question — look at what it is, decide what is weak about it, and change it. A FAQ with five thin questions gets better questions and better answers; a hero with a generic headline gets a specific one; a pricing table with unnamed tiers gets named tiers.
- MOST SECTIONS KEEP THEIR CONTENT IN BLOCKS, not in settings. A FAQ's questions, a pricing table's tiers, a testimonial's quotes, a gallery's images are all blocks. Changing a section's settings alone will not touch any of them, so if a request is about content, use the block tools. read_section lists the block types a section takes and the blocks it currently has.
- NOT EVERY MESSAGE IS AN EDIT. A greeting or a question ("what can you do?", "why is my header dark?") gets an answer, not a guess: make no changes and reply in one to three plain sentences. Never apologise at length and never describe your tools.
- ASK ONLY WHAT YOU CANNOT READ. When a missing fact would change what you build (which of several products, which page, brand colours the site does not have, a business fact that is nowhere on the page or in the store) call ask_creator with one short question and two to four choices taken from what you read. The run stops there; their answer is their next message, with this conversation shown above it. Never ask what the page, the theme, the store or the conversation already answers, and never about taste you can decide.
- ALWAYS CHANGE SOMETHING VISIBLE when you are asked to change something, unless you asked a question. A run that reads a section and then replies without a single operation has not done what was asked. If a request is broad, decide what would genuinely improve the thing in front of you and do it.
- STAY ON THE SUBJECT, but do the subject properly. "Change this heading to X" is one operation and stops there — do not restyle things nobody mentioned or "improve" copy that was not the subject. That is about SCOPE, not about effort, and it is not licence to do the smallest possible version of what WAS asked.
- WHEN THE ASK IS TO BUILD, DESIGN OR MAKE SOMETHING GOOD, the standard is a section a designer would ship, and it takes ten to twenty operations. Adding the section is the first of them, not the job:
    1. read_section_type first, so you know every control and block type before you start.
    2. add_section.
    3. Write ALL of its content. A section that takes blocks needs them FULL — a pricing table with three named tiers, each with its price, its feature list and its button; an FAQ with six real questions and real answers; testimonials with named people; a feature grid with every cell filled. Half-filled is the single most common way this comes out looking cheap.
    4. Set the controls that make it look designed: heading and subheading, the layout or style option, the columns, the padding, the colours that match this page.
    5. Read it back with read_section and ask yourself whether you would ship it. If a field is empty that should not be, fill it.
- A WHOLE PAGE IS AN ORDER, NOT A PILE. When the ask is a landing page, a home page or a whole site, decide the running order first and build it in that order: what it is and who it is for, then the proof, then what they get, then what it costs, then the questions, then the ask. Five or six sections, each finished before you start the next, alternating background against the one above it so the page has a rhythm. One long section is not a page, and six sections that each shout is not a page either.
- "COMPLEX" AND "COMPLETE" MEAN CONTENT, NOT DECORATION. Nobody asking for a complex section wants louder colours; they want a section with real substance in it — more entries, better written, properly organised. Fill it up.
- DO NOT STOP EARLY. If you have made two or three operations and the section is not finished, keep going. Running out of turns having done thorough work is fine; stopping at a third of the job because it technically answers the request is not.
- WRITE COPY ABOUT THE REAL BUSINESS. Call read_store before you write anything that mentions what they sell, what it costs, or who it is for — the catalogue is there and inventing one produces a page that contradicts the shop behind it. When the STORE is already shown with the request, it has been read for you: do not read it again. Never "Lorem ipsum" and never "Your headline here".
- SELL WITH THE REAL CATALOGUE. A product section set to the shop draws the real products, prices and pictures and stays in step with them; a product picker takes a product's page address from read_store. Buy buttons go to Storelib checkout, which brings the buyer back to this site. Never type a price, product or picture the store does not have.
- Do not add a product section to a store with no products. It renders empty, which looks broken rather than new.
- MATCH THE PAGE YOU ARE ON. It has a palette, a spacing rhythm and a way of alternating backgrounds, and you are shown them. Reuse a colour that is already there rather than introducing one three shades off it; keep padding on the values the rest of the page uses. Coherence is what separates a designed page from an assembled one, and it comes from using a small vocabulary consistently — not from making each section interesting on its own.
- YOUR WORK IS CHECKED BEFORE YOU FINISH. Contrast, empty text, repeated entries, and a section left holding its preset's demo copy are all checked against the page as it stands after your changes. If anything is wrong you will be told and you fix it. So get it right first: text needs at least 4.5:1 against what is behind it, every section you add gets real copy about this store, and no two entries say the same thing.
- THE SOURCE IS REACHED WITH TOOLS, LIKE ANYTHING ELSE HERE. When the change is not something a control covers: read_section_code on that section's type, then change the markup, the CSS, the script or the schema with edit_section_code, exact find and replace for only the lines that change. Use write_section_code with the whole file only for a new layout. A refused write did not happen; the compiler says what is wrong, so fix that and write again rather than reporting a change you did not save.
- READ ONCE. What you read in this run stays true until you change it; a second read of something unchanged is answered with a note, not the content again. Make related changes in the same turn.
- When you are done, reply with one plain sentence saying what you changed and in which sections. No preamble, no markdown, no lists.

${pageAgentRules()}

${builderAgentRules()}

${pageAgentReference()}`

function toolSpecs(addable: string[], schemas?: SchemaMap, code?: boolean): ToolSpec<string>[] {
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
      description: `Add a section to the page. It arrives filled from its preset and this tool hands back every control it has, so you can follow up with update_section and add_block to make it this store's. Available types:\n${describeSectionTypes(addable, schemas)}`,
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
    ...(code
      ? [
          {
            name: "read_section_code",
            description:
              "Read the SOURCE of a kind of section: its markup, its CSS, its script and its schema. Use this the moment a request is about something no setting covers — an animation, a transition, hover behaviour, spacing between two particular things, how a part behaves on a phone.",
            parameters: {
              type: "object" as const,
              properties: {
                sectionType: { type: "string", description: 'The section type, e.g. "faq_accordion".' },
              },
              required: ["sectionType"],
              additionalProperties: false,
            },
          },
          {
            name: "edit_section_code",
            description:
              "Change PART of a kind of section's source: exact find-and-replace edits, applied in order. Each find is copied from read_section_code and appears exactly once in the file (add a neighbouring line if it does not). The result is compiled and checked like a whole file and refused if it fails. This is how to make a change to a file: it costs a fraction of resending it and cannot touch lines you did not name. Changes every place this kind of section is used.",
            parameters: {
              type: "object" as const,
              properties: {
                sectionType: { type: "string", description: "The section type you read." },
                edits: {
                  type: "array",
                  description: "One or more edits, in order.",
                  items: {
                    type: "object",
                    properties: {
                      find: { type: "string", description: "Text that is in the file exactly once, copied exactly." },
                      replace: { type: "string", description: "What it becomes." },
                    },
                    required: ["find", "replace"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["sectionType", "edits"],
              additionalProperties: false,
            },
          },
          {
            name: "write_section_code",
            description:
              "Replace the source of a kind of section with a new one. Send the WHOLE file. Only for a new layout: for a change to part of it, edit_section_code. It is compiled before it is stored and refused if it does not compile, so keep every part you were not asked to change exactly as it was: the schema, the settings it reads, the blocks, the classes the rest of the theme uses. Changes every place this kind of section is used.",
            parameters: {
              type: "object" as const,
              properties: {
                sectionType: { type: "string", description: "The section type you read." },
                source: { type: "string", description: "The complete new file." },
              },
              required: ["sectionType", "source"],
              additionalProperties: false,
            },
          },
        ]
      : []),
    {
      name: "read_store",
      description:
        "Read what this store actually sells: its name, whether it is live, and its products with their ids, page addresses, kinds, prices, sale prices and options. Do this before writing copy that mentions the business or its catalogue, and before adding a product section: a store with no products renders one empty. Not needed when the STORE is already shown with the request.",
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
    /* Last, so every tool above it keeps its place in the cached prefix. */
    ASK_TOOL,
  ]
}

/**
 * The closing sentence, from the work rather than from the model.
 *
 * Used when a run does real work and then runs out of room before writing one.
 * Deliberately plain: it lists what happened, because that is all it knows —
 * the model's own sentence is better when there is one, and this is what makes
 * its absence stop mattering.
 */
function summarise(done: string[]): string {
  if (done.length === 0) return ""
  const unique = [...new Set(done)]
  if (unique.length === 1) return `${unique[0]}.`
  if (unique.length === 2) return `${unique[0]} and ${unique[1].toLowerCase()}.`
  const last = unique[unique.length - 1].toLowerCase()
  return `${unique.slice(0, -1).join(", ")} and ${last}.`
}

/** A short line for the chat: "Added a pricing section", not "add_section". */
/**
 * WHAT A TOOL CALL IS, IN THE CREATOR'S WORDS.
 *
 * "read_section" is not a step anybody asked for; "Reading the FAQ" is the
 * same step described to the person waiting on it. Named against the page as
 * it stands when the call is made, so a section is called what it is called
 * rather than by its id.
 */
/**
 * The tools that exist to CHANGE the page. One of these that comes back with
 * no operation did not do what it set out to do, whatever its message says.
 */
const WRITE_TOOLS = new Set([
  "add_section",
  "remove_section",
  "move_section",
  "rename_section",
  "update_section",
  "set_section_visibility",
  "add_block",
  "update_block",
  "remove_block",
  "move_block",
  "update_theme",
])

function describeCall(
  name: string,
  argumentsJson: string,
  state: ThemeState,
  schemas?: SchemaMap,
): string {
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(argumentsJson || "{}") as Record<string, unknown>
  } catch {
    /* A call whose arguments will not parse still gets a name. */
  }
  /**
   * "the FAQ" where the section is on the page, and "a section" where it is
   * not — the caller writes `the ${...}` around it, so an unknown one has to
   * come back without the article or the label reads "Reading the a section".
   */
  const nameOf = (id: unknown) => {
    const section = state.sections.find((s) => s.id === id)
    return section ? `the ${typeName(schemas, section.type)}` : "a section"
  }
  const typeOf = (value: unknown) =>
    typeof value === "string" ? `the ${typeName(schemas, value)}` : "a section"

  switch (name) {
    case "read_section": return `Reading ${nameOf(args.id)}`
    case "read_section_type": return `Looking at what ${typeOf(args.sectionType)} can do`
    case "read_section_code": return `Reading ${typeOf(args.sectionType)} code`
    case "write_section_code": return `Writing ${typeOf(args.sectionType)} code`
    case "edit_section_code": return `Editing ${typeOf(args.sectionType)} code`
    case "ask_creator": return "Asking you a question"
    case "read_store": return "Reading the catalogue"
    case "add_section": return `Adding ${typeOf(args.sectionType)}`
    case "remove_section": return `Removing ${nameOf(args.id)}`
    case "move_section": return `Moving ${nameOf(args.id)}`
    case "rename_section": return `Renaming ${nameOf(args.id)}`
    case "update_section": return `Changing ${nameOf(args.id)}`
    case "set_section_visibility":
      return args.visible === false ? `Hiding ${nameOf(args.id)}` : `Showing ${nameOf(args.id)}`
    case "add_block": return `Adding to ${nameOf(args.sectionId)}`
    case "update_block": return `Editing ${nameOf(args.sectionId)}`
    case "remove_block": return `Removing from ${nameOf(args.sectionId)}`
    case "move_block": return `Reordering ${nameOf(args.sectionId)}`
    case "update_theme": return "Changing the theme's settings"
    default: return name.replace(/_/g, " ")
  }
}

function labelFor(op: ThemeOp, state: ThemeState, schemas?: SchemaMap): string {
  const nameOf = (id: string) => {
    const section = state.sections.find((s) => s.id === id)
    return section ? typeName(schemas, section.type) : "a section"
  }
  switch (op.kind) {
    case "add_section":
      return `Added ${typeName(schemas, op.sectionType)}`
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
  /**
   * This install's saved `.storelib` files, path to source. What makes the
   * sections the creator wrote visible to the assistant: they exist only
   * here, so without them it knew their names and nothing about their
   * settings. Left out, it sees the theme's sections and no others, which is
   * what it saw before.
   */
  sources?: Record<string, string>
  /**
   * ===========================================================================
   *  A SETTING IS ONE WAY TO MAKE A CHANGE, NOT THE LIMIT OF WHAT IS POSSIBLE
   * ===========================================================================
   * Asked to make an accordion open more smoothly, the agent used to answer
   * that the section exposes no animation control and stop. The section is a
   * file: markup, CSS, a little script and a schema, all editable. What it
   * lacked was a way in.
   *
   * Given this, it can read a section's source and write it back. The write
   * compiles the file first and refuses a source that does not, so a request
   * for a nicer animation can never leave somebody with a section that will
   * not render. Absent, the two tools are simply not offered, and the agent
   * works with settings alone as it always did.
   */
  code?: {
    read(sectionType: string): string | null
    write(sectionType: string, source: string): Promise<{ ok: true } | { ok: false; error: string }>
  }
  model: string
  prompt: string
  /**
   * Pictures the creator attached to this request. They are shown to the
   * model, not described to it: a section written from a screenshot the
   * model can see is a different section from one written from a summary of
   * it. See lib/sites/agent/attachments.ts.
   */
  images?: AgentImage[]
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
   * ONLY THIS SECTION MAY CHANGE.
   *
   * Selecting a section and asking for "a bit more space" should not come back
   * with a reworded hero and a new palette. The model was TOLD which section
   * was open and left free to touch anything, so sometimes it did — and an
   * edit that changes more than you asked for is one you have to inspect the
   * whole page to trust.
   *
   * With this set, every write is checked against the open section: its
   * settings, its blocks, its name. Anything else is refused with an
   * explanation the model can pass on, so the answer is "the FAQ is the only
   * thing open — clear the lock and I'll add a section" rather than a surprise
   * somewhere else on the page.
   *
   * Reads are NOT restricted. Looking at the header to match its type scale
   * changes nothing, and a model that cannot look produces a section that
   * matches nothing.
   */
  lockToSelection?: boolean
  /**
   * Reads what the store sells. Injected for the same reason everything else
   * is: the loop has no database, and a test needs a store it can write.
   * Absent means the agent is told it cannot see the catalogue rather than
   * being left to invent one.
   */
  readStore?: () => Promise<StoreFacts | null>
  /**
   * THE LAST FEW MESSAGES OF THIS CONVERSATION, oldest first, before this
   * request (./memory.ts). What makes "I meant the animation" and a tapped
   * answer to its own question mean something. Absent: the request stands
   * alone, as it always did.
   */
  history?: RecentMessage[]
  /** Groups this theme's requests for the provider's prompt cache. */
  cacheKey?: string
  /** How hard to think, passed through to providers that have such a dial. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max"
  signal?: AbortSignal
  maxTurns?: number
  /**
   * THIS REQUEST IS ASKING FOR SOMETHING TO BE BUILT (./ambition). Two things
   * follow from it, and both were measured against runs that came out thin:
   *
   *   THE CATALOGUE IS READ UP FRONT. Copy for a section is about the
   *   business whether or not the sentence mentions it, and "add a
   *   testimonials section" does not trip STORE_WORDS. The model was left to
   *   spend a turn on read_store, or to write around a shop it had not seen.
   *
   *   IT IS GIVEN ROOM TO WRITE. A filled section is six blocks of real copy
   *   in one turn, and 8,000 output tokens is where that gets cut off — which
   *   arrives as a half-written section, not as an error.
   */
  ambitious?: boolean
  /** How many times the run may be handed its own work back. */
  maxReviews?: number
  /** Ids for new sections. Injected so a test gets stable ones. */
  newId?: (type: string) => string
}

export async function* themeAgent(
  input: ThemeAgentInput,
): AsyncGenerator<ThemeAgentEvent, ThemeAgentResult> {
  const { provider, model, prompt, page, addable, signal } = input
  const images = input.images ?? []
  /** Only meaningful with a section actually selected. */
  const locked = input.lockToSelection ? input.selectedSectionId : undefined
  const maxTurns = input.maxTurns ?? MAX_TURNS
  const maxReviews = input.maxReviews ?? MAX_REVIEWS
  const newId = input.newId ?? ((type: string) => `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
  /**
   * EVERY SECTION TYPE THIS INSTALL CAN SEE, built once for this run: the
   * theme's, and the ones the creator wrote, which exist only in their own
   * files. Without it the assistant could move, hide, duplicate and remove
   * their sections but could not name a single setting on one, because the
   * map it read was built when the site was built.
   *
   * Built here and passed down rather than held anywhere: a module-level map
   * would be shared by every request this server is handling at once.
   */
  const schemas = schemaMapFor(input.sources)

  let state: ThemeState = { sections: [...input.state.sections], settings: { ...input.state.settings } }
  /** Whether any section's source was rewritten, so the caller can reload it. */
  let wroteCode = false
  const ops: ThemeOp[] = []
  let usage: TokenUsage = ZERO_USAGE
  let message = ""
  let status: ThemeAgentResult["status"] = "failed"
  /**
   * The value nobody should ever read. Every exit below sets its own, and the
   * block at the end of this function turns "ran out of room having done real
   * work" into a success. It stays only as the answer to "the loop body never
   * ran at all", which is a bug rather than an outcome.
   */
  let error: string | null = "The edit did not finish."
  /** What was done, in the creator's words, for the summary at the end. */
  const done: string[] = []
  /** Sections this run wrote to, and the subset it created, for the review. */
  const touched = new Set<string>()
  const added = new Set<string>()
  /** Per section type, how many writes the quality gate has sent back. */
  const codeRefusals = new Map<string, number>()
  /** Sections whose blocks this run added to or removed from. */
  const filled = new Set<string>()
  /**
   * Which FIELDS were set, per section. The review needs the difference
   * between "this section was involved" and "the model chose this value" —
   * without it, every contrast check reports the product's own presets.
   */
  const written = new Map<string, Set<string>>()
  /** Which blocks the run wrote words into, per section, for the copy check. */
  const blockWrites = new Map<string, Set<string>>()
  let reviews = 0

  /** Where the run is, said once per stage: see ./progress. */
  const trail = new ProgressTrail()
  /** The question the run stopped on, when it asked one. */
  let asked: AgentQuestion | null = null
  /**
   * WHAT THIS RUN HAS ALREADY READ, by tool and arguments. Every turn resends
   * the whole conversation, so a second read of something unchanged pays for
   * the same text twice and then again on every turn after it. It is answered
   * with a note instead, until a write changes what was read.
   */
  const reads = new Map<string, string>()
  const forget = (prefix: string) => {
    for (const key of [...reads.keys()]) if (key.startsWith(prefix)) reads.delete(key)
  }

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

  const history = input.history ?? []

  /**
   * THE CATALOGUE, READ BEFORE THE MODEL IS ASKED, when the request is about
   * the business: copy, products, prices, a picture to fill with the
   * creator's content. The model would call read_store as its first move on
   * every one of these, and that round trip resends everything above it; read
   * here, it is one database read and a few lines in the first turn.
   */
  {
    const reading = trail.next(progress("reading", PROGRESS_LABELS.page))
    if (reading) yield reading
    if (images.length) yield progress("reading", PROGRESS_LABELS.picture)
  }

  let store: StoreFacts | null | undefined
  const aboutTheBusiness = STORE_WORDS.test(prompt) || images.length > 0 || !!input.ambitious
  if (aboutTheBusiness && input.readStore) {
    const said = trail.next(progress("products", PROGRESS_LABELS.products))
    if (said) yield said
    store = await input.readStore()
  }

  const turns: AgentTurn[] = [
    {
      role: "user",
      content: [
        describeTheme(state, page, schemas),
        /**
         * BEFORE the theme settings and before the request, because it is the
         * frame everything else is read in. A model told what the page has
         * already decided writes a first attempt that belongs there; one told
         * afterwards has already chosen.
         */
        describeHouseStyle(readHouseStyle(state, [], schemas)),
        /* Compact: the indentation of a pretty-printed dump was a third of its tokens. */
        `THEME SETTINGS\n${compactSettings(state.settings)}`,
        selected && locked
          ? `THE CREATOR HAS THIS SECTION OPEN AND LOCKED. It is the ONLY thing you may change — its settings, its blocks, its name. You may READ anything else on the page to match it, but every write to another section, and every change to the theme, will be refused. If what they asked for genuinely needs more than this section, do what you can here and say plainly what the rest would take.\n\n${describeSection(selected, schemas)}`
          : selected
            ? `THE CREATOR HAS THIS SECTION SELECTED AND OPEN. "this section", "this", "it" and "here" all mean THIS one unless they clearly name another.\n\n${describeSection(selected, schemas)}`
            : "",
        store ? `STORE, read for you just now:\n${describeStore(store)}` : "",
        /* What was just said, so a follow-up or an answer means what it meant. */
        describeRecent(history),
        /**
         * AFTER the theme and BEFORE the request. What the picture is for is
         * read in the light of what this theme can do; what they typed is
         * read in the light of the picture.
         */
        describeImages(images, prompt.trim().length > 0),
        /**
         * RETRIEVED, NOT DUMPED, and in the turn rather than the prefix.
         * The whole reference is thousands of tokens of mostly-irrelevant
         * detail; what a request about an animation needs is the handful of
         * facts about animation. It goes here, beside the request, because a
         * prefix that changes per request is a prefix neither provider
         * caches, and the cached prefix is most of what a run costs.
         */
        skillContext(prompt, { images: images.length > 0 }),
        `REQUEST\n${prompt}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      images: images.length ? images : undefined,
    },
  ]

  /** The opening turn is the plan; everything after it is commentary. */
  let plannedYet = false

  try {
    for (let attempt = 1; attempt <= maxTurns; attempt++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError")

      if (usage.inputTokens + usage.outputTokens > MAX_TOKENS) {
        error = "This edit reached its token budget."
        break
      }

      if (attempt === 1) yield progress("planning", PROGRESS_LABELS.planning)

      const turn = await provider.complete({
        model,
        system: SYSTEM_PROMPT,
        turns: [...turns],
        tools: toolSpecs(addable, schemas, !!input.code),
        /* A filled section is a lot of copy in one turn; cut off, it arrives half written. See `ambitious`. */
        maxOutputTokens: input.ambitious ? 16_000 : 8_000,
        cacheKey: input.cacheKey,
        effort: input.effort,
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
        /**
         * =====================================================================
         *  IT DOES NOT GET TO SAY IT IS FINISHED WITHOUT READING ITS WORK BACK
         * =====================================================================
         * The code agent bundles, typechecks and renders before it will admit
         * to being done. A theme has nothing to compile, so this loop used to
         * accept the model's word for it — and a colour change that left body
         * text at 1.4:1 against its background was reported as a success.
         *
         * A theme has plenty that can be wrong; it just is not a compiler that
         * knows it. ./review checks the sections this run touched and hands
         * back anything objectively broken, and the run carries on until they
         * are fixed or the review budget is spent. See MAX_REVIEWS for why the
         * budget is small.
         */
        const reviewing = ops.length > 0 && reviews < maxReviews
        if (reviewing) {
          const checking = trail.next(progress("checking", PROGRESS_LABELS.checking))
          if (checking) yield checking
        }
        const findings = reviewing
          ? reviewSections({
              state,
              schemas,
              touched: [...touched],
              added: [...added],
              filled: [...filled],
              written: Object.fromEntries([...written].map(([id, set]) => [id, [...set]])),
              writtenBlocks: Object.fromEntries([...blockWrites].map(([id, set]) => [id, [...set]])),
            })
          : []

        if (findings.length > 0) {
          reviews++
          yield {
            type: "thinking",
            text:
              findings.length === 1
                ? "Checking the change — one thing to fix."
                : `Checking the changes — ${findings.length} things to fix.`,
          }
          turns.push({ role: "user", content: describeFindings(findings, state) })
          continue
        }

        message = turn.text.trim()
        status = "succeeded"
        error = null
        break
      }

      /**
       * THE FIRST THING IT SAYS IS THE PLAN.
       *
       * Every turn after this one is commentary between steps — useful, and
       * replaced by the next line. The opening turn is different: it is the
       * only place in a run that says what the whole run is for, and it was
       * being scrolled away by the first tool call.
       */
      if (turn.text.trim()) {
        if (!plannedYet) {
          plannedYet = true
          yield { type: "plan", text: turn.text.trim() }
        } else {
          yield { type: "thinking", text: turn.text.trim() }
        }
      }

      const results: Array<{ id: string; output: string }> = []
      for (const call of turn.toolCalls) {
        /**
         * ANNOUNCED BEFORE IT RUNS, and named against the page as it stands
         * now — after the call, a section it removed no longer has a name to
         * be called by.
         */
        const stepLabel = describeCall(call.name, call.argumentsJson, state, schemas)
        yield { type: "step", id: call.id, label: stepLabel, state: "running" }

        /**
         * A QUESTION ENDS THE RUN. The policy is checked first (./ask.ts):
         * once a run, two to four choices, never the same question twice,
         * never "which product" to a one-product store. A refusal goes back to
         * the model as a result it acts on; a question goes to the creator.
         */
        if (call.name === "ask_creator") {
          const read = readAsk(call.argumentsJson, call.id, {
            products: store ? store.publishedProducts : null,
            previousQuestion: lastQuestion(history),
            asked: asked ? 1 : 0,
          })
          if ("refused" in read) {
            results.push({ id: call.id, output: read.refused })
            yield { type: "step", id: call.id, label: stepLabel, state: "failed" }
            continue
          }
          asked = read.question
          yield { type: "step", id: call.id, label: stepLabel, state: "done" }
          yield {
            type: "question",
            id: asked.id,
            question: asked.question,
            ...(asked.why ? { why: asked.why } : {}),
            options: asked.suggestions,
          }
          break
        }

        /**
         * The one tool that has to wait on something. `execute` is synchronous
         * on purpose — every other tool is a pure function of the theme — so
         * this is handled here rather than making the whole executor async for
         * one caller. Read once a run: the catalogue does not change under it.
         */
        if (call.name === "read_store") {
          if (store === undefined) {
            const said = trail.next(progress("products", PROGRESS_LABELS.products))
            if (said) yield said
            store = input.readStore ? await input.readStore() : null
            results.push({
              id: call.id,
              output: store
                ? describeStore(store)
                : "The catalogue is not available from here. Write copy that does not depend on knowing the products, and say so in your reply.",
            })
          } else {
            results.push({
              id: call.id,
              output: store
                ? "You already have the store: it is shown above (STORE) and has not changed. Use it."
                : "The catalogue is not available from here. Write copy that does not depend on knowing the products, and say so in your reply.",
            })
          }
          yield { type: "step", id: call.id, label: stepLabel, state: store ? "done" : "failed" }
          continue
        }

        /* A read of something this run already read, unchanged since: a note, not the text again. */
        const readKey = READ_TOOLS.has(call.name) ? `${call.name}:${readTarget(call.argumentsJson)}` : ""
        if (readKey && reads.has(readKey)) {
          results.push({ id: call.id, output: `You read this earlier in this run and nothing has changed it since. Use that result.` })
          yield { type: "step", id: call.id, label: stepLabel, state: "done" }
          continue
        }

        /**
         * THE CODE TOOLS ARE THE ONLY ONES THAT TOUCH A FILE, so they are
         * the only ones that have to wait for anything. Everything else is a
         * change to the page held in memory here and stays instant.
         */
        if (
          input.code &&
          (call.name === "read_section_code" || call.name === "write_section_code" || call.name === "edit_section_code")
        ) {
          const writing = call.name !== "read_section_code"
          const codeType = readTarget(call.argumentsJson)
          const codeName = `the ${typeName(schemas, codeType)}`
          if (writing) {
            const said = trail.next(progress("writing", writingLabel(codeName)))
            if (said) yield said
          }
          const saved = await runCodeTool(call.name, call.argumentsJson, input.code, codeRefusals)
          results.push({ id: call.id, output: saved.output })
          if (call.name === "read_section_code" && saved.ok) reads.set(readKey, saved.output)
          const wrote = writing && saved.ok
          if (wrote) {
            // The canvas has to be told, the same way an operation tells it.
            yield progress("saving", savingLabel(codeName))
            done.push(`Rewrote the ${codeType.replace(/_/g, " ")} section's code`)
            wroteCode = true
            /* What was read of it, and what its schema says, are no longer true. */
            forget(`read_section_code:${codeType}`)
            forget(`read_section_type:${codeType}`)
            forget("read_section:")
            /**
             * The source itself, so the panel can show what was written
             * rather than only that something was. It is what was saved,
             * after the edits were applied: the same string, not a summary.
             */
            if (saved.source) yield { type: "code", path: `sections/${codeType}.storelib`, source: saved.source }
          }
          yield {
            type: "step",
            id: call.id,
            label: stepLabel,
            state: writing && !wrote ? "failed" : "done",
          }
          continue
        }

        /* Which section a write is about, for "Writing the FAQ", said when the run moves on to it. */
        if (WRITE_TOOLS.has(call.name)) {
          const said = trail.next(progress("writing", writingLabel(targetName(call.name, call.argumentsJson, state, schemas))))
          if (said) yield said
        }

        const { output, op, failed: refused } = execute(call.name, call.argumentsJson, state, newId, locked, schemas)
        if (readKey && !refused) reads.set(readKey, output)
        if (op) {
          /* What was read of this section is no longer what it holds. */
          forget(`read_section:${"sectionId" in op ? op.sectionId : "id" in op ? op.id : ""}`)
          if (op.kind === "update_theme") forget("read_section:")
          if (op.kind === "add_block" || op.kind === "update_block") {
            const blocks = blockWrites.get(op.sectionId) ?? new Set<string>()
            blocks.add(op.blockId)
            blockWrites.set(op.sectionId, blocks)
          }
          /**
           * Labelled against the state BEFORE the operation, so "Removed FAQ"
           * can still name the section it removed.
           */
          const label = labelFor(op, state, schemas)
          state = applyOp(state, op, schemas)
          ops.push(op)
          done.push(label)
          if ("sectionId" in op) touched.add(op.sectionId)
          if ("id" in op) touched.add(op.id)
          if (op.kind === "add_section") added.add(op.id)
          if (op.kind === "add_block" || op.kind === "remove_block") filled.add(op.sectionId)
          if (
            (op.kind === "update_section" || op.kind === "add_section") &&
            op.settings
          ) {
            const fields = written.get(op.id) ?? new Set<string>()
            for (const key of Object.keys(op.settings)) fields.add(key)
            written.set(op.id, fields)
          }
          yield { type: "op", op, label }
        }
        results.push({ id: call.id, output })
        /**
         * TWO WAYS A STEP CAN NOT HAVE HAPPENED, and neither is read off the
         * wording of a message written for a model.
         *
         * `execute` sets `failed` where it refused. And separately: a WRITE
         * that produced no operation changed nothing, whatever it said about
         * it — a tick against a call that moved nothing is the list lying
         * about the one thing it exists to report.
         */
        const changedNothing = !op && WRITE_TOOLS.has(call.name)
        yield {
          type: "step",
          id: call.id,
          label: stepLabel,
          state: refused || changedNothing ? "failed" : "done",
        }
      }
      /**
       * ASKED: the run is over. What it changed before asking stays, and the
       * question is the reply, as text for the transcript and for a client
       * that does not draw the `question` event.
       */
      if (asked) {
        status = "succeeded"
        message = questionText(asked)
        error = null
        break
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
   * =========================================================================
   *  RUNNING OUT OF ROOM IS NOT FAILING
   * =========================================================================
   * This is where "The edit did not finish." came from, and it was wrong every
   * time somebody saw it.
   *
   * The loop ends for three reasons that are not the model saying it is done:
   * the turn ceiling, the token budget, and an abort. In the first two the
   * page has usually ALREADY CHANGED — the operations were applied and
   * streamed to the browser as they happened, so the creator watched their
   * page get better and was then told the edit failed. Nothing had failed. The
   * model simply had not got round to writing its closing sentence.
   *
   * So: work done is a finished edit. What is missing is the sentence, and a
   * sentence can be written from the operations, which is what `done` is for.
   *
   * A run with NO operations is the only real failure, and it says what
   * happened rather than that something vague did not finish.
   */
  if (status !== "refused") {
    if (ops.length > 0) {
      // Work was done. Whatever stopped the loop, this edit happened.
      status = "succeeded"
      error = null
      if (!message) message = summarise(done)
    } else if (message) {
      // It answered without changing anything, which is a real outcome:
      // "your FAQ already covers that" is a useful reply, not a failure.
      status = "succeeded"
      error = null
    } else if (error === null || error === "The edit did not finish.") {
      /**
       * Nothing changed, nothing said, and no specific reason — either the
       * model replied with an empty string (`error` already cleared to null on
       * that path) or the loop simply ran out.
       *
       * An empty success is worse than a failure: it tells somebody their
       * change was made when it was not. And "did not finish" describes the
       * machinery rather than the situation, leaving them nothing to do about
       * it. Any OTHER error at this point is specific — cancelled, the token
       * budget, something the provider said — and is kept as it is.
       */
      status = "failed"
      error =
        "I could not work out a change to make for that. Say which section, or what you want it to look like."
    }
  }

  /**
   * DONE, with what changed: one sentence and the sections, by the names the
   * sidebar uses. Not after a question (the question is the ending) and not
   * after a failure (the error is).
   */
  if (status === "succeeded" && !asked && (ops.length > 0 || wroteCode)) {
    yield progress("done", PROGRESS_LABELS.done, {
      detail: firstSentence(message),
      sections: changedSections(state, input.state, touched, schemas),
    })
  }

  return { status, message, error, usage, ops, wroteCode, asked }
}

/** The tools that only read. A second identical read in a run is answered from the first. */
/**
 * WHAT THIS TYPE LOOKS LIKE FINISHED, said before its controls are listed.
 *
 * The preset was already handed over, but as a JSON dump trimmed to 2,000
 * characters — a rich preset's blocks are the first thing that trimming
 * takes, so the one number that says "this is how many entries a finished
 * one has" was the thing most likely to be missing. The review says it
 * afterwards (./review, thinFindings) and being told at the end to go back
 * and add three more entries is a worse run than being told at the start.
 *
 * Taken from the type's own first preset, so it cannot drift from what the
 * section actually ships with, and phrased as the standard rather than as a
 * limit: more entries than the preset is fine, fewer is a section that looks
 * unfinished.
 */
function finishedLooksLike(type: string, schemas?: SchemaMap): string {
  const schema = schemaOf(schemas, type)
  const blockTypes = schema?.blocks ?? []
  if (blockTypes.length === 0) return ""
  const expected = (schema?.presets?.[0]?.blocks ?? []).length
  if (expected < 2) return ""
  const names = blockTypes.map((b) => b.type).filter(Boolean).join(", ")
  return `FINISHED MEANS ${expected} ENTRIES. This section holds its content in blocks${names ? ` (${names})` : ""}, and its preset ships with ${expected}. That is what one looks like when it is done: ${expected} entries, each written properly about this store. Fewer reads as unfinished rather than concise, and add_section alone gives you the preset's demo copy, not content. More than ${expected} is fine when the creator has more to say.`
}

const READ_TOOLS = new Set(["read_section", "read_section_type", "read_section_code"])

/**
 * A request about the business, which the model would answer by reading the
 * store first: products, prices, selling, and copy about what they do.
 */
const STORE_WORDS = /\b(products?|price[sd]?|pricing|shop|store|catalog(ue)?|sell(s|ing)?|buy|checkout|cart|presets?|courses?|ebooks?|downloads?|offers?|collections?|headlines?|taglines?|copy|about (us|me)|what (i|we) (sell|do|make))\b/i

/** What a read or code call is about: its section id or its section type. */
function readTarget(argumentsJson: string): string {
  try {
    const args = JSON.parse(argumentsJson || "{}") as Record<string, unknown>
    const value = args.id ?? args.sectionType ?? args.sectionId ?? ""
    return typeof value === "string" ? value.trim() : ""
  } catch {
    return ""
  }
}

/** "the FAQ", "the theme": the thing a write is about, the way the sidebar names it. */
function targetName(name: string, argumentsJson: string, state: ThemeState, schemas?: SchemaMap): string {
  if (name === "update_theme") return "the theme"
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(argumentsJson || "{}") as Record<string, unknown>
  } catch {
    /* named generically below */
  }
  if (name === "add_section" && typeof args.sectionType === "string") return `the ${typeName(schemas, args.sectionType)}`
  const id = typeof args.sectionId === "string" ? args.sectionId : typeof args.id === "string" ? args.id : ""
  const section = state.sections.find((s) => s.id === id)
  if (!section) return "the page"
  return `the ${section.name?.trim() || typeName(schemas, section.type)}`
}

/** The sections a run changed, by name, first change first. */
function changedSections(after: ThemeState, before: ThemeState, touched: Set<string>, schemas?: SchemaMap): string[] {
  const names: string[] = []
  for (const id of touched) {
    const section = after.sections.find((s) => s.id === id) ?? before.sections.find((s) => s.id === id)
    if (!section) continue
    const name = section.name?.trim() || typeName(schemas, section.type)
    if (!names.includes(name)) names.push(name)
  }
  return names.slice(0, 8)
}

/** The run's own closing sentence, one sentence of it. */
function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, " ").trim()
  const end = t.search(/[.!?](\s|$)/)
  return (end >= 0 ? t.slice(0, end + 1) : t).slice(0, 240)
}

/**
 * The theme's settings as the model reads them: compact JSON of what is set,
 * without the indentation a pretty print spends a third of its tokens on,
 * and without values nobody set.
 */
function compactSettings(settings: Record<string, unknown>): string {
  const kept: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(settings)) {
    if (value === null || value === undefined || value === "") continue
    if (typeof value === "string" && value.length > 300) continue
    kept[key] = value
  }
  const text = JSON.stringify(kept)
  return text.length > 3_000 ? `${text.slice(0, 3_000)}…` : text
}

/**
 * One tool call. Returns what the model reads and, when the call changes the
 * page, the operation to apply.
 *
 * Errors are RESULTS, not exceptions: a bad id or an unknown field is
 * something the model can correct on its next turn, and throwing would end a
 * run over a typo.
 */
/**
 * Reading a section's source, and writing one back. Kept apart from `execute`
 * because these two are the only tools that touch anything outside this run,
 * and because a refusal here has to say WHY in a way the model can act on:
 * a file that did not compile comes back with the compiler's own words.
 */
/**
 * ===========================================================================
 *  THE QUALITY GATE ONLY BLOCKS WHAT THIS EDIT BROKE
 * ===========================================================================
 * Refusing a write because the file has a fixed id in it sounds right until
 * the file ALREADY had one: then somebody asking for a colour change is told
 * about an unrelated defect, forever, and their change never happens. The
 * checks are run against the source as it was and the source as it is being
 * written, and only what appeared in between is this edit's fault.
 *
 * AND IT GIVES UP BEFORE THE CREATOR DOES. Two refusals per section in a run;
 * the third write goes through with the finding reported rather than held. A
 * gate that cannot be satisfied is a gate that loses somebody's work.
 */
const QUALITY_REFUSALS = 2

/**
 * What a code tool says back: the text the model reads, whether it did what
 * it was asked, and for a write, the whole source that was saved (after the
 * edits, for edit_section_code), for the panel to show.
 */
interface CodeResult {
  ok: boolean
  output: string
  source?: string
}

async function runCodeTool(
  name: string,
  argumentsJson: string,
  code: NonNullable<ThemeAgentInput["code"]>,
  /** How many times each section's write has already been sent back. */
  refused: Map<string, number>,
): Promise<CodeResult> {
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(argumentsJson || "{}") as Record<string, unknown>
  } catch {
    return { ok: false, output: "The arguments were not JSON. Send sectionType, and for a write the edits or the whole source." }
  }
  const sectionType = typeof args.sectionType === "string" ? args.sectionType.trim() : ""
  if (!sectionType) return { ok: false, output: "Name the section type, e.g. \"faq_accordion\"." }

  if (name === "read_section_code") {
    const source = code.read(sectionType)
    if (source === null) {
      return {
        ok: false,
        output: `There is no source for "${sectionType}" in this theme. It is one of the sections built into the product, so it has no file to edit: do what you can with its settings and say plainly in your reply what the settings cannot do.`,
      }
    }
    return { ok: true, output: `The whole of sections/${sectionType}.storelib:\n\n${source}` }
  }

  /**
   * THE SAME GATE FOR BOTH WRITES. A patch is applied to the file as it
   * stands, and what that produces is then held to exactly what a whole file
   * is: the quality checks, the compiler, a draft save.
   */
  let source: string
  if (name === "edit_section_code") {
    const current = code.read(sectionType)
    if (current === null) {
      return { ok: false, output: `There is no source for "${sectionType}" in this theme to edit. Built-in sections cannot be changed: work with their settings.` }
    }
    const applied = applySourceEdits(current, args.edits)
    if (applied.ok === false) return { ok: false, output: `Nothing was saved. ${applied.error}` }
    source = applied.source
  } else {
    source = typeof args.source === "string" ? args.source : ""
    if (!source.trim()) return { ok: false, output: "Send the whole file in `source`, or use edit_section_code for a change to part of it." }
  }

  const seen = refused.get(sectionType) ?? 0
  if (seen < QUALITY_REFUSALS) {
    const before = code.read(sectionType)
    const had = new Set(before === null ? [] : qualityErrors(checkSectionQuality(before)).map((f) => f.id))
    const introduced = qualityErrors(checkSectionQuality(source)).filter((f) => !had.has(f.id))
    if (introduced.length) {
      refused.set(sectionType, seen + 1)
      return {
        ok: false,
        output: `That change was NOT saved. It compiles, but it would be wrong on a real page:\n${describeQuality(introduced)}\n\nFix those and send it again, keeping everything else exactly as it is.`,
      }
    }
  }

  const written = await code.write(sectionType, source)
  if (written.ok === true) {
    return {
      ok: true,
      source,
      output: `sections/${sectionType}.storelib was compiled and saved. It is live on the canvas. If the change was meant to be visible, say what you changed in one sentence when you finish.`,
    }
  }
  return {
    ok: false,
    output: `That change was refused and NOTHING was saved: ${written.error}\n\nRead the errors, fix them, and send it again. Do not give up on the request because of a compile error.`,
  }
}

function execute(
  name: string,
  argumentsJson: string,
  state: ThemeState,
  newId: (type: string) => string,
  /** When set, the only section any operation may touch. */
  locked?: string,
  /** Every type this install can see, theirs included. See ./schemas. */
  schemas?: SchemaMap,
  /**
   * `failed` is set by the paths that REFUSED, rather than inferred by the
   * caller reading this output. A step's tick used to be decided by matching
   * the first word of a sentence written for a model, which is a rule that
   * silently stops working the day somebody rewords the sentence — and then
   * every refused call shows a tick and the list quietly lies.
   */
): { output: string; op?: ThemeOp; failed?: true } {
  let args: Record<string, unknown>
  try {
    args = argumentsJson.trim() ? JSON.parse(argumentsJson) : {}
  } catch {
    return { output: "Your arguments were not valid JSON. Send them again as a JSON object.", failed: true }
  }

  const id = typeof args.id === "string" ? args.id : ""
  const found = state.sections.find((s) => s.id === id)

  /**
   * =========================================================================
   *  THE LOCK, ENFORCED HERE RATHER THAN ASKED FOR IN THE PROMPT
   * =========================================================================
   * A rule in the system prompt is a request. This is the check, and it is at
   * the one place every operation passes through, so there is no tool that can
   * be added later and quietly not be covered — a write either names the open
   * section or it does not happen.
   *
   * Reads are deliberately not listed: they change nothing, and a model that
   * may not look at the header cannot match the header.
   */
  if (locked) {
    const lockedSection = state.sections.find((s) => s.id === locked)
    const lockedName = lockedSection
      ? `${typeName(schemas, lockedSection.type)} [${locked}]`
      : `[${locked}]`

    const wholePage: Record<string, string> = {
      add_section: "adding a section",
      remove_section: "removing a section",
      move_section: "moving a section",
      update_theme: "changing the theme, which applies to every page",
      set_section_visibility: "hiding or showing a section",
    }
    if (wholePage[name]) {
      return {
        output: `${lockedName} is the only thing open, so ${wholePage[name]} is not available in this edit. Do what you can inside ${lockedName}, and tell the creator in your reply that ${wholePage[name]} needs the lock cleared first.`,
        failed: true,
      }
    }

    const target =
      typeof args.sectionId === "string" ? args.sectionId : name === "read_section" ? "" : id
    if (target && target !== locked) {
      return {
        output: `${lockedName} is the only section you may change in this edit. Nothing was changed. Use read_section if you need to look at another one.`,
        failed: true,
      }
    }
  }

  switch (name) {
    case "read_section": {
      if (!found) return { output: notFound(id, state), failed: true }
      return { output: describeSection(found, schemas) }
    }

    case "update_section": {
      if (!found) return { output: notFound(id, state), failed: true }
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
      const checked = checkSettings(fieldsFor(found.type, schemas), settings, found.type)
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
      const schema = schemaOf(schemas, wanted)
      if (!schema) {
        return { output: `There is no section type "${wanted}". The types are listed on add_section.`, failed: true }
      }
      const specimen = buildSection(`preview-${wanted}`, wanted, schemas)
      return {
        output: [
          `${wanted} — ${schema.name}${schema.description ? `: ${schema.description}` : ""}`,
          finishedLooksLike(wanted, schemas),
          `CONTROLS\n${describeFields(wanted, schemas)}`,
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
      if (!schemaOf(schemas, sectionType)) {
        return { output: `There is no section type "${sectionType}". Use one of the types listed on this tool.`, failed: true }
      }
      let settings = parseSettings(args.settingsJson) ?? undefined
      let notes: string[] = []
      if (settings && Object.keys(settings).length > 0) {
        const checked = checkSettings(fieldsFor(sectionType, schemas), settings, sectionType)
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
      const created = applyOp(state, op, schemas).sections.find((s) => s.id === fresh)
      return {
        output: [
          `Added ${sectionType} as [${fresh}].${notes.length > 0 ? ` (${notes.join("; ")})` : ""}`,
          created ? describeSection(created, schemas) : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        op,
      }
    }

    case "move_section": {
      if (!found) return { output: notFound(id, state), failed: true }
      if (found.type === "header" || found.type === "footer") {
        return { output: `The ${found.type} is fixed and cannot be moved. It is the same on every page.` }
      }
      const index = typeof args.index === "number" ? args.index : NaN
      if (!Number.isFinite(index)) return { output: "Send `index` as a number.", failed: true }
      return { output: `Moved [${id}] to position ${index}.`, op: { kind: "move_section", id, index } }
    }

    case "remove_section": {
      if (!found) return { output: notFound(id, state), failed: true }
      if (found.type === "header" || found.type === "footer") {
        return { output: `The ${found.type} cannot be removed. A page without one is not a page.` }
      }
      return { output: `Removed ${found.type} [${id}].`, op: { kind: "remove_section", id } }
    }

    case "set_section_visibility": {
      if (!found) return { output: notFound(id, state), failed: true }
      if (typeof args.hidden !== "boolean") {
        return { output: "Send `hidden` as true to hide the section or false to show it.", failed: true }
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
      if (!found) return { output: notFound(id, state), failed: true }
      const label = typeof args.name === "string" ? args.name.trim().slice(0, 60) : ""
      if (!label) return { output: "Send `name` as a short label.", failed: true }
      return { output: `Renamed [${id}] to "${label}".`, op: { kind: "rename_section", id, name: label } }
    }

    case "add_block": {
      const sectionId = typeof args.sectionId === "string" ? args.sectionId : ""
      const section = state.sections.find((s) => s.id === sectionId)
      if (!section) return { output: notFound(sectionId, state), failed: true }

      const blockType = typeof args.blockType === "string" ? args.blockType : ""
      const specs = blockSpecs(section.type, schemas)
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
      const cap = maxBlocks(section.type, schemas)
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
        blockFieldsFor(section.type, blockType, schemas),
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
      if (!section) return { output: notFound(sectionId, state), failed: true }

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
        blockFieldsFor(section.type, block.type, schemas),
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
      if (!section) return { output: notFound(sectionId, state), failed: true }
      const blockId = typeof args.blockId === "string" ? args.blockId : ""
      if (!(section.blocks ?? []).some((b) => b.id === blockId)) {
        return { output: `${section.type} has no block "${blockId}".` }
      }
      const index = typeof args.index === "number" ? args.index : NaN
      if (!Number.isFinite(index)) return { output: "Send `index` as a number.", failed: true }
      return {
        output: `Moved block [${blockId}] to position ${index}.`,
        op: { kind: "move_block", sectionId, blockId, index },
      }
    }

    case "remove_block": {
      const sectionId = typeof args.sectionId === "string" ? args.sectionId : ""
      const section = state.sections.find((s) => s.id === sectionId)
      if (!section) return { output: notFound(sectionId, state), failed: true }
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
      return { output: `There is no tool called ${name}.`, failed: true }
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
