import "server-only"

/**
 * The cover on a site card: the site as you last left it.
 *
 * ---------------------------------------------------------------------------
 *  BUILT ON READ, CACHED BY REVISION
 * ---------------------------------------------------------------------------
 * A site autosaves every 1.2 seconds. Building a cover on every write would
 * spend a compile per keystroke on a picture nobody is looking at, and
 * building on every read would spend one per dashboard visit. So the stored
 * cover records the revision it was built from: equal means serve it, behind
 * or missing means build it now. The cost is paid once, by whoever looks
 * first after a change.
 *
 * ---------------------------------------------------------------------------
 *  ONE SELF-CONTAINED FILE, AND WHY THAT IS NOT A DETAIL
 * ---------------------------------------------------------------------------
 * The card renders this in a `sandbox="allow-scripts"` iframe with no
 * `allow-same-origin`, which gives the frame an OPAQUE origin — the whole
 * reason it is safe to put a creator's generated JavaScript on the dashboard's
 * own domain at all.
 *
 * An opaque origin has consequences: requests it makes are cross-origin, so
 * `SameSite=Lax` cookies are not attached to them. Any asset that needed the
 * session to fetch would 404 inside the frame while working perfectly when
 * opened directly — a bug that only appears in the place it matters.
 *
 * `previewDocument` inlines the CSS and the bundle and imports React from
 * /sites/vendor, which is public and already carries the CORS header an
 * opaque origin needs. So the cover is ONE document that needs no session,
 * and there is nothing left to authenticate.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { bundleProject } from "./bundle"
import { previewDocument } from "./preview-document"
import { readProject, siteRevisions } from "./projects"
import { DEPLOYMENT_BUCKET } from "./publish"
import type { Site } from "./types"

/** One object per site, overwritten in place — history lives in versions. */
function coverPath(siteId: string): string {
  return `sites/${siteId}/cover/index.html`
}

/**
 * A site that has never built, or whose build fails. Shown rather than a
 * broken frame: a creator mid-edit with a syntax error should see a calm
 * placeholder on their dashboard, not a stack trace and not a blank hole.
 */
function placeholder(reason: string): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8">
<style>
  html,body{height:100%;margin:0}
  body{display:grid;place-items:center;background:#faf9f7;color:#a8a29a;
       font:500 13px/1.4 ui-sans-serif,system-ui,sans-serif;text-align:center;padding:24px}
</style>
<div>${reason}</div>`
}

export async function siteCover(site: Site): Promise<string> {
  const admin = createAdminClient()
  const path = coverPath(site.id)

  /**
   * Read here rather than carried on `Site`, because `preview_revision` is a
   * recent column and this project applies SQL by hand — putting it in the
   * shared column list took the whole dashboard down on any database where
   * the migration had not been run. If it is missing, this reports "never
   * built" and the cover is simply rebuilt each time.
   */
  const { revision, previewRevision } = await siteRevisions(site.id)
  const isFresh = previewRevision === revision

  if (isFresh) {
    const { data } = await admin.storage.from(DEPLOYMENT_BUCKET).download(path)
    // A missing object with a fresh marker means the two disagree — the file
    // was removed, or an upload failed after the marker was written. Falling
    // through to a rebuild is cheaper than trusting the marker.
    if (data) return await data.text()
  }

  const files = await readProject(site.id)
  if (Object.keys(files).length === 0) return placeholder("Nothing here yet")

  const esbuild = await import("esbuild")
  const built = await bundleProject(esbuild as never, files)
  if (!built.ok) return placeholder("This site does not build right now")

  const html = previewDocument({
    code: built.code ?? "",
    css: built.css,
    html: files["index.html"],
  })

  /**
   * Stored, then marked. In that order, because a marker written before a
   * successful upload claims a cover that is not there — and the reader
   * above would trust it, download nothing, and show a blank card until the
   * next edit.
   */
  const { error } = await admin.storage
    .from(DEPLOYMENT_BUCKET)
    .upload(path, new Blob([html], { type: "text/html" }), {
      contentType: "text/html; charset=utf-8",
      upsert: true,
      cacheControl: "0",
    })

  if (!error) {
    await admin.from("sites").update({ preview_revision: revision }).eq("id", site.id)
  }

  return html
}
