/**
 * ===========================================================================
 *  WHAT A PERSON TYPES INTO A LINK FIELD, AND WHAT IS SAVED
 * ===========================================================================
 * The link field is a plain text box: type or paste an address and it is the
 * link. People type addresses the way they say them, so the box accepts the
 * spoken forms and saves the form a browser can follow:
 *
 *   shop.example.com/sale    https://shop.example.com/sale
 *   //cdn.example.com/x      https://cdn.example.com/x
 *   hello@shop.com           mailto:hello@shop.com
 *   +40 721 000 000          tel:+40721000000
 *   /about  #faq  ?q=x       kept as they are: this site's own pages
 *
 * and refuses what should never be a link on a creator's site: `javascript:`
 * and every scheme that is not the web, email or a phone. A refusal keeps the
 * link that was there and says why; it never saves half an address.
 *
 * Pure, so tests/link-address.test.ts can ask it everything.
 */

export type LinkAddress = { ok: true; href: string } | { ok: false; reason: string }

/** Schemes a link on a storefront may use. Everything else is refused. */
const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "tel"])

const TOO_LONG = 2048

/**
 * A browser ignores tabs, newlines and other control characters inside a URL
 * before it reads the scheme, so `java\tscript:` is `javascript:` to it. The
 * check reads the address the way the browser will.
 */
function schemeOf(raw: string): string | null {
  const squeezed = raw.replace(/[\u0000- \u007f]+/g, "")
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(squeezed)
  return m ? m[1].toLowerCase() : null
}

/** `localhost:3000/x` and `shop.com:8080` start with something that looks like a scheme and is a host. */
function isHostWithPort(raw: string): boolean {
  return /^[a-z0-9.-]+:\d{1,5}(\/|$|\?|#)/i.test(raw)
}

function looksLikeHost(raw: string): boolean {
  const host = raw.split(/[/?#]/, 1)[0].replace(/:\d{1,5}$/, "")
  if (host === "localhost") return true
  // A dot, and a last label of letters: shop.com, www.example.co.uk, not "1.5" or "hero".
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(host)
}

export function normalizeLinkAddress(input: string): LinkAddress {
  const raw = (input ?? "").trim()
  if (raw === "") return { ok: true, href: "" }
  if (raw.length > TOO_LONG) return { ok: false, reason: "That address is too long." }

  /* This site's own pages, a place on this page, or a search on it. */
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    if (/\s/.test(raw)) return { ok: false, reason: "An address cannot have spaces in it." }
    return { ok: true, href: raw }
  }
  if (raw.startsWith("#") || raw.startsWith("?")) {
    if (/\s/.test(raw)) return { ok: false, reason: "An address cannot have spaces in it." }
    return { ok: true, href: raw }
  }
  if (raw.startsWith("//")) return normalizeLinkAddress(`https:${raw}`)

  const scheme = isHostWithPort(raw) ? null : schemeOf(raw)
  if (scheme !== null) {
    if (!ALLOWED_SCHEMES.has(scheme)) {
      return { ok: false, reason: "Links can go to a web page, an email address or a phone number." }
    }
    const rest = raw.slice(raw.indexOf(":") + 1)
    if (scheme === "mailto") {
      const to = rest.trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+/.test(to)) return { ok: false, reason: "That email address is missing something." }
      return { ok: true, href: `mailto:${to}` }
    }
    if (scheme === "tel") {
      const number = rest.replace(/[\s().-]/g, "")
      if (!/^\+?\d{3,20}$/.test(number)) return { ok: false, reason: "That phone number has something other than digits in it." }
      return { ok: true, href: `tel:${number}` }
    }
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      return { ok: false, reason: "That address is not complete." }
    }
    if (!url.hostname || /\s/.test(raw) || !looksLikeHost(url.host)) {
      return { ok: false, reason: "That address is not complete." }
    }
    /* The scheme in lower case, and otherwise exactly what was typed. */
    return { ok: true, href: `${scheme}:${raw.slice(raw.indexOf(":") + 1)}` }
  }

  /* No scheme. An email, a phone number, or a web address without https://. */
  if (/^[^\s@/]+@[^\s@/]+\.[a-z]{2,}$/i.test(raw)) return { ok: true, href: `mailto:${raw}` }
  if (/^\+?[\d\s().-]{6,}$/.test(raw) && /\d{6,}/.test(raw.replace(/\D/g, ""))) {
    return { ok: true, href: `tel:${raw.replace(/[\s().-]/g, "")}` }
  }
  if (/\s/.test(raw)) {
    return { ok: false, reason: "An address cannot have spaces in it. Type one like www.example.com, or pick a page." }
  }
  if (looksLikeHost(raw)) return normalizeLinkAddress(`https://${raw}`)
  return { ok: false, reason: "Finish the address, like www.example.com, or pick a page or a product." }
}

/** What an address is, for the one mark the field draws beside it. */
export function linkKind(href: string): "empty" | "web" | "email" | "phone" | "site" {
  const v = (href ?? "").trim()
  if (!v) return "empty"
  if (/^mailto:/i.test(v)) return "email"
  if (/^tel:/i.test(v)) return "phone"
  if (/^(https?:)?\/\//i.test(v)) return "web"
  return "site"
}
