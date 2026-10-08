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
  fieldIds,
  fieldsFor,
  maxBlocks,
  themeFieldsFor,
  type StoreFacts,
  type ThemeOp,
  type ThemeState,
} from "./operations"
import { describeHouseStyle, readHouseStyle } from "./house-style"
import { blockAt, countAll, resolvePath } from "../block-tree"
import { addableBlocks, themeBlockCatalog } from "../storelib-schemas"
import { LIMITS, MAX_BLOCK_DEPTH } from "@/lib/storelib-theme/types"
import { describeFindings, reviewSections } from "./review"
import { nameOf as typeName, schemaMapFor, schemaOf, type SchemaMap } from "./schemas"
import { ASK_TOOL, questionText, readAsk } from "./ask"
import { applySourceEdits } from "./code-edits"
import { describeRecent, lastQuestion, type RecentMessage } from "./memory"
import { PROGRESS_LABELS, ProgressTrail, progress, savingLabel, writingLabel, type ProgressEvent } from "./progress"
import { describeQuality, pageAgentRules } from "@/lib/storelib-ai"
import { builderAgentRules } from "@/lib/agent-rules"
import { pageAgentReference } from "@/lib/storelib-ai/reference"
import { sectionAdvice } from "@/lib/storelib-ai/integration"
import { skillContext } from "@/lib/agent-skills"
import type { AgentQuestion } from "@/lib/sites/agent/questions"
import { failureKind, plainRunError } from "@/lib/sites/agent/plain-errors"
import { COMPILE_CHECK_LABEL, fileLabel, toolStepLabel, type StepNames } from "./step-labels"
import { MAX_CODE_ATTEMPTS, checkSectionSource, outOfAttempts } from "./compile-feedback"
import { describeSelectedCode, resolveSelectedSection, SECTION_TYPE, type SectionOrigin, type SelectedSectionContext } from "./selected-section"
import { makeCodedCopy } from "./coded-copy"
import { kindOfSource } from "@/lib/storelib-theme/section-groups"
import { CREATIVE_BRIEF, IMAGE_FIDELITY_RULES, editingSubject, newSectionSubject } from "./creative-section"
import { MENU_TOOLS, describeMenus, editMenu } from "./menu-edits"
import { intentGuidance, type Intent } from "./intent"
import { PLANNER_SYSTEM, describeCreativePlan, extractJson, planForCreator, planTurn, readCreativePlan, archetypesFor, type CreativePlan } from "./creative-plan"
import { BRIEF_KEY, briefOp, describeProject, readBrief, updateBrief } from "./project-state"
import { THEME_FINDING, checkProject } from "./project-check"
import { SET_COLOR_SCHEME_TOOL, setColorScheme } from "./scheme-edit"
import { DESIGN_DEFAULTS, describePatterns, patternById } from "@/lib/storelib-ai/patterns"
import { archetypeById, describeArchetype } from "@/lib/storelib-ai/archetypes"
import { knowledgeBlock, topicsById } from "@/lib/storelib-ai/knowledge"
import { OFFERED_FAMILIES } from "../font-link"
import type {
  AgentProvider,
  AgentTurn,
  ProviderRequest,
  ProviderTurn,
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
 *
 * Twenty-four now: accuracy over speed. A run reads, plans, writes, checks
 * the render, reads its work back against the request (and the picture) and
 * refines once before it finishes (SELF_CHECK below), and that last pass
 * needs room left to happen in.
 */
export const MAX_TURNS = 24

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
  /**
   * WHAT THE RUN IS ABOUT, in two or three words: "Editing Pricing", or
   * "New section: Testimonials". Said once it is known and again if it
   * changes; the chat keeps it over the steps and the canvas labels the
   * section it is working on with it.
   */
  | { type: "subject"; text: string }
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
  | {
      type: "step"
      id: string
      label: string
      state: "running" | "done" | "failed"
      /**
       * The sections on the page this step is working on, by id: the one it
       * reads or changes, or every instance of a type whose code it writes.
       * The canvas lays its shimmer over these while the run is at work.
       */
      sections?: string[]
    }
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
  | {
      type: "question"
      id: string
      question: string
      why?: string
      options: string[]
      /** The picture setting it asks for, checked against the page: its answers "Upload image" and "Paste image URL" act on it. */
      target?: AgentQuestion["target"]
    }

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
  /** What kind of request it was read as (./intent.ts), when the caller classified it. */
  intent?: Intent | null
  /** The creative plan it built to, when it made one (./creative-plan.ts). */
  plan?: CreativePlan | null
  /** Checks still failing when the run ended (review, project check, visual), for the log and the reply. */
  unresolved?: string[]
  /** What the browser check found, and whether it ran. */
  visual?: { ran: number; findings: number; ms: number }
}

/** A finding from the browser check (./visual-check.ts), as the loop needs it. Kept here so the loop never imports a server-only module. */
export interface VisualCheckReport {
  findings: { sectionId: string; width: number; kind: string; message: string }[]
  shots: AgentImage[]
  ms: number
}

/** One line of the run's structured log: what happened, never what the model thought. */
export type TraceEntry = { at: number; kind: string } & Record<string, unknown>

const SYSTEM_PROMPT = `You edit a website in a visual theme editor. The page is a list of SECTIONS, each with settings defined by a schema, and each KIND of section is a file you can read and rewrite: its markup, its CSS, its script and that schema. You change the page by calling tools.

Rules:
- Address a section by the id shown in square brackets. Never invent an id.
- read_section before you change one. You are shown the page's structure, not every setting, so writing a field you have not read is guessing.
- update_section MERGES the settings you send. Send only the fields you are changing; everything you leave out keeps its value.
- EVERY SETTING IS A CONTROL, and the control decides what it will take. A select takes one of its listed choices and nothing else. A toggle takes true or false. A slider takes a number inside its range. A colour takes a hex value like "#1a1a1a". A field id that does not exist, and a value the control cannot take, are BOTH silently ignored by the renderer — the change would look like it worked and do nothing. read_section lists every control on a section and what each one accepts; read_section_type does the same for a type you have not added yet.
- The header and footer cannot be moved, removed, or inserted around. They are the same on every page.
- HEADER AND FOOTER ARE DESIGNED FREELY. Layout, icons, buttons, type, motion and logo size are the section's own. "Make my header like this" means design it: update the one on the page, or write sections/<name>.storelib with "kind": "header" or "kind": "footer" when they want one of their own. It replaces the built-in one. Do not copy the built-in header's setting list. sections/header.storelib and sections/footer.storelib are reserved names. What stays live: the menu from a link_list (default "main-menu"), looped with link.links for sub links; the logo from theme.logo.url or an image_picker, size and colour as settings; cart, search and the menu drawer through data-storelib-cart, data-storelib-cart-count, data-storelib-search and data-storelib-menu; account through routes.account_url. A buy button uses checkout_url. Products and prices come from products. One kind per theme.
- LINKS IN A MENU ARE THE SITE'S MENU (Website settings, Navigation), as in Shopify. "Add a Pricing link", "rename Shop to Store", "move About", "take Blog out" mean read_menus, then edit_menu on the menu that header or footer shows (usually "main-menu"), one link per call. A header you write reads that menu with link_list. Do not type link_1_label pairs. Link a page by its path ("/pages/pricing").
- PREFER HIDING TO DELETING. "Take this off for now", "hide it until launch", "I don't want this here yet" all mean set_section_visibility, not remove_section. A hidden section keeps its settings and its content and comes back in one call; a removed one is gone, and whoever wrote that content wrote it once. Remove only when somebody clearly wants it gone for good.
- WHEN A SECTION IS SELECTED, act on it. "Make this section better" means that section, and it is not a question — look at what it is, decide what is weak about it, and change it. A FAQ with five thin questions gets better questions and better answers; a hero with a generic headline gets a specific one; a pricing table with unnamed tiers gets named tiers.
- THE SELECTED SECTION IS EDITED IN PLACE: its settings, blocks or own code, never a new section beside it. A built in one whose change needs code: ask once, then copy_section_to_code and edit the copy.
- MOST SECTIONS KEEP THEIR CONTENT IN BLOCKS, not in settings. A FAQ's questions, a pricing table's tiers, a testimonial's quotes, a gallery's images are all blocks. Changing a section's settings alone will not touch any of them, so if a request is about content, use the block tools. read_section lists the block types a section takes and the blocks it currently has. Some sections take theme blocks (heading, text, button, image, video, spacer, group): a group holds blocks of its own, so to build a row, add a group and then add blocks inside it with parentBlockId. A block inside another is addressed by its path, outer/inner. A block marked static is placed by the template: change it, never remove it.
- NOT EVERY MESSAGE IS AN EDIT. A greeting or a question ("what can you do?", "why is my header dark?") gets an answer, not a guess: make no changes and reply in one to three plain sentences. Never apologise at length and never describe your tools.
- ASK ONLY WHAT YOU CANNOT READ. When a missing fact would change what you build (which of several products, which page, brand colours the site does not have, a business fact that is nowhere on the page or in the store) call ask_creator with one short question and two to four choices taken from what you read. The run stops there; their answer is their next message, with this conversation shown above it. Never ask what the page, the theme, the store or the conversation already answers, and never about taste you can decide. If two honest readings would build different things, ask before any change; if one is clearly likelier, act on it.
- PLAN, THEN DO. For more than a couple of operations, your FIRST turn's text is the plan, sent with the first tool calls: two to five short lines, in order. The chat shows it. Then finish every line. A one operation change gets no plan.
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
- THE SOURCE IS REACHED WITH TOOLS, LIKE ANYTHING ELSE HERE. When the change is not something a control covers: read_section_code on that section's type, then change the markup, the CSS, the script or the schema with edit_section_code, exact find and replace for only the lines that change. Use write_section_code with the whole file only for a new layout. A refused write did not happen; the compiler says what is wrong, so fix that and write again rather than reporting a change you did not save. Never edit a file you have not read this run; keep its setting ids, block types, color_scheme and container queries, and give anything new a setting.
- READ ONCE. What you read in this run stays true until you change it; a second read of something unchanged is answered with a note, not the content again. Make related changes in the same turn.
- When you are done, reply with one plain sentence saying what you changed and in which sections. No preamble, no markdown, no lists.

${CREATIVE_BRIEF}

${IMAGE_FIDELITY_RULES}

${pageAgentRules()}

${builderAgentRules()}

${pageAgentReference()}`

function toolSpecs(addable: string[], schemas?: SchemaMap, code?: boolean, opts: { memory?: boolean } = {}): ToolSpec<string>[] {
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
              'A JSON OBJECT AS A STRING: field id → new value, only the fields you are changing. e.g. {"heading":"Questions, answered","style":"boxed"}. null clears a setting the section holds that its schema no longer declares.',
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
        "Add a block to a section — one FAQ question, one pricing tier, one testimonial, one gallery image, or a theme block (heading, text, image, button, video, group) in a section that accepts them. THIS IS WHERE THE CONTENT LIVES for most sections: half the library keeps its real content in blocks, and changing a section's settings alone will not touch it. A group holds blocks too: pass its path as parentBlockId to add inside it. Call read_section first to see which block types it takes.",
      parameters: {
        type: "object",
        properties: {
          sectionId: { type: "string", description: "The section to add it to." },
          parentBlockId: { type: "string", description: 'The block to add it inside, by its [path] from read_section. "" for the section itself.' },
          blockType: { type: "string", description: "A block type that section (or that parent block) accepts." },
          index: { type: "number", description: "Position among the blocks. -1 for the end." },
          settingsJson: {
            type: "string",
            description:
              'A JSON OBJECT AS A STRING: block field id → value. e.g. {"question":"Do you ship worldwide?","answer":"<p>Yes.</p>"}',
          },
        },
        required: ["sectionId", "parentBlockId", "blockType", "index", "settingsJson"],
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
          blockId: { type: "string", description: "The block's [path] from read_section (its id, for a block not inside another)." },
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
              "Read the SOURCE of a kind of section: its markup, its CSS, its script and its schema. Use this the moment a request is about something no setting covers: an animation, a transition, hover behaviour, spacing between two particular things, how a part behaves on a phone. Storelib's built in sections can be read and not written: see copy_section_to_code.",
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
            name: "copy_section_to_code",
            description:
              "Give ONE section on the page an editable copy of Storelib's built in code: the same file under a new type and name in the creator's theme, and that section switched to it with every setting and block it had. Only after the creator agreed to it (ask_creator), and only for a built in section whose change truly needs code. Then edit the copy with edit_section_code. Never the header or the footer.",
            parameters: {
              type: "object" as const,
              properties: {
                id: { type: "string", description: "The section's id, from the page listing." },
              },
              required: ["id"],
              additionalProperties: false,
            },
          },
          {
            name: "create_section",
            description:
              "Write a NEW section of your own and put it on the page: a whole sections/<type>.storelib file (template, style, optional script, schema with presets) under a new lowercase type. Use it for what no built-in type draws well: an immersive hero, a marquee, an event poster with a countdown, a lineup, a schedule, a before and after slider, a header of your own (\"kind\": \"header\"). It is compiled, checked and drawn with its preset before it is kept; a refusal says what to fix. Give it real settings a creator would change (colour scheme, layout, spacing, the words, the pictures as image_picker) and a preset that arrives finished. Read one close built-in section first (read_section_code) and keep its setting ids for the same jobs.",
            parameters: {
              type: "object" as const,
              properties: {
                sectionType: { type: "string", description: "The new type: lowercase letters, digits and underscores, not a type that exists, e.g. \"bandidos_hero\"." },
                source: { type: "string", description: "The whole file." },
                index: { type: "number", description: "Where on the page, as add_section takes it. -1 for the end, above the footer." },
                settingsJson: { type: "string", description: 'A JSON OBJECT AS A STRING merged over its preset, e.g. {"heading":"Bandidos"}. "{}" for none.' },
              },
              required: ["sectionType", "source", "index", "settingsJson"],
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
    SET_COLOR_SCHEME_TOOL as unknown as ToolSpec<string>,
    {
      name: "read_design_patterns",
      description:
        "Read Storelib's design knowledge: a pattern (hero_immersive, marquee, event_spotlight, schedule, gallery, team, tickets, pricing, testimonials, before_after, stats, venue, menu, cta_final and more) with the built-in types that draw it and how to write it yourself; a kind of site (nightlife, course, photographer, luxury_fashion, ecommerce, creator, coach, restaurant, saas, digital_products, music, community) with its usual structure, type, palette, imagery and motion; or \"defaults\" for spacing, type, rhythm and motion defaults. \"\" lists every pattern.",
      parameters: {
        type: "object",
        properties: { topic: { type: "string", description: "A pattern id, a kind of site, \"defaults\", or \"\"." } },
        required: ["topic"],
        additionalProperties: false,
      },
    },
    {
      name: "read_storelib_docs",
      description:
        "Read the Storelib section format on one subject before writing code that depends on it: blocks, theme blocks, colour schemes, theme globals, typography, CSS scoping, responsive layout, scripts, forms, embeds, animation, assets, editor state, settings, multiple instances, accessibility. Say the subject in a few words.",
      parameters: {
        type: "object",
        properties: { topic: { type: "string", description: 'e.g. "animation", "script and countdown", "colour scheme"' } },
        required: ["topic"],
        additionalProperties: false,
      },
    },
    ...(opts.memory
      ? [
          {
            name: "remember",
            description:
              "Keep one decision or preference about this website for later messages: something the creator said they want or do not want (\"no gradients\", \"prices in euros\", \"the events part is the main thing\"). Not for what you changed; that is kept anyway.",
            parameters: {
              type: "object" as const,
              properties: { note: { type: "string", description: "One short sentence." } },
              required: ["note"],
              additionalProperties: false,
            },
          },
        ]
      : []),
    /* The site's navigation: the Main menu the header shows (./menu-edits). */
    ...MENU_TOOLS,
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

/* What a tool call is, in the creator's words, is ./step-labels.ts. */

/**
 * The tools that exist to CHANGE the page. One of these that comes back with
 * no operation did not do what it set out to do, whatever its message says.
 */
const WRITE_TOOLS = new Set([
  "set_color_scheme",
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
    case "set_section_type":
      return `Made ${nameOf(op.id)} editable`
    case "update_theme":
      return "color_schemes" in op.settings ? "Changed the colours" : BRIEF_KEY in op.settings ? "Kept notes on this website" : "Updated the theme"
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
    /** The section type's source: the creator's own file, or Storelib's shipped one (read only). */
    read(sectionType: string): string | null
    /** Whose code a type is: see ./selected-section. Absent: only the creator's own files exist here. */
    origin?(sectionType: string): SectionOrigin
    /**
     * Keeps a source the loop has already checked (./compile-feedback). The
     * route stages it for the end of the run (./code-journal) and refuses
     * anything an agent may not write. `create` is a coded copy, the only
     * write that may name a file that does not exist yet.
     */
    write(sectionType: string, source: string, opts?: { create?: boolean }): Promise<{ ok: true } | { ok: false; error: string }>
  }
  /**
   * The open section as the server resolved it (./selected-section): its
   * type, its file and whose code that is. Absent, it is resolved here from
   * `selectedSectionId` and the page.
   */
  selected?: SelectedSectionContext | null
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
  /**
   * THE CREATOR CHOSE "CODE A SECTION" WITH A SECTION OPEN: the change is to
   * that section's code. Its own file is edited; a built in one is copied to
   * an editable file first without asking, because choosing Code a section
   * is the agreement copy_section_to_code otherwise asks for.
   */
  codeFocus?: boolean
  /**
   * READ ITS WORK BACK ONCE BEFORE IT FINISHES (SELF_CHECK). On for anything
   * built, coded or made from a picture; a one word change does not pay for
   * the extra turn. "auto" decides from the request and what the run did
   * (the route's choice); absent is off, so a caller that scripts a run's
   * turns gets exactly those turns.
   */
  selfCheck?: boolean | "auto"
  /** Ids for new sections. Injected so a test gets stable ones. */
  newId?: (type: string) => string
  /**
   * WHAT KIND OF REQUEST THIS IS (./intent.ts), classified by the caller
   * before the run. With it the run is told what that kind permits, and the
   * project check judges a redesign as a redesign. Absent: the run is the run
   * it always was.
   */
  intent?: Intent | null
  /** Make a creative plan first when the intent calls for one (./creative-plan.ts). One extra call with no tools. */
  plan?: boolean
  /** Read and keep the project's memory in the theme settings (./project-state.ts). */
  memory?: boolean
  /** Hold the finished page to the whole-project check before finishing (./project-check.ts). */
  projectCheck?: boolean
  /**
   * Draw the page in a browser and measure it (./visual-check.ts), injected
   * because that needs Chromium and this loop runs in tests without one.
   * Returns null when it could not check, which is never read as clean.
   */
  visualCheck?: (state: ThemeState, sources: Record<string, string>, opts: { shots: boolean }) => Promise<VisualCheckReport | null>
  /** Structured log of the run, for developers: tool calls, findings, repairs, the plan. */
  trace?: (entry: TraceEntry) => void
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
   *
   * `let`: a code write can change a schema (a new setting, a copy under a
   * new type), and every check after it has to read the new one.
   */
  let schemas = schemaMapFor(input.sources)
  /** This install's files as this run has them: what it wrote replaces what it read. */
  const sourcesNow: Record<string, string> = { ...(input.sources ?? {}) }

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
  /** Per section type, how many writes the compiler (or a failed draw) refused: see MAX_CODE_ATTEMPTS. */
  const codeFailures = new Map<string, number>()
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
  /**
   * WHERE ITS CODE LIVES, AND WHOSE IT IS (./selected-section): the
   * creator's own file, Storelib's shipped one, or none at all. What lets
   * "make the cards slide in" on a selected section edit that section's
   * file rather than add a new section beside it.
   */
  const originOf = (type: string): SectionOrigin =>
    input.code?.origin ? input.code.origin(type) : input.code?.read(type) != null ? "own" : "product"
  const selectedContext: SelectedSectionContext | null =
    input.selected !== undefined ? input.selected : resolveSelectedSection(state.sections, input.selectedSectionId, originOf)

  const history = input.history ?? []

  /**
   * WHAT KIND OF REQUEST, AND WHAT THE SITE ALREADY DECIDED. Both are the
   * caller's to switch on (./intent.ts, ./project-state.ts); a caller that
   * passes neither gets the run it always got.
   */
  const intent = input.intent ?? null
  const bigIntent = !!intent && (intent.kind === "FULL_SITE_REDESIGN" || intent.kind === "NEW_SITE_GENERATION" || intent.kind === "PAGE_REDESIGN")
  const brief = input.memory ? readBrief(input.state.settings) : null
  /** Decisions the model asked to keep (the remember tool). */
  const notes: string[] = []
  const t0 = Date.now()
  const trace = (kind: string, data: Record<string, unknown> = {}) => {
    try {
      input.trace?.({ at: Date.now() - t0, kind, ...data })
    } catch {
      /* the log never stops a run */
    }
  }
  if (intent) trace("intent", { kind: intent.kind, also: intent.also, scope: intent.scope, reasons: intent.reasons })
  /** Section types whose code this run wrote or created: the project check holds their instances to the new schema. */
  const rewrittenTypes = new Set<string>()
  /** The browser check: how many times it ran, what it found, how long it took. */
  const visual = { ran: 0, findings: 0, ms: 0 }
  /** Findings still standing when the review budget ran out, said in the reply rather than hidden. */
  let unresolved: string[] = []

  /**
   * WHAT THE RUN IS ABOUT, said plainly: "Editing Pricing" from the start
   * when the open section is the only thing it may change (or the change is
   * to its code), else from the first section it writes to (`about`, below).
   */
  let subject = ""
  const about = (text: string): ThemeAgentEvent | null => {
    if (!text || text === subject) return null
    subject = text
    return { type: "subject", text }
  }
  if (selected && (locked || input.codeFocus)) {
    const said = about(editingSubject(selected.name?.trim() || typeName(schemas, selected.type)))
    if (said) yield said
  }

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

  /** The opening turn is the plan; everything after it is commentary. */
  let plannedYet = false

  /**
   * =========================================================================
   *  THE CREATIVE PLAN, BEFORE ANY TOOL (./creative-plan.ts)
   * =========================================================================
   * Only for a new site, a new direction or a page rethought. One call, no
   * tools, its own instructions: the brief, the page, the store and the
   * knowledge for this kind of business go in; a checked plan comes out. A
   * plan that cannot be read is asked for once more, then the run goes on
   * without one, told the archetype instead, and the project check still
   * refuses the old page recoloured.
   */
  let plan: CreativePlan | null = null
  if (input.plan && intent?.plan && !signal?.aborted) {
    yield progress("planning", "Planning the site")
    const memoryText = brief ? describeProject(state, brief, schemas) : ""
    const planContext = {
      prompt,
      intent,
      state,
      page,
      schemas,
      addable,
      store: store ? `STORE\n${describeStore(store)}` : "",
      memory: memoryText,
      recent: describeRecent(history),
    }
    const planTurns: AgentTurn[] = [{ role: "user", content: planTurn(planContext), images: images.length ? images : undefined }]
    for (let tryNo = 0; tryNo < 2 && !plan; tryNo++) {
      try {
        const answer = await completeOnce(provider, {
          model,
          system: PLANNER_SYSTEM,
          turns: [...planTurns],
          tools: [],
          maxOutputTokens: 8_000,
          cacheKey: input.cacheKey,
          effort: input.effort,
          signal,
        })
        usage = addUsage(usage, answer.usage)
        plan = readCreativePlan(extractJson(answer.text), { state, schemas, addable, prompt })
        if (!plan) {
          planTurns.push({ role: "assistant", content: answer.text, toolCalls: [], raw: answer.raw })
          planTurns.push({ role: "user", content: "That was not the JSON object asked for. Answer with the one JSON object only, in the shape given." })
        }
      } catch (thrown) {
        if (thrown instanceof Error && thrown.name === "AbortError") throw thrown
        trace("plan-failed", { error: plainRunError(thrown, "theme agent planner", "planner failed") })
        break
      }
    }
    trace(plan ? "plan" : "plan-missing", plan ? { archetype: plan.archetype, sections: plan.sections.map((s) => s.use), remove: plan.remove, corrections: plan.corrections } : {})
    if (plan) {
      plannedYet = true
      yield { type: "plan", text: planForCreator(plan, schemas) }
    }
  }
  /* Without a plan, a big request still gets the knowledge for its kind of business. */
  const fallbackKnowledge =
    bigIntent && !plan
      ? [
          archetypesFor(prompt, store ? describeStore(store) : "", brief ? JSON.stringify(brief) : "")
            .map(describeArchetype)
            .join("\n\n"),
          DESIGN_DEFAULTS,
        ]
          .filter(Boolean)
          .join("\n\n")
      : ""

  const turns: AgentTurn[] = [
    {
      role: "user",
      content: [
        describeTheme(state, page, schemas),
        /* What the page cannot say: the business, the direction, what each section is for. */
        brief ? describeProject(state, brief, schemas) : "",
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
          ? `THE CREATOR HAS THIS SECTION OPEN AND LOCKED. It is the ONLY thing you may change: its settings, its blocks, its name, its code. You may READ anything else on the page to match it, but every write to another section, and every change to the theme, will be refused. If what they asked for genuinely needs more than this section, do what you can here and say plainly what the rest would take.\n\n${describeSection(selected, schemas)}${selectedContext ? `\n\n${describeSelectedCode(selectedContext)}` : ""}`
          : selected
            ? `THE CREATOR HAS THIS SECTION SELECTED AND OPEN. "this section", "this", "it" and "here" all mean THIS one unless they clearly name another. A change they ask for is a change to THIS section, not a new section.\n\n${describeSection(selected, schemas)}${selectedContext ? `\n\n${describeSelectedCode(selectedContext)}` : ""}`
            : "",
        selected && input.codeFocus
          ? "THE CREATOR CHOSE CODE A SECTION. Make this change in this section's CODE: read_section_code on its type, then edit_section_code (write_section_code only for a new layout). If it is Storelib's built in section, call copy_section_to_code on it first WITHOUT asking: choosing Code a section is their agreement. Keep every setting id and block it has, and give anything new a setting."
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
        fallbackKnowledge,
        /* Right beside the request: what kind of request it is, and the plan it is built to. */
        intent ? intentGuidance(intent) : "",
        plan ? describeCreativePlan(plan, state, schemas) : "",
        `REQUEST\n${prompt}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      images: images.length ? images : undefined,
    },
  ]

  /** SELF_CHECK has been asked for, once, and the step that says so while the model answers it. */
  let selfChecked = false
  let checkingStep: { id: string; label: string } | null = null

  try {
    for (let attempt = 1; attempt <= maxTurns; attempt++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError")

      if (usage.inputTokens + usage.outputTokens > MAX_TOKENS) {
        error = "This edit reached its token budget."
        break
      }

      if (attempt === 1) yield progress("planning", PROGRESS_LABELS.planning)

      const turn = await completeOnce(provider, {
        model,
        system: SYSTEM_PROMPT,
        turns: [...turns],
        tools: toolSpecs(addable, schemas, !!input.code, { memory: !!input.memory }),
        /* A filled section is a lot of copy in one turn; cut off, it arrives half written. See `ambitious`. A new section file is more. */
        maxOutputTokens: bigIntent ? 24_000 : input.ambitious ? 16_000 : 8_000,
        cacheKey: input.cacheKey,
        effort: input.effort,
        signal,
      })

      // Accumulated FIRST: a turn that then throws still cost money.
      usage = addUsage(usage, turn.usage)
      trace("turn", { n: attempt, tools: turn.toolCalls.map((c) => c.name), input: turn.usage.inputTokens, output: turn.usage.outputTokens })
      /* The self check was answered: its step is over, and whatever it fixes is its own steps. */
      if (checkingStep) {
        yield { type: "step", id: checkingStep.id, label: checkingStep.label, state: "done" }
        checkingStep = null
      }

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
        const reviewing = (ops.length > 0 || (!!input.projectCheck && wroteCode)) && reviews < maxReviews
        if (reviewing) {
          const checking = trail.next(progress("checking", input.projectCheck ? "Validating the theme" : PROGRESS_LABELS.checking))
          if (checking) yield checking
        }
        const findings = reviewing
          ? [
              ...reviewSections({
                state,
                schemas,
                touched: [...touched],
                added: [...added],
                filled: [...filled],
                written: Object.fromEntries([...written].map(([id, set]) => [id, [...set]])),
                writtenBlocks: Object.fromEntries([...blockWrites].map(([id, set]) => [id, [...set]])),
              }),
              /* The page as it will be saved, whole: settings the schemas still declare, schemes and fonts that exist, the plan built. */
              ...(input.projectCheck
                ? checkProject({ before: input.state, after: state, schemas, rewrittenTypes, touched, added, intent, plan })
                : []),
            ]
          : []

        if (findings.length > 0) {
          reviews++
          unresolved = findings.map((f) => f.message)
          trace("findings", { round: reviews, findings: findings.map((f) => `${f.sectionId}: ${f.message}`.slice(0, 240)) })
          yield {
            type: "thinking",
            text:
              findings.length === 1
                ? "Checking the change: one thing to fix."
                : `Checking the changes: ${findings.length} things to fix.`,
          }
          yield progress("checking", "Fixing an issue")
          turns.push({ role: "user", content: describeFindings(findings, state) })
          continue
        }
        if (reviewing) unresolved = []

        /**
         * =====================================================================
         *  AND IT LOOKS AT THE PAGE, IN A BROWSER, AT TWO WIDTHS
         * =====================================================================
         * The checks above read values. This one draws the page and measures
         * it (./visual-check.ts): sideways scroll, collapsed sections, clipped
         * and overlapping text, empty bands. For a build, the photographs go
         * with it so the model judges the design too. Twice at most: once
         * after the work, once after the fixes.
         */
        const wantsVisual =
          !!input.visualCheck &&
          visual.ran < 2 &&
          (ops.length > 0 || wroteCode) &&
          attempt < maxTurns - 1 &&
          !signal?.aborted &&
          (bigIntent || wroteCode || added.size > 0 || ops.length >= 4 || intent?.kind === "SECTION_REDESIGN")
        if (wantsVisual) {
          const shots = visual.ran === 0 && (bigIntent || intent?.kind === "SECTION_REDESIGN" || wroteCode)
          yield progress("checking", "Checking mobile layout")
          const report = await input.visualCheck!(state, sourcesNow, { shots }).catch(() => null)
          visual.ran++
          if (report) {
            visual.ms += report.ms
            visual.findings += report.findings.length
            trace("visual", { round: visual.ran, findings: report.findings.map((f) => `${f.sectionId}@${f.width}: ${f.kind} ${f.message}`.slice(0, 200)), ms: report.ms, shots: report.shots.length })
            const nameOfSection = (id: string) => {
              const found = state.sections.find((x) => x.id === id)
              return found ? `${found.name?.trim() || typeName(schemas, found.type)} [${id}]` : `[${id}]`
            }
            const lines = report.findings.slice(0, 14).map((f) => `- ${nameOfSection(f.sectionId)}${f.width ? ` at ${f.width}px` : ""}: ${f.message}`)
            if (lines.length || report.shots.length) {
              if (report.shots.length) selfChecked = true
              turns.push({
                role: "user",
                content: [
                  lines.length ? `YOUR PAGE, DRAWN IN A BROWSER AT 1440 AND 390 WIDE. These are wrong and must be fixed:\n${lines.join("\n")}` : "YOUR PAGE, DRAWN IN A BROWSER AT 1440 AND 390 WIDE. The measurements found nothing broken.",
                  report.shots.length
                    ? `The two pictures attached are the page at a laptop's width and a phone's. Look at them as the designer who will put their name on this: hierarchy, rhythm down the page, spacing, whether every section looks finished, whether the phone layout is designed, whether it looks like ${plan?.brand.name || "this business"} and not like any site.${intent ? " And against the request: every part asked for is there." : ""} Fix what is weak with the tools. If it is genuinely good, reply with your one closing sentence.`
                    : "Fix them with the tools, then reply with your one closing sentence.",
                ].join("\n\n"),
                images: report.shots.length ? report.shots : undefined,
              })
              continue
            }
          } else {
            trace("visual-skipped", {})
          }
        }

        /**
         * =====================================================================
         *  AND IT READS ITS WORK BACK AGAINST WHAT WAS ASKED, ONCE
         * =====================================================================
         * The review above catches what is objectively broken. This catches
         * what is missing: the flag nobody drew, the third plan that never
         * got its features, the part of the picture left out. Once a run,
         * with room left for it to fix what it finds.
         */
        const wantsCheck =
          input.selfCheck === "auto"
            ? images.length > 0 || !!input.ambitious || wroteCode || !!input.codeFocus || ops.length >= 3
            : input.selfCheck === true
        if (!selfChecked && wantsCheck && (ops.length > 0 || wroteCode) && attempt < maxTurns - 1 && !signal?.aborted) {
          selfChecked = true
          checkingStep = { id: "self-check", label: images.length ? "Comparing it with your picture" : "Checking every part you asked for" }
          yield { type: "step", id: checkingStep.id, label: checkingStep.label, state: "running" }
          turns.push({ role: "user", content: selfCheckNote(images.length > 0) })
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
        const stepNames: StepNames = {
          section: (id) => {
            const found = state.sections.find((s) => s.id === id)
            return found ? found.name?.trim() || typeName(schemas, found.type) : null
          },
          type: (type) => typeName(schemas, type),
        }
        const codeTypeArg = readTarget(call.argumentsJson)
        const stepLabel = toolStepLabel(call.name, call.argumentsJson, stepNames, {
          attempt: call.name === "write_section_code" || call.name === "edit_section_code" ? codeFailures.get(codeTypeArg) ?? 0 : 0,
        })
        /* What the canvas shimmers while this step runs: see `sections` on the step event. */
        const stepSections = stepTargets(call.name, call.argumentsJson, state)
        const on = stepSections.length ? { sections: stepSections } : {}
        /* "Editing Pricing", "New section: Testimonials": said as the run moves to it. Locked, it never moves. */
        if (!locked) {
          const said = about(subjectFor(call.name, call.argumentsJson, state, schemas))
          if (said) yield said
        }
        yield { type: "step", id: call.id, label: stepLabel, state: "running", ...on }

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
          /* A picture it asks for is checked against the page, so "Upload image" puts it somewhere real. */
          if (asked.target) {
            const target = checkImageTarget(asked.target, state, schemas)
            if (target) asked.target = target
            else delete asked.target
          }
          yield { type: "step", id: call.id, label: stepLabel, state: "done" }
          yield {
            type: "question",
            id: asked.id,
            question: asked.question,
            ...(asked.why ? { why: asked.why } : {}),
            options: asked.suggestions,
            ...(asked.target ? { target: asked.target } : {}),
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

        /*
          THE SITE'S NAVIGATION (./menu-edits). Read as it stands now, and
          changed one link at a time through the theme's `menus`, with the
          header pointed at the Main menu when it still drew its own links.
          A whole site change, so the lock refuses it like update_theme.
        */
        if (call.name === "read_menus") {
          results.push({ id: call.id, output: describeMenus(state) })
          yield { type: "step", id: call.id, label: stepLabel, state: "done" }
          continue
        }
        if (call.name === "edit_menu") {
          if (locked) {
            results.push({ id: call.id, output: "Only the open section may change in this edit, and a menu is the whole site's. Say in your reply that changing the menu needs the lock cleared first." })
            yield { type: "step", id: call.id, label: stepLabel, state: "failed" }
            continue
          }
          const edited = editMenu(call.argumentsJson, state)
          results.push({ id: call.id, output: edited.output })
          for (const op of edited.ops ?? []) {
            state = applyOp(state, op, schemas)
            ops.push(op)
            if (op.kind === "update_section") touched.add(op.id)
            yield { type: "op", op, label: op.kind === "update_theme" ? "Changed the menu" : "Pointed the header at the Main menu" }
          }
          if (edited.ops?.length) done.push("Changed the menu")
          forget("read_section:")
          yield { type: "step", id: call.id, label: stepLabel, state: edited.failed ? "failed" : "done" }
          continue
        }

        /*
          THE SITE'S PALETTE (./scheme-edit). A whole-site change, so the
          lock refuses it like update_theme. Checked for contrast before it
          is applied; a refusal says the ratios.
        */
        if (call.name === "set_color_scheme") {
          if (locked) {
            results.push({ id: call.id, output: "Only the open section may change in this edit, and a colour scheme is the whole site's. Change this section's own colours, and say that the palette needs the lock cleared." })
            yield { type: "step", id: call.id, label: stepLabel, state: "failed" }
            continue
          }
          const said = trail.next(progress("writing", "Setting the colours"))
          if (said) yield said
          const set = setColorScheme(call.argumentsJson, state)
          results.push({ id: call.id, output: set.output })
          if (set.op) {
            const label = labelFor(set.op, state, schemas)
            state = applyOp(state, set.op, schemas)
            ops.push(set.op)
            done.push(label)
            forget("read_section:")
            yield { type: "op", op: set.op, label }
          }
          trace("tool", { name: call.name, ok: !!set.op })
          yield { type: "step", id: call.id, label: stepLabel, state: set.op ? "done" : "failed" }
          continue
        }
        /* Design knowledge and the format, read on demand rather than sent with every request. */
        if (call.name === "read_design_patterns" || call.name === "read_storelib_docs") {
          let topic = ""
          try {
            topic = String((JSON.parse(call.argumentsJson || "{}") as { topic?: unknown }).topic ?? "").trim()
          } catch {
            /* an empty topic lists everything */
          }
          const key = topic.toLowerCase().replace(/[\s-]+/g, "_")
          let output: string
          if (call.name === "read_design_patterns") {
            const pattern = patternById(key)
            const archetype = archetypeById(key)
            output = pattern
              ? describePatterns([pattern.id])
              : archetype
                ? describeArchetype(archetype)
                : key === "defaults"
                  ? DESIGN_DEFAULTS
                  : `${describePatterns()}\n\n${DESIGN_DEFAULTS}`
          } else {
            output = knowledgeBlock(topic, { limit: 3 }) || topicsById(["color-scheme", "responsive", "animation"])
          }
          results.push({ id: call.id, output })
          yield { type: "step", id: call.id, label: stepLabel, state: "done" }
          continue
        }
        if (call.name === "remember") {
          let note = ""
          try {
            note = String((JSON.parse(call.argumentsJson || "{}") as { note?: unknown }).note ?? "").replace(/\s+/g, " ").trim().slice(0, 200)
          } catch {
            /* nothing to keep */
          }
          if (note && input.memory) notes.push(note)
          results.push({ id: call.id, output: note ? "Kept. It will be shown to you on later messages about this website." : "Send the note as one sentence." })
          yield { type: "step", id: call.id, label: stepLabel, state: note ? "done" : "failed" }
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
         *
         * A WRITE IS CHECKED HERE, THEN KEPT BY THE ROUTE. Compiled, held to
         * the integration rules, and drawn with every instance's settings on
         * this page (./compile-feedback). A refusal goes back to the model in
         * plain numbered lines with the line of the file each one is about,
         * and it tries again, up to MAX_CODE_ATTEMPTS per file; then the file
         * is left as it was. What passes is staged by the route and saved
         * only when the run ends well (./code-journal).
         */
        if (input.code && CODE_TOOLS.has(call.name)) {
          const code = input.code
          const codeType = codeTypeArg

          if (call.name === "read_section_code") {
            const read = readCode(codeType, code, originOf)
            results.push({ id: call.id, output: read.output })
            if (read.ok) reads.set(readKey, read.output)
            yield { type: "step", id: call.id, label: stepLabel, state: read.ok ? "done" : "failed" }
            continue
          }

          /*
            A NEW SECTION OF THE MODEL'S OWN, written, checked and placed in
            one step: compiled, held to the integration rules, drawn with its
            own preset, then kept (staged by the route, saved only if the run
            ends well) and added to the page. The add carries the built
            section, because the editor learns a new type's schema a render
            after the stream tells it (./operations, add_section `section`).
          */
          if (call.name === "create_section") {
            const said = trail.next(progress("writing", writingLabel(fileLabel(codeType))))
            if (said) yield said
            if (locked) {
              results.push({ id: call.id, output: "Only the open section may change in this edit, so no section can be added. Do what you can inside it." })
              yield { type: "step", id: call.id, label: stepLabel, state: "failed" }
              continue
            }
            const failures = codeFailures.get(codeType) ?? 0
            if (failures >= MAX_CODE_ATTEMPTS) {
              results.push({ id: call.id, output: outOfAttempts(`sections/${codeType}.storelib`) })
              yield { type: "step", id: call.id, label: stepLabel, state: "failed", ...on }
              continue
            }
            const created = await createSection(call.argumentsJson, {
              state,
              code,
              schemas,
              sources: sourcesNow,
              newId,
              lenient: (codeRefusals.get(codeType) ?? 0) >= QUALITY_REFUSALS,
            })
            if (created.ok === false) {
              if (created.reason === "quality") codeRefusals.set(codeType, (codeRefusals.get(codeType) ?? 0) + 1)
              else if (created.reason !== "args") codeFailures.set(codeType, failures + 1)
              results.push({ id: call.id, output: created.output })
              trace("repair", { tool: call.name, type: codeType, reason: created.reason, feedback: created.output.slice(0, 400) })
              yield { type: "step", id: call.id, label: stepLabel, state: "failed" }
              continue
            }
            sourcesNow[created.path] = created.source
            schemas = schemaMapFor(sourcesNow)
            rewrittenTypes.add(codeType)
            wroteCode = true
            forget("read_section_type:")
            yield { type: "code", path: created.path, source: created.source }
            const label = `Added ${typeName(schemas, codeType)}`
            state = applyOp(state, created.op, schemas)
            ops.push(created.op)
            done.push(label)
            touched.add(created.op.id)
            added.add(created.op.id)
            if (created.op.settings) written.set(created.op.id, new Set(Object.keys(created.op.settings)))
            yield { type: "op", op: created.op, label }
            for (const more of created.extra) {
              const moreLabel = labelFor(more, state, schemas)
              state = applyOp(state, more, schemas)
              ops.push(more)
              if ("id" in more) touched.add(more.id)
              yield { type: "op", op: more, label: moreLabel }
            }
            results.push({ id: call.id, output: created.output })
            trace("tool", { name: call.name, ok: true, type: codeType })
            yield { type: "step", id: call.id, label: stepLabel, state: "done", sections: [created.op.id] }
            continue
          }

          if (call.name === "copy_section_to_code") {
            const copied = await copyToCode(call.argumentsJson, {
              state,
              code,
              originOf,
              locked,
              schemas,
              sources: sourcesNow,
              newSchemas: (next) => {
                schemas = next
              },
            })
            results.push({ id: call.id, output: copied.output })
            if (copied.op && copied.code) {
              /* The file first, so the canvas can draw the new type the moment the section switches to it. */
              yield { type: "code", path: copied.code.path, source: copied.code.source }
              const label = labelFor(copied.op, state, schemas)
              state = applyOp(state, copied.op, schemas)
              ops.push(copied.op)
              done.push(label)
              touched.add(copied.op.id)
              wroteCode = true
              forget("read_section:")
              forget("read_section_type:")
              yield { type: "op", op: copied.op, label }
            }
            yield { type: "step", id: call.id, label: stepLabel, state: copied.op ? "done" : "failed", ...on }
            continue
          }

          const path = `sections/${codeType}.storelib`
          const said = trail.next(progress("writing", writingLabel(fileLabel(codeType))))
          if (said) yield said
          const prepared = prepareCodeWrite(call.name, call.argumentsJson, code, originOf)
          if (prepared.ok === false) {
            results.push({ id: call.id, output: prepared.output })
            yield { type: "step", id: call.id, label: stepLabel, state: "failed", ...on }
            continue
          }
          const failures = codeFailures.get(codeType) ?? 0
          if (failures >= MAX_CODE_ATTEMPTS) {
            results.push({ id: call.id, output: outOfAttempts(path) })
            yield { type: "step", id: call.id, label: stepLabel, state: "failed", ...on }
            continue
          }

          const checkId = `${call.id}:check`
          yield { type: "step", id: checkId, label: COMPILE_CHECK_LABEL, state: "running", ...on }
          const qualitySent = codeRefusals.get(codeType) ?? 0
          const checked = checkSectionSource({
            path,
            type: codeType,
            source: prepared.source,
            before: prepared.before,
            instances: state.sections,
            theme: state.settings,
            sources: sourcesNow,
            strict: true,
            /* Sent back twice over quality already: the third goes through with the finding reported. */
            lenient: qualitySent >= QUALITY_REFUSALS,
          })
          if (checked.ok === false) {
            if (checked.reason === "quality") codeRefusals.set(codeType, qualitySent + 1)
            else codeFailures.set(codeType, failures + 1)
            trace("repair", { tool: call.name, type: codeType, reason: checked.reason, feedback: checked.feedback.slice(0, 400) })
            const spent = checked.reason !== "quality" && failures + 1 >= MAX_CODE_ATTEMPTS
            results.push({
              id: call.id,
              output: spent
                ? `${checked.feedback}\n\n${outOfAttempts(path)}`
                : `${checked.feedback}\n\nFix exactly that and send it again. Do not give up on the request because of a compile error.`,
            })
            yield { type: "step", id: checkId, label: COMPILE_CHECK_LABEL, state: "failed", ...on }
            yield { type: "step", id: call.id, label: stepLabel, state: "failed", ...on }
            continue
          }
          yield { type: "step", id: checkId, label: COMPILE_CHECK_LABEL, state: "done", ...on }

          const kept = await code.write(codeType, prepared.source)
          if (kept.ok === false) {
            results.push({ id: call.id, output: `That change was refused and NOTHING was saved: ${kept.error}` })
            yield { type: "step", id: call.id, label: stepLabel, state: "failed", ...on }
            continue
          }
          /* Kept, and what it should still have: a colour setting per element it draws (lib/storelib-ai/integration.ts). */
          const advice = sectionAdvice(prepared.source)
          results.push({
            id: call.id,
            output: `${path} compiled and is kept. It is saved when this edit finishes, and the canvas draws it now.${advice.length ? ` Still worth doing in this file:\n${describeQuality(advice)}\n` : " "}If the change was meant to be visible, say what you changed in one sentence when you finish.`,
          })
          // The canvas has to be told, the same way an operation tells it.
          yield progress("saving", savingLabel(fileLabel(codeType)))
          done.push(`Rewrote ${fileLabel(codeType)}`)
          wroteCode = true
          rewrittenTypes.add(codeType)
          for (const instance of state.sections) if (instance.type === codeType) touched.add(instance.id)
          sourcesNow[path] = prepared.source
          schemas = schemaMapFor(sourcesNow)
          /* What was read of it, and what its schema says, are no longer true. */
          forget(`read_section_code:${codeType}`)
          forget(`read_section_type:${codeType}`)
          forget("read_section:")
          /**
           * The source itself, so the panel can show what was written and
           * the canvas can draw it now. It is what was checked, after the
           * edits were applied: the same string, not a summary.
           */
          yield { type: "code", path, source: prepared.source }
          yield { type: "step", id: call.id, label: stepLabel, state: "done", ...on }
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
    /* Never the provider's own words: they were "400 {"type":"error",...}" on screen once (lib/sites/agent/plain-errors). */
    error =
      thrown instanceof Error && thrown.name === "AbortError"
        ? "Cancelled."
        : plainRunError(thrown, "theme agent loop", "The edit failed. Try again.")
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
    /* A section file it wrote and kept is work too: it is saved when the run ends (./code-journal). */
    if (ops.length > 0 || wroteCode) {
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
   * WHAT IS STILL WRONG IS SAID, NOT HIDDEN. A finding the run could not fix
   * within its budget stays in the reply, in a sentence, so "done" never
   * stands in front of a check that failed.
   */
  if (input.projectCheck && status === "succeeded" && unresolved.length && (ops.length > 0 || wroteCode)) {
    const first = unresolved[0].replace(/\s+/g, " ").split(/(?<=[.!?])\s/)[0].slice(0, 200)
    message = `${message ? `${message} ` : ""}One thing is still not right: ${first}${unresolved.length > 1 ? ` (and ${unresolved.length - 1} more)` : ""}`
  }

  /**
   * THE PROJECT'S MEMORY, written after the work (./project-state.ts): the
   * plan and its direction, what each section is for, the change itself.
   * An ordinary update_theme the editor applies and the Save button saves.
   * Streamed, but not recorded with the run's changes: it is notes, not an
   * edit somebody made.
   */
  if (brief && status === "succeeded" && (ops.length > 0 || wroteCode || notes.length || plan)) {
    const next = updateBrief(brief, {
      request: prompt,
      intent: intent ?? { kind: "LOCAL_EDIT", also: [], scope: "element", plan: false, preserveStructure: true, followUp: false, wantsMotion: false, reasons: [] },
      changed: changedSections(state, input.state, touched, schemas),
      state,
      added,
      plan,
      page,
      schemas,
      notes,
    })
    const op = briefOp(brief, next)
    if (op) {
      state = applyOp(state, op, schemas)
      yield { type: "op", op, label: "Kept notes on this website" }
      trace("memory", { bytes: JSON.stringify(next).length })
    }
  }
  trace("end", { status, ops: ops.length, wroteCode, unresolved: unresolved.length, visual, usage })

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

  return { status, message, error, usage, ops, wroteCode, asked, intent, plan, unresolved, visual }
}

/**
 * THE SELF CHECK, as the model reads it after it thought it was done: every
 * element asked for, and every part of the picture, on the page now, or fixed
 * with the tools before it answers.
 */
export function selfCheckNote(withPicture: boolean): string {
  return [
    "BEFORE YOU FINISH, READ YOUR WORK BACK against the request" + (withPicture ? " and the picture" : "") + ".",
    "List to yourself every element the creator named" + (withPicture ? ", and every part of the picture: its layout, spacing, colours, type, imagery and words" : "") + ". For each, it is on the page now, in the section it belongs to, looking as asked.",
    "If anything is missing, plainer than asked, or different, fix it now with the tools. If everything is there, reply with your one closing sentence saying what you changed and where.",
  ].join(" ")
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
 * ONE MODEL CALL, WITH ONE SECOND CHANCE WHEN THE PROVIDER WAS ONLY BUSY.
 *
 * The SDK already retries a 429 or a dropped connection on its own, quickly.
 * A run that has done ten steps of real work and then meets a busy provider
 * on its eleventh is worth one more patient try before the creator is told
 * anything: a short wait, then the same request. Anything else (a timeout,
 * billing, a cancel) is not retried, because waiting will not change it.
 */
export const BUSY_RETRY_MS = 1_500

async function completeOnce(provider: AgentProvider, request: ProviderRequest): Promise<ProviderTurn> {
  try {
    return await provider.complete(request)
  } catch (thrown) {
    const kind = failureKind(thrown)
    if ((kind !== "busy" && kind !== "network") || request.signal?.aborted) throw thrown
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, BUSY_RETRY_MS)
      request.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer)
          reject(new DOMException("Aborted", "AbortError"))
        },
        { once: true },
      )
    })
    return await provider.complete(request)
  }
}

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

/**
 * What a write is about, as the chat's subject line says it: "Editing
 * Pricing" for a change to a section on the page or its code, "New section:
 * Testimonials" for one being added. A read, a theme change and anything
 * that names nothing on the page say nothing.
 */
export function subjectFor(name: string, argumentsJson: string, state: ThemeState, schemas?: SchemaMap): string {
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(argumentsJson || "{}") as Record<string, unknown>
  } catch {
    return ""
  }
  if (name === "edit_menu") return editingSubject(args.menu === "main-menu" || !args.menu ? "the Main menu" : "a menu")
  if (name === "add_section") {
    const type = typeof args.sectionType === "string" ? args.sectionType : ""
    return type && schemaOf(schemas, type) ? newSectionSubject(typeName(schemas, type)) : ""
  }
  if (name === "write_section_code" || name === "edit_section_code") {
    const type = typeof args.sectionType === "string" ? args.sectionType.trim() : ""
    if (!type) return ""
    const instance = state.sections.find((s) => s.type === type)
    return editingSubject(instance?.name?.trim() || typeName(schemas, type))
  }
  if (name === "copy_section_to_code" || (WRITE_TOOLS.has(name) && name !== "update_theme" && name !== "add_section")) {
    const id = typeof args.sectionId === "string" ? args.sectionId : typeof args.id === "string" ? args.id : ""
    const section = state.sections.find((s) => s.id === id)
    return section ? editingSubject(section.name?.trim() || typeName(schemas, section.type)) : ""
  }
  return ""
}

/**
 * The picture setting a question names, checked against the page: the
 * section is on it, the block (when there is one) is in it, and the setting
 * is an image_picker there. Anything else is dropped, and the question is
 * asked without the actions rather than with ones that would write nowhere.
 */
export function checkImageTarget(
  target: NonNullable<AgentQuestion["target"]>,
  state: ThemeState,
  schemas?: SchemaMap,
): NonNullable<AgentQuestion["target"]> | null {
  const section = state.sections.find((s) => s.id === target.sectionId)
  if (!section) return null
  let fields = fieldsFor(section.type, schemas)
  if (target.blockId) {
    const path = resolvePath(section.blocks, target.blockId)
    const block = path ? blockAt(section.blocks, path)?.block : undefined
    if (!block) return null
    fields = blockFieldsFor(section.type, block.type, schemas)
  }
  const field = fields.find((f) => f.id === target.setting)
  if (!field || field.type !== "image_picker") return null
  return { ...target, label: field.label || section.name || typeName(schemas, section.type) }
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
    /* The project's memory is shown as PROJECT STATE, described; never twice. */
    if (key === BRIEF_KEY) continue
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

/** The tools that read or write a section's file. */
const CODE_TOOLS = new Set(["read_section_code", "write_section_code", "edit_section_code", "copy_section_to_code", "create_section"])

/**
 * The sections on the page a step is about, for the canvas's shimmer. A
 * write to a section's code is about every instance of that type; a read is
 * about nothing, because reading changes nothing anybody is looking at.
 */
export function stepTargets(name: string, argumentsJson: string, state: ThemeState): string[] {
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(argumentsJson || "{}") as Record<string, unknown>
  } catch {
    return []
  }
  if (name === "write_section_code" || name === "edit_section_code") {
    const type = typeof args.sectionType === "string" ? args.sectionType.trim() : ""
    return type ? state.sections.filter((s) => s.type === type).map((s) => s.id) : []
  }
  if (name === "copy_section_to_code" || WRITE_TOOLS.has(name)) {
    const id = typeof args.sectionId === "string" ? args.sectionId : typeof args.id === "string" ? args.id : ""
    return id && state.sections.some((s) => s.id === id) ? [id] : []
  }
  return []
}

/** read_section_code: the creator's file, or Storelib's own, which is read and never written. */
function readCode(
  sectionType: string,
  code: NonNullable<ThemeAgentInput["code"]>,
  originOf: (type: string) => SectionOrigin,
): { ok: boolean; output: string } {
  if (!SECTION_TYPE.test(sectionType)) return { ok: false, output: 'Name the section type, e.g. "faq_accordion".' }
  const source = code.read(sectionType)
  if (source === null) {
    return {
      ok: false,
      output: `There is no source for "${sectionType}" in this theme. It is drawn by Storelib itself, so it has no file to edit: do what you can with its settings and say plainly in your reply what the settings cannot do.`,
    }
  }
  if (originOf(sectionType) === "builtin") {
    return {
      ok: true,
      output: `sections/${sectionType}.storelib is Storelib's built in file. You can read it and you cannot change it. To change its code the creator first agrees to an editable copy (ask_creator), then copy_section_to_code on the section, then you edit the copy.\n\n${source}`,
    }
  }
  return { ok: true, output: `The whole of sections/${sectionType}.storelib:\n\n${source}` }
}

/**
 * write_section_code and edit_section_code, up to the point of checking: the
 * whole new source, and what the file said before it. Refuses a file that is
 * not the creator's own before anything is compiled.
 */
function prepareCodeWrite(
  name: string,
  argumentsJson: string,
  code: NonNullable<ThemeAgentInput["code"]>,
  originOf: (type: string) => SectionOrigin,
): { ok: true; source: string; before: string | null } | { ok: false; output: string } {
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(argumentsJson || "{}") as Record<string, unknown>
  } catch {
    return { ok: false, output: "The arguments were not JSON. Send sectionType, and the edits or the whole source." }
  }
  const sectionType = typeof args.sectionType === "string" ? args.sectionType.trim() : ""
  if (!SECTION_TYPE.test(sectionType)) return { ok: false, output: 'Name the section type, e.g. "faq_accordion".' }
  const origin = originOf(sectionType)
  if (origin === "builtin") {
    return {
      ok: false,
      output: `Nothing was saved. sections/${sectionType}.storelib is Storelib's built in file and is never changed. If the creator has agreed to an editable copy, call copy_section_to_code on the section and edit the copy; otherwise make the change with its settings.`,
    }
  }
  const before = code.read(sectionType)
  if (before === null || origin !== "own") {
    return { ok: false, output: `There is no source for "${sectionType}" in this theme to change. Built in sections are changed through their settings.` }
  }
  if (name === "edit_section_code") {
    const applied = applySourceEdits(before, args.edits)
    if (applied.ok === false) return { ok: false, output: `Nothing was saved. ${applied.error}` }
    return { ok: true, source: applied.source, before }
  }
  const source = typeof args.source === "string" ? args.source : ""
  if (!source.trim()) return { ok: false, output: "Send the whole file in `source`, or use edit_section_code for a change to part of it." }
  return { ok: true, source, before }
}

/**
 * copy_section_to_code: Storelib's file for a built in section, copied into
 * the creator's theme under a new type (./coded-copy), checked, kept, and the
 * section switched over to it with every setting and block it had.
 */
async function copyToCode(
  argumentsJson: string,
  ctx: {
    state: ThemeState
    code: NonNullable<ThemeAgentInput["code"]>
    originOf: (type: string) => SectionOrigin
    locked?: string
    schemas: SchemaMap
    sources: Record<string, string>
    newSchemas: (next: SchemaMap) => void
  },
): Promise<{ output: string; op?: Extract<ThemeOp, { kind: "set_section_type" }>; code?: { path: string; source: string } }> {
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(argumentsJson || "{}") as Record<string, unknown>
  } catch {
    return { output: "The arguments were not JSON. Send the section's id." }
  }
  const id = typeof args.id === "string" ? args.id : ""
  if (ctx.locked && id !== ctx.locked) {
    return { output: `[${ctx.locked}] is the only section you may change in this edit. Nothing was copied.` }
  }
  const section = ctx.state.sections.find((s) => s.id === id)
  if (!section) return { output: notFound(id, ctx.state) }
  if (section.type === "header" || section.type === "footer") {
    return { output: `The ${section.type} is never copied: a second one would have no cart, search or menus. Change it through its settings.` }
  }
  const origin = ctx.originOf(section.type)
  if (origin === "own") {
    return { output: `[${id}] already draws from the creator's own file, sections/${section.type}.storelib. Edit that with edit_section_code; there is nothing to copy.` }
  }
  const shipped = origin === "builtin" ? ctx.code.read(section.type) : null
  if (shipped === null) {
    return { output: `[${id}] is drawn by Storelib itself and has no code to copy. Its settings and blocks are the whole of it: change those, and say plainly what they cannot do.` }
  }
  const copy = makeCodedCopy({
    type: section.type,
    source: shipped,
    takenTypes: new Set([
      ...Object.keys(ctx.schemas),
      ...Object.keys(ctx.sources).map((p) => p.replace(/^sections\//, "").replace(/\.storelib$/, "")),
    ]),
    takenNames: new Set(Object.values(ctx.schemas).map((s) => String(s.name ?? "").toLowerCase())),
  })
  if (copy.ok === false) return { output: copy.error }
  const switched = { ...section, type: copy.type }
  /* Storelib's own file is not re-judged on taste; it must still compile and draw with this section's settings. */
  const checked = checkSectionSource({
    path: copy.path,
    type: copy.type,
    source: copy.source,
    instances: [switched],
    theme: ctx.state.settings,
    sources: ctx.sources,
    strict: false,
    lenient: true,
  })
  if (checked.ok === false) return { output: `The copy could not be made, and nothing changed: ${checked.feedback}` }
  const kept = await ctx.code.write(copy.type, copy.source, { create: true })
  if (kept.ok === false) return { output: `The copy could not be kept, and nothing changed: ${kept.error}` }
  ctx.sources[copy.path] = copy.source
  ctx.newSchemas(schemaMapFor(ctx.sources))
  return {
    output: `Made an editable copy. [${id}] now draws from ${copy.path} ("${copy.name}") with every setting and block it had. Read it with read_section_code "${copy.type}" and make the change there with edit_section_code.`,
    op: { kind: "set_section_type", id, sectionType: copy.type },
    code: { path: copy.path, source: copy.source },
  }
}

/**
 * create_section: a new file of the model's own, checked the way every write
 * is (./compile-feedback), then kept and placed. A file declaring "kind":
 * "header" or "footer" goes in that group and takes the place of the one
 * drawn there, which is hidden, never removed: the editor's own Add section
 * does exactly that (lib/storelib-theme/section-groups.ts, placeSection).
 */
async function createSection(
  argumentsJson: string,
  ctx: {
    state: ThemeState
    code: NonNullable<ThemeAgentInput["code"]>
    schemas: SchemaMap
    sources: Record<string, string>
    newId: (type: string) => string
    lenient: boolean
  },
): Promise<
  | { ok: true; path: string; source: string; op: Extract<ThemeOp, { kind: "add_section" }>; extra: ThemeOp[]; output: string }
  | { ok: false; reason: "args" | "compile" | "quality" | "render" | "kept"; output: string }
> {
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(argumentsJson || "{}") as Record<string, unknown>
  } catch {
    return { ok: false, reason: "args", output: "The arguments were not JSON. Send sectionType, source, index and settingsJson." }
  }
  const type = typeof args.sectionType === "string" ? args.sectionType.trim() : ""
  if (!SECTION_TYPE.test(type) || type === "header" || type === "footer") {
    return { ok: false, reason: "args", output: 'Give the new section a lowercase type of its own, e.g. "event_poster". "header" and "footer" are taken.' }
  }
  if (schemaOf(ctx.schemas, type)) {
    return { ok: false, reason: "args", output: `"${type}" already exists. Pick a new type for a new section, or change that one with edit_section_code.` }
  }
  const source = typeof args.source === "string" ? args.source : ""
  if (!source.trim()) return { ok: false, reason: "args", output: "Send the whole file in `source`." }
  const path = `sections/${type}.storelib`
  const first = checkSectionSource({ path, type, source, before: null, instances: [], theme: ctx.state.settings, sources: ctx.sources, strict: true, lenient: ctx.lenient })
  if (first.ok === false) return { ok: false, reason: first.reason, output: `${first.feedback}\n\nNothing was saved. Fix exactly that and send create_section again.` }

  const tentative = schemaMapFor({ ...ctx.sources, [path]: source })
  const id = ctx.newId(type)
  const built = buildSection(id, type, tentative)
  if (!built) return { ok: false, reason: "compile", output: `${path} compiled but its schema could not be read as a section. Check its <schema> has "name" and "settings".` }
  const wanted = parseSettings(args.settingsJson) ?? {}
  let notes: string[] = []
  if (Object.keys(wanted).length) {
    const checked = checkSettings(fieldsFor(type, tentative), wanted, type)
    if (checked.error) return { ok: false, reason: "args", output: `${checked.error}\n\nNothing was saved. Use the settings your schema declares.` }
    built.settings = { ...built.settings, ...checked.settings }
    notes = checked.notes
  }
  const kind = kindOfSource(source, type)
  if (kind) built.group = kind
  /* Drawn with the settings it will have on the page, so a value the template cannot handle is found now. */
  const drawn = checkSectionSource({ path, type, source, before: null, instances: [built], theme: ctx.state.settings, sources: ctx.sources, strict: false, lenient: true })
  if (drawn.ok === false) return { ok: false, reason: drawn.reason, output: `${drawn.feedback}\n\nNothing was saved.` }

  const kept = await ctx.code.write(type, source, { create: true })
  if (kept.ok === false) return { ok: false, reason: "kept", output: `That file was refused and NOTHING was saved: ${kept.error}` }

  const index = typeof args.index === "number" && args.index >= 0 ? args.index : undefined
  const op: Extract<ThemeOp, { kind: "add_section" }> = { kind: "add_section", id, sectionType: type, index, settings: built.settings, section: built }
  /* A header of its own takes the drawn header's place; that one is hidden, so the eye in the sidebar brings it back. */
  const extra: ThemeOp[] = kind
    ? ctx.state.sections
        .filter((sec) => !sec.hidden && (sec.type === kind || kindOfSource(ctx.sources[`sections/${sec.type}.storelib`] ?? "", sec.type) === kind))
        .map((sec) => ({ kind: "set_section_visibility" as const, id: sec.id, hidden: true }))
    : []
  const advice = sectionAdvice(source)
  return {
    ok: true,
    path,
    source,
    op,
    extra,
    output: [
      `Created ${path} and added it as [${id}]${kind ? ` in the ${kind} group, in place of the ${kind} that was drawn (now hidden)` : ""}.${notes.length ? ` (${notes.join("; ")})` : ""}`,
      describeSection(built, tentative),
      advice.length ? `Still worth doing in this file:\n${describeQuality(advice)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
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
      edit_menu: "changing a menu, which the whole site shows",
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
      /*
        NULL CLEARS A SETTING THE SCHEMA NO LONGER HAS, and only that. A
        section file rewritten without a setting leaves its value on every
        instance; this is how it is taken off (./project-check.ts says which).
      */
      const declared = new Set(fieldIds(found.type, schemas))
      const unset = Object.keys(settings).filter((k) => settings[k] === null && !declared.has(k) && k in (found.settings ?? {}))
      for (const k of unset) delete settings[k]
      const nulled = Object.keys(settings).filter((k) => settings[k] === null)
      if (nulled.length) {
        return { output: `${nulled.map((k) => `"${k}"`).join(", ")} ${nulled.length === 1 ? "is a setting" : "are settings"} this section has, so null cannot clear ${nulled.length === 1 ? "it" : "them"}: send a value. null only clears a setting its schema no longer declares.`, failed: true }
      }
      const checked = Object.keys(settings).length ? checkSettings(fieldsFor(found.type, schemas), settings, found.type) : { settings: {}, notes: [] as string[] }
      if (checked.error) return { output: checked.error }

      return {
        output: `Updated ${found.type} [${id}]: ${[...Object.keys(checked.settings!), ...unset.map((k) => `${k} cleared`)].join(", ")}.${
          checked.notes.length > 0 ? ` (${checked.notes.join("; ")})` : ""
        }`,
        op: { kind: "update_section", id, settings: checked.settings!, ...(unset.length ? { unset } : {}) },
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
      const parentKey = typeof args.parentBlockId === "string" ? args.parentBlockId.trim() : ""
      const parentPath = parentKey ? resolvePath(section.blocks, parentKey) : []
      if (!parentPath) return { output: `${section.type} has no block "${parentKey}" to add inside. Its blocks are listed by read_section.` }
      const parentBlock = parentPath.length ? blockAt(section.blocks, parentPath)?.block ?? null : null
      const catalog = themeBlockCatalog()
      const specs = parentBlock
        ? addableBlocks({ accepts: catalog[parentBlock.type]?.accepts }, catalog)
        : blockSpecs(section.type, schemas)
      if (!specs.some((b) => b.type === blockType)) {
        const where = parentBlock ? `A ${parentBlock.type} block` : section.type
        return {
          output: `${where} does not take a "${blockType}" block. It takes: ${
            specs.map((b) => b.type).join(", ") || "no blocks at all"
          }.`,
        }
      }

      /**
       * The schema's own ceiling. A slideshow that declares four slides means
       * four; a fifth is a section that renders wrong rather than a section
       * with more in it. A block that holds blocks has its own, and a section
       * holds LIMITS.blocksPerSection at every depth together.
       */
      const siblings = (parentBlock ? parentBlock.blocks : section.blocks) ?? []
      const cap = parentBlock ? catalog[parentBlock.type]?.max_blocks : maxBlocks(section.type, schemas)
      const placed = siblings.filter((b) => !b.static).length
      if (cap !== undefined && placed >= cap) {
        return {
          output: `${parentBlock ? `This ${parentBlock.type}` : section.type} takes at most ${cap} blocks and already has ${placed}. Change one of the existing ones, or remove one first.`,
        }
      }
      if (countAll(section.blocks) >= LIMITS.blocksPerSection) {
        return { output: `A section holds ${LIMITS.blocksPerSection} blocks, counting the ones inside other blocks, and this one is full.` }
      }
      if (parentPath.length >= MAX_BLOCK_DEPTH) {
        return { output: `Blocks nest ${MAX_BLOCK_DEPTH} deep at most.` }
      }

      const settings = parseSettings(args.settingsJson)
      if (!settings) {
        return { output: 'Send `settingsJson` as a JSON object in a string, e.g. {"question":"…"}.' }
      }
      const checked = checkSettings(
        (specs.find((b) => b.type === blockType)?.fields ?? []).filter((f) => f.type !== "header" && f.type !== "paragraph"),
        settings,
        `a ${blockType} block`,
      )
      if (checked.error) return { output: `${checked.error}\n\nNothing was added.` }

      const index = typeof args.index === "number" && args.index >= 0 ? args.index : undefined
      const blockId = newId(blockType)
      const path = [...parentPath, blockId].join("/")
      return {
        output: `Added a ${blockType} block [${path}] to ${parentBlock ? `the ${parentBlock.type} [${parentPath.join("/")}] in ` : ""}${section.type}.${
          checked.notes.length > 0 ? ` (${checked.notes.join("; ")})` : ""
        }`,
        op: { kind: "add_block", sectionId, blockId, blockType, index, settings: checked.settings!, ...(parentPath.length ? { parentId: parentPath.join("/") } : {}) },
      }
    }

    case "update_block": {
      const sectionId = typeof args.sectionId === "string" ? args.sectionId : ""
      const section = state.sections.find((s) => s.id === sectionId)
      if (!section) return { output: notFound(sectionId, state), failed: true }

      const blockId = typeof args.blockId === "string" ? args.blockId : ""
      const blockPath = resolvePath(section.blocks, blockId)
      const block = blockPath ? blockAt(section.blocks, blockPath)?.block : undefined
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
      if (!resolvePath(section.blocks, blockId)) {
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
      const removing = resolvePath(section.blocks, blockId)
      if (!removing) {
        return { output: `${section.type} has no block "${blockId}".` }
      }
      if (blockAt(section.blocks, removing)?.block.static) {
        return { output: `[${blockId}] is placed by the section's template, so it stays. Change its settings with update_block, or hide it.` }
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
      /*
        A FONT IS A FAMILY THE THEME CAN LOAD. The control takes any string,
        and "Fraunces" merges, saves and then draws as the fallback on every
        visitor's screen, because only the panel's families are ever fetched
        (lib/website-builder/font-link.ts).
      */
      const badFont = (["font_heading", "font_body", "font_accent"] as const).find(
        (k) => typeof checked.settings![k] === "string" && (checked.settings![k] as string).trim() !== "" && !OFFERED_FAMILIES.has((checked.settings![k] as string).trim()),
      )
      if (badFont) {
        return { output: `${badFont} "${checked.settings![badFont]}" is not a family the theme can load, so visitors would see a fallback. Nothing was changed. Use one of: ${[...OFFERED_FAMILIES].join(", ")}.` }
      }

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
