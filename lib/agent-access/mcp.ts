/**
 * ===========================================================================
 *  STORELIB AS AN MCP SERVER
 * ===========================================================================
 * The Model Context Protocol is how Claude Code, Codex, Cursor and others
 * take tools from a server. This answers its JSON-RPC over plain HTTP
 * (the "Streamable HTTP" transport, stateless: every POST is complete in
 * itself, and there is no server-sent stream to hold open on a serverless
 * function).
 *
 * The tools are ./operations.ts and nothing else, so an agent over MCP can do
 * exactly what an agent over the REST API can, and no more.
 *
 * Pure: it is handed the operations already bound to one connection, so it
 * can be tested without a request, a database or a token.
 * See tests/agent-connection.test.ts.
 */
import type { ThemeError } from "@/lib/storelib-theme/types"
import type { FileEntry, OpResult } from "./operations"
import type { SiteBrief } from "./site-brief"
import { PAGE_OP_NAMES } from "./page-ops"
import { agentRulesBrief, agentRulesText } from "@/lib/agent-rules"
import { skillById, skillIndex, skillText, skillsForRequest } from "@/lib/agent-skills"

/** The protocol versions this server can speak, newest first. */
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const

export interface BoundOps {
  siteName: string
  agentName: string
  list: () => Promise<OpResult<{ framework: { engine: number; schema: number }; docs: string; writable: string; files: FileEntry[] }>>
  read: (path: string) => Promise<OpResult<{ path: string; source: string; origin: string; updated_at: string | null }>>
  compile: (path: string, source: string) => OpResult<{ path: string; warnings: ThemeError[] }>
  write: (path: string, source: string, baseUpdatedAt?: string) => Promise<OpResult<{ path: string; type: string; created: boolean; drafted: boolean; updated_at: string | null }>>
  guide: () => string
  /** The rules every agent follows before shipping code. Optional so older test doubles still bind. */
  rules?: () => string
  /** What the website is: see ./site-brief.ts. Optional so older test doubles still bind. */
  site?: () => Promise<OpResult<SiteBrief>>
  /**
   * The project tools (./project.ts): pages, settings, tests and preview.
   * Each answers text for the agent. Optional so older test doubles bind.
   */
  project?: ProjectOps
  /**
   * AI Memory for this website (lib/ai-memory/store.ts), bound to the token's
   * creator and website in ./bind.ts. Optional so older test doubles bind.
   */
  memory?: MemoryOps
}

type Args = Record<string, unknown>
export interface MemoryOps {
  /** This website's notes and the creator's everywhere ones, as the block every agent is shown, with ids. */
  read: () => Promise<OpResult<string>>
  /** Keep one note for this website, from what the creator said or confirmed. */
  remember: (args: Args) => Promise<OpResult<string>>
  /** Delete one of this website's notes by its id. */
  forget: (args: Args) => Promise<OpResult<string>>
}
export interface ProjectOps {
  readProject: () => Promise<OpResult<string>>
  readPage: (args: Args) => Promise<OpResult<string>>
  readSelectedSection: (args: Args) => Promise<OpResult<string>>
  searchComponents: (args: Args) => Promise<OpResult<string>>
  createSection: (args: Args) => Promise<OpResult<string>>
  editSection: (args: Args) => Promise<OpResult<string>>
  /** Optional so older test doubles still bind. */
  patchSection?: (args: Args) => Promise<OpResult<string>>
  updateStyles: (args: Args) => Promise<OpResult<string>>
  createPage: (args: Args) => Promise<OpResult<string>>
  createSafePatch: (args: Args) => Promise<OpResult<string>>
  runTests: (args: Args) => Promise<OpResult<string>>
  runPreview: (args: Args) => Promise<OpResult<string>>
}

type Json = Record<string, unknown>
export interface RpcRequest { jsonrpc?: string; id?: string | number | null; method?: string; params?: Json }
export type RpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } }

const PATH = { type: "string", description: 'A theme path, such as "sections/price_table.storelib".' }
const SOURCE = { type: "string", description: "The WHOLE .storelib file: <template>, optional <style> and <script>, and <schema>." }

export const TOOLS = [
  {
    name: "storelib_rules",
    description:
      "The rules every agent follows on a Storelib site. Read them FIRST, before any other call: what you may change (section files only, never a built-in section), how every link, button and menu is made editable, how to split a screenshot into sections, menus and sheets, motion, phones and iOS, and the checks before you say it is done.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "storelib_guide",
    description:
      "The Storelib Builder Framework: the file format, template language, schema, styling and script rules. Read this BEFORE writing any section. The template language is not Vue, React or JSX.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "storelib_site",
    description:
      "What this website is: its name and address, brand, title and description, fonts and colour schemes, the sections on each page, and its published products with prices and ids. Read it before writing a section, so the section fits this site and sells what it really sells.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "storelib_list_files",
    description:
      "Every file of this site's theme. origin is \"yours\" for files the creator (or an agent) saved and \"theme\" for the shipped ones. writable says whether you may write it: sections/<type>.storelib and blocks/<type>.storelib, never a built-in section or block (write a new one beside it), and the theme settings: config/settings_schema.json says what they are, Shopify's format, and config/settings_data.json holds their values as { \"current\": { ... } }.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "storelib_read_file",
    description: "Read one file: the saved draft where there is one, else the shipped version. Returns updated_at, to send back when writing so a newer save is never overwritten.",
    inputSchema: { type: "object", properties: { path: PATH }, required: ["path"], additionalProperties: false },
  },
  {
    name: "storelib_compile",
    description:
      "Compile a section file WITHOUT saving it. Returns every error as file:line message. Run this until it is clean, then write. Fix the line an error names; do not rewrite the file.",
    inputSchema: { type: "object", properties: { path: PATH, source: SOURCE }, required: ["path", "source"], additionalProperties: false },
  },
  {
    name: "storelib_write_section",
    description:
      "Save a section or theme block file as a DRAFT. It is compiled first and refused with its errors if it does not compile. A new section appears on the page the creator has open in the builder; a new block appears in Add block for every section that accepts it. Nothing reaches visitors until the creator publishes. Only sections/<type>.storelib or blocks/<type>.storelib, lower case, or a theme settings file: config/settings_schema.json (add, reorder or regroup theme settings, change a label, default or range; Storelib's own settings keep their id, type and group) or config/settings_data.json (their values; a value you leave out stays, null puts one back to its default). Either is checked and refused with its lines, and Theme settings in the builder follow at once.",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        source: SOURCE,
        base_updated_at: { type: "string", description: "updated_at from storelib_read_file, when changing an existing file." },
      },
      required: ["path", "source"],
      additionalProperties: false,
    },
  },
] as const

const NONE = { type: "object", properties: {}, additionalProperties: false } as const
const PAGE = { type: "string", description: 'A page key from storelib_read_project, such as "home" or "about". Leave it out for the page open in the builder, else home.' }
const SETTINGS = { type: "object", description: "Setting id to value, using only ids the section, block or theme declares. Unknown ids and values a control cannot take are refused with the list of what it takes.", additionalProperties: true }
const OP = {
  type: "object",
  description: "One page operation. add_section: section_type, index?, settings?. update_section: section_id, settings. move_section: section_id, index. remove_section / set_section_visibility (hidden) / rename_section (name): section_id. add_block: section_id, block_type, index?, settings?, parent_block_id? (a group's path, to add inside it). update_block / move_block / remove_block: section_id, block_id (a path such as outer/inner for a block inside another). update_theme: settings.",
  properties: {
    op: { type: "string", enum: PAGE_OP_NAMES },
    section_id: { type: "string" },
    section_type: { type: "string" },
    block_id: { type: "string" },
    block_type: { type: "string" },
    parent_block_id: { type: "string" },
    index: { type: "number" },
    hidden: { type: "boolean" },
    name: { type: "string" },
    settings: SETTINGS,
  },
  required: ["op"],
  additionalProperties: false,
} as const

/**
 * THE PROJECT TOOLS, the eleven on the mcp.storelib.com diagram plus the
 * skills. Named for what they do, in the order an agent reaches for them.
 */
export const PROJECT_TOOLS = [
  {
    name: "storelib_skills",
    description:
      "The skills for a task: steps, tools, the part of the framework it touches, what goes wrong and the checks that say it is done. Pass `task` in your own words (\"make the FAQ buttons darker\") to get only the skills it needs, or `id` for one. With neither, the list.",
    inputSchema: { type: "object", properties: { task: { type: "string" }, id: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "storelib_read_project",
    description: "The whole project in one read: the site brief, every page, the creator's own section types, the theme blocks Add block offers, where each part of Theme settings is (Storelib's own settings, menus, colour schemes), and what is open in the builder right now.",
    inputSchema: NONE,
  },
  {
    name: "storelib_read_page",
    description: "One page's sections in order, with ids, types, settings and blocks. Defaults to the page open in the builder.",
    inputSchema: { type: "object", properties: { page: PAGE }, additionalProperties: false },
  },
  {
    name: "storelib_read_selected_section",
    description: "The section the creator has selected in the builder (or the one named by section_id): every control it has with its type and range, its current settings and blocks, and whether its file can be changed.",
    inputSchema: { type: "object", properties: { page: PAGE, section_id: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "storelib_search_components",
    description: "Search the sections this site can use, the built-in library and the creator's own, by what they are for (\"testimonials slider\", \"pricing\"). Use it before writing a new section.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"], additionalProperties: false },
  },
  {
    name: "storelib_create_section",
    description: "Save a NEW section file (sections/<type>.storelib) as a draft and, with `page`, place it on that page. It must compile and pass the quality checks, or it is refused with what to fix and nothing is saved.",
    inputSchema: { type: "object", properties: { path: PATH, source: SOURCE, page: PAGE, index: { type: "number" } }, required: ["path", "source"], additionalProperties: false },
  },
  {
    name: "storelib_edit_section",
    description: "Save a change to a section file the creator already has. Send base_updated_at from storelib_read_file. Built-in sections cannot be changed. Compile and quality are checked first; the previous version is kept.",
    inputSchema: { type: "object", properties: { path: PATH, source: SOURCE, base_updated_at: { type: "string" } }, required: ["path", "source"], additionalProperties: false },
  },
  {
    name: "storelib_patch_section",
    description: "Change PART of a section file the creator already has: exact find-and-replace edits, each find copied from storelib_read_file and in the file exactly once. Costs a fraction of resending the file and cannot touch lines you did not name. Send base_updated_at. The result is compiled and quality checked like storelib_edit_section, saved as a draft, and the previous version is kept.",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        edits: {
          type: "array",
          items: {
            type: "object",
            properties: { find: { type: "string" }, replace: { type: "string" } },
            required: ["find", "replace"],
            additionalProperties: false,
          },
        },
        base_updated_at: { type: "string" },
      },
      required: ["path", "edits"],
      additionalProperties: false,
    },
  },
  {
    name: "storelib_update_styles",
    description: "Change settings: colours, colour scheme, button colours and hover, spacing, alignment, type, backgrounds. scope \"section\" (section_id), \"block\" (section_id, block_id) or \"theme\" for the whole site: the theme's settings, its own config/settings_schema.json ones included, menus, colour schemes, and on an imported theme Storelib's Hover and focus (storelib_* ids). Checked against what the section or theme declares. A restore point is taken first.",
    inputSchema: {
      type: "object",
      properties: { scope: { type: "string", enum: ["section", "block", "theme"] }, page: PAGE, section_id: { type: "string" }, block_id: { type: "string" }, settings: SETTINGS },
      required: ["settings"],
      additionalProperties: false,
    },
  },
  {
    name: "storelib_create_page",
    description: "Make a new page with the site's header and footer and the section types listed, each filled from its preset. Its address comes from the title.",
    inputSchema: { type: "object", properties: { title: { type: "string" }, sections: { type: "array", items: { type: "string" } } }, required: ["title"], additionalProperties: false },
  },
  {
    name: "storelib_create_safe_patch",
    description: "Several page operations as ONE change: every operation is checked first, and if any is refused nothing is written. A restore point of the whole site is taken before it is applied, and the page checks run after.",
    inputSchema: { type: "object", properties: { page: PAGE, label: { type: "string" }, ops: { type: "array", items: OP } }, required: ["ops"], additionalProperties: false },
  },
  {
    name: "storelib_run_tests",
    description: "Run the checks: compile and quality for a section file (path), and page-types, page-settings, contrast and limits for a page. Pass `request` to run the checks your task's skills name, or `checks` to choose.",
    inputSchema: {
      type: "object",
      properties: { path: PATH, page: PAGE, request: { type: "string" }, checks: { type: "array", items: { type: "string", enum: ["compile", "quality", "page-types", "page-settings", "contrast", "limits"] } } },
      additionalProperties: false,
    },
  },
  {
    name: "storelib_run_preview",
    description: "A link to the page as the drafts make it, to open at phone and desktop width, the builder link, and the page checks.",
    inputSchema: { type: "object", properties: { page: PAGE }, additionalProperties: false },
  },
] as const

/**
 * AI MEMORY, the same notes Storelib AI keeps (lib/ai-memory/store.ts):
 * brand voice, design decisions, likes and dislikes, facts, preferences.
 * Read is the whole block; a write is one note for THIS website only, and a
 * forget reaches only this website's notes. Never a secret.
 */
export const MEMORY_TOOLS = [
  {
    name: "storelib_memory_read",
    description: "What the creator told Storelib AI or a connected agent to remember: brand voice, design decisions, likes and dislikes, facts about the business, preferences. Follow it unless the creator says otherwise now. Each note has an id in square brackets.",
    inputSchema: NONE,
  },
  {
    name: "storelib_memory_remember",
    description: "Keep one short note for this website in AI Memory, only something the creator said or confirmed (\"never use gradients\", \"we write in a warm, plain voice\"). Not what you changed, and never a password, key or personal data. The creator sees and can delete it.",
    inputSchema: { type: "object", properties: { note: { type: "string", description: "One sentence, under 240 characters." } }, required: ["note"], additionalProperties: false },
  },
  {
    name: "storelib_memory_forget",
    description: "Delete one of this website's notes from AI Memory by its id from storelib_memory_read, only when the creator says it is wrong or asks you to forget it.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
  },
] as const

/** Prompts: the rules, and the rules with a task's skills. Clients show them as slash commands. */
export const PROMPTS = [
  { name: "storelib-rules", title: "Storelib agent rules", description: "The rules and workflow every agent follows on a Storelib site." },
  {
    name: "storelib-task",
    title: "Work on this Storelib site",
    description: "The rules, and the skills for the task you describe.",
    arguments: [{ name: "task", description: "What you are about to do, in your own words.", required: true }],
  },
] as const

export const RESOURCES = [
  { uri: "storelib://rules", name: "rules", title: "Storelib agent rules", mimeType: "text/markdown" },
  { uri: "storelib://guide", name: "guide", title: "Storelib Builder Framework", mimeType: "text/markdown" },
  { uri: "storelib://skills", name: "skills", title: "Storelib skills", mimeType: "text/plain" },
] as const

/** Every rule an agent reads: the universal ones, then the detailed page. */
function rulesFor(ops: BoundOps): string {
  const page = ops.rules ? ops.rules() : ""
  return page ? `${agentRulesText()}\n\n---\n\n${page}` : agentRulesText()
}

function text(value: string, isError = false) {
  return { content: [{ type: "text", text: value }], ...(isError ? { isError: true } : {}) }
}

/** Compiler errors the way an agent fixes them fastest: file:line message. */
export function formatErrors(errors: ThemeError[] | undefined): string {
  return (errors ?? [])
    .slice(0, 40)
    .map((e) => `${e.file ?? ""}${e.line ? `:${e.line}` : ""} ${e.message}`.trim())
    .join("\n")
}

function refusal<T>(r: OpResult<T>): ReturnType<typeof text> | null {
  if (r.ok === true) return null
  const detail = formatErrors(r.errors)
  return text(detail ? `${r.error}\n${detail}` : r.error, true)
}

function str(params: Json | undefined, key: string): string {
  const v = params?.[key]
  return typeof v === "string" ? v : ""
}

/** Each project tool, to the bound operation that answers it. */
const PROJECT_CALLS: Record<string, (p: ProjectOps, args: Json) => Promise<OpResult<string>>> = {
  storelib_read_project: (p) => p.readProject(),
  storelib_read_page: (p, a) => p.readPage(a),
  storelib_read_selected_section: (p, a) => p.readSelectedSection(a),
  storelib_search_components: (p, a) => p.searchComponents(a),
  storelib_create_section: (p, a) => p.createSection(a),
  storelib_edit_section: (p, a) => p.editSection(a),
  storelib_patch_section: (p, a) =>
    p.patchSection ? p.patchSection(a) : Promise.resolve({ ok: false as const, status: 404, error: "Unknown tool: storelib_patch_section" }),
  storelib_update_styles: (p, a) => p.updateStyles(a),
  storelib_create_page: (p, a) => p.createPage(a),
  storelib_create_safe_patch: (p, a) => p.createSafePatch(a),
  storelib_run_tests: (p, a) => p.runTests(a),
  storelib_run_preview: (p, a) => p.runPreview(a),
}

/**
 * One JSON-RPC message in, its answer out, or null for a notification
 * (which, by the protocol, gets no answer).
 */
export async function handleMcp(msg: RpcRequest, ops: BoundOps): Promise<RpcResponse | null> {
  const id = msg.id ?? null
  const isNotification = msg.id === undefined
  const ok = (result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result })
  const fail = (code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } })

  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return isNotification ? null : fail(-32600, "Invalid request")
  }
  if (msg.method.startsWith("notifications/")) return null

  switch (msg.method) {
    case "initialize": {
      const asked = str(msg.params, "protocolVersion")
      const version = (PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : PROTOCOL_VERSIONS[0]
      /* What the creator asked to be remembered, in the context from the first message, like Storelib AI's own runs. */
      const remembered = ops.memory ? await ops.memory.read().catch(() => null) : null
      const memoryNote = remembered && remembered.ok === true && remembered.value ? `\n\n${remembered.value}` : ""
      return ok({
        protocolVersion: version,
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: { name: "storelib", title: "Storelib", version: "2.0.0" },
        /* Clients put this in the model's context on connect: the rules arrive without being asked for. */
        instructions: agentRulesBrief({ siteName: ops.siteName, agentName: ops.agentName }) + memoryNote,
      })
    }
    case "ping":
      return ok({})
    case "tools/list":
      return ok({ tools: [...(ops.project ? [...TOOLS, ...PROJECT_TOOLS] : [...TOOLS, PROJECT_TOOLS[0]]), ...(ops.memory ? MEMORY_TOOLS : [])] })
    case "prompts/list":
      return ok({ prompts: PROMPTS })
    case "prompts/get": {
      const name = str(msg.params, "name")
      const promptArgs = (msg.params?.arguments && typeof msg.params.arguments === "object" ? msg.params.arguments : {}) as Json
      if (name === "storelib-rules") {
        return ok({ description: PROMPTS[0].description, messages: [{ role: "user", content: { type: "text", text: rulesFor(ops) } }] })
      }
      if (name === "storelib-task") {
        const task = str(promptArgs, "task").slice(0, 4_000)
        if (!task) return fail(-32602, "The storelib-task prompt needs a task.")
        const body = [agentRulesText(), skillsForRequest(task), `TASK\n${task}`].join("\n\n")
        return ok({ description: PROMPTS[1].description, messages: [{ role: "user", content: { type: "text", text: body } }] })
      }
      return fail(-32602, `Unknown prompt: ${name}`)
    }
    case "resources/list":
      return ok({ resources: RESOURCES })
    case "resources/read": {
      const uri = str(msg.params, "uri")
      const body = uri === "storelib://rules" ? rulesFor(ops) : uri === "storelib://guide" ? ops.guide() : uri === "storelib://skills" ? skillIndex() : null
      if (body === null) return fail(-32602, `Unknown resource: ${uri}`)
      return ok({ contents: [{ uri, mimeType: uri === "storelib://skills" ? "text/plain" : "text/markdown", text: body }] })
    }
    case "tools/call": {
      const name = str(msg.params, "name")
      const args = (msg.params?.arguments && typeof msg.params.arguments === "object" ? msg.params.arguments : {}) as Json
      switch (name) {
        case "storelib_rules":
          return ok(text(rulesFor(ops)))
        case "storelib_skills": {
          const id = str(args, "id")
          const task = str(args, "task")
          if (id) {
            const skill = skillById(id)
            return ok(skill ? text(skillText(skill)) : text(`There is no skill "${id}". The skills:\n${skillIndex()}`, true))
          }
          if (task) return ok(text(skillsForRequest(task)))
          return ok(text(`Pass task (what you are about to do) for the skills it needs, or id for one:\n${skillIndex()}`))
        }
        case "storelib_guide":
          return ok(text(ops.guide()))
        case "storelib_site": {
          if (!ops.site) return fail(-32602, "Unknown tool: storelib_site")
          const r = await ops.site()
          return ok(refusal(r) ?? text(JSON.stringify(r.ok === true ? r.value : null, null, 2)))
        }
        case "storelib_list_files": {
          const r = await ops.list()
          return ok(refusal(r) ?? text(JSON.stringify(r.ok === true ? r.value : null, null, 2)))
        }
        case "storelib_read_file": {
          const r = await ops.read(str(args, "path"))
          if (r.ok === false) return ok(refusal(r))
          return ok(text(`${r.value.path} (${r.value.origin}, updated_at ${r.value.updated_at ?? "never saved"})\n\n${r.value.source}`))
        }
        case "storelib_compile": {
          const r = ops.compile(str(args, "path"), str(args, "source"))
          if (r.ok === false) return ok(refusal(r))
          const warnings = formatErrors(r.value.warnings)
          return ok(text(`${r.value.path} compiles.${warnings ? `\nWarnings:\n${warnings}` : ""}`))
        }
        case "storelib_write_section": {
          const base = str(args, "base_updated_at")
          const r = await ops.write(str(args, "path"), str(args, "source"), base || undefined)
          if (r.ok === false) return ok(refusal(r))
          const v = r.value
          return ok(
            text(
              `${v.path} saved as a draft${v.created ? ", a new section" : ""}. updated_at ${v.updated_at ?? "unknown"}. ` +
                (v.created
                  ? "If the creator has the builder open it is on their page now; otherwise it is in Add Section under Created. "
                  : "The builder shows the change. ") +
                "It goes live when they publish.",
            ),
          )
        }
        case "storelib_memory_read":
        case "storelib_memory_remember":
        case "storelib_memory_forget": {
          if (!ops.memory) return fail(-32602, `Unknown tool: ${name}`)
          const r = name === "storelib_memory_read" ? await ops.memory.read() : name === "storelib_memory_remember" ? await ops.memory.remember(args) : await ops.memory.forget(args)
          return ok(refusal(r) ?? text(r.ok === true ? r.value || "AI Memory has no notes for this website yet." : ""))
        }
        default: {
          const project = ops.project ? PROJECT_CALLS[name] : undefined
          if (!project || !ops.project) return fail(-32602, `Unknown tool: ${name}`)
          const r = await project(ops.project, args)
          return ok(refusal(r) ?? text(r.ok === true ? r.value : ""))
        }
      }
    }
    default:
      return isNotification ? null : fail(-32601, `Method not found: ${msg.method}`)
  }
}
