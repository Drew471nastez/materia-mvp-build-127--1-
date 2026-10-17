/**
 * ===========================================================================
 *  WHAT A SETTING IS WORTH, RIGHT NOW
 * ===========================================================================
 * A template instance stores only what a person changed. Everything else is
 * decided here, in one order, every time:
 *
 *   1. Storelib's own default for the control type     (registry fallback)
 *   2. the theme's settings, for tokens                 (theme)
 *   3. the section schema's default                     (setting.default)
 *   4. the instance's value                             (saved)
 *   5. for a block, the block instance's value          (saved, per block)
 *
 * Later wins. `resolved = saved ?? schemaDefault ?? controlFallback`, with
 * the theme supplying tokens rather than per-setting values, which is why
 * it is a level rather than a step in the chain. Documented in
 * docs/theme/07-settings-resolution.md, and this file is that document's
 * implementation.
 *
 * Three transformations happen on the way through, so a template never has
 * to do them:
 *
 *   RESPONSIVE  a setting marked `responsive: true` comes out as
 *               `{desktop, tablet, mobile}` with every breakpoint filled,
 *               whatever the person set. Set desktop only, and tablet and
 *               mobile inherit it. Set all three, and each is its own.
 *
 *   ASSETS      an `asset://…` reference in an image, video or file setting
 *               comes out as the URL this account serves it from. The
 *               template sees a URL; the stored data never contains one.
 *
 *   UNKNOWN     a saved key the schema does not declare is passed through
 *               untouched. A theme from a later engine, or a setting that
 *               was renamed, keeps its data.
 */
import { controlFor, holdsValue, resolveControlType, type ControlType } from "./controls/registry"
import { withCollectionBindings } from "./collection-binding"
import {
  Linked,
  cleanBackground,
  cleanDatetime,
  cleanFocalPoint,
  cleanMenu,
  isColor,
  parseVideoUrl,
  safeHref,
  safeMediaUrl,
  sanitizeInlineHtml,
  VIDEO_HOSTS,
  type Menu,
} from "./values"
import { legacySchemeValues, schemeTokenName, themeColorSchemes } from "./color-schemes"
import { themeTypography } from "./typography"
import { shopObject } from "./globals"
import { faviconOf } from "@/lib/website-builder/favicon-sync"
import { BREAKPOINTS, MAX_BLOCK_DEPTH, isAssetRef, type BlockInstanceData, type Breakpoint, type ResponsiveValue, type SectionInstanceData, type SectionSchema, type SettingDefinition, type StorefrontCollection, type StorefrontCommunity, type ThemeBlockSchema } from "./types"

export interface ResolveOptions {
  /** `asset://…` → URL. Missing references resolve to "". */
  assets?: Record<string, string>
  /**
   * The products a `product_picker` or `product_list` may name, block-shaped
   * like `products`. Absent means none are known: a picker then stays the
   * address it holds and a list comes out empty.
   */
  catalog?: CatalogItem[]
  /** The site's menus by handle, for `link_list`. */
  menus?: Record<string, Menu>
  /**
   * The creator's communities a `community_picker` may name, by id. Absent,
   * or an id that is not here (somebody else's, a draft, a private one, or
   * communities switched off), and the setting is empty.
   */
  communities?: Record<string, StorefrontCommunity>
  /**
   * The creator's published collections a `collection_picker` or
   * `collection_list` may name, by id. Absent, or an id that is not here
   * (somebody else's, unpublished, deleted), and the setting is empty.
   */
  collections?: Record<string, StorefrontCollection>
  /**
   * What the page itself is about, for a picker set to CURRENT (`@current`,
   * Shopify's "dynamic source"): the product on a product page, the
   * collection on a collection page. Elsewhere a CURRENT picker is empty.
   */
  current?: { product?: CatalogItem | null; collection?: StorefrontCollection | null }
}

/** The value a product or collection picker holds to mean "whatever this page is about". */
export const CURRENT_REF = "@current"

/** A product as a section is handed it: `{ id, type, settings: { title, price, … } }`. */
export interface CatalogItem {
  id: string
  type?: string
  settings: Record<string, unknown>
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/**
 * Fill a responsive value downwards: mobile ← tablet ← desktop.
 *
 * THE DEFAULT MAY ITSELF BE PER BREAKPOINT, and for a while this did not
 * know that. A schema saying `"default": { "desktop": 3, "mobile": 1 }` and
 * an instance that had never touched the setting produced
 * `{ desktop: {desktop:3,mobile:1}, tablet: {…}, mobile: {…} }` — the whole
 * object at every breakpoint. A template writing that into a custom property
 * gets `--cols-d: {"desktop":3,...}`, `grid-template-columns` fails to parse,
 * and the grid quietly collapses to one column at every width. It looks like
 * a section that is very responsive.
 *
 * So the fallback is expanded first, by the same downward rule.
 */
export function fillResponsive<T>(v: unknown, fallback: T): ResponsiveValue<T> {
  const fb: ResponsiveValue<T> =
    isPlain(fallback) && BREAKPOINTS.some((b) => b in fallback)
      ? (() => {
          const d = (fallback as Record<string, unknown>).desktop as T
          const t = ((fallback as Record<string, unknown>).tablet ?? d) as T
          const m = ((fallback as Record<string, unknown>).mobile ?? t) as T
          return { desktop: d, tablet: t, mobile: m }
        })()
      : { desktop: fallback, tablet: fallback, mobile: fallback }

  if (isPlain(v) && BREAKPOINTS.some((b) => b in v)) {
    // A value set at one breakpoint still carries down to the ones below it,
    // which is what somebody means by setting only the desktop number.
    const desktop = (v.desktop ?? fb.desktop) as T
    const tablet = (v.tablet ?? v.desktop ?? fb.tablet) as T
    const mobile = (v.mobile ?? v.tablet ?? v.desktop ?? fb.mobile) as T
    return { desktop, tablet, mobile }
  }
  if (v === undefined) return fb
  return { desktop: v as T, tablet: v as T, mobile: v as T }
}

/* ── what a stored value is allowed to be ──────────────────────────────── */

/**
 * ===========================================================================
 *  A VALUE THE SCHEMA DOES NOT ALLOW IS NOT DRAWN
 * ===========================================================================
 * The schema says what each setting holds, and until now nothing held a
 * stored value to it on the way to the page. A `select` somebody's AI set to
 * `1 / 1; background: url(//x)` was printed into a style attribute, a range
 * holding a word became `--pad: bigpx`, a link holding `javascript:` was
 * printed into any `href` whose author forgot `| url`.
 *
 * So each value is checked against its control here, where every surface
 * passes through (the published page, the builder's canvas, the export),
 * and a value that fails is drawn as the setting's default. The stored value
 * is left exactly as it was: this decides what is DRAWN, never what is
 * kept, so nothing a creator saved is lost to a rule they cannot see.
 *
 * Returns `undefined` for "not allowed", which the caller turns into the
 * default. An empty string is an allowed value for every text-like control:
 * it means "nothing here", and a template already treats it that way.
 */
function allowed(type: ControlType, v: unknown, def: SettingDefinition, opts: ResolveOptions): unknown {
  switch (type) {
    case "text":
    case "textarea":
      return typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : undefined
    case "richtext":
    case "html":
      /* Cleaned against their allow lists when saved and again when read,
         by the application, which has the HTML parser the engine does not
         carry: lib/website-builder/sanitize.ts. */
      return typeof v === "string" ? v : undefined
    case "inline_richtext":
      return typeof v === "string" ? sanitizeInlineHtml(v) : undefined
    case "number":
    case "range": {
      const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
      if (!Number.isFinite(n)) return undefined
      /* A slider's value from before its range moved is drawn at the nearest end, as the sidebar shows it; the stored value stays until it is moved. */
      if (type === "range") {
        if (typeof def.min === "number" && Number.isFinite(def.min) && n < def.min) return def.min
        if (typeof def.max === "number" && Number.isFinite(def.max) && n > def.max) return def.max
      }
      return n
    }
    case "toggle":
    case "checkbox":
      return typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : undefined
    case "select":
    case "radio": {
      if (typeof v !== "string" && typeof v !== "number") return undefined
      const s = String(v)
      const options = Array.isArray(def.options) ? def.options : []
      return options.length === 0 || options.some((o) => o && o.value === s) ? s : undefined
    }
    case "color":
      /* `scheme.accent` is kept as written; render.ts swaps it for the section's own scheme colour. */
      return v === "" ? "" : isColor(v) ? (v as string).trim() : schemeTokenName(v) !== null ? (v as string).trim() : undefined
    case "color_background":
      return v === "" ? "" : cleanBackground(v) || undefined
    case "color_scheme":
      return typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : undefined
    case "font_picker":
      /* A font name lands in `font-family`, inside a style attribute or a
         stylesheet: letters, digits, spaces and hyphens, nothing that ends
         a declaration. */
      return typeof v === "string" && /^[A-Za-z0-9 _-]{0,80}$/.test(v) ? v : undefined
    case "alignment":
      return v === "left" || v === "center" || v === "right" ? v : undefined
    case "datetime":
      return v === "" ? "" : cleanDatetime(v) || undefined
    case "focal_point":
      return v === "" ? "" : cleanFocalPoint(v) || undefined
    case "image_picker": {
      if (typeof v !== "string") return undefined
      const url = safeMediaUrl(isAssetRef(v) ? (opts.assets?.[v] ?? "") : v)
      /*
        A picture the schema declared as text (schema/normalise.ts) may hold
        something that is not an address: a word somebody typed while it was
        a text box. It is drawn as it was before rather than dropped, so
        reading the setting as a picture never loses what was saved. Only a
        script address is refused, as it would be anywhere.
      */
      if (url === "" && def.declared_type && !isAssetRef(v) && v.trim() !== "" && !/^\s*(javascript|vbscript|data):/i.test(v)) return v
      return url
    }
    case "video_picker":
    case "file_picker": {
      if (typeof v !== "string") return undefined
      const s = isAssetRef(v) ? (opts.assets?.[v] ?? "") : v.trim()
      return s === "" || /^(https?:\/\/|\/(?![/\\]))/i.test(s) ? s : ""
    }
    case "image_gallery":
      if (!Array.isArray(v)) return undefined
      return v
        .filter((x): x is string => typeof x === "string")
        .map((x) => safeMediaUrl(isAssetRef(x) ? (opts.assets?.[x] ?? "") : x))
        .filter((x) => x !== "")
    case "icon_picker":
      return typeof v === "string" && /^[a-z0-9-]{0,64}$/.test(v) ? v : undefined
    case "url":
    case "page_picker":
      return typeof v === "string" ? safeHref(v) : undefined
    case "video_url": {
      if (typeof v !== "string") return undefined
      if (v.trim() === "") return ""
      const accept = Array.isArray(def.accept) ? (def.accept as string[]) : VIDEO_HOSTS
      return parseVideoUrl(v, accept) ? v.trim() : ""
    }
    case "community_picker":
      return typeof v === "string" ? communityRef(v, opts) : undefined
    case "product_picker":
      return typeof v === "string" ? productRef(v, opts) : undefined
    case "product_list":
      return Array.isArray(v) ? productList(v, def, opts) : undefined
    case "collection_picker":
      return typeof v === "string" ? collectionRef(v, opts) : undefined
    case "collection_list":
      return Array.isArray(v) ? collectionList(v, def, opts) : undefined
    case "link_list":
      return typeof v === "string" ? menuFor(v, opts) : undefined
    case "header":
    case "paragraph":
    case "divider":
      return undefined
  }
}

/* ── references: products and menus ───────────────────────────────────── */

const catalogIndex = new WeakMap<CatalogItem[], Map<string, CatalogItem>>()

/** A catalogue by id and by address, built once per catalogue. */
function lookupIn(catalog: CatalogItem[] | undefined): Map<string, CatalogItem> {
  if (!catalog) return new Map()
  const hit = catalogIndex.get(catalog)
  if (hit) return hit
  const map = new Map<string, CatalogItem>()
  for (const item of catalog) {
    if (!item || typeof item.id !== "string") continue
    map.set(item.id, item)
    const url = item.settings?.url
    if (typeof url === "string" && url) map.set(url, item)
    /* A handle on its own ("waxed-tote"), as a Shopify theme stores a product, names the same product. */
    const slug = typeof item.settings?.slug === "string" && item.settings.slug ? item.settings.slug : typeof url === "string" ? (url.match(/^\/products\/([^/?#]+)$/)?.[1] ?? "") : ""
    if (slug && !map.has(slug)) map.set(slug, item)
  }
  catalogIndex.set(catalog, map)
  return map
}

/**
 * A product picker holds an address (`/products/linen-apron`) or an id.
 * When the page knows that product, the setting becomes a Linked value: it
 * prints as the address, as it always did, and it carries the product's own
 * title, price and picture for a template that asks.
 */
function productRef(v: string, opts: ResolveOptions): unknown {
  const key = v.trim()
  if (key === "") return ""
  if (key === CURRENT_REF) {
    /* The page's own product, at its fullest: the catalogue's card when it has one (price, variants, checkout), else what the page knows. */
    const page = opts.current?.product
    if (!page) return ""
    const full = lookupIn(opts.catalog).get(page.id) ?? (typeof page.settings.url === "string" ? lookupIn(opts.catalog).get(page.settings.url) : undefined)
    const item = full ? { ...full, settings: { ...page.settings, ...full.settings } } : page
    return new Linked(safeHref(typeof item.settings.url === "string" ? item.settings.url : "#"), { id: item.id, ...item.settings, ...ratingOf(item) })
  }
  const item = lookupIn(opts.catalog).get(key)
  if (!item) return safeHref(key)
  const href = safeHref(typeof item.settings.url === "string" ? item.settings.url : key)
  return new Linked(href, { id: item.id, ...item.settings, ...ratingOf(item) })
}

/** Storelib Reviews' rating, which a card carries beside its settings (lib/website-builder/shop-products.ts withRatings). */
function ratingOf(item: unknown): { rating?: unknown } {
  const r = (item as { rating?: unknown } | null)?.rating
  return r && typeof r === "object" ? { rating: r } : {}
}

/**
 * A community picker holds an id. When the page knows that community (the
 * creator's own, published and public), the setting becomes a Linked value
 * that prints as its address and carries its name, figures and button. Any
 * other id is empty, so a template's `{% if settings.community.name %}`
 * draws nothing for it.
 */
function communityRef(v: string, opts: ResolveOptions): unknown {
  const key = v.trim().toLowerCase()
  if (key === "") return ""
  const item = opts.communities?.[key]
  if (!item) return ""
  return new Linked(safeHref(item.url), { ...item, id: key } as Record<string, unknown>)
}

/**
 * A collection picker holds an id. When the page knows that collection (the
 * creator's own and published), the setting becomes a Linked value that
 * prints as its address and carries its title, picture, count and first
 * products. Any other id is empty.
 */
function collectionRef(v: string, opts: ResolveOptions): unknown {
  const item = collectionById(v, opts)
  if (!item) return ""
  return new Linked(safeHref(item.url), collectionFields(item))
}

function collectionById(v: string, opts: ResolveOptions): StorefrontCollection | undefined {
  const key = v.trim().toLowerCase()
  if (key === CURRENT_REF) return opts.current?.collection ?? undefined
  if (key === "" || !opts.collections) return undefined
  if (Object.prototype.hasOwnProperty.call(opts.collections, key)) return opts.collections[key]
  /* A handle ("summer") or its address ("/collections/summer"), as a Shopify theme stores one, names the same collection. */
  const handle = key.replace(/^\/collections\//, "")
  return Object.values(opts.collections).find((c) => c.handle.toLowerCase() === handle)
}

/** What a template reads off a collection: plain values, its address made safe. */
function collectionFields(c: StorefrontCollection): Record<string, unknown> {
  return {
    id: c.id,
    title: c.title,
    handle: c.handle,
    description: c.description,
    image: safeMediaUrl(c.image),
    url: safeHref(c.url),
    products_count: c.products_count,
    products: c.products,
  }
}

/** A collection, block-shaped like a product in `products`, for a loop. */
export function collectionBlock(c: StorefrontCollection): { id: string; type: string; settings: Record<string, unknown> } {
  return { id: c.id, type: "collection", settings: collectionFields(c) }
}

/** The chosen collections, in the creator's order, each once, up to the limit. */
function collectionList(v: unknown[], def: SettingDefinition, opts: ResolveOptions): CatalogItem[] {
  const limit = typeof def.limit === "number" && Number.isInteger(def.limit) ? Math.min(24, Math.max(1, def.limit)) : 12
  const seen = new Set<string>()
  const out: CatalogItem[] = []
  for (const raw of v) {
    if (typeof raw !== "string") continue
    const item = collectionById(raw, opts)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(collectionBlock(item))
    if (out.length >= limit) break
  }
  return out
}

/** The chosen products, in the creator's order, each once, up to the limit. */
function productList(v: unknown[], def: SettingDefinition, opts: ResolveOptions): CatalogItem[] {
  const limit = typeof def.limit === "number" && Number.isInteger(def.limit) ? Math.min(24, Math.max(1, def.limit)) : 12
  const index = lookupIn(opts.catalog)
  const seen = new Set<string>()
  const out: CatalogItem[] = []
  for (const raw of v) {
    if (typeof raw !== "string") continue
    const item = index.get(raw.trim())
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    out.push({ id: item.id, type: item.type ?? "product", settings: item.settings })
    if (out.length >= limit) break
  }
  return out
}

/** A menu as a template reads it. An unknown handle is an empty menu, never an error. */
function menuFor(handle: string, opts: ResolveOptions): { handle: string; title: string; links: ReturnType<typeof cleanMenu> } {
  const h = handle.trim()
  const menu = h ? opts.menus?.[h] : undefined
  if (!menu) return { handle: h, title: "", links: [] }
  return { handle: h, title: menu.title, links: cleanMenu(menu.links) }
}

/**
 * One setting, resolved. Exposed for the editor, which shows the resolved
 * value in a control and a "reset to default" affordance when it differs.
 *
 * Saved, else the schema's default, else the control's own fallback, and
 * each of those only if the control allows it: a saved value the control
 * refuses is drawn as the default.
 */
export function resolveOne(def: SettingDefinition, saved: unknown, opts: ResolveOptions = {}): unknown {
  const control = controlFor(def.type)
  if (!control || control.value === "none") return undefined
  const type = resolveControlType(def.type)!
  /*
    A range or number with no default starts at its lowest value, not at the
    registry's 0: a heading size declared 40 to 120 with no default is 40,
    never a heading 0px tall. The validator says so as a warning.
  */
  const lowest = (type === "range" || type === "number") && def.default === undefined && typeof def.min === "number" && Number.isFinite(def.min) && (control.fallback as number) < def.min ? def.min : undefined
  const fallback = def.default !== undefined ? def.default : lowest !== undefined ? lowest : control.fallback
  /*
    A colour that follows the scheme by default and holds "" is following it.
    The builder's Advanced colors writes a heading or button override into
    the scheme and blanks the older field beside it (heading_color,
    button_color: lib/website-builder/section-overrides.ts), so "" here means
    "the scheme's colour, override included", never "no colour at all".
  */
  if (type === "color" && saved === "" && schemeTokenName(def.default) !== null) saved = undefined
  const pick = (v: unknown, fb: unknown): unknown => {
    const ok = v === undefined ? undefined : allowed(type, v, def, opts)
    if (ok !== undefined) return ok
    const d = allowed(type, fb, def, opts)
    return d !== undefined ? d : allowed(type, control.fallback, def, opts) ?? control.fallback
  }
  if (def.responsive && control.responsive) {
    const r = fillResponsive(saved, fallback)
    const f = fillResponsive(undefined, fallback)
    return {
      desktop: pick(r.desktop, f.desktop),
      tablet: pick(r.tablet, f.tablet),
      mobile: pick(r.mobile, f.mobile),
    }
  }
  return pick(saved, fallback)
}

export function resolveSettings(
  defs: SettingDefinition[],
  saved: Record<string, unknown> | undefined,
  opts: ResolveOptions = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const declared = new Set<string>()
  for (const def of defs) {
    if (!holdsValue(def.type)) continue
    declared.add(def.id)
    out[def.id] = resolveOne(def, saved?.[def.id], opts)
  }
  // Unknown keys survive. They are not the engine's to drop.
  for (const [k, v] of Object.entries(saved ?? {})) {
    if (!declared.has(k)) out[k] = v
  }
  /* A picture or a title that is the picked collection's until somebody sets one (./collection-binding.ts). */
  return withCollectionBindings(defs, out)
}

/**
 * ===========================================================================
 *  A RENAMED SETTING KEEPS ITS VALUE
 * ===========================================================================
 * A schema may say `"migrations": [{ "from": "title", "to": "heading" }]`,
 * and the docs have always promised that the old value is then read under
 * the new name. Nothing did the reading, so renaming a setting quietly
 * emptied it on every page that had filled it in.
 *
 * Applied in order, oldest first, and only where the new name holds
 * nothing: a value saved under the new name is newer than any under the
 * old one. The old key stays in the stored data, untouched.
 */
function migrated(schema: SectionSchema, saved: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const steps = Array.isArray(schema.migrations) ? schema.migrations : []
  if (!saved || steps.length === 0) return saved
  let out: Record<string, unknown> | undefined
  for (const step of steps) {
    if (!step || typeof step.from !== "string" || typeof step.to !== "string") continue
    const current = out ?? saved
    if (current[step.to] !== undefined || current[step.from] === undefined) continue
    out = { ...current, [step.to]: current[step.from] }
  }
  return out ?? saved
}

/** A block, resolved: its settings filled, and its own blocks the same way. */
export interface ResolvedBlock {
  id: string
  type: string
  settings: Record<string, unknown>
  /** Its theme blocks in order, without the static ones. */
  blocks: ResolvedBlock[]
  /** Its static blocks, by the id its template places each under. */
  statics: Record<string, ResolvedBlock>
  hidden?: boolean
}

type BlockOwner = { blocks?: Record<string, BlockInstanceData>; block_order?: string[] }

/**
 * A whole instance against its schema: settings, then each block in
 * `block_order` against its block definition, and each theme block's own
 * blocks the same way, as deep as blocks nest. Blocks whose type nobody
 * declares any more are kept with their raw settings, so a section update
 * that drops a block type does not silently drop the content in it.
 *
 * Static blocks (the ones a template places with `content_for "block"`) are
 * not in `blocks`: they are in `statics`, by id, hidden ones included and
 * marked, so the template can tell "hidden" from "never edited".
 */
export function resolveInstance(
  schema: SectionSchema,
  instance: SectionInstanceData,
  opts: ResolveOptions & { themeBlock?: (type: string) => ThemeBlockSchema | null } = {},
): { settings: Record<string, unknown>; blocks: ResolvedBlock[]; statics: Record<string, ResolvedBlock> } {
  const settings = resolveSettings(schema.settings, migrated(schema, instance.settings), opts)
  const byType = new Map((schema.blocks ?? []).map((b) => [b.type, b]))
  const defsOf = (type: string): SettingDefinition[] | null => byType.get(type)?.settings ?? opts.themeBlock?.(type)?.settings ?? null
  const tree = resolveBlockTree(instance, defsOf, opts, 1)
  return { settings, blocks: tree.blocks, statics: tree.statics }
}

function resolveBlockTree(
  owner: BlockOwner,
  defsOf: (type: string) => SettingDefinition[] | null,
  opts: ResolveOptions,
  depth: number,
): { blocks: ResolvedBlock[]; statics: Record<string, ResolvedBlock> } {
  const all = owner.blocks ?? {}
  const blocks: ResolvedBlock[] = []
  const statics: Record<string, ResolvedBlock> = {}
  if (depth > MAX_BLOCK_DEPTH) return { blocks, statics }
  const one = (id: string, b: BlockInstanceData): ResolvedBlock => {
    const defs = defsOf(String(b.type))
    const inner = resolveBlockTree(b as BlockOwner, defsOf, opts, depth + 1)
    return {
      id,
      type: String(b.type),
      settings: defs ? resolveSettings(defs, b.settings, opts) : { ...(b.settings ?? {}) },
      blocks: inner.blocks,
      statics: inner.statics,
      ...(b.hidden ? { hidden: true } : {}),
    }
  }
  const order = owner.block_order ?? Object.keys(all).filter((id) => !all[id]?.static)
  for (const id of order) {
    const b = all[id]
    if (!b || b.hidden || b.static) continue
    blocks.push(one(id, b))
  }
  for (const [id, b] of Object.entries(all)) {
    if (b && b.static) statics[id] = one(id, b)
  }
  return { blocks, statics }
}

/**
 * The inverse, for saving: keep only what differs from the default, so a
 * template stays small and a later change to a default reaches every
 * instance that never overrode it.
 */
export function stripDefaults(defs: SettingDefinition[], values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const byId = new Map(defs.map((d) => [d.id, d]))
  for (const [k, v] of Object.entries(values)) {
    const def = byId.get(k)
    if (!def) { out[k] = v; continue }
    const control = controlFor(def.type)
    const fallback = def.default !== undefined ? def.default : control?.fallback
    if (v === undefined) continue
    if (def.responsive && isPlain(v)) {
      const f = fillResponsive(v, fallback)
      // Compared against the default AS FILLED, so a per-breakpoint default
      // strips as cleanly as a scalar one.
      const d = fillResponsive(undefined, fallback)
      if (f.desktop === d.desktop && f.tablet === d.tablet && f.mobile === d.mobile) continue
      // Collapse a value that is the same at every breakpoint.
      out[k] = f.desktop === f.tablet && f.tablet === f.mobile ? f.desktop : { desktop: f.desktop, tablet: f.tablet, mobile: f.mobile }
      continue
    }
    if (JSON.stringify(v) === JSON.stringify(fallback)) continue
    out[k] = v
  }
  return out
}

/**
 * The theme's tokens, from its settings. Sections read `theme.colors.primary`
 * rather than `theme.settings.primary_color`, so a theme can rename a
 * setting without every section noticing, and the raw settings are still
 * there under `theme.settings` for anything a token does not cover.
 *
 * `schemes` holds every colour scheme the theme has, each under both its
 * semantic names (`background`, `heading`, `primary_button_background`) and
 * the legacy ones (`bg`, `heading`, `primary_btn_bg`) templates were written
 * against. The defaults live in ./color-schemes, and the application reads
 * them from there too, so the two renderer families cannot drift.
 */
export function themeTokens(settings: Record<string, unknown>): Record<string, unknown> {
  const s = (k: string, d: unknown = undefined) => (settings[k] === undefined ? d : settings[k])
  const schemes: Record<string, Record<string, unknown>> = {}
  for (const [name, scheme] of Object.entries(themeColorSchemes(settings))) {
    schemes[name] = { ...legacySchemeValues(scheme), ...scheme }
  }
  const typography = themeTypography(settings)
  return {
    schemes,
    colors: {
      primary: s("primary_color", "#6366f1"),
      secondary: s("secondary_color", "#111827"),
      accent: s("accent_color", "#f59e0b"),
      background: s("background_color", "#ffffff"),
      surface: s("surface_color", "#f9fafb"),
      text: s("text_color", "#111827"),
      muted: s("muted_color", "#6b7280"),
    },
    typography: {
      heading: typography.fonts.heading,
      body: typography.fonts.body,
      accent: typography.fonts.accent,
      styles: typography.styles,
    },
    radius: {
      small: 4,
      medium: Number(s("border_radius", 8)),
      large: Number(s("border_radius", 8)) * 2,
      pill: 9999,
    },
    spacing: { small: 16, medium: 32, large: 64, xlarge: 96 },
    ...themeGlobals(settings),
    settings,
  }
}

/**
 * ===========================================================================
 *  THE THEME'S GENERAL SETTINGS, AS A SECTION READS THEM
 * ===========================================================================
 * Shopify gives every section `settings.logo`, the social links and the
 * button style. Here a section's `settings` are its own, so the theme's are
 * under `theme`: the logo, the buttons, the page layout, the entrance
 * animation and the social links, each with Theme settings' own default
 * filled in, because a site that never opened a panel has none of these
 * keys saved and a section reading `theme.settings.logo_width` got nothing.
 * The defaults are the ones lib/website-builder/theme-settings-schema.ts
 * gives, and tests/section-framework-t.test.ts holds the two together.
 */
/**
 * The currency a page's prices are shown in, when it is not the store's: put
 * on the theme settings a page is drawn with by the live site in a market
 * (lib/markets/live.ts Localizer.theme) and by the builder's canvas
 * previewing one. Never saved; a section reads it as theme.currency.code.
 */
export const DISPLAY_CURRENCY_KEY = "_display_currency"

function displayCurrency(settings: Record<string, unknown>): string {
  const v = settings[DISPLAY_CURRENCY_KEY]
  return typeof v === "string" && /^[A-Z]{3}$/.test(v) ? v : "USD"
}

export function themeGlobals(settings: Record<string, unknown>): Record<string, unknown> {
  const str = (k: string, d = "") => (typeof settings[k] === "string" && (settings[k] as string).trim() !== "" ? (settings[k] as string).trim() : d)
  const num = (k: string, d: number) => {
    const v = typeof settings[k] === "number" ? (settings[k] as number) : typeof settings[k] === "string" ? Number(settings[k]) : NaN
    return Number.isFinite(v) ? v : d
  }
  const bool = (k: string, d: boolean) => (typeof settings[k] === "boolean" ? (settings[k] as boolean) : d)
  const logo = safeMediaUrl(str("logo_url"))
  const mobileLogo = bool("use_mobile_logo", false) ? safeMediaUrl(str("mobile_logo_url")) : ""
  return {
    logo: {
      url: logo,
      width: num("logo_width", 120),
      mobile_url: mobileLogo || logo,
      mobile_width: num("mobile_logo_width", num("logo_width", 120)),
      /* The height the built-in header draws it at, for a coded header that sizes by height (0 when nobody set one). */
      height: num("logo_height", 0),
      mobile_height: num("mobile_logo_height", num("logo_height", 0)),
      /* What a header prints when there is no picture: the store's name. */
      text: str("brand_name"),
    },
    /* The one favicon (Website settings, Branding and an imported theme's own are one value): lib/website-builder/favicon-sync.ts. */
    favicon: safeMediaUrl(faviconOf(settings)),
    buttons: {
      style: str("button_style", "filled"),
      shape: str("button_shape", "rounded"),
      radius: num("button_border_radius", 8),
      size: str("button_size", "md"),
      weight: str("button_font_weight", "600"),
      shadow: bool("button_shadow", false),
      hover: str("button_transition", "fade"),
    },
    layout: {
      page_width: num("page_width", 1280),
      padding_x: num("content_padding_x", 24),
      section_gap: num("section_gap", 0),
      spacing_scale: num("spacing_scale", 1),
      card_radius: num("border_radius", 8),
      image_radius: num("image_border_radius", 8),
      card_shadow: str("card_shadow", "none"),
    },
    animation: {
      enabled: bool("animations_enabled", false),
      style: str("animation_style", "fade-up"),
      duration: num("animation_duration", 600),
      stagger: num("animation_stagger", 80),
    },
    socials: shopObject(settings).socials,
    /* Theme settings › Brand information, Shopify's shop.brand. */
    brand: {
      headline: str("brand_headline"),
      description: str("brand_description"),
      image: safeMediaUrl(str("brand_image")),
      image_width: num("brand_image_width", 100),
    },
    /* Theme settings › Badges: whether a discounted product says Sale, and in what words. */
    badges: {
      sale: bool("badge_sale_show", true),
      sale_text: str("badge_sale_text", "Sale"),
      position: str("badge_position", "top_left"),
    },
    /* Theme settings › Cart › Cart type: drawer, page or notification. */
    cart: { type: ["page", "notification"].includes(str("cart_type")) ? str("cart_type") : "drawer" },
    /* Theme settings › Currency format. */
    /* The code is the one the page's prices are in: the store's, or the visitor's market's (DISPLAY_CURRENCY_KEY). */
    currency: { code: displayCurrency(settings), show_code: bool("currency_code_enabled", false) },
  }
}

export type { Breakpoint }
