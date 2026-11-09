/**
 * ===========================================================================
 *  WHAT GENERATED CODE MAY USE: THE STORELIB RUNTIME SURFACE (round L)
 * ===========================================================================
 * An AI component is a `.storelib` section (architecture D1). It cannot
 * import anything: there is no npm at runtime and no remote script. What it
 * may use is exactly three things, all of which already exist and are named
 * here so the agent's prompt, the validator (L3) and the runtime (L4) agree:
 *
 *   1. TEMPLATE DATA, resolved on the server, tenant scoped. A binding prop
 *      (product_picker, product_list, collection_picker, collection_list,
 *      community_picker, page_picker, link_list, and the new form_picker)
 *      reads the creator's own rows by id; an id that is not theirs renders
 *      empty (lib/storelib-theme/resolve.ts). `RuntimeContext` below.
 *
 *   2. HOST HOOKS: attributes the trusted page acts on, so a component can
 *      have a real cart, checkout, search, menu, form or wishlist without a
 *      line of script (lib/website-builder/storefront-hooks.ts and the form
 *      and offers handlers). `STORELIB_HOOKS` below.
 *
 *   3. SCRIPT, in the opaque-origin sandbox, against `root, settings, blocks,
 *      theme, page, storelib` with declared capabilities only
 *      (lib/storelib-theme/storelib/script.ts, sandbox/guest-source.ts).
 *      `SandboxStorelib` below.
 *
 * Interfaces only. TODO(L4): pin `RuntimeProduct` to the catalog builder the
 * storefront passes as `catalog` (lib/storelib-theme/resolve.ts CatalogItem),
 * add `form_picker`, and keep this file the single list the prompt quotes.
 */
import { STOREFRONT_HOOKS } from "@/lib/website-builder/storefront-hooks"
import type { StorefrontCollection, StorefrontCommunity } from "@/lib/storelib-theme/types"
import type { ScriptCapability } from "./types"

/* ── 1. template data ─────────────────────────────────────────────────── */

/** A product as a binding prop reads it (`settings.product.title`); it PRINTS as its address. */
export interface RuntimeProduct {
  id: string
  title: string
  /** The product page, on this website. */
  url: string
  /** As printed, in the store's currency ("€24"). Display only: checkout prices from the database. */
  price: string
  compare_price?: string
  image: string
  /** digital, course, membership, physical, service, bundle... */
  kind: string
  slug: string
  /** Free, pay what you want. */
  pay_what_you_want?: boolean
}

export type RuntimeCollection = StorefrontCollection
export type RuntimeCommunity = StorefrontCommunity

/** A published native form or booking form (lib/forms). TODO(L4): resolve from form_picker. */
export interface RuntimeForm {
  id: string
  title: string
  kind: "form" | "booking" | "quiz"
  /** Where it is served on its own; a component may also embed it with data-storelib-form="native-form". */
  url: string
}

export interface RuntimePage {
  key: string
  title: string
  url: string
}

/** What a component's template can read besides its own `settings` and `blocks`. */
export interface RuntimeContext {
  /** Theme tokens: `theme.radius.medium`, `theme.typography.heading`, colour schemes by `scheme.*`. */
  theme: Record<string, unknown>
  page: { template: string; in_editor: boolean; url: string }
  /** Addresses the site has: cart_url, search_url, account_url, password_enter_url... */
  routes: Record<string, string>
  /** The store: name, currency. */
  shop: { name: string; currency: string }
}

/**
 * What list_capabilities answers: the ids the agent may bind, all this
 * creator's, all live. The agent never writes an id that is not here.
 */
export interface RuntimeCapabilities {
  store: { name: string; currency: string; brandImage: string | null; tagline: string | null }
  products: Pick<RuntimeProduct, "id" | "title" | "kind" | "price" | "url">[]
  collections: Pick<RuntimeCollection, "id" | "title" | "url" | "products_count">[]
  communities: Pick<RuntimeCommunity, "id" | "name" | "url">[]
  forms: RuntimeForm[]
  pages: RuntimePage[]
  menus: { handle: string; title: string }[]
  blog: { posts: number }
  reviews: { count: number; average: number | null }
  /** Features this store has switched on: memberships, bookings, communities, shop, blog. */
  features: string[]
}

/* ── 2. host hooks ────────────────────────────────────────────────────── */

/**
 * Attributes the page handles for a component. Values are text or checked
 * addresses, never markup. The cart is the site's one cart; orders are priced
 * on the server.
 */
export const STORELIB_HOOKS = {
  ...STOREFRONT_HOOKS,
  /** On a <form>: "subscribe", "contact", "native" (posts to its action). */
  form: "data-storelib-form",
  /** On an element: the offers island of a product (its block id). */
  offers: "data-storelib-offers",
  /*
    No native "buy now" hook yet: data-storelib-buy-now is handled only for
    imported themes (lib/storelib-theme/compat/canvas-bridge.ts). A component
    buys with add-to-cart then data-storelib-checkout. TODO(L4) if needed.
  */
  /** A heart: adds or removes the product (its id) from the wishlist. */
  wishlist: "data-storelib-wishlist",
} as const

export type StorelibHook = keyof typeof STORELIB_HOOKS

/* ── 3. sandboxed script ──────────────────────────────────────────────── */

/** The `storelib` object a component script receives. Members appear only for declared capabilities. */
export interface SandboxStorelib {
  scrollTo(el: Element, options?: { left?: number; top?: number; behavior?: "smooth" | "auto" }): void
  scrollToSection(key: string): void
  /** capability "navigation" */
  navigate?(path: string): void
  /** capability "database": the site's own connected Supabase, public key only. */
  database?: unknown
}

/** The names a component script gets, nothing else (script.ts SCRIPT_CONTEXT). */
export type SandboxScript = (root: Element, settings: Record<string, unknown>, blocks: unknown[], theme: Record<string, unknown>, page: Record<string, unknown>, storelib: SandboxStorelib) => void

/** Capabilities the agent may declare without a person's say so. `database` and `embed` need the creator's site to have them. */
export const AGENT_DEFAULT_CAPABILITIES: readonly ScriptCapability[] = ["navigation", "timers", "analytics"]

/**
 * Hosts a template may load from. Nothing else: no <script src>, no remote
 * CSS (fonts come from the font picker), images from the creator's media.
 * TODO(L4/L3): enforce in validate (code import.*).
 */
export const ALLOWED_REMOTE_HOSTS: readonly string[] = []
