/**
 * ===========================================================================
 *  START WITH AI: ONE GATE FOR EVERY FILE A MODEL WRITES
 * ===========================================================================
 * Two engines write a website's own section files: the classic job's code
 * step (./code.ts acceptCoded, round AP) and the agent's write_file
 * (lib/ai-builder/agent/validate.ts validateFile, round L). Whichever one a
 * job runs on, a file is held to the same rules before it is saved:
 *
 *   SOURCE   no key, server setting, env read or token; no script loaded
 *            from another address; no picture address typed into the markup;
 *            nothing that loops forever without a reduced motion rule
 *   SCHEMA   settings an owner can edit (a section with none is refused);
 *            a header or footer says its kind and reads the site's menu;
 *            picture defaults empty or https; a richtext setting printed
 *            with | raw (else its tags show as text); every text default is final
 *            copy (no placeholder, no banned word, no em dash)
 *
 * Each engine adds its own checks around these (the compiler, the path rule,
 * the agent's import and binding checks), but these are the same words in
 * both, so a site cannot be held to less because of the engine it ran on.
 *
 * Pure. No IO.
 */
import type { SectionSchema } from "../types"
import { declaredChromeKind } from "../agent/operations"
import { placeholderIn, slopIn } from "./craft"

export interface GateProblem {
  /** A stable name for the rule, for the agent's issue codes and tests. */
  code: "secret" | "remote_script" | "typed_picture" | "endless_motion" | "escaped_richtext" | "no_settings" | "chrome_kind" | "chrome_menu" | "picture_default" | "placeholder" | "banned_copy"
  message: string
}

/** What a written file may never contain: a key, a server secret, an env read, a token. */
export const SECRET = /(sk-ant-[a-z0-9-]+|sk_(?:live|test)_[a-z0-9]+|service_role|SUPABASE_SERVICE|ANTHROPIC_API_KEY|OPENAI_API_KEY|process\.env|import\.meta\.env|eyJhbGciOi[A-Za-z0-9_-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i
/** A script loaded from somewhere else: generated code runs only what is in its own file. */
export const REMOTE_SCRIPT = /<script\b[^>]*\bsrc\s*=/i
/** A picture typed into the markup: pictures are image settings, filled with real photos and editable. */
export const TYPED_PICTURE = /<img\b[^>]*\bsrc\s*=\s*["']\s*(?:https?:)?\/\//i

/** An animation that never ends, in the style. */
export const ENDLESS_MOTION = /\banimation(?:-iteration-count)?\s*:[^;{}]*\binfinite\b/i
/** A rule that stops motion for a visitor who asked for less. */
const REDUCED_MOTION = /prefers-reduced-motion/i

/** Every problem with the file's text itself, in the order they are refused. Empty when clean. */
export function sourceProblems(text: string): GateProblem[] {
  const out: GateProblem[] = []
  if (SECRET.test(text)) out.push({ code: "secret", message: "The file contains something that looks like a key or a server setting. Generated code never holds one." })
  if (REMOTE_SCRIPT.test(text)) out.push({ code: "remote_script", message: "The file loads a script from another address. A section runs only the code in its own file." })
  if (TYPED_PICTURE.test(text)) out.push({ code: "typed_picture", message: "A picture's address is typed into the markup. Every picture is an image_picker setting, so it can be replaced and is copied into the creator's media." })
  /* Round AQ: a looping animation with nothing to stop it for a visitor who asked for less motion (drawn samples showed the writer's worked example copied into site sections). */
  if (ENDLESS_MOTION.test(text) && !REDUCED_MOTION.test(text)) out.push({ code: "endless_motion", message: "Something animates forever and nothing stops it under prefers-reduced-motion. Let it run once, or add a reduced motion rule that stops it." })
  return out
}

/** The first problem with the file's text itself. Null when clean. */
export function sourceProblem(text: string): GateProblem | null {
  return sourceProblems(text)[0] ?? null
}

/** Every text default a schema carries: its settings', its blocks' and its presets'. */
export function schemaTexts(schema: SectionSchema): string[] {
  const out: string[] = []
  const take = (v: unknown) => {
    if (typeof v === "string") out.push(v)
    else if (Array.isArray(v)) v.forEach(take)
    else if (v && typeof v === "object") Object.values(v).forEach(take)
  }
  /* Not words a visitor reads: addresses, pictures, menus, schemes, and a choice's stored value (its label is the sidebar's, not the page's). */
  const notCopy = new Set(["image_picker", "url", "link_list", "color_scheme", "select", "radio", "product_picker", "product_list", "collection_picker", "collection_list", "community_picker", "page_picker", "form_picker", "font_picker", "icon_picker", "video_url", "video_picker"])
  for (const f of schema.fields ?? []) if (!notCopy.has(f.type)) take((f as { default?: unknown }).default)
  for (const b of schema.blocks ?? []) for (const f of b.fields ?? []) if (!notCopy.has(f.type)) take((f as { default?: unknown }).default)
  for (const pr of schema.presets ?? []) take((pr as { settings?: unknown }).settings), take((pr as { blocks?: unknown }).blocks)
  return out
}

/** Picture defaults that are not empty and not a real https address. */
function badPictureDefault(schema: SectionSchema): string | null {
  const fields = [...(schema.fields ?? []), ...(schema.blocks ?? []).flatMap((b) => b.fields ?? [])]
  for (const f of fields) {
    if (f.type !== "image_picker") continue
    const d = (f as { default?: unknown }).default
    if (typeof d === "string" && d.trim() && !/^https:\/\/[^\s"'<>]+$/i.test(d.trim())) return f.id
  }
  return null
}

/**
 * A richtext setting printed escaped. Output is escaped unless `| raw` says otherwise (storelib/template.ts), and a
 * richtext value is HTML, so `{{ settings.intro }}` draws "<p>Small groups...</p>" on the live page, tags and all.
 * Found by drawing whole sample sites (scripts/check-ai-sample-site.mjs, round AQ): files that passed every other
 * check showed their markup as text. `| strip_html` is a deliberate plain print and is fine too.
 */
export function escapedRichtext(text: string, schema: SectionSchema): string | null {
  const template = /<template>([\s\S]*?)<\/template>/i.exec(text)?.[1] ?? text
  const outputs = template.match(/\{\{[\s\S]*?\}\}/g) ?? []
  const rich = (fields: { id: string; type: string }[] | undefined, scope: "settings" | "block") =>
    (fields ?? []).filter((f) => f.type === "richtext").map((f) => ({ id: f.id, scope }))
  const ids = [...rich(schema.fields, "settings"), ...(schema.blocks ?? []).flatMap((b) => rich(b.fields, "block"))]
  for (const { id, scope } of ids) {
    const name = scope === "block" ? `block\\.settings\\.${id}` : `(?:section\\.)?settings\\.${id}`
    const read = new RegExp(`(?<![\\w.])${name}(?![\\w])`)
    for (const out of outputs) if (read.test(out) && !/\|\s*(?:raw|strip_html)\b/.test(out)) return id
  }
  return null
}

export type GateRole = "header" | "footer" | "section"

/**
 * The first problem with what the schema lets an owner edit and what its defaults say. `role` is what the file is
 * for; `menuFor` the roles that must read the site's menu (the classic job asks it of both, the agent of the header).
 */
export function schemaProblem(schema: SectionSchema, opts: { role: GateRole; menuFor?: readonly GateRole[]; source?: string }): GateProblem | null {
  if ((schema.fields ?? []).length === 0) return { code: "no_settings", message: "It has no settings, so the owner could not edit it. Every word and picture is a setting." }
  const kind = declaredChromeKind(schema)
  if (opts.role === "section" && kind) return { code: "chrome_kind", message: `A page section must not say "kind": "${kind}".` }
  if (opts.role !== "section" && kind !== opts.role) return { code: "chrome_kind", message: `The ${opts.role} must say "kind": "${opts.role}" in its schema.` }
  const menuFor = opts.menuFor ?? ["header", "footer"]
  if (opts.role !== "section" && menuFor.includes(opts.role) && !(schema.fields ?? []).some((f) => f.type === "link_list")) return { code: "chrome_menu", message: `The ${opts.role} must read the site's menu through a link_list setting.` }
  const picture = badPictureDefault(schema)
  if (picture) return { code: "picture_default", message: `The picture setting "${picture}" has a default that is not an https address. Leave it "" for the builder to fill.` }
  const escaped = opts.source ? escapedRichtext(opts.source, schema) : null
  if (escaped) return { code: "escaped_richtext", message: `"${escaped}" is richtext, so its value is HTML, but it is printed without | raw: visitors would see its <p> tags as text. Print it as {{ settings.${escaped} | raw }} inside a <div>, not a <p>.` }
  const words = schemaTexts(schema).join("\n")
  const hold = placeholderIn(words)
  if (hold) return { code: "placeholder", message: `A default still says "${hold}". Write the final words for this site.` }
  const slop = slopIn(words)
  if (slop) return { code: "banned_copy", message: `A default uses "${slop}". Say what happens in plain words.` }
  return null
}
