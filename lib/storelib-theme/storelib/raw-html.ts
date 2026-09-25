/**
 * ===========================================================================
 *  WHAT `raw` MAY PUT ON A PAGE
 * ===========================================================================
 * `raw` exists for rich text, and rich text is cleaned when it is saved
 * (lib/website-builder/sanitize.ts). "When it is saved" is not every way a
 * value arrives, though: a row written before that cleaning existed, a
 * setting on a section type whose schema the cleaner never saw, a string the
 * template put together itself with `append`. Each of those reached the page
 * exactly as written, on the platform's own origin.
 *
 * So the value is looked at again as it is drawn. Markup the cleaner could
 * have produced goes out untouched, byte for byte, and so does ordinary
 * pasted HTML: a map or a video frame, a form, a comment. Markup that can run
 * something (a script, an event handler, a javascript: address) or that can
 * hide markup from this check (a tag or a quote that never closes, text a
 * browser may read as tags) goes out as its words instead, with the tags
 * taken away. What somebody wrote stays readable and none of it runs.
 *
 * It is a check, not a second cleaner: it has no allow list of its own and
 * changes nothing it lets through. It lives in the engine rather than on the
 * server because the builder's canvas draws the same sections in the browser.
 *
 * What it cannot see is where the value lands. It reads the value as page
 * content, which is where every shipped template puts `raw`; a template that
 * puts `raw` inside a tag is not covered by this.
 */

const SPACE = new Set(["\t", "\n", "\f", "\r", " "])

/** Tags that run code, load another document or change where the page's addresses point. */
const BLOCKED_TAGS = new Set([
  "script", "object", "embed", "applet", "frame", "frameset", "portal", "fencedframe",
  "base", "meta", "link", "plaintext",
  /* Inside these a browser reads tags by other rules, which this check does not follow. */
  "svg", "math",
])

/**
 * Tags whose inside a browser reads as text, except inside an <svg>, where it
 * reads it as tags. Only an inside with no "<" reads the same both ways, so
 * that is the only kind let through.
 */
const TEXT_ONLY_TAGS = new Set(["style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript"])

/** Attributes whose value is an address a browser may follow or load. */
const ADDRESS_ATTRIBUTES = new Set([
  "href", "src", "action", "formaction", "xlink:href", "data", "poster",
  "background", "codebase", "cite", "ping", "lowsrc", "dynsrc", "longdesc", "usemap",
])

/**
 * Character references undone, as a browser undoes them inside an attribute.
 * Only the kinds that can spell a scheme: numbers, and the named colon, tab
 * and newline that turn up in `javascript&colon;` tricks.
 */
function decodeReferences(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|colon|tab|newline);?/gi, (_m, ref: string) => {
    const r = ref.toLowerCase()
    if (r === "colon") return ":"
    if (r === "tab") return "\t"
    if (r === "newline") return "\n"
    const code = r.startsWith("#x") ? parseInt(r.slice(2), 16) : parseInt(r.slice(1), 10)
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "�"
  })
}

/** An address with references undone and every space and control character dropped. */
function plainAddress(value: string): string {
  return decodeReferences(value).replace(/[\u0000- \u007f]/g, "").toLowerCase()
}

/**
 * A javascript: or vbscript: address, however it is spelled. More spaces and
 * control characters are dropped than a browser drops, so a `java\tscript:`
 * cannot slip past by being spelled oddly.
 */
export function isScriptScheme(value: string): boolean {
  const v = plainAddress(value)
  return v.startsWith("javascript:") || v.startsWith("vbscript:")
}

/** An address that runs something when it is followed or loaded. */
export function isScriptAddress(value: string): boolean {
  if (isScriptScheme(value)) return true
  const v = plainAddress(value)
  if (!v.startsWith("data:")) return false
  /* A picture held in the address is fine; a page, an svg or a script is not. */
  const type = v.slice(5).split(/[;,]/, 1)[0]
  return /html|xml|svg|script/.test(type)
}

/** A frame may show a web page and nothing else: http, https, or protocol relative. */
function isFrameAddress(value: string): boolean {
  const v = plainAddress(value)
  return v === "" || v.startsWith("https://") || v.startsWith("http://") || v.startsWith("//")
}

/**
 * True when the markup can run nothing and hides nothing. It is read the way
 * a browser's tokenizer reads a tag, attribute by attribute, including the
 * spellings a browser accepts and a regular expression usually misses:
 * `<img/onerror=…>`, `<img src="x"onerror=…>`, `jav&#x61;script:`.
 */
export function rawMarkupIsInert(html: string): boolean {
  const n = html.length
  let i = html.indexOf("<")
  while (i !== -1) {
    /* A "<" at the very end would open a tag with whatever the template draws next. */
    if (i + 1 >= n) return false
    const next = html.charAt(i + 1)
    if (next === "!") {
      /* A comment is read the way a browser reads one. Anything else after
         "<!" (a doctype, CDATA) is never in a fragment somebody wrote. */
      if (!html.startsWith("<!--", i)) return false
      if (html.startsWith("<!-->", i)) { i = html.indexOf("<", i + 5); continue }
      if (html.startsWith("<!--->", i)) { i = html.indexOf("<", i + 6); continue }
      const close = /--!?>/.exec(html.slice(i + 4))
      if (!close) return false
      i = html.indexOf("<", i + 4 + close.index + close[0].length)
      continue
    }
    if (next === "?") return false
    const closing = next === "/"
    let at = closing ? i + 2 : i + 1
    if (!/[A-Za-z]/.test(html.charAt(at))) {
      /* "</" then anything but a letter hides everything up to the next ">". */
      if (closing) return false
      /* "<" then anything but a letter is just a character. */
      i = html.indexOf("<", i + 1)
      continue
    }
    let k = at
    while (k < n && !SPACE.has(html[k]) && html[k] !== "/" && html[k] !== ">") k++
    const name = html.slice(at, k).toLowerCase()
    if (!closing && BLOCKED_TAGS.has(name)) return false

    let src: string | null = null
    for (;;) {
      while (k < n && (SPACE.has(html[k]) || html[k] === "/")) k++
      /* A tag that never closes swallows whatever the template draws next. */
      if (k >= n) return false
      if (html[k] === ">") break
      /* The first character always begins a name, even "=" or a quote. */
      at = k++
      while (k < n && !SPACE.has(html[k]) && html[k] !== "/" && html[k] !== ">" && html[k] !== "=") k++
      const attribute = html.slice(at, k).toLowerCase()
      while (k < n && SPACE.has(html[k])) k++
      let value = ""
      if (html[k] === "=") {
        k++
        while (k < n && SPACE.has(html[k])) k++
        const quote = html[k]
        if (quote === '"' || quote === "'") {
          const end = html.indexOf(quote, k + 1)
          if (end === -1) return false
          value = html.slice(k + 1, end)
          k = end + 1
        } else {
          const from = k
          while (k < n && !SPACE.has(html[k]) && html[k] !== ">") k++
          value = html.slice(from, k)
        }
      }
      if (attribute.startsWith("on") || attribute === "srcdoc") return false
      if (ADDRESS_ATTRIBUTES.has(attribute) && isScriptAddress(value)) return false
      if (attribute === "src") src = value
    }

    if (!closing && TEXT_ONLY_TAGS.has(name)) {
      if (name === "iframe" && src !== null && !isFrameAddress(src)) return false
      const rest = html.slice(k + 1)
      const end = new RegExp(`</${name}[\\t\\n\\f\\r />]`, "i").exec(rest)
      if (!end || rest.slice(0, end.index).includes("<")) return false
      i = k + 1 + end.index
      continue
    }
    i = html.indexOf("<", k + 1)
  }
  return true
}

/** A value that cannot go out as markup goes out as its words. */
export function textOnly(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?(<\/\1\s*>|$)/gi, "")
    .replace(/<!--[\s\S]*?(-->|$)/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/** What `raw` emits into a page: the value itself, or its words. */
export function guardRawHtml(html: string): string {
  return html.indexOf("<") === -1 || rawMarkupIsInert(html) ? html : textOnly(html)
}

/**
 * A section's stylesheet is written into a <style> element, and the only
 * thing that ends one early is `</style`. A stylesheet has no use for it, so
 * it is escaped wherever it came from: the file, a setting, or `raw`.
 */
export function guardStyleText(css: string): string {
  return /<\/style/i.test(css) ? css.replace(/<\/(style)/gi, "<\\/$1") : css
}
