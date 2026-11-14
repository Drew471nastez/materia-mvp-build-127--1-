import "server-only"

/**
 * Publishing: canonical files → static build → object storage → live.
 *
 * ---------------------------------------------------------------------------
 *  THE LIVE POINTER MOVES LAST, AND ONLY ON A GREEN BUILD
 * ---------------------------------------------------------------------------
 * A deployment is written to its own immutable prefix first, and only when
 * every file is uploaded does the pointer move. A build that fails, an upload
 * that dies halfway, a crash — none of them can touch the page that is already
 * serving. The worst outcome is an orphaned prefix nobody points at.
 *
 * The database enforces the same rule from underneath: a partial unique index
 * on `is_live` means a site cannot end up with two live deployments however
 * badly this code races with itself.
 *
 * ---------------------------------------------------------------------------
 *  STATIC, NOT RENDERED
 * ---------------------------------------------------------------------------
 * The output is HTML, CSS, JS and an import map. A visitor's request is
 * answered from storage through the CDN; no Node process renders anything, no
 * database is touched, and 4,000 sites cost what one bucket costs. Dynamic
 * behaviour — forms, email capture, product data — is the Site API's job, and
 * is called by the page rather than baked into it.
 *
 * NOTHING PRIVILEGED IS IN THE BUNDLE. The published page gets the site's
 * public id and nothing else: no Supabase keys, no model key, no cookies. It
 * is served from a different registrable domain than the dashboard, so even a
 * malicious generated page has no session to reach.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { describeFindings, preflight } from "./preflight"
import { bundleProject } from "./bundle"
import { contentTypeFor } from "./content-type"
import { VENDOR_PREFIX, publishedDocument } from "./preview-document"
import { readProject } from "./projects"
import { allocateSiteSlug, newSiteSlugError, siteSlugError } from "./slug"
import type { ProjectFiles, Site } from "./types"

export const DEPLOYMENT_BUCKET = "site-deployments"

/**
 * Where published sites answer.
 *
 * A SUBDOMAIN OF THE MAIN DOMAIN: andrewrullz.storelib.com. Creator pages
 * keep the paths — storelib.com/andrewrullz — so the two never collide.
 *
 * The apex is NOT a sites host. `storelib.com/<name>` is the creator
 * storefront and always has been; serving generated pages there would both
 * collide with every creator and put somebody else's JavaScript on the
 * dashboard's own origin.
 *
 * WHAT MAKES THE SUBDOMAIN SAFE is that the session cookie is host-only. A
 * cookie scoped to `.storelib.com` reaches every subdomain, and the browser
 * Supabase client reads its cookie from JavaScript, so it cannot be
 * httpOnly — a domain-scoped session would be readable by every page we
 * publish. lib/supabase/server.ts and client.ts keep it host-only, and
 * tests/sites.test.ts fails if that changes.
 */
export const SITES_HOST = process.env.NEXT_PUBLIC_SITES_HOST || "storelib.com"

export function publishedHost(slug: string): string {
  return `${slug}.${SITES_HOST}`
}

export function publishedUrl(slug: string): string {
  return `https://${publishedHost(slug)}`
}

export type PublishResult =
  | { ok: true; url: string; slug: string; deploymentId: string; revision: number }
  | { ok: false; error: string; details?: string[] }

/**
 * Is this deployment able to publish at all?
 *
 * Run BEFORE any work, because the two things that can be missing are missing
 * for the whole platform, not for one site: the publishing migration, and the
 * storage bucket it creates. Without this the first symptom is a Postgres
 * "column does not exist" swallowed into "Try again" — advice that can never
 * work, on an error that has nothing to do with the person reading it.
 *
 * Both checks are probes rather than information_schema queries, because
 * PostgREST does not expose information_schema and a probe tests the thing
 * that actually has to work.
 */
export async function publishPreflight(): Promise<string | null> {
  const admin = createAdminClient()

  // Columns the publish INSERT writes. `head: true` fetches no rows — this is
  // asking the schema a question, not reading anybody's data.
  const { error: schemaError } = await admin
    .from("site_deployments")
    .select("is_live, slug, storage_prefix, version_label", { head: true, count: "exact" })
    .limit(1)

  if (schemaError) {
    return "Publishing is not set up on this deployment yet — the database is missing the publishing tables. Paste supabase/sql/RUN_CREATOR_PAGE_AND_SITES.sql into the Supabase SQL editor."
  }

  const { error: revisionError } = await admin
    .from("sites")
    .select("revision, published_revision", { head: true, count: "exact" })
    .limit(1)

  if (revisionError) {
    return "Publishing is not set up on this deployment yet — the database is missing the publishing columns. Paste supabase/sql/RUN_CREATOR_PAGE_AND_SITES.sql into the Supabase SQL editor."
  }

  const { data: bucket } = await admin.storage.getBucket(DEPLOYMENT_BUCKET)
  if (!bucket) {
    return `Publishing is not set up on this deployment yet — the "${DEPLOYMENT_BUCKET}" storage bucket does not exist. Paste supabase/sql/RUN_CREATOR_PAGE_AND_SITES.sql into the Supabase SQL editor.`
  }

  return null
}

/**
 * The address this site publishes at, allocated once and then kept.
 *
 * Kept, because the URL is the thing people share. Renaming a site must not
 * silently move a page somebody has already linked to; changing the address is
 * a separate, deliberate action.
 */
export async function ensureSlug(site: Site): Promise<string> {
  /*
    An address already published keeps working, whatever it says. One that
    was never published is still being chosen, so the phishing-name rule
    applies to it too (lib/sites/slug.ts newSiteSlugError, round AW): a site
    named "PayPal Login" before that rule existed does not go live as
    paypal-login.storelib.com.
  */
  const keeps = site.status === "draft" ? newSiteSlugError : siteSlugError
  if (site.slug && !keeps(site.slug)) return site.slug

  const admin = createAdminClient()
  const slug = await allocateSiteSlug(site.name, async (candidate) => {
    /**
     * Checked with the ADMIN client on purpose. RLS would hide other
     * creators' sites, so a uniqueness check through the user's own client
     * would report every taken address as free — and then the unique index
     * would reject the insert with an error nobody could explain.
     */
    const { count, error } = await admin
      .from("sites")
      .select("id", { count: "exact", head: true })
      .eq("slug", candidate.toLowerCase())
    /* A count that failed is not zero: the address is not known to be free, so the publish stops (fail closed). */
    if (error) throw new SlugCheckFailed(error.message)
    if ((count ?? 0) > 0) return true

    /**
     * A CREATOR'S USERNAME IS TAKEN TOO.
     *
     * Creator pages are storelib.com/andrewrullz and AI sites are
     * andrewrullz.storelib.com, so the same word names two different people's
     * things. Letting a stranger publish a site on another creator's name is
     * an impersonation anybody could perform by naming their site after them
     * — and it would shadow the redirect that keeps that creator's old
     * subdomain links working.
     */
    const { count: usernameCount, error: usernameError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("username", candidate.toLowerCase())
    if (usernameError) throw new SlugCheckFailed(usernameError.message)
    if ((usernameCount ?? 0) > 0) return true

    // ...and by creator slug, the OTHER way storelib.com/<name> resolves.
    // Reserving only usernames would leave every slug-addressed creator's
    // name free for a stranger to publish on.
    const { count: creatorCount, error: creatorError } = await admin
      .from("creators")
      .select("id", { count: "exact", head: true })
      .eq("slug", candidate.toLowerCase())
    if (creatorError) throw new SlugCheckFailed(creatorError.message)
    return (creatorCount ?? 0) > 0
  })

  /* Kept, or the next publish allocates again and the address moves. */
  const { error: keepError } = await admin.from("sites").update({ slug }).eq("id", site.id)
  if (keepError) throw new SlugCheckFailed(keepError.message)
  return slug
}

/** The address could not be checked or kept: the publish stops before anything goes up. */
export class SlugCheckFailed extends Error {
  constructor(why?: string) {
    super(`site address check failed: ${why || "the read failed"}`)
    this.name = "SlugCheckFailed"
  }
}
export const SLUG_CHECK_FAILED = "Could not check this site's address right now, so nothing was published. Try again in a moment."

/** The built site, as files ready to upload. */
export async function buildStatic(
  files: ProjectFiles,
  siteId: string,
  /** Stamped onto the asset URLs so a new publish is a new URL. */
  version?: string | number,
): Promise<{ ok: true; output: Record<string, string> } | { ok: false; errors: string[] }> {
  const esbuild = await import("esbuild")
  const result = await bundleProject(esbuild as never, files)

  if (!result.ok) {
    return {
      ok: false,
      errors: result.errors.map((e) =>
        e.file ? `${e.file}${e.line ? `:${e.line}` : ""}: ${e.message}` : e.message,
      ),
    }
  }

  const output: Record<string, string> = {
    "index.html": publishedDocument({
      code: "",
      css: result.css,
      html: files["index.html"],
      siteId,
      version,
    }),
    "app.js": result.code ?? "",
  }
  if (result.css) output["app.css"] = result.css

  return { ok: true, output }
}

/**
 * React, uploaded once for the whole platform.
 *
 * Every published site's import map points at `_vendor/react-{version}/`, so
 * this runs on the first publish after a deploy and is a no-op forever after.
 * Checked by listing rather than tracked in a table: the bucket is the source
 * of truth for what is in the bucket, and a table that disagreed with it would
 * be worse than no table.
 */
async function ensureVendorAssets(): Promise<void> {
  const admin = createAdminClient()
  const prefix = VENDOR_PREFIX.replace(/^\//, "")

  const { data: existing } = await admin.storage.from(DEPLOYMENT_BUCKET).list(prefix, { limit: 10 })
  if ((existing?.length ?? 0) >= 5) return

  const { readFile } = await import("node:fs/promises")
  const { join } = await import("node:path")
  const vendorDir = join(process.cwd(), "public/sites/vendor")

  const names = [
    "react.js",
    "react-jsx-runtime.js",
    "react-jsx-dev-runtime.js",
    "react-dom.js",
    "react-dom-client.js",
  ]

  for (const name of names) {
    const source = await readFile(join(vendorDir, name), "utf8").catch(() => null)
    // A missing vendor file is a deployment problem, not a per-site one — the
    // publish still has to fail loudly rather than ship a page whose imports
    // resolve to nothing.
    if (source === null) throw new Error(`Vendor asset missing: ${name}. Run scripts/build-sites-assets.mjs.`)
    const { error } = await admin.storage
      .from(DEPLOYMENT_BUCKET)
      .upload(`${prefix}/${name}`, new Blob([source], { type: "text/javascript" }), {
        contentType: "text/javascript; charset=utf-8",
        upsert: true,
        cacheControl: "31536000",
      })
    if (error) throw new Error(`Could not upload ${name}: ${error.message}`)
  }
}

export async function publishSite(site: Site): Promise<PublishResult> {
  const admin = createAdminClient()

  const notReady = await publishPreflight()
  if (notReady) return { ok: false, error: notReady }

  const files = await readProject(site.id)
  if (Object.keys(files).length === 0) {
    return { ok: false, error: "This site has no files to publish." }
  }

  /**
   * EVERYTHING THE AGENT IS HELD TO, APPLIED TO THE THING GOING PUBLIC.
   *
   * An agent run bundles, typechecks and renders before it may finish. This
   * ran esbuild and nothing else — so every path that is NOT an agent run went
   * live unchecked, and the safest path was the least guarded one: the Code
   * tab autosaves every 1.2 seconds and Publish took whatever was there.
   *
   * And nothing looked for credentials at all, on the one operation that
   * copies a project onto a public bucket behind a CDN. A key that goes out
   * that way is not exposed later; it is published, and deleting the site
   * afterwards does not recall it.
   */
  const checks = await preflight(files)
  if (!checks.ok) {
    return {
      ok: false,
      error: "This site did not pass its checks, so nothing was published.",
      details: describeFindings(checks.findings.filter((f) => f.level === "blocking")),
    }
  }

  // Read the revision we are building FROM, before anything is built or
  // written, so the record says which version is live rather than which was
  // current when the upload finished — and so the asset URLs can carry it.
  const { data: current } = await admin
    .from("sites")
    .select("revision")
    .eq("id", site.id)
    .maybeSingle()
  const revision = (current as { revision: number } | null)?.revision ?? 1

  const built = await buildStatic(files, site.id, `r${revision}`)
  if (built.ok === false) {
    return {
      ok: false,
      error: "This site does not build, so nothing was published.",
      details: built.errors,
    }
  }

  let slug: string
  try {
    slug = await ensureSlug(site)
  } catch (e) {
    if (!(e instanceof SlugCheckFailed)) throw e
    console.error("[sites/publish] address not checked", { siteId: site.id, message: e.message })
    return { ok: false, error: SLUG_CHECK_FAILED }
  }

  const { data: created, error: createError } = await admin
    .from("site_deployments")
    .insert({
      site_id: site.id,
      status: "building",
      slug,
      version_label: `r${revision}`,
    })
    .select("id")
    .single()

  const deploymentId = (created as { id: string } | null)?.id
  if (createError || !deploymentId) {
    /**
     * The real reason, not "try again".
     *
     * This used to discard `createError` entirely and return advice that could
     * never work — the failure was a schema problem and retrying it forever
     * would not have fixed it. The message is the creator's own site's error
     * about our own schema; there is nothing here belonging to anybody else.
     */
    console.error("[sites/publish] could not create deployment row", {
      siteId: site.id,
      code: createError?.code,
      message: createError?.message,
    })
    return {
      ok: false,
      error: "Could not start the publish.",
      details: createError?.message ? [createError.message] : undefined,
    }
  }

  // Immutable prefix. Every publish gets its own, so the previous one keeps
  // serving untouched while this one uploads.
  const prefix = `sites/${site.id}/${deploymentId}`
  let bytes = 0

  try {
    await ensureVendorAssets()

    for (const [path, content] of Object.entries(built.output)) {
      const body = new Blob([content], { type: contentTypeFor(path) })
      bytes += content.length
      const { error } = await admin.storage
        .from(DEPLOYMENT_BUCKET)
        .upload(`${prefix}/${path}`, body, {
          contentType: contentTypeFor(path),
          upsert: true,
          // A year, because the prefix contains the deployment id — this exact
          // file at this exact path can never change.
          cacheControl: "31536000",
        })
      if (error) throw new Error(`${path}: ${error.message}`)
    }
  } catch (thrown) {
    await admin
      .from("site_deployments")
      .update({
        status: "failed",
        error: thrown instanceof Error ? thrown.message : "Upload failed.",
        finished_at: new Date().toISOString(),
      })
      .eq("id", deploymentId)
    const detail = thrown instanceof Error ? thrown.message : String(thrown)
    console.error("[sites/publish] upload failed", { siteId: site.id, detail })
    return { ok: false, error: "Could not upload the site.", details: [detail] }
  }

  const publishedAt = new Date().toISOString()
  const switched = await goLive(admin as unknown as SwitchDb & RpcDb, site.id, deploymentId, {
    status: "ready",
    storage_prefix: prefix,
    file_count: Object.keys(built.output).length,
    bytes,
    published_at: publishedAt,
    finished_at: publishedAt,
  })
  if (switched.ok === false) {
    return { ok: false, error: switched.error }
  }

  const siteFields = {
    status: "published",
    published_deployment_id: deploymentId,
    published_revision: revision,
    published_at: publishedAt,
  }
  /* The site is live by now; this row only says so. Asked again once, and logged if it still does not take: the next publish writes it. */
  let { error: siteError } = await admin.from("sites").update(siteFields).eq("id", site.id)
  if (siteError) ({ error: siteError } = await admin.from("sites").update(siteFields).eq("id", site.id))
  if (siteError) {
    console.error("[sites/publish] live, but the site row was not updated", { siteId: site.id, deploymentId, code: siteError.code, message: siteError.message })
  }

  return { ok: true, url: publishedUrl(slug), slug, deploymentId, revision }
}

/* The few calls the switch makes, so it can be driven by a fake in tests. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SwitchDb = { from: (table: string) => any }
type DbError = { code?: string; message?: string } | null

export const SWITCH_FAILED = "The site built but could not go live. Nothing that was live has changed. Try again."
export const SWITCH_RESTORE_FAILED = "The site built but could not go live, and the version that was live could not be put back. Publish again to bring it back."

/**
 * ===========================================================================
 *  THE SWITCH: OLD POINTER DOWN, NEW POINTER UP, AND BACK IF IT DID NOT TAKE
 * ===========================================================================
 * Two statements, because the unique index on (site_id) WHERE is_live
 * refuses the new pointer while the old one is up. Between them a site has no
 * live deployment for a few milliseconds, which the serving route answers
 * with the held copy or a 503.
 *
 * Neither result used to be read. If "new up" failed (a statement timeout
 * when the database is slow), the old pointer stayed down and the site
 * answered "Site not found" until the creator published again. Now:
 *
 *   - which deployment is live is read first, so it can be put back;
 *   - "old down" failing changes nothing (one statement), so the publish stops;
 *   - "new up" failing puts the old pointer back (asked twice), unless the
 *     new one did go live after all (the unique index refuses the old one
 *     with 23505, and a re-read confirms it), and marks the new one failed.
 *
 * A single-transaction switch needs a database function (SQL part 348,
 * switch_site_deployment): until it has run, this is the path.
 */
export async function switchLiveDeployment(
  db: SwitchDb,
  siteId: string,
  deploymentId: string,
  fields: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const liveNow = async (): Promise<{ id: string | null; error: DbError }> => {
    const { data, error } = await db.from("site_deployments").select("id").eq("site_id", siteId).eq("is_live", true).maybeSingle()
    return { id: (data as { id?: string } | null)?.id ?? null, error }
  }
  const markFailed = (why: string) =>
    db
      .from("site_deployments")
      .update({ status: "failed", error: why, finished_at: new Date().toISOString() })
      .eq("id", deploymentId)
      .eq("is_live", false)

  const before = await liveNow()
  if (before.error) {
    await markFailed("could not read the live deployment")
    console.error("[sites/publish] switch not started: live read failed", { siteId, code: before.error.code, message: before.error.message })
    return { ok: false, error: SWITCH_FAILED }
  }
  const previousId = before.id

  if (previousId) {
    const { error: downError } = await db.from("site_deployments").update({ is_live: false }).eq("site_id", siteId).eq("is_live", true)
    if (downError) {
      await markFailed("could not take the old version down")
      console.error("[sites/publish] switch not started: old pointer kept", { siteId, code: downError.code, message: downError.message })
      return { ok: false, error: SWITCH_FAILED }
    }
  }

  const { error: liveError } = await db.from("site_deployments").update({ ...fields, is_live: true }).eq("id", deploymentId)
  if (!liveError) return { ok: true }

  console.error("[sites/publish] new pointer did not go up", { siteId, deploymentId, code: liveError.code, message: liveError.message })
  if (!previousId) {
    await markFailed(liveError.message || "could not go live")
    return { ok: false, error: SWITCH_FAILED }
  }

  let restoreError: DbError = null
  for (let attempt = 0; attempt < 2; attempt++) {
    ;({ error: restoreError } = await db.from("site_deployments").update({ is_live: true }).eq("id", previousId))
    if (!restoreError) break
    if (restoreError.code === "23505") {
      /* Something is live already: the new one, if its update took after all. */
      const after = await liveNow()
      if (after.id === deploymentId) return { ok: true }
      if (after.id) break
    }
  }
  if (!restoreError) {
    await markFailed(liveError.message || "could not go live")
    return { ok: false, error: SWITCH_FAILED }
  }
  console.error("[sites/publish] OLD POINTER NOT RESTORED: site has no live deployment", { siteId, previousId, code: restoreError.code, message: restoreError.message })
  return { ok: false, error: SWITCH_RESTORE_FAILED }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RpcDb = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: DbError }> }

/** The database has no such function yet (its SQL part has not run): PostgREST's code, or Postgres's. */
function noSuchFunction(error: DbError): boolean {
  return !!error && (error.code === "PGRST202" || error.code === "42883")
}

/**
 * THE SWITCH IN ONE TRANSACTION when SQL part 348 has run
 * (switch_site_deployment), and the two-step switch with its way back when it
 * has not. The function's failure changes nothing, so the old version is
 * still live; an answer that was lost is checked by reading what is live.
 */
export async function goLive(
  db: SwitchDb & RpcDb,
  siteId: string,
  deploymentId: string,
  fields: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db.rpc("switch_site_deployment", { p_site: siteId, p_deployment: deploymentId, p_fields: fields })
  if (!error) return { ok: true }
  if (noSuchFunction(error)) return switchLiveDeployment(db, siteId, deploymentId, fields)
  const { data: live } = await db.from("site_deployments").select("id").eq("site_id", siteId).eq("is_live", true).maybeSingle()
  if ((live as { id?: string } | null)?.id === deploymentId) return { ok: true }
  console.error("[sites/publish] switch in one step failed; nothing changed", { siteId, deploymentId, code: error.code, message: error.message })
  await db
    .from("site_deployments")
    .update({ status: "failed", error: error.message || "could not go live", finished_at: new Date().toISOString() })
    .eq("id", deploymentId)
    .eq("is_live", false)
  return { ok: false, error: SWITCH_FAILED }
}

/** Take a site offline without deleting anything it built. */
export async function unpublishSite(siteId: string): Promise<{ ok: boolean }> {
  const admin = createAdminClient()
  await admin.from("site_deployments").update({ is_live: false }).eq("site_id", siteId).eq("is_live", true)
  await admin.from("sites").update({ status: "unpublished" }).eq("id", siteId)
  return { ok: true }
}
