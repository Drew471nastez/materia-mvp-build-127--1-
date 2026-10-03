/**
 * ===========================================================================
 *  A SECTION AN AGENT WRITES MUST PLUG INTO THE THEME LIKE A NATIVE ONE
 * ===========================================================================
 * quality.ts catches files that are broken: a fixed id, a width media query,
 * motion that ignores the visitor. A file can pass all of that and still be
 * a stranger on the page: its own blue, its own font, a button that ignores
 * the theme's button colours and has no hover, padding nobody can change,
 * a heading typed into the markup, a link to a URL the creator cannot edit.
 * It looks fine the day it is written and wrong the day the creator changes
 * their theme, because it never listened to the theme.
 *
 * These checks are what "native" means, written down as the built-in
 * sections already do it (themes/default/sections/*.storelib; cta_simple is
 * the short one to read). Every built-in section passes them, and
 * tests/section-integration.test.ts holds that, so a rule here can never
 * refuse something Storelib itself ships.
 *
 * WHO IS HELD TO THEM: every section written by an agent. Storelib AI, Claude
 * Code and Codex over MCP, the agent HTTP API and a push from a linked GitHub
 * repository all save through validateSection(..., { strict: true }). A
 * person typing in the builder's code editor is not: that editor is theirs.
 *
 * PURE: source text in, findings out.
 */

import { parseStorelib } from "@/lib/storelib-theme/storelib/parse"
import { chromeRefusal, chromeRoleOf, declaredKind } from "@/lib/storelib-theme/chrome"
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

  /* ── the site's header and footer are not section files ─────────── */
  /* Alone, and first: nothing else about the file matters if it should not exist (lib/storelib-theme/chrome.ts). */
  const chrome = chromeRoleOf({ schema: schema as Record<string, unknown>, template: parsed.value.template.text })
  if (chrome) return [{ id: "integration-chrome", severity: "error", message: chromeRefusal(chrome) }]

  /* ── a header of the creator's own reads the site's menu ───────────── */
  const kind = declaredKind(schema as Record<string, unknown>)
  const allTypes = [...settings, ...(schema.blocks ?? []).flatMap((bl) => bl.settings ?? [])].map((st) => resolveControlType(String(st?.type ?? "")))
  if (kind === "header" && !allTypes.includes("link_list")) {
    err("integration-header-menu", `A header of your own shows the site's menu, so the creator edits it in Website settings, Navigation. Add { "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" } and loop {% for link in settings.menu.links %}, with {% for child in link.links %} for its sub links.`)
  }

  /* ── pictures are pictures, menus are menus ────────────────────────── */
  const disguised = [...settings, ...(schema.blocks ?? []).flatMap((bl) => bl.settings ?? [])].find((st) => isImageInDisguise(st as Record<string, unknown>))
  if (disguised) {
    err("integration-image-setting", `"${disguised.id}" holds a picture but is declared as "${disguised.type}". A picture is { "type": "image_picker", "id": "${disguised.id}" }, so the creator chooses it from the media library or pastes an address under the picker; print it with {{ settings.${disguised.id} | asset }}.`)
  }
  if (numberedLinkPairs(settings as { id?: unknown }[]) >= 2) {
    err("integration-menu", `The links are typed out as numbered label and address settings. A menu is one link_list setting, { "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" }, which the creator points at one of the site's menus; loop {% for link in settings.menu.links %}. For the site's own navigation, change the built-in header instead of writing one.`)
  }

  /* ── colour scheme ─────────────────────────────────────────────── */
  /* Whatever the scheme setting is called, the root must name it. */
  const schemeId = settings.find((st) => st?.type === "color_scheme")?.id ?? (ids.has("color_scheme") ? "color_scheme" : null)
  if (!schemeId) {
    err("integration-scheme", `Add a color_scheme setting, and put data-scheme="{{ settings.color_scheme }}" on the section's outermost element. That is how a section takes the site's colours and changes with them.`)
  } else if (!new RegExp(`data-scheme\\s*=\\s*"\\{\\{\\s*settings\\.${schemeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}"`).test(template)) {
    err("integration-scheme-root", `The section declares a colour scheme setting but never applies it. Put data-scheme="{{ settings.${schemeId} }}" on its outermost element.`)
  } else if (!/\bscheme\.|--scheme-|--sl-btn/.test(template + css)) {
    err("integration-scheme-read", `The section never reads its scheme. Take colours from it, as the built-in sections do: style="--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }}; ..." on the root, then var(--s-bg) in the CSS.`)
  }

  const literal = declarations(css).filter((d) => COLOUR_PROPS.test(d.prop) && !onlyNeutrals(withoutVarFallbacks(d.value)))
  /* A shadow or a scrim darkening a picture is not a theme colour; an inline style with a literal is. */
  const inlineLiteral = [...template.matchAll(/style\s*=\s*"([^"]*)"/g)].flatMap((m) => declarations(m[1])).filter((d) => COLOUR_PROPS.test(d.prop) && !onlyNeutrals(withoutVarFallbacks(d.value.replace(/\{\{[^}]*\}\}/g, ""))))
  if (literal.length || inlineLiteral.length) {
    const first = literal[0] ?? inlineLiteral[0]
    err("integration-colour", `"${first.prop}: ${first.value}" is a fixed colour. It will not change when the creator changes their theme. Use the scheme: var(--s-text), var(--s-heading), var(--s-bg), var(--s-border), var(--s-accent), or a color setting the creator can change.`)
  }

  /* ── typography ────────────────────────────────────────────────── */
  const fonts = declarations(css).filter((d) => d.prop === "font-family" || (d.prop === "font" && /[a-z]/i.test(d.value)))
  const foreignFont = fonts.find((d) => !/var\(--theme-font|theme\.typography|inherit/.test(d.value))
  if (foreignFont) {
    err("integration-font", `"${foreignFont.prop}: ${foreignFont.value}" names a font. Type comes from the theme: font-family: var(--theme-font-heading, {{ theme.typography.heading }}) for headings, var(--theme-font-body, {{ theme.typography.body }}) or inherit for text.`)
  }
  if (/<h[1-3][\s>]/i.test(template) && !/--section-heading-|--theme-heading|--type-h[1-6]|theme\.typography/.test(css)) {
    err("integration-heading", `The headings do not take the theme's heading style. Size and weight them with var(--section-heading-size, 32px), var(--section-heading-weight, 700) and var(--section-heading-line-height, 1.15), so a change in Theme settings, Typography reaches them.`)
  }

  /* ── buttons ───────────────────────────────────────────────────── */
  /* BEM names count: s__btn, hero-button, cta--primary. */
  const hasButtons = /<(a|button)\b[^>]*class\s*=\s*"[^"]*(?:^|[^a-z])(btn|button|cta)(?:[^a-z]|$)[^"]*"/i.test(template) || /<a\b[^>]*data-sl-button/i.test(template)
  if (hasButtons) {
    const fromScheme = /primary_btn|secondary_btn|--s-btn|--scheme-button|data-sl-button|--sl-btn/.test(template + css)
    if (!fromScheme) {
      err("integration-button", `The buttons do not take the scheme's button colours. Put --s-btn: {{ scheme.primary_btn_bg }}; --s-btn-text: {{ scheme.primary_btn_text }} on the root and paint the button with them, so Theme settings, Buttons and the section's colour scheme apply.`)
    } else if (!/:hover/.test(css) && !/data-sl-button/.test(template)) {
      err("integration-button-hover", `The buttons have no hover. Add :hover rules painted from the scheme's hover keys: --s-btn-hover: {{ scheme.primary_btn_hover_bg }} and --s-btn-hover-text: {{ scheme.primary_btn_hover_text }}.`)
    }
  }

  /* ── spacing ───────────────────────────────────────────────────── */
  if (!frame) {
    const pad = ["padding_top", "padding_bottom"].filter((id) => !ids.has(id))
    if (pad.length) {
      err("integration-spacing", `Add range settings ${pad.join(" and ")} (px, 0 to 160) and use them for the section's vertical padding, so the creator can space it like every other section.`)
    } else if (!/settings\.padding_top/.test(template + css) || !/settings\.padding_bottom/.test(template + css)) {
      err("integration-spacing-use", `padding_top and padding_bottom are declared but never used. Set --s-pt: {{ settings.padding_top }}px and --s-pb: {{ settings.padding_bottom }}px on the root and pad with them.`)
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

  /* ── phones ────────────────────────────────────────────────────── */
  const wide = declarations(css).find((d) => /^(width|min-width|flex-basis|grid-template-columns)$/.test(d.prop) && [...d.value.matchAll(/(\d{3,})px/g)].some((m) => Number(m[1]) >= 420))
  if (wide && !/@container/.test(css)) {
    err("integration-responsive", `"${wide.prop}: ${wide.value}" is wider than a phone and nothing changes it on one. Lay it out for a phone first and widen it inside @container (min-width: 640px), with container-type: inline-size on the root.`)
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
export const INTEGRATION_CONTRACT = `NATIVE, NOT PASTED IN: a section takes everything from the theme. data-scheme="{{ settings.color_scheme }}" on the root with its scheme colours as variables and no fixed colours or fonts; a color setting per element drawn, defaulting to a scheme colour ("scheme.heading"); headings sized from var(--section-heading-size); buttons painted from the scheme's button keys with a :hover from its hover keys; padding_top and padding_bottom range settings for its spacing; every word, link and picture a setting or block, a picture an image_picker, a menu one link_list; phone layout first, widened with @container.`
