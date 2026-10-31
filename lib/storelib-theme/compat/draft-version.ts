/**
 * ===========================================================================
 *  A DRAFT ASSET ADDRESS, AND THE PASS IT CARRIES
 * ===========================================================================
 * An imported theme's files are served at
 * /api/site-theme/assets/<install>/<version>/<name>. A draft version is
 * `edit` (the builder's canvas) or `draft-<time>` (a preview link's page, a
 * cover picture), and it serves the UNPUBLISHED file and settings.
 *
 * The install id is in every published page's asset addresses, so a draft
 * version alone let anybody read a store's unpublished stylesheets, scripts
 * and settings. A draft version now carries a pass after a dot,
 * `edit.<pass>` or `draft-<time>.<pass>` (lib/website-builder/
 * draft-asset-pass.ts): signed by the server for that one install, handed
 * only to the owner's editor (the theme's files, which only the owner or a
 * team member may read) and drawn into pages only a preview link or the
 * cover's own pass may see. The canvas cannot send a session (a sandboxed
 * frame with no origin), so the pass is the address itself.
 *
 * A draft version without a pass that checks out is answered with the
 * PUBLISHED file, never a 404: an editor tab opened before this change keeps
 * drawing, from the live files, until it is reloaded.
 *
 * No imports: the canvas (a client component) and the route both read it.
 */
export function splitAssetVersion(version: string): { draft: boolean; pass: string | null } {
  const at = version.indexOf(".")
  const base = at < 0 ? version : version.slice(0, at)
  const pass = at < 0 ? null : version.slice(at + 1) || null
  return { draft: base === "edit" || base.startsWith("draft"), pass }
}

/** A draft version with its pass: `edit.<pass>`, or `edit` alone while there is none (served the published file). */
export function withDraftPass(base: string, pass: string | null | undefined): string {
  return pass ? `${base}.${pass}` : base
}
