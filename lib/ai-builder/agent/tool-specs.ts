/**
 * The 17 tools as the provider sees them: JSON schemas built from the
 * contract's input shapes (lib/ai-builder/agent-tools.ts AgentToolInputs).
 * Keep the two in step; tests/ai-builder-agent.test.ts checks every name has
 * exactly one spec.
 */
import type { ToolSpec } from "@/lib/sites/agent/types"
import { AGENT_TOOL_NAMES, type AgentToolName } from "../types"
import { CONCEPT_SCHEMA } from "./concept"

const PHASES = ["brief", "plan", "build", "verify", "repair", "finish"]
const KINDS = ["style", "layout", "component", "motion", "industry", "anti_slop", "resource", "core", "storelib", "debugging"]
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false })
const str = (description: string) => ({ type: "string", description })

const PLACED_SECTION = obj(
  {
    id: str("Keep an existing section's id to update it in place. Omit for a new one."),
    type: str("ai_<slug> (a component you wrote), or a native type in theme mode."),
    settings: { type: "object", description: "Values for the component's settings, by setting id." },
    blocks: { type: "array", items: obj({ id: { type: "string" }, type: { type: "string" }, settings: { type: "object" } }, ["type"]) },
    group: { type: "string", enum: ["header", "footer", "overlay"], description: "Only for a header, footer or overlay component. Site-wide: shown on every page." },
    hidden: { type: "boolean" },
  },
  ["type"],
)

const MANIFEST = {
  type: "object",
  description: "Optional. The component's editable props; written into the file's <schema> for you (replaces any <schema> in content).",
  properties: {
    type: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    category: { type: "string" },
    runtime: { type: "string", enum: ["storelib"] },
    props: { type: "array", items: { type: "object" } },
    items: { type: "array", items: { type: "object" } },
    maxItems: { type: "number" },
    placement: { type: "object" },
    capabilities: { type: "array", items: { type: "string" } },
  },
  required: ["type", "name", "props", "placement", "capabilities", "runtime"],
}

export const TOOL_SPECS: Record<AgentToolName, ToolSpec<AgentToolName>> = {
  list_files: { name: "list_files", description: "List the website's files (paths and when each was saved). Theme files are readable; you write only sections/ai_*, blocks/ai_*, snippets/ai_* .storelib files.", parameters: obj({ prefix: str("Only paths starting with this, e.g. \"sections/\".") }) },
  read_file: { name: "read_file", description: "Read a file's current draft text and its version. Read a file before you edit it; also works for the theme's own sections, as examples.", parameters: obj({ path: str("e.g. sections/ai_hero.storelib") }, ["path"]) },
  write_file: { name: "write_file", description: "Write a whole component file (.storelib: <template>, <style scoped>, optional <script>, <schema>). It is compiled and checked first; a file with errors is NOT saved and the errors come back with line numbers. Saved as a draft.", parameters: obj({ path: str("sections/ai_<slug>.storelib or blocks/ai_<slug>.storelib"), content: str("The whole file."), manifest: MANIFEST }, ["path", "content"]) },
  edit_file: { name: "edit_file", description: "Replace one exact piece of a file you have read. `old` must occur exactly once. Checked like write_file. Prefer this for small changes.", parameters: obj({ path: { type: "string" }, old: { type: "string" }, new: { type: "string" } }, ["path", "old", "new"]) },
  delete_file: { name: "delete_file", description: "Delete one of your ai_ component files. Remove it from every page first.", parameters: obj({ path: { type: "string" } }, ["path"]) },
  list_pages: { name: "list_pages", description: "The website's pages and the sections on each (id, type, group).", parameters: obj({}) },
  add_page: { name: "add_page", description: "Add a page. Its address is /<key>; it is added to the site's Main menu (the header's links) and gets its own search title and description.", parameters: obj({ key: str("lowercase letters, digits and dashes, e.g. coaching"), title: str("What the menu and the tab call it."), seo: obj({ title: { type: "string" }, description: { type: "string" } }) }, ["key", "title"]) },
  set_page_sections: { name: "set_page_sections", description: "Set a page's sections, in order. Sections you leave out are removed from that page; header/footer sections (with `group`) are site-wide and only change when you send one.", parameters: obj({ page: str("Page key, e.g. home"), sections: { type: "array", items: PLACED_SECTION } }, ["page", "sections"]) },
  set_section_settings: { name: "set_section_settings", description: "Change some settings of one placed section; the others keep their values.", parameters: obj({ page: { type: "string" }, sectionId: { type: "string" }, settings: { type: "object" } }, ["page", "sectionId", "settings"]) },
  set_tokens: {
    name: "set_tokens",
    description: "Set the website's design tokens. They become Theme settings the creator can change: colours become the `site` and `site_inverse` colour schemes; fonts, corner radius, spacing and motion their Theme settings; `custom` becomes CSS variables --t-<name>.",
    parameters: obj(
      {
        tokens: obj({
          colors: obj({ background: { type: "string" }, surface: { type: "string" }, text: { type: "string" }, muted: { type: "string" }, accent: { type: "string" }, accentText: { type: "string" }, border: { type: "string" }, inverse: obj({ background: { type: "string" }, text: { type: "string" }, accent: { type: "string" } }) }),
          fonts: obj({ heading: { type: "string" }, body: { type: "string" }, accent: { type: "string" } }),
          radius: obj({ small: { type: "number" }, medium: { type: "number" }, large: { type: "number" } }),
          spacing: obj({ scale: { type: "number" }, sectionY: { type: "number" }, pageWidth: { type: "number" }, gutter: { type: "number" } }),
          motion: obj({ level: { type: "string", enum: ["none", "subtle", "expressive"] }, style: { type: "string" }, durationMs: { type: "number" } }),
          custom: { type: "object", description: "name (no --t-) to CSS value. No url()." },
        }),
      },
      ["tokens"],
    ),
  },
  list_capabilities: { name: "list_capabilities", description: "This store's real data: products, collections, communities, forms, pages, menus, reviews and switched-on features, with ids. Bind only these ids; never invent one.", parameters: obj({}) },
  bind_data: { name: "bind_data", description: "Point a binding setting (product, products, collection, collections, community, page, menu) of a placed section at real ids from list_capabilities.", parameters: obj({ page: { type: "string" }, sectionId: { type: "string" }, prop: { type: "string" }, kind: { type: "string", enum: ["product", "products", "collection", "collections", "community", "page", "menu", "form"] }, ids: { type: "array", items: { type: "string" } } }, ["page", "sectionId", "prop", "kind", "ids"]) },
  search_knowledge: { name: "search_knowledge", description: "Search Storelib's design knowledge (styles, layouts, components, motion, industries, anti slop rules, .storelib examples).", parameters: obj({ query: { type: "string" }, kinds: { type: "array", items: { type: "string", enum: KINDS } }, limit: { type: "number" } }, ["query"]) },
  validate: { name: "validate", description: "Check one file, or (no path) every file you touched and every page: compile, manifest, remote imports, bindings, links.", parameters: obj({ path: { type: "string" } }) },
  render_check: { name: "render_check", description: "Draw a page with the template engine and read it: empty sections, leftover template code, pictures without alt, heading order, broken internal links, and runtime errors the editor reported.", parameters: obj({ page: { type: "string" } }, ["page"]) },
  report_progress: { name: "report_progress", description: "Say what you are doing, for the progress view. With phase \"plan\", hand in the visual concept (required before the first write on a new website) and the plan as tasks.", parameters: obj({ phase: { type: "string", enum: PHASES }, label: { type: "string" }, concept: CONCEPT_SCHEMA, tasks: { type: "array", items: { type: "string" } } }, ["phase", "label"]) },
  finish: { name: "finish", description: "Say the website is done. Everything is validated first: with errors, finish is refused and you get the list to fix.", parameters: obj({ summary: str("Two or three plain sentences for the creator: what was made, what to fill in."), notes: { type: "array", items: { type: "string" } } }, ["summary"]) },
}

export const TOOL_LIST: ToolSpec<AgentToolName>[] = AGENT_TOOL_NAMES.map((n) => TOOL_SPECS[n])
