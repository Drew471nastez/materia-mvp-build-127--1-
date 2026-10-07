/**
 * ===========================================================================
 *  WHAT A SCHEMA MEANT, WHEN IT SAID SOMETHING ELSE
 * ===========================================================================
 * Sections are written by people and by models, and both make the same few
 * mistakes in the schema. The file still compiles, the page still draws, and
 * the creator is left with the wrong control in the sidebar:
 *
 *   A PICTURE DECLARED AS TEXT. `{ "type": "text", "id": "logo_url" }` with a
 *   picture's address in its default. The sidebar shows a text box, so the
 *   creator has to host the logo somewhere and paste its address, when every
 *   other picture on the site is chosen from the media library.
 *
 *   A MENU TYPED OUT AS PAIRS. `link_1_label`, `link_1_url`, `link_2_label`...
 *   The header already has the site's links, and Website settings ›
 *   Navigation has every menu; a section that types its own copy drifts from
 *   them the day the creator adds a page.
 *
 * The first is corrected here, without touching the file or the stored
 * value: the setting is READ as an image_picker, so the sidebar draws the
 * picker (with the address box under it) and the value saved under the old
 * type keeps working, because an image_picker takes an address too. The
 * compile says so in plain words, so whoever wrote the file can fix the
 * declaration. The second cannot be corrected without guessing which menu
 * was meant, so it is only said.
 *
 * PURE. The same answer in the editor, on the server and in a test.
 */
import { resolveControlType } from "../controls/registry"
import type { SettingDefinition } from "../types"

/* ── pictures declared as text ─────────────────────────────────────────── */

/** Words in an id or label that say the setting is a picture. */
const IMAGE_WORD = /(^|[^a-z])(image|img|logo|photo|picture|pic|avatar|icon_image|src|thumbnail|banner_image|cover_image|headshot|portrait)(s?)($|[^a-z])/i

/**
 * Words that say it is ABOUT a picture without being one: its alt text, its
 * caption, its size, the link it goes to. `logo_text` is the store name typed
 * where there is no logo; `image_alt` is the description of a picture.
 */
const NOT_THE_PICTURE = /(^|[^a-z])(alt|text|label|title|caption|name|description|desc|heading|size|width|height|ratio|aspect|fit|position|focus|focal|align|alignment|style|shape|radius|border|color|colour|opacity|overlay|link|href|target|layout|count|max|min|offset|padding|margin|gap|show|hide|enable|enabled|use|toggle|video|audio|file|pdf|embed|iframe)($|[^a-z])/i

/** The same, for a label: narrower, because a label is a sentence ("Photo to show"). */
const LABEL_NOT_THE_PICTURE = /(^|[^a-z])(alt|text|caption|title|name|description|size|width|height|link|position|focus|video|file)($|[^a-z])/i

/** An address that is a picture: by its extension, by a host that only serves pictures, or by a storage path. */
export function looksLikeImageUrl(value: unknown): boolean {
  if (typeof value !== "string") return false
  const v = value.trim()
  if (v === "") return false
  if (/^asset:\/\/[a-f0-9]{16,64}$/.test(v)) return true
  if (/^data:image\//i.test(v)) return true
  if (!/^(https?:\/\/|\/(?![/\\]))/i.test(v)) return false
  const path = v.split(/[?#]/)[0].toLowerCase()
  if (/\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/.test(path)) return true
  return /(images\.unsplash\.com|res\.cloudinary\.com|\.imgix\.net|cdn\.shopify\.com\/s\/files|\/storage\/v1\/object\/public\/)/i.test(v)
}

/** The text a setting is known by: its id with _ as spaces, and its label. */
function words(s: { id?: unknown; label?: unknown }): string {
  return `${String(s.id ?? "").replace(/_/g, " ")} ${String(s.label ?? "")}`
}

/**
 * Is this text or url setting obviously a picture? Its id or label says
 * picture and nothing that makes it a property of one, and its default is a
 * picture's address or empty. A default that is a word ("Luca") or a page
 * ("/about") says it is not.
 */
export function isImageInDisguise(s: { type?: unknown; id?: unknown; label?: unknown; default?: unknown }): boolean {
  const type = typeof s.type === "string" ? resolveControlType(s.type) : null
  if (type !== "text" && type !== "url") return false
  const id = String(s.id ?? "")
  /* The id is the strongest signal; the label only backs it up. */
  const name = words(s)
  if (!IMAGE_WORD.test(name)) return false
  if (NOT_THE_PICTURE.test(id.replace(/_/g, " "))) return false
  if (LABEL_NOT_THE_PICTURE.test(String(s.label ?? ""))) return false
  /* `url` may end an image's id (logo_url, image_url) but a url setting called "link" is a link. */
  const d = s.default
  if (d === undefined || d === null || d === "") return true
  return looksLikeImageUrl(d)
}

export interface NormaliseNote {
  /** Dotted path of the setting: settings[3], blocks[0].settings[1]. */
  path: string
  message: string
}

/**
 * The settings with every picture in disguise read as an image_picker. The
 * type it was written with is kept as `declared_type`, so a value that turns
 * out not to be an address (resolve.ts) is still drawn the way it was before.
 * Returns the same array when nothing changed.
 */
export function normaliseSettings<T extends SettingDefinition>(list: T[], at: string, notes: NormaliseNote[]): T[] {
  let out: T[] | null = null
  list.forEach((s, i) => {
    if (!isImageInDisguise(s)) return
    out ??= [...list]
    const declared = String(s.type)
    out[i] = { ...s, type: "image_picker", declared_type: declared }
    notes.push({
      path: `${at}[${i}]`,
      message: `"${s.id}" holds a picture but is declared as "${declared}", so it is shown as an image picker with an address box under it. Declare it as { "type": "image_picker", "id": "${s.id}" } and print it with {{ settings.${s.id} | asset }}.`,
    })
  })
  return out ?? list
}

/* ── menus typed out as pairs ──────────────────────────────────────────── */

/**
 * `link_1_label` / `link_1_url`, `nav_2_text` / `nav_2_link`, `menu_item_3_title`...
 * Two or more numbered pairs in one list is a menu written by hand.
 */
export function numberedLinkPairs(list: { id?: unknown; type?: unknown }[]): number {
  const labels = new Set<string>()
  const urls = new Set<string>()
  for (const s of list) {
    const id = String(s.id ?? "")
    const m = id.match(/^(.*?)(\d{1,2})_?(label|text|title|name|url|link|href)$/)
    if (!m || !/(link|nav|menu|item)/.test(m[1])) continue
    const key = `${m[1]}${m[2]}`
    if (m[3] === "url" || m[3] === "link" || m[3] === "href") urls.add(key)
    else labels.add(key)
  }
  let n = 0
  for (const k of labels) if (urls.has(k)) n++
  return n
}

/* ── a section's own entrance animation ───────────────────────────────── */

/**
 * The values a section's `animation` setting may hold. "theme" follows Theme
 * settings › Animations; anything else is this section's own, whatever the
 * theme says. The runtime that plays them reads the setting by this id.
 */
export const SECTION_ANIMATIONS = ["theme", "none", "fade", "fade_up", "zoom", "slide_left", "slide_right", "blur", "rise"] as const
export type SectionAnimation = (typeof SECTION_ANIMATIONS)[number]

/** The setting id the runtime reads a section's animation from. */
export const ANIMATION_SETTING_ID = "animation"

/* ── where a section may go ─────────────────────────────────────────────── */

export const SECTION_GROUPS = ["header", "footer", "template"] as const
export type SectionGroup = (typeof SECTION_GROUPS)[number]
export const SECTION_KINDS = ["header", "footer"] as const
export type SectionKind = (typeof SECTION_KINDS)[number]

/**
 * Which groups a section may be placed in, from what its schema says:
 *
 *   "kind": "header"                 it IS the header: the header group, alone
 *   "enabled_on": { "groups": [...] } only these
 *   "disabled_on": { "groups": [...] } every group but these
 *   "category": "announcement"        the header group, with nothing said
 *   nothing                           the page's own sections (template)
 *
 * The builder decides what to do with the answer (an announcement bar goes
 * above the header, a section of kind header replaces the built-in one).
 */
export function sectionGroupsOf(schema: { kind?: unknown; enabled_on?: unknown; disabled_on?: unknown; category?: unknown }): SectionGroup[] {
  const kind = schema.kind
  if (kind === "header" || kind === "footer") return [kind]
  const groupsIn = (v: unknown): SectionGroup[] | null => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return null
    const g = (v as { groups?: unknown }).groups
    if (!Array.isArray(g)) return null
    if (g.includes("*")) return [...SECTION_GROUPS]
    return SECTION_GROUPS.filter((x) => g.includes(x))
  }
  const enabled = groupsIn(schema.enabled_on)
  if (enabled) return enabled
  const disabled = groupsIn(schema.disabled_on)
  if (disabled) return SECTION_GROUPS.filter((g) => !disabled.includes(g))
  if (typeof schema.category === "string" && schema.category.trim().toLowerCase() === "announcement") return ["header"]
  return ["template"]
}
