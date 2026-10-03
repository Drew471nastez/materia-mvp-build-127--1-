/**
 * ===========================================================================
 *  ONE HEADER AND ONE FOOTER, AND NO SECTION FILE MAY BE EITHER
 * ===========================================================================
 * Every Storelib site has exactly one header and one footer. They are the
 * built-in `header` and `footer` sections, shared by every page, and they
 * carry the parts of a shop a section file cannot rebuild on its own: the
 * cart drawer and its count, the search modal, the account and wishlist
 * links for a signed-in visitor, the phone menu with its sub-menus, sticky
 * and hide-on-scroll behaviour, the transparent header over a hero, the
 * logo and brand name from Theme settings, the menus from Website settings,
 * policy links, and the payment and social icons.
 *
 * An AI asked to "build a header" writes a new section called Header and
 * puts it in the page body: a second header under the real one, with a
 * cart icon that opens nothing, a search box that searches nothing, and a
 * menu that is a hard-coded copy of the real one. That is the bug this
 * module exists to refuse. A section file that IS a header or a footer is
 * named here, and every door that writes one (the code editor, Ask AI,
 * Claude Code or Codex over MCP, a GitHub push, a theme import) turns it
 * away with what to do instead: change the header's own settings.
 *
 * A creator who asks for a header of their own gets ONE section that says
 * `"kind": "header"`, which replaces the built-in one: see declaredKind
 * below. That is not refused. Everything else that is a header is.
 *
 * HOW A FILE IS RECOGNISED, strongest signal first:
 *
 *   1. It says so without declaring a kind: `"group": "header"` (or
 *      footer). Shopify's `enabled_on.groups` is where a section may go
 *      (an announcement bar in the header group), not what it is.
 *   2. Its type or name is a header's or a footer's: "Header", "Site
 *      header", "Navbar", "Navigation bar", "Top bar", "Footer", with a
 *      version or a "section" on the end. A "Page header" or a "Collection
 *      header" is a heading band on a page, not the site's header, and is
 *      left alone.
 *   3. Its markup is one: the outermost element is <header> holding a
 *      <nav>, or <footer>, and its name says header, nav, menu or footer.
 *
 * PURE, so the rule is the same in the browser, on the server and in a test.
 */

export type ChromeRole = "header" | "footer"

const WORD_HEADER = String.raw`(?:header|navbar|nav[ _-]?bar|navigation(?:[ _-]?(?:bar|menu))?|menu[ _-]?bar|top[ _-]?bar|masthead)`
const WORD_FOOTER = String.raw`(?:footer)`
/** Words that may sit in front of a header's name without making it something else. */
const LEADING = String.raw`(?:(?:site|main|global|custom|new|my|store|shop|sticky|mega|primary|storelib|website|universal|top)[ _-]+)*`
/** And after it: "Header v2", "Header section", "Footer 01". */
const TRAILING = String.raw`(?:[ _-]+(?:v?\d+|section|block|component|area|layout|bar|menu|nav))*`

const HEADER_NAME = new RegExp(`^${LEADING}${WORD_HEADER}${TRAILING}$`, "i")
const FOOTER_NAME = new RegExp(`^${LEADING}${WORD_FOOTER}${TRAILING}$`, "i")

/** A name with the decoration an AI puts around it taken off: "LD 02 — Header" is "Header". */
function bareName(value: string): string {
  return value
    .trim()
    .replace(/^[a-z]{0,4}[ _-]*\d{1,3}\s*[—–:|-]+\s*/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function roleFromName(value: unknown): ChromeRole | null {
  if (typeof value !== "string" || !value.trim()) return null
  const name = bareName(value)
  if (HEADER_NAME.test(name)) return "header"
  if (FOOTER_NAME.test(name)) return "footer"
  return null
}

/**
 * `"group": "header"` is not a Storelib key, but a model writing a header
 * reaches for it, so it still marks one. Shopify's `enabled_on.groups` does
 * NOT: it says where a section may go, and an announcement bar that sits in
 * the header group is not the header. Only `kind` says a section IS one.
 */
function roleFromGroup(schema: Record<string, unknown>): ChromeRole | null {
  const say = (v: unknown): ChromeRole | null => (v === "header" || v === "footer" ? v : null)
  return say(schema.group) ?? say(schema.section_group) ?? say(schema.sectionGroup)
}

/**
 * ===========================================================================
 *  A HEADER OF ITS OWN, SAID OUT LOUD
 * ===========================================================================
 * `"kind": "header"` (or "footer") is a section that says it IS the site's
 * header, written because the creator asked for a header of their own. It
 * is not refused: the builder puts it in the header group in place of the
 * built-in one, on every page. One per theme, which the save holds
 * (lib/website-builder/save-theme-file.ts). What is refused is a header
 * that does not say so: a nav bar dropped into a page under the real one.
 */
export function declaredKind(schema: Record<string, unknown> | null | undefined): ChromeRole | null {
  const k = schema?.kind
  return k === "header" || k === "footer" ? k : null
}

/** The first element a template draws, ignoring comments and Storelib tags around it. */
function outermostTag(template: string): string | null {
  const text = template
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\{#[\s\S]*?#\}/g, " ")
    .replace(/\{%[\s\S]*?%\}/g, " ")
  const m = text.match(/<\s*([a-z][a-z0-9-]*)\b/i)
  return m ? m[1].toLowerCase() : null
}

function roleFromMarkup(template: string | undefined, label: string): ChromeRole | null {
  if (!template) return null
  const tag = outermostTag(template)
  const words = bareName(label).toLowerCase()
  if (tag === "header" && /<\s*nav\b/i.test(template) && /\b(header|nav|navigation|menu|navbar)\b/.test(words)) return "header"
  if (tag === "nav" && /\b(header|nav|navigation|menu|navbar)\b/.test(words)) return "header"
  if (tag === "footer" && /\bfooter\b/.test(words)) return "footer"
  return null
}

/**
 * Whether a section is the site's header or footer, by its schema and,
 * when there is one, its template. Null for every other section.
 *
 * `type` is the file's type (its name on disk), which wins over a schema
 * whose own `type` line disagrees, as it does everywhere else.
 */
export function chromeRoleOf(input: {
  schema?: Record<string, unknown> | null
  type?: string | null
  template?: string
}): ChromeRole | null {
  const schema = input.schema ?? {}
  /* A section that declares its kind is a replacement the creator asked for, not a stray copy. */
  if (declaredKind(schema)) return null
  return (
    roleFromGroup(schema) ??
    roleFromName(input.type) ??
    roleFromName(schema.type) ??
    roleFromName(schema.name) ??
    roleFromMarkup(input.template, `${String(input.type ?? "")} ${String(schema.name ?? "")}`)
  )
}

/** The built-in section a role is, and the file names a section file may never take. */
export const CHROME_TYPES: Record<ChromeRole, string> = { header: "header", footer: "footer" }

/**
 * What the writer is told, in words a person and a model can both act on.
 * It names the real section and the settings that do what a new file was
 * trying to do, because "refused" on its own sends a model straight back
 * to writing the same file under another name.
 */
export function chromeRefusal(role: ChromeRole): string {
  if (role === "header") {
    return [
      "A Storelib site has one header, shared by every page, and a section file cannot be another one.",
      "Change the site's header instead: it is the section of type \"header\".",
      "Its settings cover the logo and store name (Theme settings), the menu links (its nav_link blocks, or a menu from Website settings, Navigation), the desktop and phone layouts, sticky, sticky on scroll up and transparent, the search, account, wishlist and cart icons with their drawers, a call to action button, its colour scheme and its border.",
      "In the editor that is Sections, Header. In the builder's AI it is update_section on the header, with add_block and update_block for its nav_link links. Over MCP it is storelib_create_safe_patch with those same operations, or storelib_update_styles for its colours.",
      "Only if the creator asked for a header of their own: write ONE section with \"kind\": \"header\" in its schema, a link_list setting for the menu (default \"main-menu\") and an image_picker for the logo. It replaces the built-in header on every page.",
    ].join(" ")
  }
  return [
    "A Storelib site has one footer, shared by every page, and a section file cannot be another one.",
    "Change the site's footer instead: it is the section of type \"footer\".",
    "Its settings cover the logo, tagline and copyright, two menus from Website settings, Navigation, its own link columns (footer_column and footer_link blocks), the policy and contact links, a newsletter sign up, social and payment icons, its layout and its colour scheme.",
    "In the editor that is Sections, Footer. In the builder's AI it is update_section on the footer; over MCP, storelib_create_safe_patch with update_section, or storelib_update_styles for its colours.",
    "Only if the creator asked for a footer of their own: write ONE section with \"kind\": \"footer\" in its schema, with link_list settings for its menus. It replaces the built-in footer on every page.",
  ].join(" ")
}

/** Said when a second section declares the same kind. */
export function kindTaken(role: ChromeRole, existing: string): string {
  return `This theme already has a ${role} of its own: ${existing}. A site has one ${role}. Change that file, or take "kind" out of one of them.`
}
