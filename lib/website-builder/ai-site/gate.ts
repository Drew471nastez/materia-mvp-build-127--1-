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
 *            from another address; no picture address typed into the markup
 *   SCHEMA   settings an owner can edit (a section with none is refused);
 *            a header or footer says its kind and reads the site's menu;
 *            picture defaults empty or https; every text default is final
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
  code: "secret" | "remote_script" | "typed_picture" | "no_settings" | "chrome_kind" | "chrome_menu" | "picture_default" | "placeholder" | "banned_copy"
  message: string
}

/** What a written file may never contain: a key, a server secret, an env read, a token. */
export const SECRET = /(sk-ant-[a-z0-9-]+|sk_(?:live|test)_[a-z0-9]+|service_role|SUPABASE_SERVICE|ANTHROPIC_API_KEY|OPENAI_API_KEY|process\.env|import\.meta\.env|eyJhbGciOi[A-Za-z0-9_-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i
/** A script loaded from somewhere else: generated code runs only what is in its own file. */
export const REMOTE_SCRIPT = /<script\b[^>]*\bsrc\s*=/i
/** A picture typed into the markup: pictures are image settings, filled with real photos and editable. */
export const TYPED_PICTURE = /<img\b[^>]*\bsrc\s*=\s*["']\s*(?:https?:)?\/\//i

/** The first problem with the file's text itself, in the order they are refused. Null when clean. */
export function sourceProblem(text: string): GateProblem | null {
  if (SECRET.test(text)) return { code: "secret", message: "The file contains something that looks like a key or a server setting. Generated code never holds one." }
  if (REMOTE_SCRIPT.test(text)) return { code: "remote_script", message: "The file loads a script from another address. A section runs only the code in its own file." }
  if (TYPED_PICTURE.test(text)) return { code: "typed_picture", message: "A picture's address is typed into the markup. Every picture is an image_picker setting, so it can be replaced and is copied into the creator's media." }
  return null
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

export type GateRole = "header" | "footer" | "section"

/**
 * The first problem with what the schema lets an owner edit and what its defaults say. `role` is what the file is
 * for; `menuFor` the roles that must read the site's menu (the classic job asks it of both, the agent of the header).
 */
export function schemaProblem(schema: SectionSchema, opts: { role: GateRole; menuFor?: readonly GateRole[] }): GateProblem | null {
  if ((schema.fields ?? []).length === 0) return { code: "no_settings", message: "It has no settings, so the owner could not edit it. Every word and picture is a setting." }
  const kind = declaredChromeKind(schema)
  if (opts.role === "section" && kind) return { code: "chrome_kind", message: `A page section must not say "kind": "${kind}".` }
  if (opts.role !== "section" && kind !== opts.role) return { code: "chrome_kind", message: `The ${opts.role} must say "kind": "${opts.role}" in its schema.` }
  const menuFor = opts.menuFor ?? ["header", "footer"]
  if (opts.role !== "section" && menuFor.includes(opts.role) && !(schema.fields ?? []).some((f) => f.type === "link_list")) return { code: "chrome_menu", message: `The ${opts.role} must read the site's menu through a link_list setting.` }
  const picture = badPictureDefault(schema)
  if (picture) return { code: "picture_default", message: `The picture setting "${picture}" has a default that is not an https address. Leave it "" for the builder to fill.` }
  const words = schemaTexts(schema).join("\n")
  const hold = placeholderIn(words)
  if (hold) return { code: "placeholder", message: `A default still says "${hold}". Write the final words for this site.` }
  const slop = slopIn(words)
  if (slop) return { code: "banned_copy", message: `A default uses "${slop}". Say what happens in plain words.` }
  return null
}
