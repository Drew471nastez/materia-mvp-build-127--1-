/**
 * ===========================================================================
 *  WHAT MAY BE IN THE BODY OF AN EMAIL A CREATOR SENDS
 * ===========================================================================
 * The body arrives from a browser, so it is whatever that browser sent: the
 * editor's own blocks, a paste from a web page, or a hand-made request. It is
 * cleaned twice, when it is saved and again when it is sent, because a draft
 * saved by an older page (or written straight to the table) never passed the
 * first.
 *
 *   no script, style, iframe, form, object, svg or any other active thing
 *   no event handlers, no attributes outside a short list
 *   links only to http, https, mailto and tel; images only over http(s)
 *   inline styles only from a short list of properties, with values that
 *   cannot load anything (no url(), no expression(), no position)
 *   and nothing hidden: display:none in a body is how spam hides its words
 *
 * The saved copy keeps the editor's data-sl-* markers so a draft reopens as
 * the blocks it was written as. The sent copy drops them.
 */
import sanitizeHtml from "sanitize-html"

const TAGS = [
  "p", "br", "h1", "h2", "h3", "h4", "blockquote", "ul", "ol", "li",
  "b", "strong", "i", "em", "u", "s", "strike", "del", "span", "div", "a", "img", "hr",
  "table", "thead", "tbody", "tr", "td", "th", "center",
]

const LENGTH = /^-?\d+(\.\d+)?(px|em|rem|%)?$/
const BOX = /^(-?\d+(\.\d+)?(px|em|rem|%)?|auto)(\s+(-?\d+(\.\d+)?(px|em|rem|%)?|auto)){0,3}$/
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)|transparent|inherit|currentcolor)$/i
const BORDER = /^(none|0|\d+(\.\d+)?px\s+(solid|dashed|dotted)\s+(#[0-9a-f]{3,8}|rgba?\([\d\s.,]+\)))$/i
const FONT_FAMILY = /^[a-z0-9\s,'"-]+$/i

const STYLES: sanitizeHtml.IOptions["allowedStyles"] = {
  "*": {
    color: [COLOR],
    "background-color": [COLOR],
    "text-align": [/^(left|right|center|justify)$/],
    "font-size": [LENGTH],
    "font-weight": [/^(normal|bold|[1-9]00)$/],
    "font-style": [/^(normal|italic)$/],
    "font-family": [FONT_FAMILY],
    "text-decoration": [/^(none|underline|line-through)$/],
    "line-height": [LENGTH],
    "letter-spacing": [LENGTH],
    margin: [BOX],
    "margin-top": [BOX], "margin-bottom": [BOX], "margin-left": [BOX], "margin-right": [BOX],
    padding: [BOX],
    "padding-top": [BOX], "padding-bottom": [BOX], "padding-left": [BOX], "padding-right": [BOX],
    border: [BORDER],
    "border-top": [BORDER], "border-bottom": [BORDER], "border-left": [BORDER], "border-right": [BORDER],
    "border-radius": [BOX],
    "border-collapse": [/^(collapse|separate)$/],
    width: [LENGTH, /^auto$/],
    "max-width": [LENGTH],
    height: [LENGTH, /^auto$/],
    display: [/^(block|inline-block|inline|table)$/],
    "vertical-align": [/^(top|middle|bottom|baseline)$/],
    "object-fit": [/^(cover|contain)$/],
    outline: [/^none$/],
    "word-break": [/^(break-word|break-all|normal)$/],
    "white-space": [/^(normal|nowrap|pre-wrap)$/],
  },
}

const COMMON_ATTRS = ["style", "align"]

function options(keepMarkers: boolean): sanitizeHtml.IOptions {
  const markers = keepMarkers ? ["data-sl-block", "data-sl-props", "data-sl-style"] : []
  return {
    allowedTags: TAGS,
    allowedAttributes: {
      "*": [...COMMON_ATTRS, ...markers],
      a: ["href", "title", ...COMMON_ATTRS, ...markers],
      img: ["src", "alt", "width", "height", ...COMMON_ATTRS, ...markers],
      table: ["role", "width", "cellpadding", "cellspacing", "border", "bgcolor", ...COMMON_ATTRS, ...markers],
      td: ["width", "height", "valign", "bgcolor", "colspan", "rowspan", ...COMMON_ATTRS, ...markers],
      th: ["width", "valign", "bgcolor", "colspan", ...COMMON_ATTRS],
      tr: [...COMMON_ATTRS],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https"] },
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    allowedStyles: STYLES,
    /* What is not allowed is removed with its contents when it can only be
       code, and unwrapped (its text kept) otherwise. */
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed", "svg", "math", "template", "head", "title"],
    transformTags: {
      strike: "s",
      del: "s",
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  }
}

/** For the saved draft: clean, with the editor's block markers kept. */
export function sanitizeForStorage(html: string): string {
  return sanitizeHtml(String(html ?? ""), options(true))
}

/** For the send: clean, and nothing the reader does not need. */
export function sanitizeForSend(html: string): string {
  return sanitizeHtml(String(html ?? ""), options(false))
}

/** The words a reader would see, for "is there anything in this email". */
export function visibleText(html: string): string {
  return sanitizeHtml(String(html ?? ""), { allowedTags: [], allowedAttributes: {}, nonTextTags: ["script", "style", "title", "head"] })
    .replace(/&nbsp;|&#160;| |​|‌|‍|﻿/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function imageCount(html: string): number {
  return (String(html ?? "").match(/<img\s[^>]*src=/gi) ?? []).length
}
