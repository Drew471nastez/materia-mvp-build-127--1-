import "server-only"

/**
 * ===========================================================================
 *  A PRODUCT DESCRIPTION, MADE SAFE ON THE SERVER
 * ===========================================================================
 * The description is rendered on storelib.com, in the session of whoever
 * opens the product. Until this, nothing sanitised it: the editor saved its
 * innerHTML straight to the row, the page put the row straight into the DOM,
 * and the old editor's own output carried inline `onmouseenter` handlers
 * that ran on the public page.
 *
 * So the same allow list as lib/website-builder/sanitize.ts, applied the
 * same two times:
 *
 *   ON SAVE   app/app/products/new/description-action.ts, from the product
 *             editor and from the creator page's inline editor.
 *   ON READ   lib/commerce/product-page-data.ts, for every row saved before
 *             this existed and every row written some other way.
 *
 * The allow list itself is lib/rich-text/policy.ts, shared with the browser
 * side (lib/rich-text/html.ts), so the editor, the renderer and this agree
 * about what a description is.
 *
 * PLAIN TEXT STAYS PLAIN TEXT. A description with no tags in it is drawn as
 * text by the renderer (escaped by React), and turning it into HTML here
 * would change how every old description looks.
 */
import sanitizeHtml from "sanitize-html"
import {
  ATTRIBUTE_VALUES,
  DROPPED_TAGS,
  EXTERNAL_REL,
  IFRAME_HOSTNAMES,
  STORED_ATTRIBUTES,
  STORED_CLASSES,
  LEGACY_IMAGE_WRAPPERS,
  STORED_TAGS,
  STYLE_RULES,
  TAG_ALIASES,
  isButtonShaped,
  isExternalHref,
  pictureStyle,
  safeHref,
  safeIframeSrc,
  safeImageSrc,
} from "./policy"

/** Longer than any description written by hand; a row this size is a pasted page or a stored image. */
export const MAX_DESCRIPTION = 2_000_000

function renamed(to: string): sanitizeHtml.Transformer {
  return (_tag, attribs) => ({ tagName: to, attribs })
}

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...STORED_TAGS],
  /* `target` and `rel` on a link are this file's, set below; whatever the
     row said is removed first. */
  allowedAttributes: Object.fromEntries(
    Object.entries(STORED_ATTRIBUTES).map(([tag, names]) => [tag, tag === "a" ? [...names, "target", "rel"] : [...names]]),
  ),
  allowedClasses: STORED_CLASSES,
  allowedStyles: Object.fromEntries(
    Object.entries(STYLE_RULES).map(([tag, rules]) => [tag, Object.fromEntries(Object.entries(rules).map(([prop, re]) => [prop, [re]]))]),
  ),
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["https", "data"], iframe: ["https"] },
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  allowedIframeHostnames: IFRAME_HOSTNAMES,
  allowIframeRelativeUrls: false,
  nonTextTags: [...DROPPED_TAGS],
  transformTags: {
    ...Object.fromEntries(Object.entries(TAG_ALIASES).map(([from, to]) => [from, renamed(to)])),
    /* The same checks the browser side makes, so an address either engine
       refuses is refused by both. */
    a: (tagName, attribs) => {
      const out: Record<string, string> = { ...attribs }
      delete out.target
      delete out.rel
      const href = safeHref(attribs.href)
      if (href) {
        out.href = href
        if (isExternalHref(href)) {
          out.target = "_blank"
          out.rel = EXTERNAL_REL
        }
      } else {
        delete out.href
      }
      if (out.style && !isButtonShaped(out.style)) delete out.style
      return { tagName, attribs: out }
    },
    span: (tagName, attribs) => {
      const out: Record<string, string> = { ...attribs }
      if (out.style && !isButtonShaped(out.style)) delete out.style
      return { tagName, attribs: out }
    },
    /* The picture's own rules are applied per call by sanitizeDescription,
       which knows whether it is inside one of the old editor's wrappers;
       this entry is here so the vocabulary check below wraps it. */
    img: (tagName, attribs) => ({ tagName, attribs }),
    iframe: (tagName, attribs) => {
      const out: Record<string, string> = { ...attribs }
      const src = safeIframeSrc(attribs.src)
      if (src) out.src = src
      else delete out.src
      return { tagName, attribs: out }
    },
  },
  /** An image or an embed whose address was refused is nothing at all. */
  exclusiveFilter: (frame) => (frame.tag === "img" || frame.tag === "iframe") && !frame.attribs.src,
}

/* sanitize-html has no per-value rule for ordinary attributes, so values
   with a fixed vocabulary are checked by wrapping every allowed tag's
   transform: an attribute whose value is not on its list is removed. */
for (const tag of STORED_TAGS) {
  const previous = OPTIONS.transformTags?.[tag] as sanitizeHtml.Transformer | undefined
  OPTIONS.transformTags![tag] = (tagName, attribs) => {
    const result = previous ? (typeof previous === "function" ? previous(tagName, attribs) : { tagName, attribs }) : { tagName, attribs }
    const out: Record<string, string> = {}
    for (const [name, value] of Object.entries(result.attribs)) {
      const rule = ATTRIBUTE_VALUES[name]
      if (rule && !rule.test(String(value).trim())) continue
      out[name] = value
    }
    return { tagName: result.tagName, attribs: out }
  }
}

/**
 * A picture: its address checked (own storage anywhere, the old editor's
 * shapes only inside its wrappers), lazy, and styled as it was if it is old;
 * a new one keeps only its width and shape.
 */
function imageAttributes(tagName: string, attribs: sanitizeHtml.Attributes, legacy: boolean) {
  const out: Record<string, string> = { ...attribs }
  const src = safeImageSrc(attribs.src, legacy)
  if (src) out.src = src
  else delete out.src
  if (!legacy) {
    /* A new picture keeps only its width and shape, rebuilt (pictureStyle). */
    const style = pictureStyle(out.style ?? "")
    if (style) out.style = style
    else delete out.style
  }
  out.loading = "lazy"
  return { tagName, attribs: out }
}

/** A description as it may be stored and shown. Plain text is returned as it was. */
export function sanitizeDescription(value: unknown): string {
  if (typeof value !== "string" || !value) return ""
  const input = value.slice(0, MAX_DESCRIPTION)
  if (!/<[a-z][\s\S]*>/i.test(input)) return input
  /* sanitize-html tells a transform nothing about the tag's parents, so the
     open tags are followed here: one stack per call. */
  const open: boolean[] = []
  const inLegacy = () => open.includes(true)
  const imgTransform = OPTIONS.transformTags!.img as sanitizeHtml.Transformer
  return sanitizeHtml(input, {
    ...OPTIONS,
    onOpenTag: (name, attribs) => {
      open.push(name === "div" && LEGACY_IMAGE_WRAPPERS.has(attribs["data-embed-type"] ?? ""))
    },
    onCloseTag: () => {
      open.pop()
    },
    transformTags: {
      ...OPTIONS.transformTags,
      img: (tagName, attribs) => {
        const base = typeof imgTransform === "function" ? imgTransform(tagName, attribs) : { tagName, attribs }
        return imageAttributes(base.tagName, base.attribs, inLegacy())
      },
    },
  }).trim()
}
