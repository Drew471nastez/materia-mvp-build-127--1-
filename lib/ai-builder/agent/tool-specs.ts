/**
 * Server only (search_knowledge's spec comes with L6's library module).
 *
 * The 20 tools as the provider sees them: JSON schemas built from the
 * contract's input shapes (lib/ai-builder/agent-tools.ts AgentToolInputs).
 * Keep the two in step; tests/ai-builder-agent.test.ts checks every name has
 * exactly one spec.
 */
import { LIST_TEMPLATES_TOOL } from "@/lib/storelib-ai/templates"
import type { ToolSpec } from "@/lib/sites/agent/types"
import { AGENT_TOOL_NAMES, type AgentToolName } from "../types"
import { CONCEPT_SCHEMA } from "./concept"
import { BRIEF_REFINE_JSON_SCHEMA } from "@/lib/storelib-ai/direction/brief"
import { SEARCH_KNOWLEDGE_TOOL } from "./knowledge"
import { DESIGN_BINDINGS, DESIGN_CONTROLS } from "../site-settings"

const PHASES = ["brief", "plan", "build", "verify", "repair", "finish"]
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

/* Round N (N3): the site plan, every page and template with its sections (lib/ai-builder/agent/site-plan.ts readSitePlan). */
const SITE_PLAN = {
  type: "array",
  description: "The site plan: every page and every template (home, product, collection, products, search, cart, 404, contact, the blog's blogs and article when there is a blog, and each page you will add), each with its sections in order. Required with the concept before a new website's first write.",
  items: obj(
    {
      key: str("Page key or template key, e.g. home, product, collection, about."),
      sections: { type: "array", items: { type: "string" }, description: "One short line per section, in order: the component, its Materia model as materia:<type> (or custom) and its job, e.g. \"ai_opening: materia:hero-image1, the promise and the first program\"." },
      reason: str("Why this page has fewer sections than the rule, or why a template keeps the platform's plain layout."),
    },
    ["key", "sections"],
  ),
}

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
  list_pages: { name: "list_pages", description: "The website's pages and templates and the sections on each (id, type, group). Templates (product, collection, products, search, cart, 404, contact, blog) are listed even before they hold anything, with where a visitor meets them and what their sections can read.", parameters: obj({}) },
  add_page: { name: "add_page", description: "Add a page. Its address is /<key>; it is added to the site's Main menu (the header's links) and gets its own search title and description.", parameters: obj({ key: str("lowercase letters, digits and dashes, e.g. coaching"), title: str("What the menu and the tab call it."), seo: obj({ title: { type: "string" }, description: { type: "string" } }) }, ["key", "title"]) },
  set_page_sections: { name: "set_page_sections", description: "Set a page's or a template's sections, in order. Sections you leave out are removed from that page; header/footer sections (with `group`) are site-wide and only change when you send one. A template (product, collection, products, search, cart, 404, contact, blogs, article) needs no add_page.", parameters: obj({ page: str("Page or template key, e.g. home, about, product, collection"), sections: { type: "array", items: PLACED_SECTION } }, ["page", "sections"]) },
  set_section_settings: { name: "set_section_settings", description: "Change some settings of one placed section; the others keep their values. With blockId, change one of its items instead (a picture or a row of a list).", parameters: obj({ page: { type: "string" }, sectionId: { type: "string" }, settings: { type: "object" }, blockId: { type: "string", description: "One item of the section (its block id from list_pages or set_page_sections)." } }, ["page", "sectionId", "settings"]) },
  set_tokens: {
    name: "set_tokens",
    description:
      "Set the website's design tokens and declare its own Theme settings. Tokens become Theme settings the creator can change: colours become the `site` and `site_inverse` colour schemes; fonts, type scale, corner radius, shadow, spacing and motion their Theme settings; `custom` becomes CSS variables --t-<name>. " +
      "`settings` is what the creator sees in Theme settings for this site, INSTEAD of the default theme's groups: your design system, grouped and labelled as its designer would (e.g. Palette, Type, Shape, Motion, Texture). Each setting comes out as var(--t-<id>) for your components. " +
      "A setting with `token` stands for that token (its control and limits come from it; fonts must use a token). One without `token` is the site's own value: give `type` (color, range, select, toggle) and a starting `value`. Sending settings replaces the declared list.",
    parameters: obj(
      {
        tokens: obj({
          colors: obj({ background: { type: "string" }, surface: { type: "string" }, text: { type: "string" }, muted: { type: "string" }, accent: { type: "string" }, accentText: { type: "string" }, border: { type: "string" }, inverse: obj({ background: { type: "string" }, text: { type: "string" }, accent: { type: "string" } }) }),
          fonts: obj({ heading: { type: "string" }, body: { type: "string" }, accent: { type: "string" } }),
          radius: obj({ small: { type: "number" }, medium: { type: "number" }, large: { type: "number" } }),
          spacing: obj({ scale: { type: "number" }, sectionY: { type: "number" }, pageWidth: { type: "number" }, gutter: { type: "number" } }),
          motion: obj({ level: { type: "string", enum: ["none", "subtle", "expressive"] }, style: { type: "string" }, durationMs: { type: "number" }, tier: { type: "string", enum: ["quiet", "balanced", "expressive"], description: "The site's motion feel; components read it as var(--t-motion-*)." } }),
          typeScale: obj({ base: { type: "number", description: "Body size in px, 12 to 22." }, ratio: { type: "number", description: "Each heading step, 1.05 to 1.6." } }),
          shadow: { type: "string", enum: ["none", "sm", "md", "lg"] },
          custom: { type: "object", description: "name (no --t-) to CSS value. No url()." },
        }),
        settings: {
          type: "array",
          description: "The site's own Theme settings, in groups.",
          items: obj(
            {
              id: str("Group id, e.g. palette."),
              label: str("What the creator reads, e.g. Palette."),
              settings: {
                type: "array",
                items: obj(
                  {
                    id: str("Lowercase, dashes; read as var(--t-<id>)."),
                    label: str("Short and plain, e.g. Clay."),
                    type: { type: "string", enum: [...DESIGN_CONTROLS] },
                    token: { type: "string", enum: Object.keys(DESIGN_BINDINGS), description: "The token this setting stands for, if any." },
                    value: { description: "Starting value of a setting of the site's own: a colour, a number, an option's value, or true/false." },
                    min: { type: "number" },
                    max: { type: "number" },
                    step: { type: "number" },
                    unit: { type: "string", description: "px, rem, em, %, ms, s, vw, vh, deg or empty." },
                    options: { type: "array", items: obj({ value: { type: "string" }, label: { type: "string" } }, ["value", "label"]) },
                    on: str("A toggle's CSS value when on, default 1."),
                    off: str("A toggle's CSS value when off, default 0."),
                    info: str("One short line of help, optional."),
                  },
                  ["id", "label"],
                ),
              },
            },
            ["label", "settings"],
          ),
        },
      },
      ["tokens"],
    ),
  },
  list_capabilities: { name: "list_capabilities", description: "This store's real data: products, collections, communities, forms, pages, menus, reviews and switched-on features, with ids. Bind only these ids; never invent one.", parameters: obj({}) },
  bind_data: { name: "bind_data", description: "Point a binding setting (product, products, collection, collections, community, page, menu) of a placed section at real ids from list_capabilities.", parameters: obj({ page: { type: "string" }, sectionId: { type: "string" }, prop: { type: "string" }, kind: { type: "string", enum: ["product", "products", "collection", "collections", "community", "page", "menu", "form"] }, ids: { type: "array", items: { type: "string" } }, blockId: { type: "string", description: "Bind a setting of one item of the section (a row with its own product)." } }, ["page", "sectionId", "prop", "kind", "ids"]) },
  /* L6's spec (lib/storelib-ai/library/tool.ts): the library's kinds and wording. */
  search_knowledge: SEARCH_KNOWLEDGE_TOOL as ToolSpec<AgentToolName>,
  validate: { name: "validate", description: "Check one file, or (no path) every file you touched and every page: compile, manifest, remote imports, bindings, links.", parameters: obj({ path: { type: "string" } }) },
  render_check: { name: "render_check", description: "Draw a page with the template engine and read it: empty sections, leftover template code, pictures without alt, heading order, broken internal links, and runtime errors the editor reported.", parameters: obj({ page: { type: "string" } }, ["page"]) },
  report_progress: { name: "report_progress", description: "Say what you are doing, for the progress view. With phase \"plan\", hand in the visual concept (following the ART DIRECTION in the brief), optionally sharper brief facts (brief), and the site plan as pages (both required before the first write on a new website) and the work as tasks.", parameters: obj({ phase: { type: "string", enum: PHASES }, label: { type: "string" }, concept: CONCEPT_SCHEMA, tasks: { type: "array", items: { type: "string" } }, pages: SITE_PLAN, brief: BRIEF_REFINE_JSON_SCHEMA }, ["phase", "label"]) },
  /* Round P (P1): pictures (lib/storelib-ai/images). Several in one turn are made side by side. */
  generate_image: {
    name: "generate_image",
    description:
      "Make an original photograph for the site and keep it in the creator's files. Answers { url, alt, width, height }: put the url in an image_picker setting (a component's default or a placed section's settings) and the alt in its alt setting. Describe the subject plainly; the site's art direction, light and palette are added for you. No words, logos, brands or real people in a picture. Limited per site: spend them where the design calls for imagery. Refused or failed: design that spot without a picture, never a grey box.",
    parameters: obj(
      {
        prompt: str("What the picture shows: who or what, where, doing what. e.g. \"a coach spotting a client's deadlift in a concrete gym, chalk in the air\"."),
        aspect: { type: "string", enum: ["landscape", "portrait", "square"], description: "landscape 3:2 (default), portrait 2:3, square." },
        purpose: str("What it is for: hero, product, portrait, people, place, detail, gallery, background."),
        alt: str("Alt text for the page: what it shows, under 125 characters."),
        style: { type: "string", enum: ["photo", "studio", "editorial", "illustration", "render"], description: "photo (default)." },
      },
      ["prompt"],
    ),
  },
  find_photo: {
    name: "find_photo",
    description: "Find a licensed stock photo (Pexels) and keep it in the creator's files with the photographer's credit. Answers { url, alt, width, height }. For real-world scenes where an original picture is not needed. Counts toward the same limit as generate_image.",
    parameters: obj(
      {
        query: str("A few search words: the subject, e.g. \"barbell chalk hands\"."),
        aspect: { type: "string", enum: ["landscape", "portrait", "square"] },
        purpose: str("What it is for: hero, product, portrait, gallery..."),
        alt: str("Alt text for the page."),
      },
      ["query"],
    ),
  },
  /* Round P (P2a): the starting templates (lib/storelib-ai/templates/gallery.ts). */
  list_templates: LIST_TEMPLATES_TOOL as ToolSpec<AgentToolName>,
  finish: { name: "finish", description: "Say the website is done. Everything is validated first: with errors, finish is refused and you get the list to fix.", parameters: obj({ summary: str("Two or three plain sentences for the creator: what was made, what to fill in."), notes: { type: "array", items: { type: "string" } } }, ["summary"]) },
}

export const TOOL_LIST: ToolSpec<AgentToolName>[] = AGENT_TOOL_NAMES.map((n) => TOOL_SPECS[n])
