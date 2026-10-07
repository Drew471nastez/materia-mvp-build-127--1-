/**
 * ===========================================================================
 *  WHERE A LINK IN THE CANVAS GOES
 * ===========================================================================
 * The editor's canvas follows the site's own navigation: the logo, the menu,
 * the footer's links, the mobile drawer. Deciding WHERE one goes was ninety
 * lines inside a nine thousand line component, reading state straight out of
 * the render it happened to be built in.
 *
 * That is how the logo stopped working. The decision reads which page is open
 * — going home while already home is not a page change — and the callback
 * holding it listed `products`, `customPages` and `inspectorEnabled` as its
 * dependencies but not the page. So it kept the page from the render that
 * built it, which is the editor's first render, which is the home page. From
 * then on every link to "/" was answered "you are already there", on every
 * page, for the rest of the session. The logo did nothing, Home in the menu
 * did nothing, Home in the mobile drawer did nothing, and every other address
 * worked, because no other address reads the page.
 *
 * So the decision is a function of its arguments and nothing else, and it is
 * a value rather than an action: the caller does the navigating. A stale read
 * cannot hide in here any more, and tests/editor-navigation.test.ts asks it
 * for "/" from every page there is.
 */

import { checkoutProductOf, productCheckoutHref, withoutNewTab } from "./new-tab"

export type EditorNavDecision =
  /** Nothing to do, and the reason, which is worth having in a test. */
  | { kind: "ignore"; why: "empty" | "external" | "inspector" | "placeholder" }
  /** An anchor on the page being edited: scroll to it. */
  | { kind: "anchor"; id: string }
  /** Home, while home is already open: the top of it. */
  | { kind: "top" }
  /** A page of this site, by its key, and the section on it a hash names. */
  | { kind: "page"; key: string; anchor?: string }
  /** A product page, by the slug or id in the address. */
  | { kind: "product"; slug: string }
  /** No page answers this address, and the builder offers to make one. */
  | { kind: "missing"; path: string }
  /** Straight to one product's checkout: the editor opens that real checkout beside it. */
  | { kind: "checkout"; productId: string; href: string }

export interface EditorNavContext {
  /** The page open in the canvas right now, read at the moment of the click. */
  currentPage: string
  /** With the inspector on a tap selects, unless the link IS the navigation. */
  inspectorEnabled: boolean
  fromNav: boolean
  /** Where this site's shop lives, which has moved once already. */
  shopPath: string
  /** The keys of the pages the creator has made. */
  customPageKeys: readonly string[]
}

/** The built-in pages an address can name directly. */
const DIRECT: Record<string, string> = {
  "/about": "about",
  "/contact": "contact",
  "/search": "search",
  /* The visitor's account pages, which every website has. */
  "/account": "account",
  "/account/login": "login",
  "/wishlist": "wishlist",
  /* The page a website shows while it asks for a password. */
  "/password": "password",
}

/**
 * ===========================================================================
 *  A LINK TO A SECTION OF THE PAGE THAT IS OPEN SCROLLS TO IT
 * ===========================================================================
 * `/#pricing` from home was "home, while home is open", which is the top of
 * the page: the hash was dropped with the query. A link the picker stores
 * for a section is exactly that shape (`/#section-<id>`, `/about#section-<id>`),
 * so a page that is already open answers a hash with its section, and a
 * page that has to be opened first is opened with the hash kept, for the
 * canvas to scroll to once it is drawn.
 */
/**
 * The address of a page the editor has open, the other way round from
 * resolveEditorHref: what a link to it is stored as. The product page is a
 * template for many addresses and has none of its own (null).
 */
export function editorPagePath(key: string, shopPath: string): string | null {
  if (key === "home") return "/"
  if (key === "product") return null
  if (key === "products") return shopPath
  const direct = Object.entries(DIRECT).find(([, k]) => k === key)
  return direct ? direct[0] : `/${key}`
}

/** The page key an address opens, for reading that page's sections. Null for anything that is not a page. */
export function editorPageKeyOf(path: string, ctx: Pick<EditorNavContext, "shopPath" | "customPageKeys">): string | null {
  const d = resolvePath(path, { ...ctx, currentPage: "", inspectorEnabled: false, fromNav: true })
  return d.kind === "page" ? d.key : null
}

export function resolveEditorHref(rawHref: string, ctx: EditorNavContext): EditorNavDecision {
  /* "Open in a new tab" is a mark on the address, not a place on the page (lib/website-builder/new-tab). */
  const href = withoutNewTab(rawHref ?? "")
  const decision = resolvePath(href, ctx)
  if (decision.kind === "checkout") return decision
  const at = (href ?? "").indexOf("#")
  const hash = at >= 0 ? (href ?? "").slice(at + 1).trim() : ""
  if (!hash || hash === "!" || (href ?? "").trim().startsWith("#")) return decision
  if (decision.kind === "top") return { kind: "anchor", id: hash }
  if (decision.kind === "page") {
    return decision.key === ctx.currentPage ? { kind: "anchor", id: hash } : { ...decision, anchor: hash }
  }
  return decision
}

function resolvePath(href: string, ctx: EditorNavContext): EditorNavDecision {
  const trimmed = (href ?? "").trim()
  if (!trimmed || trimmed === "#") return { kind: "ignore", why: "empty" }

  /*
    WITH THE INSPECTOR ON, A TAP SELECTS. A thumb on a phone lands on a link
    as often as on the space around it, and every one of those taps was
    changing the page under somebody who meant to select a section. Unless
    the link IS the site's navigation, which is what `fromNav` says: a header
    or footer link is navigation even while the inspector is on, because a
    nav you cannot follow is a nav you cannot check.
  */
  if (ctx.inspectorEnabled && !ctx.fromNav) return { kind: "ignore", why: "inspector" }

  // An anchor on this page scrolls the canvas to it, and nothing else.
  if (trimmed.startsWith("#")) return { kind: "anchor", id: trimmed.slice(1) }

  // Leaving the editor is not what that tap meant.
  if (/^https?:\/\//i.test(trimmed)) return { kind: "ignore", why: "external" }
  if (/^\/\//.test(trimmed)) return { kind: "ignore", why: "external" }
  if (trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) return { kind: "ignore", why: "external" }

  /* A link nobody has filled in yet. It is not a missing page, so it must not
     offer to create one. */
  if (trimmed === "#!" || trimmed.toLowerCase() === "javascript:void(0)") {
    return { kind: "ignore", why: "placeholder" }
  }

  const withPrefix = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  /* The query and the hash name a place ON a page, not another page. /search
     keeps its query because the search page reads it; everything else is
     matched without one. */
  const path = withPrefix.split("#")[0]
  const bare = path.split("?")[0]
  const noSlash = bare.length > 1 ? bare.replace(/\/+$/, "") : bare

  if (noSlash === "/" || noSlash === "") {
    /*
      HOME WHILE HOME IS OPEN IS THE TOP OF HOME. Reloading the page that is
      already showing would only throw the scroll away, but doing NOTHING is
      the thing that reads as a broken logo. A browser on a same page
      navigation goes to the top, so this does.
    */
    return ctx.currentPage === "home" ? { kind: "top" } : { kind: "page", key: "home" }
  }

  // Product page deep link.
  if (noSlash.startsWith("/products/") || noSlash.startsWith(`${ctx.shopPath}/`)) {
    const under = noSlash.startsWith("/products/") ? "/products/" : `${ctx.shopPath}/`
    const slug = noSlash.slice(under.length).split("/")[0]
    return slug ? { kind: "product", slug } : { kind: "ignore", why: "empty" }
  }

  /* A product's checkout is not a page of the site: the editor opens the real one for that product. */
  if (noSlash === "/checkout") {
    const productId = checkoutProductOf(trimmed)
    return productId ? { kind: "checkout", productId, href: productCheckoutHref(productId) } : { kind: "ignore", why: "external" }
  }

  if (noSlash === ctx.shopPath) return { kind: "page", key: "products" }
  if (DIRECT[noSlash]) return { kind: "page", key: DIRECT[noSlash] }

  /*
    NOT A PAGE: an action. Signing in, signing out and the site's own API
    leave the page on a live site; in the canvas they are nothing to open and
    nothing to offer to create.
  */
  if (noSlash === "/api" || noSlash.startsWith("/api/") || noSlash === "/account/logout") {
    return { kind: "ignore", why: "external" }
  }

  const key = noSlash.replace(/^\//, "")
  if (ctx.customPageKeys.includes(key)) return { kind: "page", key }

  /*
    A LINK TO A PAGE THAT IS NOT THERE SAYS SO. This used to do nothing at
    all, which from the creator's side is identical to a broken link: they
    click something in their own header, the screen does not change, and they
    cannot tell whether the problem is the link, the page or the editor.
  */
  return { kind: "missing", path: noSlash }
}
