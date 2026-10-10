/**
 * ===========================================================================
 *  AN IMPORTED SHOPIFY THEME, AS A STORELIB INSTALL HOLDS IT
 * ===========================================================================
 * Three places, all of them the ones every install already has:
 *
 *   store_theme_custom_files   the theme's files. Its sections, blocks,
 *                              snippets and layout as `.storelib` files in the
 *                              compatible profile (./theme.ts); everything
 *                              else the theme shipped under `shopify/`, at
 *                              the path it had: shopify/templates/index.json,
 *                              shopify/config/settings_schema.json,
 *                              shopify/locales/en.default.json,
 *                              shopify/assets/base.css. A font is written as
 *                              `base64:` and its bytes. Pictures and videos
 *                              are stored as media, and
 *                              shopify/config/assets.json maps their names
 *                              to their addresses.
 *   store_theme_settings       `compat` says this install is one, and
 *                              `shopify` holds the theme's settings (what
 *                              settings_data.json's `current` held).
 *   store_theme_pages          one page per template, each the header group,
 *                              the template's sections and the footer group,
 *                              the same as any page the builder edits.
 *
 * Pure: the import, the live site, the preview and the builder all read an
 * install through these functions.
 */

/** Where the theme's own files are kept, under their own paths. */
export const COMPAT_PREFIX = "shopify/"

/** The asset names a theme's pictures and videos were stored under, to their addresses. */
export const ASSET_MAP_PATH = `${COMPAT_PREFIX}config/assets.json`

export interface CompatSettings {
  kind: "shopify"
  version: 1
  /** The theme's own name and version, from settings_schema.json's theme_info. */
  theme: string
  theme_version?: string
  /** Section names the theme used that Storelib keeps for its own: header → theme-header. */
  renamed?: Record<string, string>
  /**
   * The theme's other section groups (overlay-group, aside-group…) whose
   * sections the pages hold, in the builder's Overlay group. A group not
   * named here is drawn from its file.
   */
  slots?: string[]
  /** A header or footer group under a name of the theme's own (main-header → header): its file says `"type": "header"`. */
  chrome_groups?: Record<string, "header" | "footer">
}

/** The install's compat marker, or null for a theme of Storelib's own. */
export function compatOf(settings: unknown): CompatSettings | null {
  const c = settings && typeof settings === "object" ? (settings as Record<string, unknown>).compat : null
  if (!c || typeof c !== "object") return null
  const o = c as Record<string, unknown>
  if (o.kind !== "shopify") return null
  return {
    kind: "shopify",
    version: 1,
    theme: typeof o.theme === "string" ? o.theme : "",
    theme_version: typeof o.theme_version === "string" ? o.theme_version : undefined,
    renamed: o.renamed && typeof o.renamed === "object" ? (o.renamed as Record<string, string>) : undefined,
    slots: Array.isArray(o.slots) ? o.slots.filter((x): x is string => typeof x === "string") : undefined,
    chrome_groups: o.chrome_groups && typeof o.chrome_groups === "object" && !Array.isArray(o.chrome_groups)
      ? Object.fromEntries(Object.entries(o.chrome_groups as Record<string, unknown>).filter((e): e is [string, "header" | "footer"] => e[1] === "header" || e[1] === "footer"))
      : undefined,
  }
}

/** The theme's settings (settings_data.json's values), from the install's settings. */
export function compatValues(settings: unknown): Record<string, unknown> {
  const v = settings && typeof settings === "object" ? (settings as Record<string, unknown>).shopify : null
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** Shopify's template names to the builder's page keys. */
const PAGE_FOR_TEMPLATE: Record<string, string> = {
  index: "home",
  product: "product",
  collection: "collection",
  "list-collections": "collections",
  search: "search",
  cart: "cart",
  "404": "404",
  password: "password",
  page: "page",
  blog: "blog",
  article: "article",
}

/** Keys the page.<suffix> templates may not take, because the site answers on them already. */
const TAKEN = new Set(["home", "product", "products", "collection", "collections", "search", "cart", "404", "password", "page", "blog", "blogs", "article", "account", "login", "wishlist", "api", "preview", "checkout", "pages"])

/**
 * The builder's page key for one of the theme's templates: `index` is home,
 * `page.contact` is contact. Null for a template that is an alternate of
 * another (`product.preorder`), which the site does not route to.
 */
export function compatPageKey(template: string): string | null {
  if (PAGE_FOR_TEMPLATE[template]) return PAGE_FOR_TEMPLATE[template]
  const m = template.match(/^page\.([a-z0-9][a-z0-9-]{0,62})$/)
  if (m && !TAKEN.has(m[1])) return m[1]
  return null
}

/**
 * WHERE A LINK IN AN IMPORTED THEME GOES, in the builder: the page of the
 * install it opens, or null for a link that leaves the site (or names a page
 * the install has none of). Shopify's addresses: /products/<handle>,
 * /collections, /collections/<handle>, /cart, /search, /pages/<handle>,
 * /blogs/<blog>[/<article>].
 */
export function compatPageForHref(href: string, keys: readonly string[]): { key: string; product?: string } | null {
  const raw = href.trim()
  if (!raw || raw.startsWith("#") || /^(mailto|tel|javascript):/i.test(raw) || /^(https?:)?\/\//i.test(raw)) return null
  const path = raw.split(/[?#]/)[0].replace(/\/+$/, "") || "/"
  const parts = path.split("/").filter(Boolean).map((p) => decodeURIComponent(p))
  const has = (key: string) => (keys.includes(key) ? key : null)
  let key: string | null = null
  let product: string | undefined
  if (parts.length === 0) key = has("home")
  else if (parts[0] === "products" && parts[1]) { key = has("product"); product = parts[1] }
  else if (parts[0] === "products") key = has("collection")
  else if (parts[0] === "collections") key = parts[1] ? has("collection") : has("collections")
  else if (parts[0] === "cart" && parts.length === 1) key = has("cart")
  else if (parts[0] === "search") key = has("search")
  /* A theme's wishlist page is the visitor's own wishlist, Storelib's, unless the site has a page of that name. */
  else if (parts[0] === "pages" && parts[1] === "wishlist") key = has("wishlist")
  else if (parts[0] === "pages" && parts[1]) key = has(parts[1]) ?? has("page")
  else if (parts[0] === "blogs" && parts[1]) key = parts[2] ? has("article") : has("blog")
  return key ? { key, ...(product ? { product } : {}) } : null
}

/** The template a page is drawn as: the theme's name for it, and a suffix for page.<suffix>. */
export function templateOfPage(key: string): { template: string; suffix?: string } {
  for (const [t, k] of Object.entries(PAGE_FOR_TEMPLATE)) if (k === key) return { template: t }
  return { template: "page", suffix: key }
}

/**
 * The files as the engine reads them: the `.storelib` files at their own
 * paths, the theme's others without the `shopify/` in front.
 */
export function engineFiles(rows: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [path, text] of Object.entries(rows)) {
    if (path.startsWith(COMPAT_PREFIX)) out[path.slice(COMPAT_PREFIX.length)] = text
    else if (/^(sections|blocks|snippets|layout)\/[^/]+\.storelib$/.test(path)) out[path] = text
  }
  return out
}

/** shopify/config/assets.json: a picture's name in assets/ to where it is stored. */
export function assetAddresses(rows: Record<string, string>): Record<string, string> {
  const text = rows[ASSET_MAP_PATH]
  if (!text) return {}
  try {
    const v = JSON.parse(text)
    return v && typeof v === "object" ? (v as Record<string, string>) : {}
  } catch {
    return {}
  }
}

/** A font kept as `base64:` and its bytes. */
export function binaryOf(text: string): Uint8Array | null {
  if (!text.startsWith("base64:")) return null
  try {
    const raw = atob(text.slice(7))
    const out = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

const TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  xml: "application/xml",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
}

/** The type a theme's file is served as, from its extension. */
export function assetType(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  return TYPES[ext] ?? null
}
