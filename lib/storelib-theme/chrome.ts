/**
 * ===========================================================================
 *  WHICH SECTION IS THE HEADER, AND WHICH THE FOOTER
 * ===========================================================================
 * Every Storelib site draws one header and one footer. They may be the
 * built-in `header` and `footer` sections, or a section the creator coded,
 * with whatever layout, icons, buttons, motion and logo size they want.
 * What stays live is Storelib data: the cart drawer, search, account, the
 * menu from a link_list, the logo from Theme settings.
 *
 * `"kind": "header"` (or "footer") replaces the built-in one: see declaredKind
 * below. A file under any other name is saved. Only the reserved filenames
 * sections/header.storelib and sections/footer.storelib are refused, because
 * they would shadow the built-in sections (lib/website-builder/save-theme-file.ts).
 *
 * A header file that is already there (an imported theme, a site saved
 * before this) is never dropped: it is placed where a header goes, in the
 * Header group as THE header, with the built-in one hidden rather than drawn
 * twice (lib/storelib-theme/section-groups.ts). That placement asks this
 * module "is this file a header or a footer". Recognition is placement, not a
 * save refusal.
 *
 * HOW A FILE IS RECOGNISED, strongest signal first:
 *
 *   1. It says so without declaring a kind: `"group": "header"` (or
 *      footer). Shopify's `enabled_on.groups` is where a section may go
 *      (an announcement bar in the header group), not what it is.
 *   2. Its type or name is a header's or a footer's: "Header", "Site
 *      header", "Navbar", "Navigation bar", "Top bar", "Footer", with a
 *      version or a "section" on the end, or a brand and a dash in front
 *      ("Luca" then an em dash then "Header"). A "Page header" or a
 *      "Collection header" is a heading band on a page and is left alone.
 *   3. Its markup is one: the outermost element is <header> holding a
 *      <nav>, or <footer>, and its name says header, nav, menu or footer.
 *
 * `sections/header.storelib` and `sections/footer.storelib` are always
 * refused: they would shadow the built-in sections every page's header and
 * footer settings are stored for.
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

/** A brand in front of a spaced dash, bar or colon taken off: "Luca", an em dash, "Header" is "Header". */
function afterBrand(value: string): string | null {
  const parts = value.split(/\s+[—–|:]\s+|\s+-\s+/)
  return parts.length > 1 ? parts[parts.length - 1] : null
}

function roleFromName(value: unknown): ChromeRole | null {
  if (typeof value !== "string" || !value.trim()) return null
  for (const candidate of [value, afterBrand(value)]) {
    if (!candidate) continue
    const name = bareName(candidate)
    if (HEADER_NAME.test(name)) return "header"
    if (FOOTER_NAME.test(name)) return "footer"
  }
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
 * header. The builder puts it in the header group in place of the built-in
 * one, on every page. One per theme, which the save holds
 * (lib/website-builder/save-theme-file.ts). A header that does not say so
 * is still saved; this module only recognises it so an import can place it.
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

/** The built-in section a role is, and the two file names a section file may never take. */
export const CHROME_TYPES: Record<ChromeRole, string> = { header: "header", footer: "footer" }

/**
 * What the writer is told, in words a person and a model can both act on.
 * It names the real section and the settings that do what a new file was
 * trying to do, because "refused" on its own sends a model straight back
 * to writing the same file under another name.
 */
export function chromeRefusal(role: ChromeRole): string {
  return `sections/${role}.storelib is the built-in ${role}. Write the creator's own as sections/<name>.storelib. Design it however the page needs. Wire Storelib's live values: a link_list for the menu and its sub links, theme.logo for the logo (size and colour are settings the creator can change), and the drawer attributes when it shows a cart, search or menu: data-storelib-menu on its menu button, data-storelib-cart on its bag (or a cart panel of its own, data-storelib-cart-panel), data-storelib-cart-count on the count, data-storelib-search on its search. "kind": "${role}" makes it the site's ${role}.`
}

/** Said when a second section declares the same kind. */
export function kindTaken(role: ChromeRole, existing: string): string {
  return `This theme already has a ${role} of its own: ${existing}. A site has one ${role}. Change that file, or take "kind" out of one of them.`
}
