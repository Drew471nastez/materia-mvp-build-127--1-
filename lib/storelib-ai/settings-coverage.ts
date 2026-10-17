/**
 * ===========================================================================
 *  EVERY SETTING DRIVES THE SECTION, AND WHAT THE CREATOR SHOULD CHANGE IS A
 *  SETTING
 * ===========================================================================
 * The sidebar is made from the schema, so it is only honest when the two
 * agree both ways:
 *
 *   UNREAD     a setting the template never prints. It shows in the panel,
 *              the creator changes it, and nothing happens. The compiler
 *              only warns about a section's own unread settings, and that
 *              warning never reached the model; a block's were not checked
 *              at all.
 *   MISSING    a value the creator owns, typed into the markup: a heading,
 *              or the words of a link whose address is already a setting.
 *              They see the words on the page and find no field for them.
 *              (Longer copy, links and pictures typed in are refused by
 *              ./integration.ts already.)
 *
 * Errors, for a file an agent writes (checkSectionIntegration, strict). Each
 * finding's id names the setting, so an edit to a file that already had one
 * of these is refused only for the ones it adds (compile-feedback, `before`).
 *
 * PURE: source text in, findings out.
 */

import { parseStorelib } from "@/lib/storelib-theme/storelib/parse"
import { resolveControlType } from "@/lib/storelib-theme/controls/registry"
import { ANIMATION_SETTING_ID } from "@/lib/storelib-theme/schema/normalise"
import type { QualityFinding } from "./quality"
import { withoutEditorBranches } from "./template-text"

type Setting = { id?: unknown; type?: unknown }
/** Controls that hold no value: a heading in the panel, a note, a rule. */
const NO_VALUE = new Set(["header", "paragraph", "divider"])

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const stripComments = (text: string) => text.replace(/<!--[\s\S]*?-->/g, " ").replace(/\{#[\s\S]*?#\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ")

/** Whether a section setting is read: `settings.x`, `section.settings.x` or `settings["x"]`, never a block's `block.settings.x`. */
export function readsSectionSetting(text: string, id: string): boolean {
  const e = escape(id)
  return new RegExp(`(?<![\\w.])settings\\.${e}\\b|\\bsection\\.settings\\.${e}\\b|(?<![\\w.])settings\\[\\s*["']${e}["']\\s*\\]`).test(text)
}

/** Whether a block setting is read: through any loop variable, `block.settings.x`, `b.settings.x`, `item.settings["x"]`. */
export function readsBlockSetting(text: string, id: string): boolean {
  const e = escape(id)
  return new RegExp(`\\b(?!section\\b)[a-z_][\\w]*\\.settings\\.${e}\\b|\\b(?!section\\b)[a-z_][\\w]*\\.settings\\[\\s*["']${e}["']\\s*\\]`, "i").test(text)
}

const skip = (st: Setting) => {
  const id = String(st.id ?? "")
  const type = resolveControlType(String(st.type ?? "")) ?? String(st.type ?? "")
  return !id || NO_VALUE.has(type) || id === ANIMATION_SETTING_ID || id.startsWith("hdr_")
}

/**
 * `frame`: the section is the site's header, footer or something over the page. A cart drawer's "Your cart" and a
 * menu's "Close" are the interface's own words there, as in a Shopify theme, so typed headings and labels are not
 * held against it; its unread settings still are.
 */
export function checkSettingsCoverage(source: string, opts: { frame?: boolean } = {}): QualityFinding[] {
  const parsed = parseStorelib(source, "section.storelib")
  if (parsed.ok === false) return []
  let schema: { settings?: Setting[]; blocks?: { type?: unknown; settings?: Setting[] }[] }
  try {
    schema = JSON.parse(parsed.value.schema.text)
  } catch {
    return []
  }
  /* What draws the section: the markup and the CSS, which may print settings too. */
  const drawn = stripComments(`${parsed.value.template.text}\n${parsed.value.style.text}`)
  const out: QualityFinding[] = []
  /* `{{ settings | review_widget }}`: the whole settings object handed to a filter, which reads what it needs. */
  const wholeSettings = /\{\{-?\s*(?:section\.)?settings\s*\|/.test(drawn)

  for (const st of Array.isArray(schema.settings) ? schema.settings : []) {
    if (skip(st)) continue
    const id = String(st.id)
    if (!wholeSettings && !readsSectionSetting(drawn, id)) {
      out.push({
        id: `setting-unread:${id}`,
        severity: "error",
        message: `"${id}" (${/^[aeiou]/i.test(String(resolveControlType(String(st.type)) ?? st.type)) ? "an" : "a"} ${resolveControlType(String(st.type)) ?? st.type} setting) is in the sidebar, but the template never reads settings.${id}, so changing it does nothing. Use it where it belongs, or remove the setting.`,
      })
    }
  }
  for (const block of Array.isArray(schema.blocks) ? schema.blocks : []) {
    const type = String(block?.type ?? "")
    for (const st of Array.isArray(block?.settings) ? block.settings : []) {
      if (skip(st)) continue
      const id = String(st.id)
      if (!readsBlockSetting(drawn, id)) {
        out.push({
          id: `block-setting-unread:${type}.${id}`,
          severity: "error",
          message: `The "${type}" block has a "${id}" setting that the template never reads (block.settings.${id}), so changing it does nothing. Print it inside the block's loop, or remove it.`,
        })
      }
    }
  }

  /* ── what the creator owns, typed in ─────────────────────────────── */
  if (opts.frame) return out
  /* What a visitor sees: a line shown only in the editor ("Add questions") is not the creator's copy. */
  const template = withoutEditorBranches(stripComments(parsed.value.template.text))
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
  const words = (inner: string) =>
    inner
      .replace(/\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
      .trim()
  for (const m of template.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const inner = m[2]
    if (/\{\{/.test(inner)) continue
    const typed = words(inner)
    if ((typed.match(/[A-Za-zÀ-ɏ]{2,}/g) ?? []).length >= 1) {
      out.push({
        id: `setting-missing:heading:${typed.slice(0, 40).toLowerCase()}`,
        severity: "error",
        message: `The heading "${typed.slice(0, 60)}" is typed into the markup, so the creator has no field for it. Make it a text setting ({ "type": "text", "id": "heading", "label": "Heading", "default": "${typed.slice(0, 40).replace(/"/g, "'")}" }) and print {{ settings.heading }}; in a block, a block setting.`,
      })
    }
  }
  for (const m of template.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = m[1]
    if (!/href\s*=\s*"[^"]*\{\{/.test(attrs)) continue
    const inner = m[2]
    if (/\{\{/.test(inner) || /aria-label\s*=/.test(attrs)) continue
    const typed = words(inner)
    if ((typed.match(/[A-Za-zÀ-ɏ]{2,}/g) ?? []).length >= 1) {
      out.push({
        id: `setting-missing:link:${typed.slice(0, 40).toLowerCase()}`,
        severity: "error",
        message: `The link "${typed.slice(0, 40)}" takes its address from a setting but its words are typed in, so the creator can change where it goes and not what it says. Add a text setting for the label (e.g. "button_label") and print it.`,
      })
    }
  }
  return out
}
