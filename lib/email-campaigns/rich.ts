/**
 * ===========================================================================
 *  RICH TEXT, AS AN INBOX DRAWS IT
 * ===========================================================================
 * The Emails pages write text in the shared rich text field
 * (components/app/rich-text-editor.tsx): paragraphs, two heading levels,
 * bold, italic, underline, strike, lists, quotes, links, a divider, and in
 * an automation a button. That HTML is written for a browser. An inbox is
 * not one: Gmail drops <style> blocks in some apps, Outlook on Windows draws
 * with Word, and nothing may be left to a default margin or colour.
 *
 * So the same tree is written again here, every element with its own inline
 * style, a button as a table cell (the only fill Outlook paints), links in
 * the brand's colour, and nothing that is not on this list. One function for
 * a campaign's text blocks, an automation's body and a draft from the old
 * editor, so they all read alike.
 *
 * SAFE BY CONSTRUCTION. The reader is lib/rich-text/html.ts parseHtml, which
 * never runs anything. The writer below only ever emits tag names from a
 * fixed list, attribute values it built itself, links that are https,
 * mailto or tel, pictures that are https, and text with every `<`, `>`, `&`
 * and quote escaped. What it does not recognise comes out as its text or not
 * at all. No script, no event handler, no style it did not write.
 *
 * Pure and browser-safe: the compose page's preview uses it too.
 */
import { parseHtml, type HElement, type HNode } from "@/lib/rich-text/html"
import { isButtonShaped, parseStyle, safeHref } from "@/lib/rich-text/policy"
import { decodeHtmlEntities } from "@/lib/html-entities"
import { DEFAULT_ACCENT, buttonColors, hexColor, type EmailTheme } from "./brand"
import { inboxImageSrc } from "./sender"

export const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
export const TEXT = "#1f2937"
export const HEAD = "#111827"
export const MUTED = "#4b5563"
export const LINE = "#e5e7eb"

/** The placeholders an address may be before it is filled in per reader. */
const HREF_PLACEHOLDER = /^\{\{\s*(unsubscribe_url|store_url)\s*\}\}$/i

export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

/**
 * A link as an email may carry it: https (http is upgraded), mailto, tel,
 * or one of the two placeholders filled in at send. A path on "this site"
 * means nothing in an inbox, so it is refused like javascript: is.
 */
export function emailHref(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (HREF_PLACEHOLDER.test(value)) return value.replace(/\s+/g, "")
  const safe = safeHref(value)
  if (!safe) return null
  if (/^mailto:|^tel:/i.test(safe)) return safe
  if (!/^https?:\/\//i.test(safe)) return null
  try {
    const u = new URL(safe)
    u.protocol = "https:"
    if (!u.hostname.includes(".") || u.username || u.password) return null
    return u.toString()
  } catch {
    return null
  }
}

/** A picture's address: https only (http is upgraded), nothing inline. */
export function emailImageSrc(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null
  const v = raw.trim()
  if (!/^https?:\/\//i.test(v)) return null
  try {
    const u = new URL(v)
    u.protocol = "https:"
    if (!u.hostname.includes(".") || u.username || u.password) return null
    return u.toString()
  } catch {
    return null
  }
}

/* ─── Styles, one per element ────────────────────────────────────────── */

const P = `margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:26px;color:${TEXT};`
const H1 = `margin:8px 0 16px;font-family:${FONT};font-size:28px;line-height:36px;font-weight:700;color:${HEAD};`
const H2 = `margin:8px 0 12px;font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;color:${HEAD};`
const H3 = `margin:4px 0 10px;font-family:${FONT};font-size:18px;line-height:26px;font-weight:600;color:${HEAD};`
const QUOTE = `margin:0 0 16px;padding:2px 0 2px 16px;border-left:3px solid ${LINE};font-family:${FONT};font-size:16px;line-height:26px;color:${MUTED};`
const LIST = `margin:0 0 16px;padding:0 0 0 24px;font-family:${FONT};font-size:16px;line-height:26px;color:${TEXT};`
const LI = "margin:0 0 6px;padding-left:4px;"
const HR = `border:0;border-top:1px solid ${LINE};height:1px;margin:24px 0;font-size:0;line-height:0;`

const ALIGN = /^(left|right|center|justify)$/

function alignOf(el: HElement): string {
  const a = new Map(parseStyle(el.attrs.style ?? "")).get("text-align") ?? el.attrs.align ?? ""
  const v = a.trim().toLowerCase()
  return ALIGN.test(v) && v !== "left" ? `text-align:${v};` : ""
}

const DROPPED = new Set([
  "script", "style", "title", "head", "meta", "link", "base", "template", "noscript", "iframe", "object", "embed",
  "applet", "frame", "frameset", "svg", "math", "canvas", "video", "audio", "source", "track", "picture", "button",
  "input", "select", "option", "textarea", "form", "dialog",
])

const BLOCK = new Set([
  "p", "div", "section", "article", "header", "footer", "main", "aside", "nav", "center", "figure", "figcaption",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "li", "hr", "table", "thead", "tbody", "tfoot", "tr",
  "td", "th", "pre", "dl", "dt", "dd", "address",
])

/* ─── Inline ─────────────────────────────────────────────────────────── */

interface Ctx {
  theme: EmailTheme
  inLink: boolean
}

function text(value: string): string {
  return esc(decodeHtmlEntities(value).replace(/ /g, " ")).replace(/ {2,}/g, (s) => " " + "&nbsp;".repeat(s.length - 1))
}

function inline(nodes: HNode[], ctx: Ctx): string {
  let out = ""
  for (const node of nodes) {
    if (node.type === "text") {
      out += text(node.value)
      continue
    }
    const name = node.name
    if (DROPPED.has(name)) continue
    switch (name) {
      case "br":
        out += "<br>"
        break
      case "b":
      case "strong":
        out += wrap("strong", "font-weight:700;", inline(node.children, ctx))
        break
      case "i":
      case "em":
        out += wrap("em", "font-style:italic;", inline(node.children, ctx))
        break
      case "u":
      case "ins":
        out += wrap("u", "text-decoration:underline;", inline(node.children, ctx))
        break
      case "s":
      case "strike":
      case "del":
        out += wrap("s", "text-decoration:line-through;", inline(node.children, ctx))
        break
      case "a": {
        const href = ctx.inLink ? null : emailHref(node.attrs.href)
        const inner = inline(node.children, { ...ctx, inLink: true })
        if (!href) {
          out += inner
          break
        }
        if (isButtonShaped(node.attrs.style ?? "")) {
          const c = buttonColors(chosenFill(node), ctx.theme)
          out += `<a href="${esc(href)}" target="_blank" style="display:inline-block;padding:10px 18px;border-radius:8px;background-color:${c.fill};color:${c.text};font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;text-decoration:none;">${inner}</a>`
          break
        }
        out += `<a href="${esc(href)}" target="_blank" style="color:${ctx.theme.link};text-decoration:underline;">${inner}</a>`
        break
      }
      case "img": {
        const stored = emailImageSrc(node.attrs.src)
        if (!stored) break
        const w = Number(node.attrs.width)
        const width = Number.isFinite(w) && w > 0 ? Math.min(520, Math.round(w)) : 520
        /* Twice its drawn width, in a format the inbox shows (./sender inboxImageSrc), never the upload itself. */
        const src = inboxImageSrc(stored, width) ?? stored
        out += `<img src="${esc(src)}" alt="${esc((node.attrs.alt ?? "").slice(0, 300))}" width="${width}" style="display:inline-block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none;vertical-align:middle;">`
        break
      }
      default:
        /* span, font, code, mark, small and anything unknown: its words. A
           block inside a line keeps a break so its words do not run on. */
        out += inline(node.children, ctx)
        if (BLOCK.has(name)) out += "<br>"
    }
  }
  return out
}

function wrap(tag: string, style: string, inner: string): string {
  return inner ? `<${tag} style="${style}">${inner}</${tag}>` : ""
}

function isBlank(html: string): boolean {
  return !decodeHtmlEntities(html.replace(/<br>/g, "").replace(/<[^>]*>/g, "")).replace(/[\s ​]+/g, "") && !/<img /.test(html)
}

/* ─── Buttons ────────────────────────────────────────────────────────── */

/**
 * The fill a button in the text chose, or "" for the brand's. The automated
 * email's editor (app/app/emails/flow/body-editor.tsx) writes every button
 * in the default ink and offers no other, so that ink is not a choice: those
 * buttons wear the creator's colour like every other button they send.
 */
function chosenFill(a: HElement): string {
  const fill = hexColor(new Map(parseStyle(a.attrs.style ?? "")).get("background-color"))
  return !fill || fill === DEFAULT_ACCENT ? "" : fill
}

/**
 * A button that survives every inbox: the fill on the table cell, which
 * Outlook paints (it ignores padding and background on a link), with the
 * padding on the link for everyone else and `mso-padding-alt` for Outlook.
 */
export function buttonHtml(input: { href: string; label: string; fill: string; text: string; align?: "left" | "center" | "right"; size?: "md" | "sm" }): string {
  const align = input.align ?? "left"
  const pad = input.size === "sm" ? "9px 16px" : "12px 24px"
  const font = input.size === "sm" ? "font-size:14px;line-height:18px;" : "font-size:16px;line-height:20px;"
  const margin = align === "center" ? "margin:0 auto;" : align === "right" ? "margin:0 0 0 auto;" : ""
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${align === "center" ? ' align="center"' : ""} style="border-collapse:separate;${margin}"><tr><td align="center" bgcolor="${input.fill}" class="sl-btn" style="border-radius:8px;background-color:${input.fill};mso-padding-alt:${pad};"><a href="${esc(input.href)}" target="_blank" style="display:inline-block;padding:${pad};font-family:${FONT};${font}font-weight:600;color:${input.text};text-decoration:none;border-radius:8px;mso-padding-alt:0;"><span style="color:${input.text};">${input.label}</span></a></td></tr></table>`
}

/** A paragraph that is only a button-shaped link: drawn as a real button. */
function loneButton(el: HElement): HElement | null {
  const kids = el.children.filter((c) => !(c.type === "text" && !c.value.replace(/[\s ]+/g, "")) && !(c.type === "el" && c.name === "br"))
  if (kids.length !== 1 || kids[0].type !== "el") return null
  const k = kids[0]
  if (k.name === "a" && isButtonShaped(k.attrs.style ?? "")) return k
  if ((k.name === "span" || k.name === "strong" || k.name === "b") && k.children.length === 1) return loneButton({ ...el, children: k.children })
  return null
}

function buttonBlock(a: HElement, align: string, ctx: Ctx): string {
  const href = emailHref(a.attrs.href)
  const label = inline(a.children, { ...ctx, inLink: true }).replace(/<[^>]*>/g, "").trim() || "Open"
  if (!href) return `<p style="${P}${align}">${label}</p>`
  const c = buttonColors(chosenFill(a), ctx.theme)
  const where = /center/.test(align) ? "center" : /right/.test(align) ? "right" : "left"
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:4px 0 20px;"><tr><td align="${where}">${buttonHtml({ href, label, fill: c.fill, text: c.text, align: where })}</td></tr></table>`
}

/* ─── Blocks ─────────────────────────────────────────────────────────── */

function blocks(nodes: HNode[], ctx: Ctx): string {
  let out = ""
  let run: HNode[] = []
  const flush = () => {
    const inner = inline(run, ctx).replace(/^(<br>)+|(<br>)+$/g, "")
    if (!isBlank(inner)) out += `<p style="${P}">${inner}</p>`
    run = []
  }
  for (const node of nodes) {
    if (node.type === "text" || (!BLOCK.has(node.name) && !DROPPED.has(node.name))) {
      run.push(node)
      continue
    }
    flush()
    out += block(node, ctx)
  }
  flush()
  return out
}

function hasBlockChild(el: HElement): boolean {
  return el.children.some((c) => c.type === "el" && BLOCK.has(c.name))
}

function block(el: HElement, ctx: Ctx): string {
  const name = el.name
  if (DROPPED.has(name)) return ""
  switch (name) {
    case "p":
    case "div":
    case "center":
    case "section":
    case "article":
    case "header":
    case "footer":
    case "main":
    case "aside":
    case "figure":
    case "figcaption":
    case "address":
    case "pre":
    case "td":
    case "th":
    case "dd":
    case "dt": {
      if (hasBlockChild(el)) return blocks(el.children, ctx)
      const align = name === "center" ? "text-align:center;" : alignOf(el)
      const button = loneButton(el)
      if (button) return buttonBlock(button, align, ctx)
      const inner = inline(el.children, ctx).replace(/^(<br>)+|(<br>)+$/g, "")
      return isBlank(inner) ? "" : `<p style="${P}${align}">${inner}</p>`
    }
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const style = name === "h1" ? H1 : name === "h2" ? H2 : H3
      const tag = name === "h1" ? "h1" : name === "h2" ? "h2" : "h3"
      const inner = inline(el.children, ctx)
      return isBlank(inner) ? "" : `<${tag} style="${style}${alignOf(el)}">${inner}</${tag}>`
    }
    case "blockquote": {
      const inner = hasBlockChild(el)
        ? blocks(el.children, ctx).replace(/margin:0 0 16px;/g, "margin:0 0 8px;")
        : inline(el.children, ctx)
      return isBlank(inner) ? "" : `<blockquote style="${QUOTE}">${inner}</blockquote>`
    }
    case "ul":
    case "ol": {
      const items = el.children
        .filter((c): c is HElement => c.type === "el" && c.name === "li")
        .map((li) => {
          const nested = li.children.filter((c): c is HElement => c.type === "el" && (c.name === "ul" || c.name === "ol"))
          const own = li.children.filter((c) => !(c.type === "el" && (c.name === "ul" || c.name === "ol")))
          const words = inline(own, ctx).replace(/^(<br>)+|(<br>)+$/g, "")
          const sub = nested.map((n) => block(n, ctx).replace(/margin:0 0 16px;/, "margin:6px 0 0;")).join("")
          return isBlank(words) && !sub ? "" : `<li style="${LI}">${isBlank(words) ? "" : words}${sub}</li>`
        })
        .join("")
      return items ? `<${name} style="${LIST}">${items}</${name}>` : ""
    }
    case "li":
      return block({ ...el, name: "ul", children: [el] }, ctx)
    case "hr":
      return `<hr style="${HR}">`
    case "table":
    case "thead":
    case "tbody":
    case "tfoot":
    case "tr":
    case "dl":
    case "nav":
      return blocks(el.children, ctx)
    default:
      return blocks(el.children, ctx)
  }
}

/** Rich text as email HTML, in the brand's colours. */
export function richToEmail(html: string, theme: EmailTheme): string {
  if (!html) return ""
  return blocks(parseHtml(html).children, { theme, inLink: false })
}

/** The same, from nodes already read (a draft's text block). */
export function nodesToEmail(nodes: HNode[], theme: EmailTheme): string {
  return blocks(nodes, { theme, inLink: false })
}
