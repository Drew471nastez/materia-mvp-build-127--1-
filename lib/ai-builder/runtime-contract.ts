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
 * Interfaces and the pure helpers the agent's tools share. `RuntimeProduct`
 * is the catalogue card the storefront hands the engine as `catalog`
 * (lib/website-builder/shop-products.ts ProductCard settings), `form_picker`
 * is real (lib/storelib-theme/resolve.ts formRef), and what list_capabilities
 * answers is built by lib/ai-builder/capabilities.ts. Keep this file the
 * single list the prompt quotes.
 *
 * BUY NOW. There is no hook for it because none is needed: every product
 * (and every variant) carries `checkout_url`, Storelib checkout for exactly
 * that product and option, priced on the server, returning to this site.
 * A "Buy now" is `<a href="{{ settings.product.checkout_url | url }}">`, and
 * "Add to bag, then check out" is data-storelib-add-to-cart followed by a
 * data-storelib-checkout button. Both work with no script.
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
  /** Storelib checkout for this product: the Buy now link. "" when it cannot be bought (sold out, needs an option chosen). */
  checkout_url: string
  available: boolean
  /** Its options, each with its own id (data-variant-id) and Buy now link. */
  variants: RuntimeVariant[]
}

export interface RuntimeVariant {
  id: string
  name: string
  price: string
  available: boolean
  checkout_url: string
}

export type RuntimeCollection = StorefrontCollection
export type RuntimeCommunity = StorefrontCommunity

/**
 * A published native form or booking form (lib/forms), as a `form_picker`
 * setting carries it (`settings.form.id`, `.title`, `.kind`, `.booking`).
 * A component shows the live form with a mark the page fills:
 * `<div data-storelib-native-form="{{ settings.form.id }}" data-presentation="inline"></div>`.
 */
export interface RuntimeForm {
  id: string
  title: string
  /** form, quiz, survey, application, lead or booking (lib/forms/kind.ts). */
  kind: string
  booking: boolean
  /** Where it is served on its own (/request/forms/<id>). */
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
  /** Published products, newest first (at most 60). Courses and memberships are products of that kind. */
  products: (Pick<RuntimeProduct, "id" | "title" | "kind" | "price" | "url" | "checkout_url" | "available"> & { variants: Pick<RuntimeVariant, "id" | "name" | "price" | "checkout_url">[] })[]
  collections: Pick<RuntimeCollection, "id" | "title" | "url" | "products_count">[]
  communities: Pick<RuntimeCommunity, "id" | "name" | "url">[]
  /** Published forms; `booking: true` are booking forms. */
  forms: RuntimeForm[]
  pages: RuntimePage[]
  menus: { handle: string; title: string }[]
  blog: { posts: number }
  reviews: { count: number; average: number | null }
  /** The creator's own page on Storelib and the site's social links (Website settings › Social links), full addresses. */
  links: { creatorPage: string | null; social: string[] }
  /** Features this store has switched on: shop, courses, memberships, bookings, forms, communities, blog, reviews. */
  features: string[]
}

/* ── 2. host hooks ────────────────────────────────────────────────────── */

/**
 * Attributes the page handles for a component. Values are text or checked
 * addresses, never markup. The cart is the site's one cart; orders are priced
 * on the server.
 *
 * A FREE SITE (round N, lib/website-builder/free-site.ts: every site the AI
 * starts from nothing) gets NO built-in header, footer, announcement bar,
 * breadcrumbs, cart drawer, search window, language or currency switch. The
 * site's own code draws all of them with these hooks; the host only fills
 * them with live data and behaviour. The whole list, by what a site needs:
 *
 *   CART PANEL     data-storelib-cart (opener), -cart-count, -cart-panel with
 *                  -cart-lines / one hidden -cart-line (data-line-title,
 *                  -variant, -price, -qty, img -image, a -url, buttons -inc,
 *                  -dec, -remove), -cart-subtotal, -cart-empty, -cart-filled,
 *                  -checkout, -cart-close. One panel anywhere on the page is
 *                  opened by every cart button and every add.
 *   SEARCH PANEL   data-storelib-search (opener), -search-panel with
 *                  <input -search-input>, -search-results / one hidden
 *                  -search-result (data-result-title, -price, -kind, img
 *                  data-result-image, a data-result-url), -search-empty,
 *                  -search-loading, -search-close. Finds this creator's
 *                  products, pages and blog posts as the visitor types; Enter
 *                  opens /search. The panel gets data-open and data-state
 *                  (idle, loading, results, empty) to style.
 *   LANGUAGE       data-storelib-locale-list / one hidden
 *                  -locale-option (data-option-label, data-option-code;
 *                  aria-current="true" on the page's own), and
 *                  -locale-current. Hidden on a one language site.
 *   CURRENCY       data-storelib-currency-list / -currency-option /
 *                  -currency-current, the same way, from the site's markets.
 *   MENU           data-storelib-menu="<menu handle>" opens the menu drawer
 *                  (data-storelib-menu-from left, right, top); or draw the
 *                  menu yourself from a link_list setting.
 *   ADD TO CART    data-storelib-add-to-cart="<product id>" with
 *                  data-variant-id, data-title, data-price, data-image,
 *                  data-url, data-kind, data-quantity. Buy now is a link to
 *                  checkout_url.
 *   WISHLIST       data-storelib-wishlist="<product id>" (aria-pressed is set).
 *   ACCOUNT        no hook: a link to routes.account_url (sign in and sign up
 *                  are one page), routes.cart_url, routes.search_url.
 *   FORMS          data-storelib-form="subscribe|contact|native",
 *                  data-storelib-native-form="<form id>".
 *
 * A plain opener with no panel of the site's own on the page (a bag with no
 * cart panel, a search button with no search panel) opens the built-in one,
 * so a button is never dead.
 */
export const STORELIB_HOOKS = {
  ...STOREFRONT_HOOKS,
  /** On a <form>: "subscribe", "contact", "native" (posts to its action). */
  form: "data-storelib-form",
  /** On an empty element: the page draws the published form whose id is its value there (data-presentation inline, card, expandable or modal). */
  nativeForm: "data-storelib-native-form",
  /** On an element: the offers island of a product (its block id). */
  offers: "data-storelib-offers",
  /*
    Buy now is a link, not a hook: the product's (or variant's) checkout_url,
    see the top of this file. data-storelib-buy-now is handled only for
    imported themes (lib/storelib-theme/compat/canvas-bridge.ts).
  */
  /** A heart: adds or removes the product (its id) from the wishlist. */
  wishlist: "data-storelib-wishlist",
} as const

export type StorelibHook = keyof typeof STORELIB_HOOKS

/**
 * The same as a few lines the agent can read (the doc comment above, as
 * text): every hook a free site's own header, footer, cart, search and
 * switches are built with. lib/ai-builder/agent/prompts.ts and the knowledge
 * library may quote it whole.
 */
export const HEADLESS_HOOK_GUIDE = `A free site draws its own header, footer, cart, search and language and currency switches; Storelib draws none of them and only fills these hooks with live data. Every value is written as text or a checked address.
- Cart panel: a button data-storelib-cart opens it; data-storelib-cart-count; an element data-storelib-cart-panel (styled by data-open="true|false", inert while shut) holding data-storelib-cart-lines with ONE hidden data-storelib-cart-line pattern (data-line-title, data-line-variant, data-line-price, data-line-qty, img data-line-image, a data-line-url, buttons data-line-inc, data-line-dec, data-line-remove), data-storelib-cart-subtotal, data-storelib-cart-empty, data-storelib-cart-filled, a data-storelib-checkout button and a data-storelib-cart-close button. One panel anywhere on the page answers every cart button and every add.
- Search panel: a button data-storelib-search opens it; an element data-storelib-search-panel (data-open, data-state idle|loading|results|empty) holding <input data-storelib-search-input>, data-storelib-search-results with ONE hidden data-storelib-search-result pattern (data-result-title, data-result-price, data-result-kind, img data-result-image, a data-result-url), data-storelib-search-empty, data-storelib-search-loading and a data-storelib-search-close button. It finds this store's products, pages and posts as the visitor types; Enter opens /search; Escape closes; focus is kept inside and returned.
- Languages: data-storelib-locale-list with ONE hidden data-storelib-locale-option pattern (a <button> holding data-option-label, optionally data-option-code); the page's language gets aria-current="true"; a press opens the page in that language. data-storelib-locale-current shows the current one. The list is hidden on a one language site.
- Currencies: data-storelib-currency-list, data-storelib-currency-option, data-storelib-currency-current, the same way.
- Menu: data-storelib-menu="{{ settings.menu.handle }}" opens the menu drawer, or draw the menu from the link_list yourself.
- Add to cart: <button data-storelib-add-to-cart="{{ block.id }}" data-title data-price data-image data-url data-kind>; Buy now is a link to checkout_url. Wishlist: data-storelib-wishlist="<product id>". Account: a link to {{ routes.account_url }}.
- Without a panel of your own, data-storelib-cart and data-storelib-search open Storelib's built-in drawer and window.`

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
 * CSS (fonts come from the font picker), images from the creator's media
 * (image_picker settings, resolved to the account's own media addresses).
 * Enforced by the render check (lib/ai-builder/render-check.ts, import.*).
 */
export const ALLOWED_REMOTE_HOSTS: readonly string[] = []
