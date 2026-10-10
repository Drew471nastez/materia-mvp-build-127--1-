/**
 * ===========================================================================
 *  HEADER, PAGE AND FOOTER: WHERE A SECTION GOES
 * ===========================================================================
 * Shopify's Online Store 2.0 keeps a page in three parts. The header group
 * (announcement bars, the header, a marquee under it), the template (the
 * page's own sections) and the footer group. A section says where it may go
 * with `enabled_on` / `disabled_on`, and the header and footer are sections
 * like any other that happen to live in their group. Storelib does the same:
 *
 *   SCHEMA     `"enabled_on": { "groups": ["header"] }` puts a section in the
 *              Header group only; `"disabled_on": { "groups": ["header",
 *              "footer"] }` keeps it on pages. `"kind": "header"` (or
 *              "footer") says the section IS the site's header, the one row
 *              of its kind the Header group shows.
 *
 *   INSTANCE   a placed section carries `group: "header" | "footer"` when it
 *              sits in one of the two groups. The built-in `header` and
 *              `footer` types are in theirs without saying so, which is how
 *              every page saved before groups existed still reads right.
 *              Nothing else is stored, so the rule needs no schema at render.
 *
 *   ONE OF EACH  Never two headers drawn. A second header is placed as the
 *              header and the first is HIDDEN, not deleted: its settings,
 *              blocks and menus stay in the page, and the eye in the Header
 *              group brings it back (which hides the other). The same for
 *              footers. `repairChrome` applies this to anything already
 *              saved or imported with two.
 *
 * A section that never says where it goes is placed by what it is: the
 * built-in announcement bars go in the Header group, a marquee or a sticky
 * bar may go in either group or on a page, a newsletter on a page or in the
 * Footer group, and a section file that is plainly a header (lib/storelib-
 * theme/chrome.ts recognises one by its name or its markup) is a header.
 *
 * PURE. The editor, the published site, the import and the tests all call
 * the same functions.
 */
import { chromeRoleOf, declaredKind } from "./chrome"
import { sectionGroupsOf, type SectionGroup, type SectionKind } from "./schema/normalise"
import { parseStorelib } from "./storelib/parse"

/* One vocabulary: the group and kind names are the schema's own (schema/normalise.ts). */
export type { SectionGroup, SectionKind }

/** The groups in the order a page and the sidebar show them; the overlay floats over the rest. */
export const GROUP_ORDER: readonly SectionGroup[] = ["header", "template", "footer", "overlay"]

/** What a group is called in the sidebar. The middle one is the page's own sections. */
export const GROUP_LABELS: Record<SectionGroup, string> = { header: "Header", template: "Page", footer: "Footer", overlay: "Overlay" }

type SchemaLike = Record<string, unknown> | null | undefined

/** The least a placed section has to be for the rules here. */
export interface GroupedSection {
  id: string
  type: string
  hidden?: boolean
  group?: unknown
  settings?: Record<string, unknown>
  blocks?: unknown[]
}

/** A section type's kind, or null. What the callers below are handed. */
export type KindOfType = (type: string) => SectionKind | null

const isGroup = (v: unknown): v is "header" | "footer" | "overlay" => v === "header" || v === "footer" || v === "overlay"

// ── What a schema says ──────────────────────────────────────────────────────

/**
 * Whether a section IS the site's header or footer.
 *
 *   1. The built-in `header` and `footer` types are.
 *   2. `"kind": "header"` or `"kind": "footer"` in the schema (chrome.ts,
 *      declaredKind).
 *   3. A file that is plainly one without saying so, by its name or its
 *      markup (chrome.ts, chromeRoleOf): a header an AI wrote before `kind`
 *      existed, or that a theme brought in. Saving a new one like that is
 *      refused; one that is already there is placed, not dropped.
 *
 * A group alone does not make a header: an announcement bar declares
 * `enabled_on: { groups: ["header"] }` and is not the header.
 */
export function kindOf(schema: SchemaLike, opts: { type?: string | null; template?: string } = {}): SectionKind | null {
  const type = opts.type ?? (typeof schema?.type === "string" ? (schema.type as string) : null)
  if (type === "header" || type === "footer") return type
  const declared = declaredKind(schema)
  if (declared) return declared
  const said = schema?.kind
  if (said !== undefined && said !== null && said !== "") return null
  const { enabled_on: _e, disabled_on: _d, ...rest } = schema ?? {}
  return chromeRoleOf({ schema: rest, type, template: opts.template })
}

/**
 * THE BUILT-IN SECTIONS, ONE BY ONE. Read from the theme's own files and the
 * Add section library: which of them belong above the header, which below
 * the footer, and which only on a page (everything not listed). The first is
 * where each goes when nobody says.
 */
const BUILT_IN_GROUPS: Record<string, SectionGroup[]> = {
  header: ["header"],
  footer: ["footer"],
  /* A thin bar of text with a link, with or without a countdown: Shopify's announcement bar. */
  announcement_banner: ["header"],
  promo_announcement: ["header"],
  /* A marquee under the header is a header group section in Shopify's own themes; it is a band on a page too. */
  scrolling_text: ["template", "header", "footer"],
  /* Fixed to the top or the bottom of the screen, so where it sits in the page does not move it. */
  sticky_bar: ["template", "header", "footer", "overlay"],
  social_proof_bar: ["template", "header"],
  /* An email sign up above the footer, as Dawn's footer group has one. */
  newsletter: ["template", "footer"],
  promo_newsletter: ["template", "footer"],
}

/* What floats over the page rather than sitting in it: a popup, a bar fixed to the bottom of a phone, back to top, a chat button. */
const OVERLAY = /\b(pop[ _-]?up|modal|back[ _-]?to[ _-]?top|scroll[ _-]?to[ _-]?top|mobile[ _-]?(nav|navigation|bar|menu|tab[ _-]?bar|dock)|bottom[ _-]?(nav|navigation|bar|menu|dock)|tab[ _-]?bar|cookie[ _-]?(bar|banner|consent)?|age[ _-]?(gate|verification|check)|exit[ _-]?intent|floating|whats[ _-]?app|chat[ _-]?(button|bubble|widget)|quick[ _-]?view)\b/i

const ANNOUNCEMENT = /\bannouncement(s)?\b|\bannouncement[ _-]?bar\b|\b(promo|notice|offer)[ _-]?bar\b|^announcement/i

const saysGroups = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v) && Array.isArray((v as { groups?: unknown }).groups)

/**
 * Where a section may go, the first being where it goes when nobody says.
 *
 * What the schema says is read by the schema's own rule (schema/normalise.ts,
 * sectionGroupsOf): kind, enabled_on, disabled_on, an announcement category.
 * This adds what a schema cannot say about itself:
 *
 *   a header file that does not declare its kind   ["header"]
 *   disabled_on                                     the page first
 *   a built-in section                              BUILT_IN_GROUPS
 *   a name or type that says announcement           ["header"]
 */
export function sectionGroupsFor(
  schema: SchemaLike,
  opts: { type?: string | null; template?: string; kind?: SectionKind | null } = {},
): SectionGroup[] {
  const s = schema ?? {}
  const type = opts.type ?? (typeof s.type === "string" ? (s.type as string) : "")
  const kind = opts.kind !== undefined ? opts.kind : kindOf(schema, { type, template: opts.template })
  if (kind) return [kind]

  const declared = sectionGroupsOf(s)
  if (saysGroups(s.enabled_on) && declared.length > 0) return declared
  if (saysGroups(s.disabled_on) && declared.length > 0) {
    return [...declared].sort((a, b) => (a === "template" ? -1 : b === "template" ? 1 : 0))
  }
  if (declared.length === 1 && declared[0] === "header") return declared

  if (type && BUILT_IN_GROUPS[type]) return [...BUILT_IN_GROUPS[type]]

  const name = typeof s.name === "string" ? s.name : ""
  if (ANNOUNCEMENT.test(name) || ANNOUNCEMENT.test(type.replace(/_/g, " "))) return ["header"]
  if (OVERLAY.test(name) || OVERLAY.test(type.replace(/_/g, " "))) return ["overlay", "template"]
  return ["template"]
}

// ── Where a placed section is ───────────────────────────────────────────────

/** The group a placed section is in: what it says, or for the built-in header and footer, what they are. */
export function groupOf(section: Pick<GroupedSection, "type" | "group">): SectionGroup {
  if (isGroup(section.group)) return section.group
  if (section.type === "header") return "header"
  if (section.type === "footer") return "footer"
  return "template"
}

/** Whether this placed section is a header (or footer): the built-in, or a section whose kind says so. */
export function isKind(section: Pick<GroupedSection, "type">, kind: SectionKind, kindOfType?: KindOfType): boolean {
  if (section.type === kind) return true
  if (section.type === "header" || section.type === "footer") return false
  return kindOfType?.(section.type) === kind
}

/** The groups, each in its own order. */
export function splitGroups<T extends GroupedSection>(list: readonly T[]): Record<SectionGroup, T[]> {
  const out: Record<SectionGroup, T[]> = { header: [], template: [], footer: [], overlay: [] }
  for (const s of list) out[groupOf(s)].push(s)
  return out
}

/** Header group first, then the page, then the footer group, each keeping its order. */
export function orderByGroup<T extends GroupedSection>(list: readonly T[]): T[] {
  const g = splitGroups(list)
  return [...g.header, ...g.template, ...g.footer, ...g.overlay]
}

/** The section, labelled for the group it is going into. The built-in header and footer need no label. */
export function inGroup<T extends GroupedSection>(section: T, group: SectionGroup): T {
  const { group: _old, ...rest } = section
  if (group === "template") return rest as T
  if (section.type === group) return rest as T
  return { ...rest, group } as T
}

const hasContent = (s: GroupedSection) =>
  Object.keys(s.settings ?? {}).length > 0 || (Array.isArray(s.blocks) && s.blocks.length > 0)

// ── Adding one ──────────────────────────────────────────────────────────────

export interface Placement<T> {
  sections: T[]
  /** The group it went into. */
  group: SectionGroup
  /** Headers or footers it took the place of: hidden, every setting kept. */
  replaced: string[]
}

/**
 * A new section, put where it belongs.
 *
 * `group` is where Add section was pressed; it is used when the section may
 * go there, and otherwise the section goes to the first group it may go to.
 * So an announcement bar added from the middle of a page lands in the Header
 * group, above the header, and a header added from anywhere is the header.
 *
 * `at` counts sections inside the group it lands in (0 is its top). Left
 * out, a header group section goes above the header, a footer group section
 * above the footer, and a page section at the end of the page.
 *
 * A header added where a header is drawn takes its place, and the old one is
 * hidden rather than removed (ask first: `replacesVisible`).
 */
export function placeSection<T extends GroupedSection>(
  list: readonly T[],
  section: T,
  opts: { groups: readonly SectionGroup[]; kind?: SectionKind | null; group?: SectionGroup | null; at?: number | null; kindOfType?: KindOfType },
): Placement<T> {
  const allowed = opts.groups.length > 0 ? opts.groups : (["template"] as SectionGroup[])
  const kind = opts.kind ?? null
  const target: SectionGroup = kind ?? (opts.group && allowed.includes(opts.group) ? opts.group : allowed[0])
  /* A place counted in the group Add section was pressed in means nothing in another group. */
  const at = !opts.group || opts.group === target ? opts.at : null
  const g = splitGroups(list)
  const placed = inGroup(section, target)
  const into = [...g[target]]
  const replaced: string[] = []

  if (kind && target !== "template") {
    let firstAt = -1
    into.forEach((s, i) => {
      if (!s.hidden && isKind(s, kind, opts.kindOfType)) {
        replaced.push(s.id)
        into[i] = { ...s, hidden: true }
        if (firstAt === -1) firstAt = i
      }
    })
    if (firstAt !== -1) into.splice(firstAt, 0, placed)
    else if (at != null) into.splice(Math.max(0, Math.min(into.length, at)), 0, placed)
    /* No header drawn: under the announcement bars, which is where a header sits. */
    else into.push(placed)
  } else if (at != null) {
    into.splice(Math.max(0, Math.min(into.length, at)), 0, placed)
  } else if (target === "header" || target === "footer") {
    /* Above the header (or the footer), the way an announcement bar sits. */
    const chromeAt = into.findIndex((s) => isKind(s, target, opts.kindOfType))
    if (chromeAt === -1) into.push(placed)
    else into.splice(chromeAt, 0, placed)
  } else {
    into.push(placed)
  }

  const next = { ...g, [target]: into } as Record<SectionGroup, T[]>
  return { sections: [...next.header, ...next.template, ...next.footer, ...next.overlay], group: target, replaced }
}

/** The header (or footer) a new one would take the place of, or null when none is drawn. */
export function visibleOfKind<T extends GroupedSection>(list: readonly T[], kind: SectionKind, kindOfType?: KindOfType): T | null {
  return list.find((s) => groupOf(s) === kind && !s.hidden && isKind(s, kind, kindOfType)) ?? null
}

/**
 * Show or hide a section, keeping one header drawn at most. Showing a header
 * while another is drawn hides the other: the eye is how somebody goes back
 * to the header they had.
 */
export function toggleShown<T extends GroupedSection>(list: readonly T[], id: string, kindOfType?: KindOfType): T[] {
  const target = list.find((s) => s.id === id)
  if (!target) return [...list]
  const showing = !!target.hidden
  const group = groupOf(target)
  const kind: SectionKind | null =
    showing && (group === "header" || group === "footer") && isKind(target, group, kindOfType) ? group : null
  return list.map((s) => {
    if (s.id === id) {
      if (!showing) return { ...s, hidden: true }
      const { hidden: _h, ...rest } = s
      return { ...rest, hidden: false } as T
    }
    if (kind && groupOf(s) === kind && !s.hidden && isKind(s, kind, kindOfType)) return { ...s, hidden: true }
    return s
  })
}

// ── Repairing what is already saved ─────────────────────────────────────────

export interface Repair<T> {
  sections: T[]
  changed: boolean
  /** Sections that were on the page and are a header or footer, now in their group. */
  moved: string[]
  /** Headers or footers that were drawn twice: the one kept is drawn, these are hidden. */
  hidden: string[]
  /** The header and footer that are drawn after the repair. */
  kept: { header?: string; footer?: string }
}

/**
 * ONE HEADER AND ONE FOOTER, OUT OF WHATEVER WAS SAVED.
 *
 * A site imported from a theme an AI wrote, or saved before groups existed,
 * can hold the built-in header and a header written as a section file, the
 * second one on the page under the first. Both are drawn. This puts every
 * header and footer in its group and keeps one of each drawn:
 *
 *   the creator's own (a section file of kind header that has settings or
 *   blocks), because that is where their work went; otherwise the built-in;
 *   otherwise the first.
 *
 * The others are HIDDEN, never removed. Nothing about them is lost, the eye
 * in the Header group brings one back, and running this again changes
 * nothing. A header somebody hid on purpose stays hidden and is not counted.
 */
export function repairChrome<T extends GroupedSection>(list: readonly T[], kindOfType?: KindOfType): Repair<T> {
  const moved: string[] = []
  const hidden: string[] = []
  const kept: Repair<T>["kept"] = {}
  let changed = false

  const relabelled = list.map((s) => {
    if (groupOf(s) !== "template") return s
    const kind = isKind(s, "header", kindOfType) ? "header" : isKind(s, "footer", kindOfType) ? "footer" : null
    if (!kind) return s
    moved.push(s.id)
    changed = true
    return inGroup(s, kind)
  })

  const g = splitGroups(relabelled)
  for (const kind of ["header", "footer"] as const) {
    const drawn = g[kind].filter((s) => !s.hidden && isKind(s, kind, kindOfType))
    if (drawn.length === 0) continue
    const keeper =
      drawn.find((s) => s.type !== kind && hasContent(s)) ??
      drawn.find((s) => s.type === kind) ??
      drawn[0]
    kept[kind] = keeper.id
    if (drawn.length === 1) continue
    g[kind] = g[kind].map((s) => {
      if (s === keeper || s.hidden || !isKind(s, kind, kindOfType)) return s
      hidden.push(s.id)
      changed = true
      return { ...s, hidden: true }
    })
  }

  const ordered = [...g.header, ...g.template, ...g.footer, ...g.overlay]
  if (!changed && ordered.some((s, i) => s !== list[i])) changed = true
  return { sections: changed ? ordered : (list as T[]), changed, moved, hidden, kept }
}

// ── A kind for every type, from the files a site has ────────────────────────

const kindCache = new Map<string, SectionKind | null>()

/** A section file's kind, by its schema and its markup. Cached by the text. */
export function kindOfSource(source: string, type: string): SectionKind | null {
  const key = `${type}\0${source}`
  const hit = kindCache.get(key)
  if (hit !== undefined) return hit
  let kind: SectionKind | null = null
  const parsed = parseStorelib(source, `sections/${type}.storelib`)
  if (parsed.ok) {
    let schema: Record<string, unknown> | null = null
    try {
      schema = JSON.parse(parsed.value.schema.text) as Record<string, unknown>
    } catch {
      schema = null
    }
    kind = kindOf(schema, { type, template: parsed.value.template.text })
  }
  if (kindCache.size > 2000) kindCache.clear()
  kindCache.set(key, kind)
  return kind
}

/**
 * The kind of every type a site can place: its saved section files first
 * (a file shadows the theme's of the same type), then the schemas it was
 * given (the built-in ones, which name only the header and the footer).
 */
export function kindLookup(
  sources: Record<string, string> | null | undefined,
  schemas?: Record<string, SchemaLike>,
): KindOfType {
  return (type: string) => {
    if (type === "header" || type === "footer") return type
    const source = sources?.[`sections/${type}.storelib`]
    if (typeof source === "string" && source.trim()) return kindOfSource(source, type)
    const schema = schemas?.[type]
    return schema ? kindOf(schema, { type }) : null
  }
}
