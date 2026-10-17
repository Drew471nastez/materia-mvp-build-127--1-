/**
 * ===========================================================================
 *  WHAT "EDIT CODE" OPENS FOR A SECTION
 * ===========================================================================
 * The section menus' Edit code goes straight to the section's file in the
 * code editor. Where that file is decides what the menu offers:
 *
 *   file    this site has its own file at sections/<type>.storelib: a
 *           section the creator wrote, a theme imported from Shopify, or a
 *           built-in this site keeps its own copy of. Edit code opens it.
 *   copy    Storelib's own shipped file. Never edited in place: one changed
 *           for one site can no longer be updated. Edit a copy makes the
 *           same file under a new type in this theme, switches the section
 *           to it with every setting and block, and opens that
 *           (lib/website-builder/agent/coded-copy.ts, as Storelib AI does).
 *   none    drawn by Storelib itself, the header and footer among them: no
 *           code to open, and the menu says so.
 *
 * Pure.
 */
export type SectionCodeTarget =
  | { kind: "file"; path: string }
  | { kind: "copy"; path: string; source: string }
  | { kind: "none"; reason: string }

export function sectionCodeTarget(
  type: string,
  ctx: { sources: Record<string, string>; defaults: Record<string, string> },
): SectionCodeTarget {
  const path = `sections/${type}.storelib`
  const own = ctx.sources[path]
  if (typeof own === "string" && own.trim() !== "") return { kind: "file", path }
  if (type === "header" || type === "footer") return { kind: "none", reason: `The ${type} is changed with its settings` }
  const shipped = ctx.defaults[path]
  if (typeof shipped === "string" && shipped.includes("<schema>")) return { kind: "copy", path, source: shipped }
  return { kind: "none", reason: "Drawn by Storelib, no code to edit" }
}
