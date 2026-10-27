/**
 * ===========================================================================
 *  WHAT A SECTION'S SCRIPT MAY SAY TO THE PAGE, AND THE PAGE TO IT
 * ===========================================================================
 * A section's `<script>` is written by a creator or by an AI, and it runs on
 * a page where a visitor may be signed in to Storelib, may have a cart, and
 * may be halfway through a checkout. So it does not run on that page.
 *
 * It runs inside ONE `<iframe sandbox="allow-scripts">` per page. That
 * sandbox has an opaque origin, which is the whole point:
 *
 *   no cookies          the visitor's Storelib session is unreachable
 *   no localStorage     nor anything any other page stored
 *   no parent DOM       `parent.document` throws; there is nothing to read
 *   no same-origin API  a fetch to storelib.com carries no credentials
 *
 * Inside it, the script gets a REAL DOM: a copy of its own section's markup.
 * That is what makes ordinary code work — querySelector, classList,
 * addEventListener, CSS transitions, `<details>` — without emulating a
 * browser. What comes back out is not DOM, it is a list of small changes,
 * and this file is the list of changes the page will accept.
 *
 * NOTHING HERE CAN INTRODUCE MARKUP OR A URL. The page applies an attribute
 * only if it is on ATTR_ALLOWED, text only as text, and never innerHTML. A
 * script cannot set `src`, `href`, `formaction` or any `on*` handler, so the
 * worst a hostile section can do to the page it is on is make itself look
 * wrong. See tests/section-sandbox.test.ts.
 */

/** Every element in a section is numbered, host and guest, in document order. */
export const INDEX_ATTR = "data-sb"

/**
 * Attributes a script may change.
 *
 * Everything that loads or navigates is missing on purpose: `src`, `href`,
 * `action`, `formaction`, `srcdoc`, `data`, `poster`, `xlink:href`, and every
 * `on*`. So is `style`, which is set through its own command with its own
 * checks, because a whole style attribute is a place to hide `url(...)`.
 */
export const ATTR_ALLOWED = [
  "class", "hidden", "title", "tabindex", "role", "open", "selected", "checked",
  "disabled", "placeholder", "value", "dir", "lang", "id", "popover", "inert",
] as const

/** And these prefixes, which describe rather than load. */
export const ATTR_PREFIXES = ["aria-", "data-"] as const

/**
 * `data-sb` is the page's own numbering. A script that could rewrite it
 * could point every later change at a different element.
 */
export const ATTR_RESERVED = [INDEX_ATTR, "data-storelib-form", "data-block-id"] as const

/** A CSS property name, as the guest may send one. Custom properties included. */
export const CSS_PROPERTY = /^(--)?[a-zA-Z][a-zA-Z0-9-]{0,48}$/

/**
 * A style value the page will accept. No `url(`, which fetches; no
 * `expression(`, which is script on old engines; no `\` escapes, which hide
 * both. Everything a transition, transform, colour or size needs is plain.
 */
export const CSS_VALUE_REFUSED = /url\s*\(|expression\s*\(|javascript:|@import|\\/i

export const EVENTS_FORWARDED = [
  "click", "dblclick", "input", "change", "submit", "keydown", "keyup",
  "focusin", "focusout", "pointerdown", "pointerup", "pointerenter", "pointerleave",
  "mouseenter", "mouseleave", "touchstart", "touchend", "scroll", "toggle",
] as const

/** Caps. A runaway loop in a section must not be able to hang the page. */
export const SANDBOX_LIMITS = {
  /** Changes one section may send in one batch. */
  patchesPerBatch: 400,
  /** And in a second, across batches, before the section is stopped. */
  patchesPerSecond: 2_000,
  /** The longest string a script may write into an attribute or text node. */
  valueChars: 4_000,
  /** How long the guest gets to load before the host gives up on it. */
  readyMs: 8_000,
} as const

export type Patch =
  | { k: "attr"; i: number; n: string; v: string | null }
  | { k: "text"; i: number; v: string }
  | { k: "style"; i: number; n: string; v: string }
  | { k: "scroll"; i: number; left?: number; top?: number; smooth?: boolean }

export type HostMessage =
  | {
      k: "run"
      id: string
      html: string
      bundle: string
      settings: Record<string, unknown>
      blocks: unknown[]
      theme: Record<string, unknown>
      page: Record<string, unknown>
      capabilities: string[]
      /** True in the builder's canvas, so a script can behave while designing. */
      inEditor: boolean
      /** The site's own Supabase, public key only, for a section that declared "database" (lib/website-builder/own-database.ts). */
      database?: { url: string; key: string } | null
    }
  | { k: "stop"; id: string }
  | { k: "event"; id: string; i: number; type: string; detail: Record<string, unknown> }

export type GuestMessage =
  | { k: "ready" }
  | { k: "patch"; id: string; patches: Patch[] }
  | { k: "listen"; id: string; types: string[] }
  | { k: "error"; id: string; message: string }
  /** `storelib.navigate(path)`, for a section that declared "navigation". */
  | { k: "navigate"; id: string; path: string }
  /**
   * `storelib.scrollToSection(key)`, or navigate() to a section of this
   * page: the page scrolls its own scroller to that section (round 25, the
   * parent's side of a script that cannot reach the page). No capability: it
   * only moves the page the visitor is on, and only to one of its sections.
   */
  | { k: "reveal"; id: string; section: string }

/**
 * A path on THIS site: starts with one slash, and is nothing else. "//host"
 * is another site and "javascript:" is not a path; both are refused, as is
 * anything with whitespace or a backslash, which browsers normalise into
 * the first two.
 */
export function acceptNavigation(path: unknown): string | null {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) return null
  if (!/^\/(?![\/\\])[^\s\\]*$/.test(path)) return null
  return path
}

/**
 * A section of this page, as a script names it: its key or its anchor
 * (`section-<key>`, or the name the section gave itself), letters, digits,
 * `_` and `-` only, and short. Anything else is refused before it reaches a
 * selector.
 */
export function acceptSectionKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const key = raw.replace(/^#/, "")
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(key) ? key : null
}

/**
 * The section a navigation means when it stays on this page (`/#section-x`
 * or `/page#x` on /page): its key, else null and it is a navigation.
 */
export function samePageSection(path: string, here: string): string | null {
  const at = path.indexOf("#")
  if (at < 0) return null
  const page = (p: string) => p.replace(/\/+$/, "") || "/"
  const before = path.slice(0, at)
  if (before && page(before.split("?")[0]) !== page(here)) return null
  return acceptSectionKey(path.slice(at + 1))
}

/** True when the page may write this attribute at a section's request. */
export function attrAllowed(name: string): boolean {
  const n = name.toLowerCase()
  if ((ATTR_RESERVED as readonly string[]).includes(n)) return false
  if (n.startsWith("on")) return false
  if ((ATTR_ALLOWED as readonly string[]).includes(n)) return true
  return ATTR_PREFIXES.some((p) => n.startsWith(p) && n.length > p.length)
}

/** True when the page may set this CSS property to this value. */
export function styleAllowed(property: string, value: string): boolean {
  if (!CSS_PROPERTY.test(property)) return false
  if (value.length > SANDBOX_LIMITS.valueChars) return false
  return !CSS_VALUE_REFUSED.test(value)
}

/**
 * One patch, checked. Returns the patch to apply, or null to drop it.
 *
 * Every rule here is applied on the PAGE's side. The guest is the thing
 * being defended against, so nothing it says about itself is trusted,
 * including that it sent a well-formed message at all.
 */
export function acceptPatch(raw: unknown): Patch | null {
  if (!raw || typeof raw !== "object") return null
  const p = raw as Record<string, unknown>
  const i = p.i
  if (typeof i !== "number" || !Number.isInteger(i) || i < 0) return null

  if (p.k === "attr") {
    const n = typeof p.n === "string" ? p.n : ""
    if (!attrAllowed(n)) return null
    if (p.v === null) return { k: "attr", i, n, v: null }
    if (typeof p.v !== "string" || p.v.length > SANDBOX_LIMITS.valueChars) return null
    return { k: "attr", i, n, v: p.v }
  }
  if (p.k === "text") {
    if (typeof p.v !== "string" || p.v.length > SANDBOX_LIMITS.valueChars) return null
    return { k: "text", i, v: p.v }
  }
  if (p.k === "style") {
    const n = typeof p.n === "string" ? p.n : ""
    const v = typeof p.v === "string" ? p.v : ""
    if (!styleAllowed(n, v)) return null
    return { k: "style", i, n, v }
  }
  if (p.k === "scroll") {
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined)
    return { k: "scroll", i, left: num(p.left), top: num(p.top), smooth: p.smooth === true }
  }
  return null
}
