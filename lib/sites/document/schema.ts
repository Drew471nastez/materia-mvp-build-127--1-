/**
 * The canonical website state: pages, sections, props, theme.
 *
 * ===========================================================================
 *  WHY THIS EXISTS, GIVEN THAT lib/sites/types.ts SAYS IT MUST NOT
 * ===========================================================================
 * That file opens with a rule, and the rule is right:
 *
 *   "Files are the source of truth. There is no section model here and there
 *    must not become one: the moment a second representation of 'what the page
 *    says' exists, the visual editor and the AI start disagreeing about which
 *    is current, and the answer is always whichever one the user did not just
 *    edit."
 *
 * Structured sections and generated code CAN coexist, but only one of them
 * gets to be true. So the direction is reversed rather than the rule broken:
 *
 *   THE DOCUMENT IS THE SOURCE. THE FILES ARE ITS OUTPUT.
 *
 * A visual control writes a prop. The agent writes a prop. Both then produce
 * the same `src/App.tsx` by the same deterministic function, so there is
 * nothing for them to disagree about — a colour picker and a prompt are two
 * inputs to one state, not two states.
 *
 * ===========================================================================
 *  WHAT KEEPS THE CODE REAL
 * ===========================================================================
 * The sections are ordinary React components written by hand and copied into
 * the project. Nothing about them is generated, so a creator who opens the
 * Code tab reads the same file a developer would have written, and the AI can
 * still edit one when a request genuinely needs it.
 *
 * Only `src/App.tsx` and `src/styles.css` are derived, and only those are ever
 * overwritten. Anything under `src/custom/` is never regenerated — that is
 * where a section the library does not have goes, and it is the boundary that
 * stops one unusual request from taking the editable parts of a site with it.
 */

/** How a prop is edited, and therefore which control the editor renders. */
export type PropKind =
  | "text"
  | "longtext"
  | "image"
  | "url"
  | "color"
  | "number"
  | "boolean"
  | "select"
  | "list"

export interface PropSpec {
  kind: PropKind
  label: string
  /** Used when a section is added and whenever a prop is missing. */
  fallback: PropValue
  /** `select` only. */
  options?: readonly string[]
  /** `number` only. */
  min?: number
  max?: number
  /** `list` only: the shape of one item. */
  item?: Record<string, PropSpec>
  /** `list` only: how many items are sensible. */
  maxItems?: number
}

export type PropValue = string | number | boolean | PropValue[] | { [key: string]: PropValue }

export interface SectionSpec {
  type: string
  /** What a person calls it. Shown in the editor and used by the agent. */
  label: string
  /** One line, so the agent can choose between sections without reading code. */
  purpose: string
  props: Record<string, PropSpec>
  /** The component file this section needs in the project. */
  file: { path: string; source: string }
  /** The exported component name, as `App.tsx` imports it. */
  component: string
}

export interface SectionInstance {
  id: string
  type: string
  props: Record<string, PropValue>
}

export interface Page {
  id: string
  /** "/" for the home page, "/about" for the rest. Unique within a site. */
  path: string
  name: string
  title?: string
  description?: string
  sections: SectionInstance[]
}

/**
 * The values every section reads instead of hard-coding a colour or a font.
 *
 * Held once so "make the whole site feel more premium" is a handful of writes
 * rather than an edit to every component — which is what makes a whole-site
 * request something the agent can actually carry out coherently.
 */
export interface Theme {
  background: string
  surface: string
  text: string
  muted: string
  primary: string
  primaryText: string
  border: string
  radius: number
  container: number
  fontHeading: string
  fontBody: string
}

export interface SiteDocument {
  /** Bumped on every write. The compare-and-swap key — see ./store. */
  revision: number
  theme: Theme
  pages: Page[]
}

export const DEFAULT_THEME: Theme = {
  background: "#ffffff",
  surface: "#f6f6f7",
  text: "#111113",
  muted: "#6b6b72",
  primary: "#111113",
  primaryText: "#ffffff",
  border: "#e6e6e9",
  radius: 10,
  container: 1080,
  fontHeading: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontBody: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
}

export function emptyDocument(): SiteDocument {
  return {
    revision: 0,
    theme: { ...DEFAULT_THEME },
    pages: [{ id: "home", path: "/", name: "Home", sections: [] }],
  }
}

/**
 * Is this a document at all?
 *
 * Read from a JSONB column that anything could have written, and handed to a
 * renderer that assumes its shape. A malformed document must read as "no
 * document" — the site then falls back to its files — rather than as a
 * document with holes in it, which is how a page renders half of itself.
 */
export function isSiteDocument(value: unknown): value is SiteDocument {
  if (!value || typeof value !== "object") return false
  const doc = value as Partial<SiteDocument>
  if (typeof doc.revision !== "number") return false
  if (!doc.theme || typeof doc.theme !== "object") return false
  if (!Array.isArray(doc.pages)) return false
  return doc.pages.every(
    (page) =>
      !!page &&
      typeof page.id === "string" &&
      typeof page.path === "string" &&
      Array.isArray(page.sections) &&
      page.sections.every((s) => !!s && typeof s.id === "string" && typeof s.type === "string"),
  )
}
