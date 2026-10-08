/**
 * ===========================================================================
 *  A SECTION AN AGENT WRITES MUST PLUG INTO THE THEME LIKE A NATIVE ONE
 * ===========================================================================
 * quality.ts catches files that are broken: a fixed id, a width media query.
 * What a save refuses here is a live Storelib value typed in by hand: a menu
 * as numbered link pairs, a picture as text, a link or a sentence the creator
 * cannot change, a header that does not read the site's menu.
 *
 * Look is not a refusal. Colours, fonts, heading size, button paint, padding,
 * motion and logo size are the section's design. Those checks are warnings,
 * so a creator or an outside AI can code a header, a footer or a section the
 * way they want, and the sidebar can still overwrite a colour.
 *
 * WHO IS HELD TO THEM: every section written by an agent. Storelib AI, Claude
 * Code and Codex over MCP, the agent HTTP API and a push from a linked GitHub
 * repository all save through validateSection(..., { strict: true }). A
 * person typing in the builder's code editor is not: that editor is theirs.
 *
 * PURE: source text in, findings out.
 */

import { parseStorelib } from "@/lib/storelib-theme/storelib/parse"
import { declaredKind } from "@/lib/storelib-theme/chrome"
import { resolveControlType } from "@/lib/storelib-theme/controls/registry"
import { isImageInDisguise, numberedLinkPairs } from "@/lib/storelib-theme/schema/normalise"
import type { QualityFinding } from "./quality"

type SchemaSetting = { id?: string; type?: string; label?: string; default?: unknown }
type Schema = { category?: string; kind?: string; settings?: SchemaSetting[]; blocks?: { settings?: SchemaSetting[] }[] }

/** Sections that are the page's frame rather than a band on it: no top and bottom padding of their own. */
const FRAME = /^(header|footer|announcement|navigation|nav|bar|sticky)/i

const stripCss = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, " ")
const stripTemplate = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\{#[\s\S]*?#\}/g, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")

/** Every property: value pair in a stylesheet, flat. */
function declarations(css: string): { prop: string; value: string }[] {
  const out: { prop: string; value: string }[] = []
  for (const m of css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)/gi)) out.push({ prop: m[1].toLowerCase(), value: m[2].trim() })
  return out
}

/** A value with every var(...) removed, nested parentheses and all: `var(--x, #fff)` names the theme, the #fff is only a fallback. */
function withoutVarFallbacks(value: string): string {
  let out = ""
  for (let i = 0; i < value.length; ) {
    if (value.startsWith("var(", i)) {
      let depth = 0
      let j = i + 3
      for (; j < value.length; j++) {
        if (value[j] === "(") depth++
        else if (value[j] === ")" && --depth === 0) break
      }
      out += "VAR"
      i = j + 1
    } else out += value[i++]
  }
  return out
}

/**
 * White and black text over a picture, and a dark or light scrim on one,
 * are not theme colours: the picture decides them. Everything else is.
 */
function onlyNeutrals(value: string): boolean {
  const v = value
    .replace(/#(?:fff|ffffff|000|000000)\b/gi, "")
    .replace(/rgba?\(\s*(?:0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255)\s*(?:,[^)]*)?\)/gi, "")
    .replace(/\b(white|black)\b/gi, "")
  return !LITERAL_COLOUR.test(v) && !NAMED_COLOUR.test(v)
}

/**
 * The template with its editor-only branches taken out. A line that asks the
 * creator to add something ({% if page.in_editor %}Add questions...) is shown
 * in the builder and never to a visitor, so it is not content to make editable.
 */
function withoutEditorBranches(template: string): string {
  const tags = /\{%-?\s*(if|elsif|else|endif|for|endfor|unless|endunless)\b([^%]*)%\}/g
  let out = ""
  let last = 0
  let skipDepth = -1
  let depth = 0
  for (const m of template.matchAll(tags)) {
    const [whole, tag, rest] = m
    const at = m.index ?? 0
    if (skipDepth === -1) out += template.slice(last, at)
    last = at + whole.length
    const editor = /page\.in_editor/.test(rest) && !/not|!=|==\s*false/.test(rest)
    if (tag === "if" || tag === "for" || tag === "unless") {
      depth++
      if (skipDepth === -1 && tag === "if" && editor) skipDepth = depth
    } else if (tag === "elsif" || tag === "else") {
      if (skipDepth === depth) skipDepth = -1
      if (skipDepth === -1 && tag === "elsif" && editor) skipDepth = depth
    } else {
      if (skipDepth === depth) skipDepth = -1
      depth--
    }
    if (skipDepth === -1) out += "\u0000"
  }
  if (skipDepth === -1) out += template.slice(last)
  return out
}

const COLOUR_PROPS = /^(color|background|background-color|border|border-color|border-(top|right|bottom|left)(-color)?|outline|outline-color|fill|stroke|text-decoration-color|caret-color|accent-color)$/
const LITERAL_COLOUR = /#[0-9a-f]{3,8}\b|\b(rgb|rgba|hsl|hsla|oklch|lab)\(/i
const NAMED_COLOUR = /\b(white|black|red|blue|green|gray|grey|purple|orange|yellow|pink)\b/i

export function checkSectionIntegration(source: string): QualityFinding[] {
  const parsed = parseStorelib(source, "section.storelib")
  if (parsed.ok === false) return []
  const template = stripTemplate(parsed.value.template.text)
  const css = stripCss(parsed.value.style.text)
  let schema: Schema = {}
  try {
    schema = JSON.parse(parsed.value.schema.text) as Schema
  } catch {
    return []
  }
  const settings = Array.isArray(schema.settings) ? schema.settings : []
  const ids = new Set(settings.map((s) => s?.id).filter(Boolean) as string[])
  const types = new Set(settings.map((s) => s?.type))
  const frame = FRAME.test(schema.category ?? "") || !!declaredKind(schema as Record<string, unknown>)
  const out: QualityFinding[] = []
  const err = (id: string, message: string) => out.push({ id, severity: "error", message })
  const note = (id: string, message: string) => out.push({ id, severity: "warning", message })

  /* A header or footer is designed freely. What is required is the live menu, not a particular look. */

  /* ── a header of the creator's own reads the site's menu ───────────── */
  const kind = declaredKind(schema as Record<string, unknown>)
  const allTypes = [...settings, ...(schema.blocks ?? []).flatMap((bl) => bl.settings ?? [])].map((st) => resolveControlType(String(st?.type ?? "")))
  if (kind === "header" && !allTypes.includes("link_list")) {
    err("integration-header-menu", `A header of your own shows the site's menu, so the creator edits it in Website settings, Navigation. Add { "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" } and loop {% for link in settings.menu.links %}, with {% for child in link.links %} for its sub links.`)
  } else if (kind === "header") {
    /* Declaring the menu is not enough: the links drawn have to be its links, as a shop theme's header draws linklists, or a change in Navigation never reaches the site. */
    const menuIds = settings.filter((st) => resolveControlType(String(st?.type ?? "")) === "link_list" && st.id).map((st) => String(st.id))
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const reads = (id: string) => new RegExp(`settings\\.${escape(id)}\\.links\\b|settings\\[\\s*["']${escape(id)}["']\\s*\\]\\.links\\b`).test(template)
    const menuId = menuIds[0]
    if (menuId && !menuIds.some(reads)) {
      err("integration-header-menu-read", `The header declares the menu "${menuId}" but never draws it, so a change in Website settings, Navigation does not reach the site. Loop {% for link in settings.${menuId}.links %} for the links, with {% for child in link.links %} for sub links.`)
    } else if (menuId && !/\{%-?\s*for\s+\w+\s+in\s+(?!settings\.)\w+\.links\b/.test(template)) {
      note("integration-header-sublinks", `The menu's sub links are not drawn. A link in Website settings, Navigation can hold links under it; loop {% for child in link.links %} inside the menu loop so they show as a dropdown or in the drawer.`)
    }
  }

  /* ── pictures are pictures, menus are menus ────────────────────────── */
  const disguised = [...settings, ...(schema.blocks ?? []).flatMap((bl) => bl.settings ?? [])].find((st) => isImageInDisguise(st as Record<string, unknown>))
  if (disguised) {
    err("integration-image-setting", `"${disguised.id}" holds a picture but is declared as "${disguised.type}". A picture is { "type": "image_picker", "id": "${disguised.id}" }, so the creator chooses it from the media library or pastes an address under the picker; print it with {{ settings.${disguised.id} | asset }}.`)
  }
  if (numberedLinkPairs(settings as { id?: unknown }[]) >= 2) {
    err("integration-menu", `The links are typed out as numbered label and address settings. A menu the site shares is one link_list setting, { "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" }; loop {% for link in settings.menu.links %} and {% for child in link.links %} for sub links. How the menu looks is the section's own.`)
  }

  /* ── colour scheme ─────────────────────────────────────────────── */
  /* Whatever the scheme setting is called, the root must name it. */
  const schemeId = settings.find((st) => st?.type === "color_scheme")?.id ?? (ids.has("color_scheme") ? "color_scheme" : null)
  if (!schemeId) {
    note("integration-scheme", `A color_scheme setting and data-scheme="{{ settings.color_scheme }}" on the outermost element let the creator recolour this section from the sidebar. Colours may also be color settings they overwrite. Neither is required.`)
  } else if (!new RegExp(`data-scheme\\s*=\\s*"\\{\\{\\s*settings\\.${schemeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}"`).test(template)) {
    note("integration-scheme-root", `The section declares a colour scheme setting but never applies it. Put data-scheme="{{ settings.${schemeId} }}" on its outermost element if the scheme should paint it.`)
  } else if (!/\bscheme\.|--scheme-|--sl-btn/.test(template + css)) {
    note("integration-scheme-read", `The section declares a scheme and does not read it. Colours may come from the scheme, or from color settings the creator overwrites.`)
  }

  const literal = declarations(css).filter((d) => COLOUR_PROPS.test(d.prop) && !onlyNeutrals(withoutVarFallbacks(d.value)))
  /* A shadow or a scrim darkening a picture is not a theme colour; an inline style with a literal is. */
  const inlineLiteral = [...template.matchAll(/style\s*=\s*"([^"]*)"/g)].flatMap((m) => declarations(m[1])).filter((d) => COLOUR_PROPS.test(d.prop) && !onlyNeutrals(withoutVarFallbacks(d.value.replace(/\{\{[^}]*\}\}/g, ""))))
  if (literal.length || inlineLiteral.length) {
    const first = literal[0] ?? inlineLiteral[0]
    note("integration-colour", `"${first.prop}: ${first.value}" is a fixed colour. That is allowed. A color setting, or the scheme (var(--s-text), var(--s-heading), var(--s-bg)), lets the creator overwrite it from the sidebar.`)
  }

  /* ── typography ────────────────────────────────────────────────── */
  const fonts = declarations(css).filter((d) => d.prop === "font-family" || (d.prop === "font" && /[a-z]/i.test(d.value)))
  const foreignFont = fonts.find((d) => !/var\(--theme-font|theme\.typography|inherit/.test(d.value))
  if (foreignFont) {
    note("integration-font", `"${foreignFont.prop}: ${foreignFont.value}" names a font. That is allowed. The theme's fonts are var(--theme-font-heading, {{ theme.typography.heading }}) and var(--theme-font-body, {{ theme.typography.body }}), if this section should follow them.`)
  }
  if (/<h[1-3][\s>]/i.test(template) && !/--section-heading-|--theme-heading|--type-h[1-6]|theme\.typography/.test(css)) {
    note("integration-heading", `The headings set their own size. That is allowed. var(--section-heading-size), var(--section-heading-weight) and var(--section-heading-line-height) follow Theme settings, Typography, when this section should.`)
  }

  /* ── buttons ───────────────────────────────────────────────────── */
  /* BEM names count: s__btn, hero-button, cta--primary. */
  const hasButtons = /<(a|button)\b[^>]*class\s*=\s*"[^"]*(?:^|[^a-z])(btn|button|cta)(?:[^a-z]|$)[^"]*"/i.test(template) || /<a\b[^>]*data-sl-button/i.test(template)
  if (hasButtons) {
    const fromScheme = /primary_btn|secondary_btn|--s-btn|--scheme-button|data-sl-button|--sl-btn/.test(template + css)
    if (!fromScheme) {
      note("integration-button", `The buttons paint themselves. That is allowed. The scheme's button colours are --s-btn: {{ scheme.primary_btn_bg }} and --s-btn-text: {{ scheme.primary_btn_text }}, if this section should follow Theme settings, Buttons.`)
    } else if (!/:hover/.test(css) && !/data-sl-button/.test(template)) {
      note("integration-button-hover", `The buttons have no hover. A hover is the section's own, from the scheme (--s-btn-hover: {{ scheme.primary_btn_hover_bg }}) or from whatever the design uses.`)
    }
  }

  /* ── spacing ───────────────────────────────────────────────────── */
  if (!frame) {
    const pad = ["padding_top", "padding_bottom"].filter((id) => !ids.has(id))
    if (pad.length) {
      note("integration-spacing", `padding_top and padding_bottom range settings let the creator space this section from the sidebar. Spacing in the CSS is allowed.`)
    } else if (!/settings\.padding_top/.test(template + css) || !/settings\.padding_bottom/.test(template + css)) {
      note("integration-spacing-use", `padding_top and padding_bottom are declared but never used. Set --s-pt: {{ settings.padding_top }}px and --s-pb: {{ settings.padding_bottom }}px on the root if the sidebar should space it.`)
    }
  }

  /* ── links and pictures the creator can change ─────────────────── */
  /* "/" is the site's own home, which is where a logo goes; anything else is the creator's to choose. */
  const fixedHref = [...template.matchAll(/\shref\s*=\s*"([^"]*)"/g)].map((m) => m[1]).find((h) => !/\{\{/.test(h) && !/^#/.test(h) && h !== "" && h !== "/")
  if (fixedHref) {
    err("integration-link", `href="${fixedHref}" is typed into the markup. Every link is a url setting (or a block setting) printed through the url filter: href="{{ settings.button_url | default: '#' | url }}".`)
  }
  const fixedImg = [...template.matchAll(/<img\b[^>]*\ssrc\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).find((s) => !/\{\{/.test(s))
  if (fixedImg) {
    err("integration-image", `An image's src is typed into the markup. Pictures are image_picker settings: src="{{ settings.image | asset }}", behind {% if settings.image %}.`)
  }
  if (/url\(\s*["']?(https?:|\/\/)/i.test(css)) {
    err("integration-image-css", `The CSS loads a picture from a fixed address. Make it an image_picker setting and pass it in: style="--s-image: url({{ settings.image | asset }})".`)
  }

  /* ── words the creator cannot change ───────────────────────────── */
  type WithOptions = { options?: { label?: string }[] }
  const allSettings = [...settings, ...(schema.blocks ?? []).flatMap((bl) => bl.settings ?? [])] as (SchemaSetting & WithOptions)[]
  const optionLabels = new Set(allSettings.flatMap((st) => (st.options ?? []).map((o) => String(o.label ?? "").toLowerCase())).filter(Boolean))
  const text = withoutEditorBranches(template)
    /* A short label naming a form field is the field's accessible name, not copy. */
    .replace(/<label\b[^>]*>\s*[^<]{0,24}<\/label>/gi, " ")
    /* A message built around what the visitor did ("No results for {{ page.query }}") is the page's, not copy. */
    .replace(/>[^<]*\{\{\s*page\.[^<]*</g, "><")
    /* Each branch of an if is its own piece of text, not one phrase with the next. */
    .replace(/\{%[\s\S]*?%\}/g, "\u0000")
    .replace(/\{\{[\s\S]*?\}\}/g, " ")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
  const stranded = [...text.matchAll(/>([^<>]+)</g)]
    .flatMap((m) => m[1].split("\u0000"))
    .map((t) => t.replace(/&[a-z#0-9]+;/gi, " ").trim())
    /* The label of an option the creator picked in one of the section's own selects is their choice, printed. */
    .filter((t) => !optionLabels.has(t.toLowerCase()))
    .find((t) => (t.match(/[A-Za-zÀ-ɏ]{2,}/g) ?? []).length >= 2)
  if (stranded) {
    err("integration-text", `"${stranded.slice(0, 60)}" is typed into the markup, so the creator cannot change it. Make it a text setting (or a block setting for repeated items) and print it: {{ settings.heading }}.`)
  }

  /* ── products come from the store, never from the section ──────── */
  /*
    A product grid with three invented products at $29 looks finished in the
    editor and sells nothing: the creator's real products never appear, and the
    buy button goes nowhere. A section that shows products reads them: the
    `products` loop, `page.product` on a product page, a product_picker or
    product_list, a collection_picker or collection_list. Each check names the
    fix, so the model's next attempt is the right one.
  */
  {
    const RESOURCE_TYPES = new Set(["product_picker", "product_list", "collection_picker", "collection_list", "product", "collection"])
    const blockDefs = schema.blocks ?? []
    const productBlocks = blockDefs.filter((bl) => /product|item|card/i.test(String((bl as { type?: unknown }).type ?? "")))
    const readsStore =
      /\{%-?\s*for\s+\w+\s+in\s+(products|page\.product|settings\.\w+)\b/.test(parsed.value.template.text) ||
      /\{\{[^}]*\b(products|page\.product|page\.collection)\b/.test(parsed.value.template.text) ||
      allSettings.some((st) => RESOURCE_TYPES.has(String(st.type)))
    const productSection = /product|shop|collection|catalog/i.test(String(schema.category ?? "")) || /product/i.test(String((schema as { type?: unknown }).type ?? ""))
    const MONEY = /(?:[$€£¥₹]\s?\d+(?:[.,]\d{1,2})?)|(?:\d+(?:[.,]\d{2})?\s?(?:USD|EUR|GBP|CAD|AUD)\b)/
    const priced = (st: SchemaSetting & { default?: unknown }) => /price|cost|amount/i.test(String(st.id ?? "")) && typeof st.default === "string" && MONEY.test(st.default)
    const typedPrice = (text.match(new RegExp(MONEY.source)) ?? [])[0]
    if (productSection && !readsStore) {
      err("integration-products", `This section shows products but never reads the store. Loop the store's own: {% for block in products %} with block.settings.title, block.settings.price, block.settings.image and block.settings.checkout_url, or give it a product_list / collection_picker setting and loop that. Never type products in.`)
    } else if (typedPrice && (productSection || productBlocks.length > 0)) {
      err("integration-products", `"${typedPrice}" is a price typed into the markup. Print the product's own: {{ block.settings.price }} from products, or {{ settings.product.price }} from a product_picker.`)
    }
    const fakeDefault = productBlocks.flatMap((bl) => (bl.settings ?? []) as (SchemaSetting & { default?: unknown })[]).find(priced)
    if (fakeDefault) {
      err("integration-products", `The ${String(fakeDefault.id)} setting defaults to "${String(fakeDefault.default)}", an invented price. Leave it empty and fall back to the chosen product's: give the block a product_picker and print {{ block.settings.price | default: block.settings.product.price }}.`)
    }
    const presets = Array.isArray((schema as { presets?: unknown }).presets) ? ((schema as { presets: { blocks?: { type?: string; settings?: Record<string, unknown> }[] }[] }).presets) : []
    const fakePreset = presets.flatMap((pr) => pr.blocks ?? []).find((b) => /product|item|card/i.test(String(b.type ?? "")) && Object.entries(b.settings ?? {}).some(([k, v]) => /price|cost|amount/i.test(k) && typeof v === "string" && MONEY.test(v)))
    if (fakePreset) {
      err("integration-products", `A preset fills a ${String(fakePreset.type)} block with an invented product and price. Presets for product sections start from the store: set the source to the shop, or leave the product blocks empty for the creator to choose.`)
    }
    if (/\[\s*\{[^\]]*\bprice\s*:[^\]]*\}\s*,\s*\{[^\]]*\bprice\s*:/s.test(parsed.value.script?.text ?? "")) {
      err("integration-products", `The script holds a list of products of its own. Products come from the template (products, page.product, a product_list), never from an array in the script; read them from the markup with data- attributes if the script needs them.`)
    }
  }

  /* ── phones ────────────────────────────────────────────────────── */
  const wide = declarations(css).find((d) => /^(width|min-width|flex-basis|grid-template-columns)$/.test(d.prop) && [...d.value.matchAll(/(\d{3,})px/g)].some((m) => Number(m[1]) >= 420))
  if (wide && !/@container/.test(css)) {
    note("integration-responsive", `"${wide.prop}: ${wide.value}" is wider than a phone and nothing changes it on one. The builder measures the section, not the window, so @container (min-width: 640px) with container-type: inline-size is how a phone layout is reliable. The layout itself is the section's.`)
  }

  return out
}

/**
 * ===========================================================================
 *  ADVICE: WHAT A SECTION AN AGENT WROTE SHOULD STILL HAVE
 * ===========================================================================
 * Warnings, never refusals, handed back to the agent with a save that went
 * through (lib/storelib-ai/validate.ts, and the builder's code tool). Kept
 * apart from checkSectionIntegration because built-in sections written
 * before the rule do not all meet it, and a rule a built-in breaks cannot
 * refuse anybody.
 *
 * COLOUR PER ELEMENT. A section that paints a heading, text, buttons, cards
 * or borders only from its scheme can be recoloured only by changing the
 * scheme, which changes every other section on it too. A creator expects
 * to change one heading's colour, the way Shopify's custom colours let
 * them. So each element it draws gets a color setting whose default names
 * the scheme colour it follows: it looks exactly like the scheme until the
 * creator picks something else.
 */
export function sectionAdvice(source: string): QualityFinding[] {
  const parsed = parseStorelib(source, "section.storelib")
  if (parsed.ok === false) return []
  let schema: Schema = {}
  try {
    schema = JSON.parse(parsed.value.schema.text) as Schema
  } catch {
    return []
  }
  const template = stripTemplate(parsed.value.template.text)
  const css = stripCss(parsed.value.style.text)
  const all = [...(schema.settings ?? []), ...(schema.blocks ?? []).flatMap((bl) => bl.settings ?? [])]
  const hasColour = all.some((st) => resolveControlType(String(st?.type ?? "")) === "color")
  const out: QualityFinding[] = []
  if (!hasColour) {
    const drawn: string[] = []
    if (/<h[1-6][\s>]/i.test(template)) drawn.push("heading_color")
    if (/<p[\s>]/i.test(template)) drawn.push("text_color")
    if (/class\s*=\s*"[^"]*(?:^|[^a-z])(btn|button|cta)(?:[^a-z]|$)/i.test(template) || /data-sl-button/.test(template)) drawn.push("button_color", "button_text_color")
    if (/class\s*=\s*"[^"]*card/i.test(template)) drawn.push("card_color")
    if (/\bborder(-[a-z]+)?\s*:/.test(css)) drawn.push("border_color")
    if (drawn.length) {
      out.push({
        id: "advice-colour-settings",
        severity: "warning",
        message: `The section draws its colours from the scheme only, so the creator cannot change one of them without changing every section on that scheme. Add a color setting for each element it draws (${[...new Set(drawn)].join(", ")}), each defaulting to the scheme colour it follows, as { "type": "color", "id": "heading_color", "label": "Heading", "default": "scheme.heading" }. Print it into a variable on the root, --s-heading: {{ settings.heading_color }}, and paint with var(--s-heading).`,
      })
    }
  }
  return out
}

/** A short statement of the same rules, for a model to read before it writes. */
export const INTEGRATION_CONTRACT = `LIVE VALUES, NOT A LOOK. A save refuses Storelib data typed in by hand: words, links and pictures are settings; a picture is an image_picker; a menu is one link_list with link.links; a header ("kind": "header") reads that menu; the logo is theme.logo or an image_picker; cart, search and menu are data-storelib-cart, data-storelib-search and data-storelib-menu; account is routes.account_url; buy is checkout_url; products and prices come from products; email is data-storelib-form="subscribe". Colours, type, buttons, spacing, motion and logo size are the section's design, not a refusal.`
