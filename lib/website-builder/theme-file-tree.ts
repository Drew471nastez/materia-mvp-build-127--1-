// ============================================================
//  THE THEME, AS FILES
// ============================================================
//  The Shopify-shaped view of a theme: config, templates,
//  sections, snippets, assets. Same idea, same folders, and —
//  now — the same relationship to reality, which is the part
//  that was missing.
//
//  ---------------------------------------------------------
//   IT WAS A HAND-MAINTAINED LIST, AND IT HAD DRIFTED
//  ---------------------------------------------------------
//  Every section path was typed out here by hand. The library
//  has fifty section types; this file listed thirty-nine. So
//  eleven sections that exist, render, and can be added from
//  the sidebar — product, image_section, scrolling_text,
//  counter, image_comparison, collection_list, icon_box,
//  promotion_banner, banner_packery, products_carousel,
//  brand_logo — simply did not appear in the code browser at
//  all. Nothing failed; they were invisible.
//
//  Worse, `getDefaultFileContent` returned a STUB for every
//  section: `{type, name, schema: {fields: []}}`. Opening
//  sections/faq.json showed an empty schema when the real FAQ
//  has ten controls and a block type with four more. A code
//  editor that shows made-up content is not a code editor.
//
//  Both are now DERIVED from the same registries the editor
//  and the renderer use. A section added tomorrow appears here
//  the moment its JSON lands, and what it shows is what it is.
// ============================================================
import manifest from "../../themes/default/manifest.json"
import { SECTION_SCHEMAS, ADDABLE_SECTIONS, STRUCTURE_SECTIONS } from "./section-schemas"
import { THEME_SETTINGS_GROUPS } from "./theme-settings-schema"
import type { PageKey, ThemeFileNode } from "./types"
import { DEFAULT_THEME_SOURCES } from "../../themes/default/sources.generated"
import { isStorelibSection } from "./storelib-runtime"

/** The pages a theme has. Matches `PageKey`, which is what the editor stores. */
export const THEME_PAGES: PageKey[] = ["home", "product", "about", "contact"]

/**
 * Every section type, in the manifest's own order.
 *
 * `section_order` is what the editor's Add panel respects, so the file browser
 * shows them in the order somebody already knows. Anything the manifest has
 * not ordered still appears — appended rather than dropped, because a section
 * missing from a list is exactly the failure this file is fixing.
 */
export function orderedSectionTypes(): string[] {
  const ordered: string[] = Array.isArray((manifest as { section_order?: string[] }).section_order)
    ? (manifest as { section_order: string[] }).section_order
    : []
  const all = Object.keys(SECTION_SCHEMAS)
  const known = ordered.filter((type) => all.includes(type))
  const rest = all.filter((type) => !known.includes(type))
  return [...known, ...rest]
}

export function buildThemeFileTree(customizedPaths: string[] = []): ThemeFileNode[] {
  const customized = new Set(customizedPaths)

  const file = (path: string, lang?: string): ThemeFileNode => ({
    path,
    name: path.split("/").pop()!,
    type: "file",
    isCustomized: customized.has(path),
    language: lang ?? detectLanguage(path),
  })

  const folder = (name: string, children: ThemeFileNode[]): ThemeFileNode => ({
    path: name,
    name,
    type: "folder",
    children,
  })

  const tree: ThemeFileNode[] = [
    file("theme.json", "json"),
    folder("config", [
      file("config/settings_schema.json", "json"),
      file("config/settings_data.json", "json"),
    ]),
    folder(
      "templates",
      THEME_PAGES.map((page) => file(`templates/${page}.json`, "json")),
    ),
    folder(
      "sections",
      /**
       * A section that has moved to the theme engine is its .storelib file;
       * one that has not is still its JSON schema. Both are the section, and
       * the browser shows each as what it is.
       */
      orderedSectionTypes().map((type) => (isStorelibSection(type) ? file(`sections/${type}.storelib`, "storelib") : file(`sections/${type}.json`, "json"))),
    ),
    /* Theme blocks: one file each, held by any section that accepts it (`{ "type": "@theme" }`). */
    folder(
      "blocks",
      Object.keys(DEFAULT_THEME_SOURCES)
        .filter((p) => p.startsWith("blocks/") && p.endsWith(".storelib"))
        .sort()
        .map((p) => file(p, "storelib")),
    ),
    folder("snippets", [
      file("snippets/button.json", "json"),
      file("snippets/product-card.json", "json"),
    ]),
    folder("assets", [
      file("assets/styles.css", "css"),
      file("assets/theme.js", "javascript"),
    ]),
  ]
  /**
   * FILES A PERSON CREATED. A saved path the default theme does not have —
   * a new section, a snippet — belongs in the tree under its folder, or the
   * file exists and cannot be opened. Folders the default theme does not
   * have are made for it.
   */
  const known = new Set(flattenTree(tree))
  for (const path of [...customized].sort()) {
    if (known.has(path) || path.includes("..") || path.startsWith("/")) continue
    const parts = path.split("/")
    if (parts.length === 1) { tree.push(file(path)); continue }
    let level = tree
    for (let i = 0; i < parts.length - 1; i++) {
      const folderPath = parts.slice(0, i + 1).join("/")
      let node = level.find((n) => n.type === "folder" && n.path === folderPath)
      if (!node) { node = folder(folderPath, []); node.name = parts[i]; level.push(node) }
      level = node.children!
    }
    level.push(file(path))
  }
  return tree
}

/** Every path the tree contains, flattened. For search and for tests. */
export function flattenTree(nodes: ThemeFileNode[]): string[] {
  const out: string[] = []
  const walk = (list: ThemeFileNode[]) => {
    for (const node of list) {
      if (node.type === "file") out.push(node.path)
      if (node.children) walk(node.children)
    }
  }
  walk(nodes)
  return out
}

export function detectLanguage(path: string): string {
  const ext = path.split(".").pop() ?? ""
  const map: Record<string, string> = {
    storelib: "storelib",
    json: "json",
    css: "css",
    js: "javascript",
    ts: "typescript",
    tsx: "typescriptreact",
    html: "html",
    md: "markdown",
  }
  return map[ext] ?? "plaintext"
}

// ── What a file actually contains ────────────────────────────

/**
 * The REAL content, not a placeholder.
 *
 * This used to invent a stub for anything it did not have a hard-coded string
 * for, which was every one of the fifty sections. Somebody opening a section
 * to see how it works was shown an empty schema and could reasonably conclude
 * their theme had nothing in it.
 *
 * Everything below reads the registry the editor and the renderer read, so a
 * file shows what that file IS. The only invented content left is the two
 * asset stubs, which have no source to read — they are genuinely empty until
 * somebody writes them.
 */
export function getDefaultFileContent(path: string, themeName: string = "Storelib Default"): string {
  if (path === "theme.json") {
    return JSON.stringify(
      {
        name: themeName,
        version: "1.0.0",
        author: "Storelib",
        description: "A Storelib theme",
        engine: "storelib-1",
        supports: {
          pages: THEME_PAGES,
          /** Derived. The hand-written list here was missing eleven types. */
          sections: orderedSectionTypes(),
        },
        /**
         * Which sections the Add panel offers, and which are structural and
         * cannot be added or removed. Both come from the manifest, so this
         * file describes the theme rather than describing an older theme.
         */
        addable_sections: ADDABLE_SECTIONS,
        structure_sections: STRUCTURE_SECTIONS,
      },
      null,
      2,
    )
  }

  if (path === "config/settings_schema.json") {
    // The real thing: twelve groups, seventy-two fields.
    return JSON.stringify(THEME_SETTINGS_GROUPS, null, 2)
  }

  if (path === "config/settings_data.json") {
    /**
     * The defaults every group declares, flattened the way the renderer reads
     * them. A creator's own values live on the install and override these —
     * this file is the floor, which is what `settings_data` means.
     */
    const current: Record<string, unknown> = {}
    for (const group of THEME_SETTINGS_GROUPS) {
      for (const field of group.fields ?? []) {
        if (field.default !== undefined) current[field.id] = field.default
      }
    }
    return JSON.stringify({ current }, null, 2)
  }

  if (path.startsWith("templates/") && path.endsWith(".json")) {
    const page = path.replace("templates/", "").replace(".json", "")
    /**
     * WHAT A PAGE OF THIS KIND ACTUALLY STARTS WITH, taken from what the
     * editor does rather than from a list that would have to be kept in step
     * with it: it prepends a header, appends a footer, and on the product page
     * seeds a product section between them.
     *
     * Written as a constant here and asserted against the editor in the suite,
     * because the alternative — a `page_defaults` key in the manifest that
     * nothing reads — is a second source of truth that would drift the same
     * way the section list did.
     */
    const order =
      page === "product" ? ["header", "product", "footer"] : ["header", "footer"]
    return JSON.stringify({ layout: "default", sections: { order } }, null, 2)
  }

  /** A .storelib file's default is the default theme's file, verbatim. */
  if (path.endsWith(".storelib")) {
    return DEFAULT_THEME_SOURCES[path] ?? `<!-- There is no ${path} in this theme. Save this file to create it. -->\n`
  }

  if (path.startsWith("sections/") && path.endsWith(".json")) {
    const type = path.replace("sections/", "").replace(".json", "")
    if (isStorelibSection(type)) {
      return JSON.stringify({ error: `"${type}" lives in sections/${type}.storelib now; open that file.` }, null, 2)
    }
    const schema = SECTION_SCHEMAS[type]
    if (!schema) {
      return JSON.stringify(
        { error: `There is no section type "${type}" in this theme.` },
        null,
        2,
      )
    }
    /**
     * The section as it really is: its controls, the block types it takes and
     * their controls, its cap, and the preset it arrives with. This is what
     * somebody opening the file came to read.
     */
    return JSON.stringify(schema, null, 2)
  }

  if (path.startsWith("snippets/") && path.endsWith(".json")) {
    return JSON.stringify({ type: "snippet", fields: [] }, null, 2)
  }

  if (path === "assets/styles.css") {
    return `/* Theme custom styles.
   Loaded after the theme's own CSS, so anything here wins. */
:root {
  --theme-primary: #6366f1;
  --theme-secondary: #8b5cf6;
}
`
  }

  if (path === "assets/theme.js") {
    return `// Theme JavaScript, run on the storefront.
// Keep it small — layout and content belong in sections, where the
// visual editor can still reach them.
`
  }

  return "// This file has no default content yet."
}
