import "server-only"

/**
 * What the agent can do, and what happens when it does it.
 *
 * ---------------------------------------------------------------------------
 *  THE TOOLS ARE THE BOUNDARY
 * ---------------------------------------------------------------------------
 * "The AI can edit your website" has to mean something bounded, and this file
 * is the bound — not a sentence in a system prompt asking it to behave. There
 * is no shell, no network, no database handle, and no filesystem: every tool
 * operates on an in-memory `ProjectFiles` map, and the only way anything
 * reaches Postgres is the ONE `saveFiles` call the loop makes at the end,
 * through the same validation and the same RLS a human edit goes through.
 *
 * There is deliberately no `run_sql`, no `install_package`, and no
 * `fetch_url`. "Add properties to my real estate site" becomes a collection
 * row, not DDL; a missing package is an answer, not an install.
 *
 * ---------------------------------------------------------------------------
 *  ERRORS ARE RESULTS
 * ---------------------------------------------------------------------------
 * Every tool returns a string the model reads, including its failures. A tool
 * that throws ends the run; a tool that says "that file does not exist, here
 * are the ones that do" gets the next call right. The only things that throw
 * are conditions the model cannot fix by trying again.
 */

import { filePathError, MAX_FILES_PER_PROJECT, MAX_FILE_BYTES } from "../file-path"
import { completeStep, emptyPlan, setSteps, type RunPlan } from "./plan"
import { type AgentQuestion, askedNote, parseQuestions } from "./questions"
import { bundleProject, formatBuildErrors } from "../bundle"
import { scanForSecrets } from "../preflight"
import {
  DOCUMENT_TOOLS,
  DOCUMENT_TOOL_NAMES,
  executeDocumentTool,
  type DocumentToolName,
} from "./document-tools"
import { renderDocument } from "../document/render"
import type { SiteDocument } from "../document/schema"
import { buildRepoMap, findUsages } from "./repo-map"
import { sortedPaths } from "../starter"
import type { BuildResult, ProjectFiles } from "../types"
import type { ToolSpec } from "./types"

/** Truncated reads keep one runaway file from eating the whole context. */
const MAX_READ_CHARS = 24_000

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "list_files",
    description:
      "List every file in the project with its size in characters. Call this first — do not guess paths.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "read_file",
    description: "Read one file. Read a file before rewriting it.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Project-relative, e.g. src/App.tsx" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "write_file",
    description:
      "Replace a file's ENTIRE contents. The path must already exist — use create_file for a new one.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string", description: "The complete new file. Not a patch or a fragment." },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "create_file",
    description: "Create a file that does not exist yet.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_file",
    description: "Delete a file. Anything still importing it will fail to build.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    /**
     * Recording something durable about the project.
     *
     * Deliberately awkward to use for trivia: every field is optional, the
     * description says what does not belong, and there is one `decision`
     * rather than a list — an agent that can append five notes at once will.
     * The value of this record is entirely in its signal-to-noise; a decision
     * list full of "made the hero bigger" crowds out "the client insists on
     * no stock photography", which is the entry that actually stops the next
     * run getting it wrong.
     */
    name: "update_manifest",
    description:
      "Record something durable about this project that could not be worked out by reading the code: what the business is, who it is for, the design direction in words, or a decision the creator should never have to repeat. Do NOT call this for ordinary edits — a change you just made is not a project decision. Call it at most once per run, and only when something lasting was established. Send null for anything you are not setting.",
    /**
     * EVERY FIELD IS REQUIRED AND NULLABLE, which looks redundant and is not.
     *
     * These fields are all genuinely optional — a run usually establishes one
     * of them at most. But OpenAI's strict mode requires `additionalProperties:
     * false` AND every declared property listed in `required`, so "optional"
     * cannot be expressed by omission; it is expressed as a type that includes
     * null. Getting this wrong is not a subtle degradation: the request is
     * rejected at the API with a 400, on the first real prompt, for every
     * creator at once.
     */
    parameters: {
      type: "object",
      properties: {
        business: {
          type: ["string", "null"],
          description: "The business or brand this site is for.",
        },
        purpose: { type: ["string", "null"], description: "What the site is for, in one sentence." },
        audience: { type: ["string", "null"], description: "Who the site is for." },
        primaryGoal: {
          type: ["string", "null"],
          description: "What the site is meant to make happen — enquiries, bookings, sales, signups.",
        },
        tone: {
          type: ["string", "null"],
          description: "How it should sound — 'plain and direct', 'warm', 'playful'.",
        },
        siteType: {
          type: ["string", "null"],
          description: "landing page, portfolio, store, agency site, funnel, and so on.",
        },
        designDirection: {
          type: ["string", "null"],
          description: "The visual direction in words, e.g. 'warm, editorial, generous whitespace'.",
        },
        decision: {
          type: ["string", "null"],
          description:
            "One lasting decision the creator has made, phrased so a future run can obey it — 'keep the header dark on every page', 'copy stays in German'.",
        },
      },
      required: [
        "business",
        "purpose",
        "audience",
        "siteType",
        "primaryGoal",
        "tone",
        "designDirection",
        "decision",
      ],
      additionalProperties: false,
    },
  },
  {
    /**
     * SEARCHING BEATS READING EVERYTHING.
     *
     * Without this the only way to find where something lives is to read files
     * until it turns up, which spends turns on discovery that should be spent
     * on work — and on a project of any size, runs out of budget before the
     * editing starts.
     */
    name: "search_code",
    description:
      "Find which files contain a string — a component name, a class, a piece of copy, an import. Returns each match with its file and line. Use this to locate things instead of reading files one by one.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Literal text to find. Not a regular expression." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    /**
     * THE QUESTION `search_code` ANSWERS BADLY.
     *
     * Searching for "Hero" returns the import, the JSX tag, the CSS class, a
     * comment and the word in a heading, and the model has to work out which
     * is which — often by reading the files, which is what searching was meant
     * to avoid. Three separate answers are more useful than twenty lines of
     * mixed ones: where it is defined, who imports it, where it is rendered.
     *
     * "Imported but never rendered" is the shape of a real and common bug —
     * the section the creator says is not showing up — and this is the only
     * tool that can state it.
     */
    name: "find_usages",
    description:
      "Find where a component, hook or exported name is defined, which files import it, and which files actually render it. Use this before renaming, moving or deleting anything, and to find out why something is not appearing on the site.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The exported name, e.g. Hero or useCart." },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    /**
     * A surgical alternative to rewriting a whole file. `write_file` replaces
     * everything, so a one-line change re-sends the entire component and every
     * such rewrite is a chance to drop something that was already right.
     */
    name: "replace_in_file",
    description:
      "Replace an exact string in a file, leaving the rest untouched. Prefer this over write_file for a small change. The old text must appear EXACTLY once — if it appears more than once, include more surrounding lines to make it unique.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        old: { type: "string", description: "The exact text to replace, including indentation." },
        new: { type: "string", description: "What to put there instead." },
      },
      required: ["path", "old", "new"],
      additionalProperties: false,
    },
  },
  {
    /**
     * The plan is what the run is later held to. Writing it is not paperwork:
     * it is the agent stating what "done" means for this request, before it
     * has any incentive to define it as whatever it happens to have finished.
     */
    name: "set_plan",
    description:
      "State what you are going to do, as a list of short steps in the creator's language ('Rebuild the hero', 'Add testimonials', 'Fix the mobile nav'). Call this before you start editing on anything but a trivial change. You may call it again to revise the plan — steps already completed stay completed.",
    parameters: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          items: { type: "string" },
          description: "The steps, in the order you intend to do them.",
        },
      },
      required: ["steps"],
      additionalProperties: false,
    },
  },
  {
    name: "complete_step",
    description:
      "Mark one plan step finished, using its text. Call this as you go, not all at the end — it is what tells the creator where the run has got to.",
    parameters: {
      type: "object",
      properties: {
        step: { type: "string", description: "The step you have finished." },
      },
      required: ["step"],
      additionalProperties: false,
    },
  },
  {
    name: "run_build",
    description:
      "Bundle the project and report whether it compiles. Run this after your edits and fix anything it reports before finishing.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "read_build_errors",
    description: "Re-read the problems from the last run_build without rebuilding.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "ask_creator",
    description:
      "Ask the creator up to four short questions about their business — its name, where it is, what it charges, when it is open, who it is for. Use this when the request is too thin to build something specific from ('a site for my barber shop' says almost nothing). YOU WILL NOT GET AN ANSWER DURING THIS RUN, and you must not wait for one: ask, then carry on and build the whole site using the best defaults you can justify. The answers come back later as a new message. Ask ONCE per run, early, and only about things you genuinely cannot infer.",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          description: "One to four questions. Ask about the business, never about code.",
          items: {
            type: "object",
            properties: {
              question: {
                type: "string",
                description: 'One sentence, in plain language. "What is the shop called?"',
              },
              why: {
                type: "string",
                description:
                  'Optional, very short: what it changes. "It goes in the header and the footer."',
              },
              suggestions: {
                type: "array",
                items: { type: "string" },
                description:
                  "Up to five tappable answers — a few words each. They are a shortcut, not a closed list; the creator can always type their own.",
              },
              placeholder: {
                type: "string",
                description: "Optional hint for the text box, a few words.",
              },
            },
            required: ["question", "why", "suggestions", "placeholder"],
            additionalProperties: false,
          },
        },
      },
      required: ["questions"],
      additionalProperties: false,
    },
  },
]

/**
 * The project as the run sees it: an in-memory copy that tools mutate, plus
 * the record of what changed so only those files are written back.
 */
/**
 * THE SIZE HAS TO BE REFUSED WHERE IT IS WRITTEN, NOT WHERE IT IS SAVED.
 *
 * It used to be checked only by `projectError`, at the very end, when the
 * whole changed set is committed. So a model asked for an image — with no
 * upload available to it, which is the state of the product today — would
 * inline the picture as a base64 data URI, sail past `write_file`, finish the
 * run, and have EVERY edit in that run thrown away by one oversized file. The
 * creator paid for the tokens and got nothing, and the thing they asked for is
 * the thing that destroyed it.
 *
 * Told here, the model still has its turns left. It reads the refusal, uses a
 * URL instead, and the run succeeds.
 */
function fileSizeError(path: string, content: string): string | null {
  // Bytes, not characters: a data URI is ASCII but a page of emoji is not, and
  // the column this lands in is measured in bytes.
  const bytes = new TextEncoder().encode(content).length
  if (bytes <= MAX_FILE_BYTES) return null
  return (
    `Cannot write "${path}": it is ${Math.round(bytes / 1024)}KB and the limit is ` +
    `${Math.round(MAX_FILE_BYTES / 1024)}KB. If you are inlining an image or a font as a ` +
    `data: URI, do not — reference it by URL instead. Nothing has been written; the rest of ` +
    `your edits are still here.`
  )
}

/**
 * The tools this run may use.
 *
 * A site with a document gets the structured edits FIRST in the list, because
 * order is one of the few things that reliably shifts which tool a model
 * reaches for — and reaching for write_file to change a colour is how a value
 * leaves the creator's controls and the picker stops working.
 *
 * A site without one is a plain code project and never sees them: offering a
 * tool that cannot apply is a wasted turn and a confusing refusal.
 */
export function toolsFor(hasDocument: boolean): ToolSpec[] {
  return hasDocument ? [...DOCUMENT_TOOLS, ...TOOL_SPECS] : TOOL_SPECS
}

export class ProjectWorkspace {
  readonly files: ProjectFiles
  readonly changed = new Set<string>()
  readonly deleted = new Set<string>()
  private lastBuild: BuildResult | null = null

  /**
   * What the agent asked to remember about the project, if anything.
   *
   * Held here and committed by the caller after a SUCCESSFUL run, exactly like
   * the files are — so a run that fails or is stopped does not leave a note
   * behind describing work that was never saved.
   */
  manifestUpdate: Record<string, string> | null = null

  /**
   * What the agent said it would do, and how far it has got.
   *
   * Held on the workspace beside the file changes because it has the same
   * lifetime as them: it belongs to one run, and the caller reads it when the
   * run resolves. The loop consults it to decide whether finishing is allowed.
   */
  plan: RunPlan = emptyPlan()

  /**
   * The last build's verdict, or null if the agent has not built.
   *
   * Private, and read through a getter that answers null once anything has
   * been edited since — see `editsSinceBuild`.
   */
  private lastBuildOk: boolean | null = null

  /**
   * FILES CHANGED SINCE THE LAST BUILD.
   *
   * A build's verdict is about the tree that was built, and it stops being
   * true the moment a file changes. Without this, a model that built green at
   * turn ten, edited at turn eleven and went quiet at turn twelve passed the
   * completion gate on a verdict that no longer described the project — and
   * the run saved an unbuilt tree over a working site, reporting success.
   *
   * A stale green is worse than no build at all: no build is caught, and the
   * loop builds for itself before saving.
   */
  private editsSinceBuild = 0

  /**
   * WHICH CHECK SAID NO, so the creator is told what actually happened.
   *
   * "The edit did not compile" is the right sentence for a syntax error and
   * the wrong one for a page that compiled and threw on render — and the loop
   * used to say it for both, because it only ever looked at the bundler.
   */
  private lastProblem: "bundle" | "types" | "render" | "secret" | null = null

  /**
   * The canonical state, when the site has one.
   *
   * Null for every site built before it existed. Those go on being edited as
   * files, which is why this is optional rather than a migration nobody asked
   * for.
   */
  document: SiteDocument | null = null

  /**
   * What the agent asked the creator this run, if anything.
   *
   * Held on the workspace rather than yielded straight out of the executor
   * because the loop is what turns tool results into events, and one place
   * deciding what reaches the client is what keeps the transcript and the
   * stream saying the same thing.
   */
  questions: AgentQuestion[] = []

  /** Whether the document changed, so the caller knows to persist it. */
  documentChanged = false

  constructor(files: ProjectFiles, document: SiteDocument | null = null) {
    this.files = { ...files }
    this.document = document
  }

  get hasDocument(): boolean {
    return this.document !== null
  }

  /**
   * Bring the files back in line with the document.
   *
   * Called after every structured edit so `run_build`, the typecheck and the
   * render all see the project as it will actually be saved. Verifying the
   * files from BEFORE the edit would be a gate that checks the wrong thing —
   * green on code nobody is going to ship.
   */
  private rerender(): void {
    if (!this.document) return
    const next = renderDocument(this.document, this.files)
    for (const [path, content] of Object.entries(next)) {
      if (this.files[path] === content) continue
      this.files[path] = content
      this.changed.add(path)
      this.deleted.delete(path)
      this.editsSinceBuild++
    }
  }


  /**
   * `typecheck` is injected rather than imported, for the same reason
   * `esbuild` is: this class runs in two places. The agent's run has Node and
   * the TypeScript compiler; the editor's preview worker has neither and must
   * stay instant. A missing typechecker means "not checked", never "clean".
   */
  async execute(
    name: string,
    argumentsJson: string,
    esbuild: unknown,
    typecheck?: (files: ProjectFiles) => Promise<{ ok: boolean; report: string } | null>,
    render?: (files: ProjectFiles) => Promise<{ ok: boolean; report: string } | null>,
  ): Promise<string> {
    let args: Record<string, unknown>
    try {
      args = argumentsJson.trim() ? JSON.parse(argumentsJson) : {}
    } catch {
      // Told, not thrown: the next call is usually well-formed.
      return "Your arguments were not valid JSON. Send the arguments again as a JSON object."
    }

    const path = typeof args.path === "string" ? args.path : ""
    const content = typeof args.content === "string" ? args.content : ""

    if ((DOCUMENT_TOOL_NAMES as readonly string[]).includes(name)) {
      if (!this.document) {
        return "This site has no editable layout — it is a code project. Use the file tools instead."
      }
      const result = executeDocumentTool(name as DocumentToolName, args, this.document)
      if (result.doc) {
        this.document = result.doc
        this.documentChanged = true
        this.rerender()
      }
      return result.output
    }

    switch (name) {
      case "search_code": {
        const query = typeof args.query === "string" ? args.query : ""
        if (!query.trim()) return "Send something to search for."

        const needle = query.toLowerCase()
        const hits: string[] = []
        for (const path of sortedPaths(this.files)) {
          const lines = this.files[path].split("\n")
          for (let i = 0; i < lines.length; i++) {
            if (!lines[i].toLowerCase().includes(needle)) continue
            hits.push(`${path}:${i + 1}: ${lines[i].trim().slice(0, 160)}`)
            // Capped so one common word cannot fill the turn with matches.
            if (hits.length >= 60) break
          }
          if (hits.length >= 60) break
        }

        if (hits.length === 0) return `No file contains "${query}".`
        return `${hits.length} match${hits.length === 1 ? "" : "es"} for "${query}":\n${hits.join("\n")}`
      }

      case "find_usages": {
        const wanted = typeof args.name === "string" ? args.name.trim() : ""
        if (!wanted) return "Which name?"

        // Rebuilt each call rather than cached: the project changes under this
        // during a run, and a map from three edits ago is a confident lie.
        const map = buildRepoMap(this.files)
        const found = findUsages(map, wanted)

        if (found.definedIn.length === 0 && found.renderedIn.length === 0) {
          return `Nothing exports or renders "${wanted}". Try search_code for the text itself.`
        }

        const lines = [
          found.definedIn.length
            ? `Defined in: ${found.definedIn.join(", ")}`
            : `Not exported by any file — it may be defined inside one, or come from a package.`,
          found.importedBy.length ? `Imported by: ${found.importedBy.join(", ")}` : "Imported by: nothing",
          found.renderedIn.length ? `Rendered in: ${found.renderedIn.join(", ")}` : "Rendered in: nothing",
        ]

        /**
         * The one inference worth stating outright, because it is nearly always
         * the answer to "why is my new section not showing".
         */
        const importedNotRendered = found.importedBy.filter((p) => !found.renderedIn.includes(p))
        if (found.definedIn.length && importedNotRendered.length) {
          lines.push(
            `Note: ${importedNotRendered.join(", ")} import${
              importedNotRendered.length === 1 ? "s" : ""
            } it but never render${importedNotRendered.length === 1 ? "s" : ""} it.`,
          )
        }

        return lines.join("\n")
      }

      case "replace_in_file": {
        const invalid = filePathError(path)
        if (invalid) return `Cannot edit "${path}": ${invalid}`
        const file = this.files[path]
        if (file === undefined) return this.noSuchFile(path)

        const oldText = typeof args.old === "string" ? args.old : ""
        const newText = typeof args.new === "string" ? args.new : ""
        if (!oldText) return "Send the exact text to replace."

        /**
         * Refused when the text appears more than once. Replacing the first of
         * several identical strings is a silent, plausible-looking corruption
         * — the file still compiles and the wrong line changed.
         */
        const first = file.indexOf(oldText)
        if (first === -1) {
          return `That text is not in "${path}". Read the file again — it may have changed, or the indentation may differ.`
        }
        if (file.indexOf(oldText, first + 1) !== -1) {
          return `That text appears more than once in "${path}". Include more surrounding lines so it matches exactly one place.`
        }

        const updated = file.slice(0, first) + newText + file.slice(first + oldText.length)
        const tooBig = fileSizeError(path, updated)
        if (tooBig) return tooBig

        this.files[path] = updated
        this.changed.add(path)
        this.deleted.delete(path)
        this.editsSinceBuild++
        return `Edited ${path} (${oldText.split("\n").length} line${
          oldText.split("\n").length === 1 ? "" : "s"
        } replaced).`
      }

      case "ask_creator": {
        /**
         * ONCE PER RUN. A model that asks, builds a little, and asks again
         * turns the chat into an interrogation — and the second batch arrives
         * after the creator has already started answering the first.
         */
        if (this.questions.length > 0) {
          return "You have already asked this run. Keep building with the defaults you chose; the answers arrive as a separate message."
        }

        const questions = parseQuestions(args)
        if (questions.length === 0) {
          return "No usable questions — each one needs a `question` string. Ask about the business (its name, where it is, its prices, its hours), not about code."
        }

        this.questions = questions
        return askedNote(questions)
      }

      case "set_plan": {
        const raw = Array.isArray(args.steps) ? args.steps : []
        const titles = raw.filter((t): t is string => typeof t === "string")
        if (titles.length === 0) return "Send at least one step."

        this.plan = setSteps(this.plan, titles)
        return `Plan set — ${this.plan.steps.length} step${
          this.plan.steps.length === 1 ? "" : "s"
        }:\n${this.plan.steps
          .map((s, i) => `  ${i + 1}. ${s.done ? "[done] " : ""}${s.title}`)
          .join("\n")}`
      }

      case "complete_step": {
        const step = typeof args.step === "string" ? args.step : ""
        if (!step.trim()) return "Which step?"

        const result = completeStep(this.plan, step)
        if (!result.found) {
          const open = this.plan.steps.filter((s) => !s.done)
          return open.length === 0
            ? "Every step is already marked complete."
            : `No open step matches "${step}". Open steps:\n${open.map((s) => `  - ${s.title}`).join("\n")}`
        }

        this.plan = result.plan
        const left = this.plan.steps.filter((s) => !s.done)
        return left.length === 0
          ? "That was the last step. Build if you have not, then finish."
          : `Done. ${left.length} left:\n${left.map((s) => `  - ${s.title}`).join("\n")}`
      }

      case "update_manifest": {
        const fields = [
          "business",
          "purpose",
          "audience",
          "siteType",
          "primaryGoal",
          "tone",
          "designDirection",
          "decision",
        ]
        const update: Record<string, string> = {}
        for (const field of fields) {
          const value = args[field]
          if (typeof value === "string" && value.trim()) update[field] = value.trim()
        }
        if (Object.keys(update).length === 0) {
          return "Nothing recorded — send at least one field, and only if something durable was established."
        }
        // Merged rather than replaced: two calls in one run should not make
        // the second silently discard the first.
        this.manifestUpdate = { ...(this.manifestUpdate ?? {}), ...update }
        return "Recorded."
      }

      case "list_files":
        return sortedPaths(this.files)
          .map((p) => `${p} (${this.files[p].length} chars)`)
          .join("\n")

      case "read_file": {
        const invalid = filePathError(path)
        if (invalid) return `Cannot read "${path}": ${invalid}`
        const file = this.files[path]
        if (file === undefined) return this.noSuchFile(path)
        return file.length > MAX_READ_CHARS
          ? `${file.slice(0, MAX_READ_CHARS)}\n\n[truncated at ${MAX_READ_CHARS} characters]`
          : file
      }

      case "write_file": {
        const invalid = filePathError(path)
        if (invalid) return `Cannot write "${path}": ${invalid}`
        const tooBig = fileSizeError(path, content)
        if (tooBig) return tooBig
        if (this.files[path] === undefined) {
          return `"${path}" does not exist. Use create_file to make it, or list_files to see what does.`
        }
        this.files[path] = content
        this.changed.add(path)
        this.deleted.delete(path)
        this.editsSinceBuild++
        return `Wrote ${path} (${content.length} chars).`
      }

      case "create_file": {
        const invalid = filePathError(path)
        if (invalid) return `Cannot create "${path}": ${invalid}`
        if (this.files[path] !== undefined) {
          return `"${path}" already exists. Use write_file to replace it.`
        }
        if (Object.keys(this.files).length >= MAX_FILES_PER_PROJECT) {
          return `This site is at its limit of ${MAX_FILES_PER_PROJECT} files.`
        }
        const tooBig = fileSizeError(path, content)
        if (tooBig) return tooBig
        this.files[path] = content
        this.changed.add(path)
        this.deleted.delete(path)
        this.editsSinceBuild++
        return `Created ${path} (${content.length} chars).`
      }

      case "delete_file": {
        if (this.files[path] === undefined) return this.noSuchFile(path)
        // index.html and the entry are the project. Deleting either leaves a
        // site that cannot build, and the model has no way to know that is
        // load-bearing rather than tidying.
        if (path === "index.html" || path === "package.json") {
          return `"${path}" is required and cannot be deleted.`
        }
        delete this.files[path]
        this.changed.delete(path)
        this.deleted.add(path)
        this.editsSinceBuild++
        return `Deleted ${path}.`
      }

      case "run_build": {
        /**
         * CREDENTIALS FIRST, because this one is free, deterministic, and true
         * whether or not the project compiles.
         *
         * A model asked to "make the contact form send email" writes a key. It
         * is not malice and it is not rare, and the next thing that happens to
         * these files is a publish onto a public bucket behind a CDN — at
         * which point the key is not exposed, it is published. Told here, the
         * model removes it in the same run.
         */
        const leaked = scanForSecrets(this.files)
        if (leaked.length > 0) {
          this.lastBuildOk = false
          this.lastProblem = "secret"
          return (
            `A CREDENTIAL IS WRITTEN INTO THIS PROJECT. A published site is public files on a CDN, so this cannot ship.\n` +
            leaked
              .map((f) => `  ${f.file}${f.line ? `:${f.line}` : ""} — ${f.message}`)
              .join("\n") +
            `\nRemove it. If the page needs a service that requires a key, say so in your reply instead of embedding one — the browser is not a place to keep a secret.`
          )
        }

        this.lastBuild = await bundleProject(esbuild as never, this.files)
        // Cleared HERE, before the verdict is recorded, so the verdict below
        // describes exactly the tree that was just compiled.
        this.editsSinceBuild = 0

        /**
         * Recorded, not just returned. The completion gate needs to know
         * whether this project compiles — a run may not finish on a red build,
         * and "the model said it built" is not the same as it having built.
         */
        const bundled = this.lastBuild.ok
        const report = formatBuildErrors(this.lastBuild)

        if (!bundled) {
          this.lastBuildOk = false
          this.lastProblem = "bundle"
          return report
        }

        /**
         * ESBUILD STRIPS TYPES, IT DOES NOT CHECK THEM.
         *
         * A green bundle means "this parses" and says nothing about a prop
         * passed with the wrong shape or a property that does not exist. So
         * the agent, told not to finish on a failing build, could finish on a
         * project that throws the moment somebody opens it. Types are checked
         * here, where the answer can still change what the run does.
         */
        const types = typecheck ? await typecheck(this.files).catch(() => null) : null

        if (types && !types.ok) {
          this.lastBuildOk = false
          this.lastProblem = "types"
          return `${report}\n\n${types.report}`
        }

        /**
         * AND DOES IT ACTUALLY RUN?
         *
         * The two checks above prove the project parses and that its types
         * line up. Neither executes a line of it, so neither has an opinion
         * about `const items = null` followed by `items.map(…)` — which
         * bundles, typechecks, and shows a blank page the moment it is opened.
         * The page is rendered once, here, before the run may finish.
         */
        const rendered = render ? await render(this.files).catch(() => null) : null

        if (rendered && !rendered.ok) {
          this.lastBuildOk = false
          this.lastProblem = "render"
          return `${report}\n\n${rendered.report}`
        }

        /**
         * Cannot check is not the same as clean. It is recorded as a pass
         * because the bundle DID pass and refusing to finish over a missing
         * compiler would strand every run on a deployment without one — but
         * the two checks above are the ones that make a green build mean
         * something, and their absence is logged where it happens, not here.
         */
        this.lastBuildOk = true
        this.lastProblem = null
        return report
      }

      case "read_build_errors":
        return this.lastBuild
          ? formatBuildErrors(this.lastBuild)
          : "No build has been run yet. Call run_build first."

      default:
        return `There is no tool called "${name}". Available: ${TOOL_SPECS.map((t) => t.name).join(", ")}.`
    }
  }

  /**
   * The last build's verdict — null once it stops describing the project.
   *
   * Null means "not checked", never "clean". Both callers treat it that way:
   * the completion gate refuses to finish on it, and the loop builds for
   * itself rather than saving on an answer about a tree that no longer exists.
   */
  get buildOk(): boolean | null {
    return this.editsSinceBuild > 0 ? null : this.lastBuildOk
  }

  /** The last build's output, for the loop's own check before it saves. */
  get buildResult(): BuildResult | null {
    return this.editsSinceBuild > 0 ? null : this.lastBuild
  }

  /** Why the last verdict was red, in one sentence for the creator. */
  get buildProblem(): string {
    switch (this.lastProblem) {
      case "secret":
        return "The edit wrote a credential into the project, so nothing was changed."
      case "types":
        return "The edit did not typecheck, so nothing was changed."
      case "render":
        return "The edit compiled but the page threw when it was rendered, so nothing was changed."
      case "bundle":
      default:
        return "The edit did not compile, so nothing was changed."
    }
  }

  /** Only what changed. A whole-project write would clobber untouched files. */
  changedFiles(): ProjectFiles {
    const out: ProjectFiles = {}
    for (const path of this.changed) out[path] = this.files[path]
    return out
  }

  private noSuchFile(path: string): string {
    const nearby = sortedPaths(this.files).slice(0, 40).join(", ")
    return `"${path}" does not exist. The project holds: ${nearby}`
  }
}
