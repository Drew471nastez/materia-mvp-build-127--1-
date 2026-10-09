// ============================================================
// Theme import — accepts a .storelib-export zip and creates a
// new install (a draft) for the current creator.
// ------------------------------------------------------------
// • parses manifest.json
// • re-uploads every bundled image to the creator's storage bucket
// • rewrites every references in the settings + pages to point at
//   the newly uploaded URLs
// • creates a fresh store_theme_installs row + settings + pages
// ============================================================
import { NextResponse } from "next/server"
import { type CoverResult, coverForNewWebsite, isPackagedCover, renderOrigin, storeCover } from "@/lib/website-builder/cover-take"
import { MAX_BYTES as SNAPSHOT_MAX_BYTES } from "@/lib/website-builder/snapshot"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIBRARY_FULL_CODE, LIBRARY_FULL_MESSAGE, firstSortOrder, isLibraryFullError, keptWithinLimit, librarySlotsLeft } from "@/lib/website-builder/library-limit"
import { screenInBackground } from "@/lib/storage/upload-guard"
import { inspectHead, inspectUpload } from "@/lib/security/uploads/inspect"
import { nodeInflateRaw } from "@/lib/security/uploads/zip-inflate"
import { logUploadVerdict } from "@/lib/security/uploads/audit"
import { runAfterResponse } from "@/lib/security/uploads/pipeline"
import { IMPORT_BUCKET, IMPORT_MAX_BYTES, IMPORT_NOT_A_PACKAGE, IMPORT_TOO_LARGE, isOwnImportPath, looksLikeZip } from "@/lib/website-builder/theme-import"
import JSZip from "jszip"
import {
  parseThemePackageManifest,
  MAX_IMAGE_BYTES_IN_ZIP,
  ALLOWED_IMAGE_EXTENSIONS,
  type ThemePackageManifest,
} from "@/lib/website-builder/theme-package-schema"
import { buildPackage, readPackage } from "@/lib/storelib-theme"
import { SHOPIFY_LICENSE_NOTICE, conversionSummary, convertShopifyTheme, isShopifyTheme, type ConversionReport } from "@/lib/storelib-theme/shopify/convert"
import { kindLookup, repairChrome } from "@/lib/storelib-theme/section-groups"
import { pagesFromPackageFiles } from "@/lib/website-builder/theme-pages"
import { readEntryCapped } from "@/lib/storelib-theme/package"
import {
  MAX_BYTES,
  MEDIA_TYPES,
  describeMedia,
  extensionOf,
  type MediaKind,
} from "@/lib/storelib-theme/media"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { ownSectionFields, sanitizeSections, sanitizeThemeSettings } from "@/lib/website-builder/sanitize-sections"
import type { SectionInstance } from "@/lib/website-builder/types"
import { STORELIB_DEFAULT_ID, THEME_REGISTRY, themeCatalogRow } from "@/lib/website-builder/theme-registry"

import { DEFAULT_THEME_SOURCES } from "../../../../../themes/default/sources.generated"

const BUCKET = "store-builder-images"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A file inside a package, checked by the central check before it gets a
 * public URL: a picture must be a picture, a video a video, and nothing may
 * be a program, a script or a web page, whatever its extension says.
 */
function packageFileAllowed(name: string, bytes: Uint8Array, kind: MediaKind): boolean {
  const context = kind === "image" ? "public_image" : kind === "video" ? "video" : "link_page_file"
  return inspectHead({ fileName: name, size: bytes.byteLength || 1, head: bytes.subarray(0, 8192), context }).ok
}

function rewriteUrls(node: unknown, urlMap: Record<string, string>): unknown {
  if (typeof node === "string") return urlMap[node] ?? node
  if (Array.isArray(node)) return node.map(v => rewriteUrls(v, urlMap))
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = rewriteUrls(v, urlMap)
    return out
  }
  return node
}

// POST /api/website-builder/themes/import
// multipart/form-data with `file` field containing the zip
/** A package is read and written at once, then its first picture: the package's own, or a photograph of up to QUICK_COVER_MS. */
export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  /*
    THE PACKAGE, FROM STORAGE OR FROM A FORM. The page puts the file in
    storage first and sends its path (lib/website-builder/theme-import.ts);
    a page from before that change still posts a form, which only a small
    file ever gets through. A stored file is removed once this request is
    done with it, whatever the answer.
  */
  const stored = (req.headers.get("content-type") ?? "").includes("application/json")
    ? ((await req.json().catch(() => null)) as { path?: unknown } | null)?.path
    : undefined
  if (stored !== undefined && !isOwnImportPath(stored, user.id)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
  }
  const bucket = admin.storage.from(IMPORT_BUCKET)
  const discard = () => (typeof stored === "string" ? bucket.remove([stored]).then(() => undefined, () => undefined) : Promise.resolve())

  /* Asked before the package is read: a full library refuses a 50 MB zip
     without downloading or unpacking it. */
  if ((await librarySlotsLeft(supabase, creator.id)) === 0) {
    await discard()
    return NextResponse.json({ error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE }, { status: 400 })
  }

  let buf: Buffer
  if (typeof stored === "string") {
    try {
      /* The size from storage's own record, before a byte is downloaded. */
      const slash = stored.lastIndexOf("/")
      const name = stored.slice(slash + 1)
      const { data: listed } = await bucket.list(stored.slice(0, slash), { search: name, limit: 1 })
      const entry = listed?.find((f) => f.name === name)
      if (!entry) return NextResponse.json({ error: "The upload did not arrive. Try again." }, { status: 400 })
      const recorded = Number((entry.metadata as { size?: unknown } | null)?.size)
      if (Number.isFinite(recorded) && recorded > IMPORT_MAX_BYTES) {
        return NextResponse.json({ error: IMPORT_TOO_LARGE }, { status: 413 })
      }
      const { data: blob, error: downloadErr } = await bucket.download(stored)
      if (downloadErr || !blob) return NextResponse.json({ error: "The upload did not arrive. Try again." }, { status: 400 })
      if (blob.size > IMPORT_MAX_BYTES) return NextResponse.json({ error: IMPORT_TOO_LARGE }, { status: 413 })
      buf = Buffer.from(await blob.arrayBuffer())
    } finally {
      await discard()
    }
  } else {
    /* A declared length over the limit is refused before the body is read. */
    if (Number(req.headers.get("content-length") ?? 0) > IMPORT_MAX_BYTES + 64 * 1024) {
      return NextResponse.json({ error: IMPORT_TOO_LARGE }, { status: 413 })
    }
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }
    const file = form.get("file")
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }
    if (file.size > IMPORT_MAX_BYTES) {
      return NextResponse.json({ error: IMPORT_TOO_LARGE }, { status: 413 })
    }
    buf = Buffer.from(await file.arrayBuffer())
  }

  /* Its first four bytes, before the unzipper sees the rest. */
  if (!looksLikeZip(buf)) {
    return NextResponse.json({ error: IMPORT_NOT_A_PACKAGE }, { status: 400 })
  }

  /* The central check on the whole package before a file of it is unpacked:
     a ZIP, and a table of contents with no traversal, no bomb and nothing
     runnable (lib/security/uploads). An engine, when one is on, looks after. */
  const packageBytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  const verdict = await inspectUpload({
    fileName: "package.zip",
    size: packageBytes.byteLength,
    head: packageBytes.subarray(0, 8192),
    tail: { bytes: packageBytes.subarray(Math.max(0, packageBytes.byteLength - 70_000)), start: Math.max(0, packageBytes.byteLength - 70_000) },
    readRange: async (a, b) => packageBytes.subarray(a, b + 1),
    /* An archive's declared sizes tested, not believed (lib/security/uploads/zip.ts). */
    inflate: nodeInflateRaw,
    context: "theme_package",
  })
  if (!verdict.ok) {
    runAfterResponse(() => logUploadVerdict(admin, verdict, { context: "theme_package", userId: user.id, creatorId: creator.id, bucket: IMPORT_BUCKET, bytes: packageBytes.byteLength }))
    return NextResponse.json({ error: verdict.code === "not_a_zip" ? IMPORT_NOT_A_PACKAGE : verdict.userMessage }, { status: 400 })
  }
  screenInBackground(admin, { bytes: packageBytes, bucket: IMPORT_BUCKET, path: typeof stored === "string" ? stored : `${user.id}/form-upload.zip`, context: "theme_package", userId: user.id })

  // Load the zip
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buf)
  } catch {
    return NextResponse.json({ error: IMPORT_NOT_A_PACKAGE }, { status: 400 })
  }

  /**
   * ===========================================================================
   *  A SHOPIFY THEME, CONVERTED, THEN READ LIKE ANY PACKAGE
   * ===========================================================================
   * A ZIP with sections/*.liquid and no theme.json is a Shopify theme. Its
   * Liquid is rewritten as text into .storelib files (lib/storelib-theme/
   * shopify/convert.ts), never run, and the result is built into a package
   * and handed to the branch below, so every check a package gets, this
   * gets too. What was left out comes back in the answer as `shopify`.
   */
  let shopify: ConversionReport | null = null
  if (isShopifyTheme(zip)) {
    const converted = await convertShopifyTheme(zip, { reservedTypes: Object.keys(SECTION_SCHEMAS) })
    if (converted.ok === false) return NextResponse.json({ error: converted.error }, { status: 400 })
    shopify = converted.report
    try {
      buf = Buffer.from(await buildPackage(converted.pkg))
      zip = await JSZip.loadAsync(buf)
    } catch {
      return NextResponse.json({ error: "This Shopify theme could not be converted" }, { status: 400 })
    }
  }
  const shopifyAnswer = shopify ? { shopify: { ...shopify, summary: conversionSummary(shopify), license: SHOPIFY_LICENSE_NOTICE } } : {}

  /**
   * ===========================================================================
   *  A .storelib-theme PACKAGE
   * ===========================================================================
   * Read as a whole or not at all (docs/theme/11): the paths, theme.json,
   * every hash in the manifest, every section compiled, every template
   * checked against the sections the theme has. A package that fails is
   * refused with the list, and nothing is written.
   *
   * The builder's earlier `manifest.json` + `images/` exports fall through
   * to the code below, which is unchanged.
   */
  if (zip.file("theme.json")) {
    const read = await readPackage(new Uint8Array(buf), { knownTypes: Object.keys(SECTION_SCHEMAS) })
    if (read.ok === false) {
      return NextResponse.json(
        { error: read.errors[0]?.message ?? "This package is not valid", errors: read.errors, ...shopifyAnswer },
        { status: 400 },
      )
    }
    const pkg = read.value

    /**
     * Assets, stored under THIS account, and every reference rewritten.
     *
     * THE TYPE IS TAKEN FROM THE EXTENSION, NEVER FROM THE MANIFEST. A
     * package is a file a stranger sent; the `mime_type` written in it is
     * whatever its author felt like writing. The extension is checked
     * against one table, and what is served is the type that table gives —
     * so a file claiming to be a PNG is served as a PNG whatever is inside
     * it, rather than as something a browser would run.
     */
    const refToUrl: Record<string, string> = {}
    const imported: Partial<Record<MediaKind, number>> = {}
    /**
     * Sequential, for the same reason the export is: a package may carry
     * several videos, and holding all of them in memory at once on a
     * serverless function is how an import of a real site fails.
     */
    /* The cover the package carries is the card's picture, not a file for the creator's media. */
    const coverRef = (pkg.theme.cover && typeof pkg.theme.cover === "object" ? pkg.theme.cover : {}) as { desktop?: unknown; phone?: unknown }
    const coverHashes = new Set([coverRef.desktop, coverRef.phone].filter((h): h is string => typeof h === "string"))
    for (const [hash, asset] of Object.entries(pkg.assets)) {
      if (coverHashes.has(hash)) continue
      /**
       * A reference that does not end up with a URL is CLEARED, not left
       * as `asset://<hash>` — a dangling reference reaches the renderer and
       * prints as literal text where a picture should be. Set up front so
       * every path out of this loop leaves the same, safe result.
       */
      refToUrl[`asset://${hash}`] = ""
      try {
        const ext = extensionOf(asset.filename)
        const type = MEDIA_TYPES[ext]
        if (!type) continue
        if (asset.bytes.byteLength > MAX_BYTES[type.kind]) continue
        if (!packageFileAllowed(asset.filename, asset.bytes, type.kind)) continue
        const path = `${user.id}/imported/${hash.slice(0, 32)}.${ext}`
        const { error: upErr } = await admin.storage.from(BUCKET).upload(path, Buffer.from(asset.bytes), {
          contentType: type.mime,
          upsert: true,
          cacheControl: "31536000",
        })
        if (upErr) continue
        refToUrl[`asset://${hash}`] = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
        imported[type.kind] = (imported[type.kind] ?? 0) + 1
      } catch {
        /* cleared above: the section takes its "nothing chosen yet" branch */
      }
    }

    /**
     * ===================================================================
     *  A PACKAGE IS SOMEBODY ELSE'S HTML, AND IT IS CLEANED AT THE DOOR
     * ===================================================================
     * Several settings reach the DOM as markup rather than as text: a
     * custom HTML block, a rich text body, an FAQ answer, a tab's
     * content, a pasted map embed. Inside one account that is the
     * creator's own writing. A package is not: it is a file somebody
     * else built, and the moment themes are passed between creators its
     * settings are a stranger's markup running on this creator's site,
     * under storelib.com, in their editor session and in front of their
     * customers.
     *
     * `/api/website-builder/themes/[installId]/sections` already cleans
     * everything the editor saves. This is the other way in, and it
     * wrote whatever the zip contained. So the same allow list runs
     * here, before a row exists: script, event handlers and javascript:
     * URLs are dropped rather than stored and dealt with later.
     */
    const rawSettings = rewriteUrls(JSON.parse(pkg.files["config/settings.json"] ?? "{}"), refToUrl) as Record<string, unknown>
    /* An imported theme's stylesheet names its pictures inside url(), not as a whole value. */
    if (typeof rawSettings.theme_stylesheet === "string") {
      rawSettings.theme_stylesheet = rawSettings.theme_stylesheet.replace(/asset:\/\/[0-9a-f]{64}/gi, (ref) => refToUrl[ref] ?? "")
    }
    const settings = sanitizeThemeSettings(rawSettings)
    /* The package's own section files say which of their settings are rich text. */
    const own = ownSectionFields(Object.entries(pkg.files).map(([path, content]) => ({ path, content })))
    /**
     * ONE HEADER AND ONE FOOTER, from the package's group files when it has
     * them and from its templates when it does not. A header the package
     * wrote as a section file is placed as the header; the built-in one is
     * hidden, not dropped, and so is any second header. Every page is the
     * Header group, its own sections, the Footer group (lib/website-builder/
     * theme-pages.ts).
     */
    const packageKinds = kindLookup(pkg.files, SECTION_SCHEMAS as never)
    const pages: { page_key: string; sections: unknown }[] = pagesFromPackageFiles(pkg.files, packageKinds).map((page) => ({
      page_key: page.page_key,
      sections: sanitizeSections(rewriteUrls(page.sections, refToUrl) as SectionInstance[], own),
    }))

    /* FIRST in the library, where the page draws it while it is being made (lib/website-builder/library-limit.ts, firstSortOrder). */
    const sortOrder = await firstSortOrder(admin, creator.id)
    const installName = String(pkg.theme.name ?? "Imported theme").slice(0, 80)
    const made = await createInstall(admin, creator.id, {
      theme_id: await catalogThemeId(admin, pkg.theme.source_theme_id),
      name: installName,
      sort_order: sortOrder,
    })
    if (made instanceof NextResponse) return made
    const created = made

    /**
     * The theme's own source files. Only those that differ from what this
     * build ships are stored: a package that carries the same hero as the
     * bundle writes no row for it, so the install follows the theme's
     * updates rather than freezing a copy of today's file.
     */
    const rows = Object.entries(pkg.files)
      .filter(([path]) => path.endsWith(".storelib"))
      .filter(([path, content]) => DEFAULT_THEME_SOURCES[path] !== content)
      /* A converted Shopify section names its pictures by asset reference, written into the file itself. */
      .map(([path, content]) => ({ install_id: created.id, path, content: shopify ? Object.entries(refToUrl).reduce((text, [ref, url]) => text.split(ref).join(url), content) : content }))
    const filled = await fillInstall(admin, created.id, settings, pages, rows)
    if (filled) return filled

    /*
      ITS COVER FROM THE START. The picture the package carried, stored in
      this request and handed back in the answer, so the new row shows this
      website from its first frame; then a photograph of the imported website
      itself. A package without one (an export from before exports carried
      it) is photographed now instead (lib/website-builder/cover-take.ts).
    */
    const owner = { installId: created.id as string, userId: user.id, creatorId: creator.id as string }
    const desktop = typeof coverRef.desktop === "string" ? pkg.assets[coverRef.desktop]?.bytes : undefined
    const phone = typeof coverRef.phone === "string" ? pkg.assets[coverRef.phone]?.bytes : undefined
    let packaged: CoverResult | null = null
    if (desktop && isPackagedCover(desktop, SNAPSHOT_MAX_BYTES)) {
      try {
        packaged = await storeCover(owner, Buffer.from(desktop), phone && isPackagedCover(phone, SNAPSHOT_MAX_BYTES) ? Buffer.from(phone) : null)
      } catch (e) {
        console.error("[cover] import: could not store the package's cover:", e instanceof Error ? e.message : e)
      }
    }
    const first = await coverForNewWebsite(owner, renderOrigin(req.url), "import", packaged)

    return NextResponse.json({
      ok: true,
      install_id: created.id,
      name: installName,
      migrated: pkg.legacy,
      /** What came with it, so the reply can say so rather than leaving somebody to scroll the page looking. */
      media: describeMedia(imported),
      /** A section file that took the built-in header's or footer's own name, left out: lib/storelib-theme/package.ts. */
      left_out: [...new Set((read.warnings ?? []).map((w) => w.message.match(/ takes the built-in (header|footer)'s own name/)?.[1]).filter(Boolean))],
      /** What a Shopify theme's conversion kept and left out, with the line to show and the license reminder. */
      ...shopifyAnswer,
      ...first,
    })
  }

  const manifestFile = zip.file("manifest.json")
  if (!manifestFile) {
    return NextResponse.json({ error: "Not a Storelib theme export" }, { status: 400 })
  }

  // Validate manifest with Zod. This covers: JSON parse errors,
  // unknown/missing `format`, malformed `install`, malformed `pages`,
  // and the optional Stage-3 `theme_pack` block. Any failure returns
  // a helpful pointer (path + reason) so creators editing zips by
  // hand get a clear error instead of a silent broken install.
  const manifestRaw = await manifestFile.async("string")
  const parsed = parseThemePackageManifest(manifestRaw)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const manifest: ThemePackageManifest = parsed.manifest

  // Upload every bundled image to the creator's storage and build a
  // remap from "images/<sha>.<ext>" -> the new public URL.
  // Safety belts:
  //   • skip files whose extension isn't on the image allow-list
  //     (nothing in the zip should execute, but belt-and-suspenders)
  //   • skip files larger than MAX_IMAGE_BYTES_IN_ZIP so one giant
  //     image can't dominate the 50 MB zip cap
  const localToRemote: Record<string, string> = {}
  const imagesFolder = zip.folder("images")
  if (imagesFolder) {
    const entries: { name: string; file: JSZip.JSZipObject }[] = []
    imagesFolder.forEach((relPath, f) => {
      if (!f.dir) entries.push({ name: relPath, file: f })
    })
    /** Sequential, and through the same one table as everything else. */
    for (const entry of entries) {
      /* Cleared unless it lands, so a local path never survives into a page. */
      localToRemote[`images/${entry.name}`] = ""
      try {
        const ext = extensionOf(entry.name)
        const type = MEDIA_TYPES[ext]
        if (!type) continue
        /* Counted as it inflates and stopped at the ceiling, because the
           size an archive declares is written by whoever made it
           (lib/storelib-theme/package.ts readEntryCapped). */
        const read = await readEntryCapped(entry.file, MAX_BYTES[type.kind])
        if (!read.bytes) continue
        const data = read.bytes
        if (!packageFileAllowed(entry.name, data, type.kind)) continue
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`
        const path = `${user.id}/imported/${safeName}`
        const { error: upErr } = await admin.storage.from(BUCKET).upload(path, data, {
          contentType: type.mime,
          upsert: true,
          cacheControl: "31536000",
        })
        if (upErr) continue
        const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
        localToRemote[`images/${entry.name}`] = pub.publicUrl
      } catch {
        /* cleared above */
      }
    }
  }

  // Rewrite manifest URLs back to the freshly uploaded URLs
  const importedSettings = sanitizeThemeSettings(rewriteUrls(manifest.settings ?? {}, localToRemote) as Record<string, unknown>)
  /* Same reasoning as the package path above: cleaned before it is stored. */
  const importedPages = (rewriteUrls(manifest.pages ?? [], localToRemote) as { page_key: string; sections: unknown }[])
    .map(p => ({ ...p, sections: repairChrome(sanitizeSections(p.sections as SectionInstance[]), kindLookup(undefined, SECTION_SCHEMAS as never)).sections }))

  // Stage 3 forward-compat: if the manifest includes a `theme_pack`
  // block (schema-only overrides shipped by the creator), stash it
  // under a reserved key inside settings so downstream editor/
  // renderer code can pick it up without needing a schema migration.
  //
  // Right now the renderer still resolves schemas from the built-in
  // default theme (see lib/website-builder/section-schemas.ts).
  // When that becomes pack-aware the reserved key `_theme_pack` is
  // already populated on imported installs, so no second migration
  // is needed on the data. This is deliberately a no-op for v1 zips.
  if (manifest.theme_pack) {
    importedSettings._theme_pack = manifest.theme_pack
  }

  // Create a new install (a draft, first in the library)
  const nextOrder = await firstSortOrder(admin, creator.id)

  const installName = (manifest.install?.name ?? "Imported Theme").slice(0, 80)

  const made = await createInstall(admin, creator.id, {
    theme_id: await catalogThemeId(admin, manifest.install?.theme_id),
    name: installName,
    sort_order: nextOrder,
  })
  if (made instanceof NextResponse) return made
  const newInstall = made

  /* Settings as a draft too, so the person can look before publishing. */
  const filled = await fillInstall(admin, newInstall.id, importedSettings, importedPages, [])
  if (filled) return filled

  /* Photographed from the start, like every other way a website is made. The older format carries no cover. */
  const first = await coverForNewWebsite({ installId: newInstall.id as string, userId: user.id, creatorId: creator.id as string }, renderOrigin(req.url), "import", null)

  return NextResponse.json({ ok: true, install_id: newInstall.id, name: installName, ...first })
}

type Admin = ReturnType<typeof createAdminClient>

/**
 * The catalogue theme a new install points at.
 *
 * `store_theme_installs.theme_id` is NOT NULL and a foreign key into
 * `themes`. A package carries the id of the theme it came from, and that id
 * means nothing in an account whose catalogue never had it, which is the
 * ordinary case for a package from somebody else. Written unchecked, the
 * insert failed and the import died with a 500 the person could do nothing
 * about (the older manifest format wrote null, which failed every time). So
 * the id is used only when the row is really there, and the default theme
 * stands in when it is not, registered first if this database lacks it.
 */
async function catalogThemeId(admin: Admin, claimed: unknown): Promise<string> {
  if (typeof claimed === "string" && UUID.test(claimed)) {
    const { data: known } = await admin.from("themes").select("id").eq("id", claimed).maybeSingle()
    if (known) return claimed
  }
  const { data: haveDefault } = await admin.from("themes").select("id").eq("id", STORELIB_DEFAULT_ID).maybeSingle()
  if (!haveDefault) {
    const def = THEME_REGISTRY.find((t) => t.id === STORELIB_DEFAULT_ID)
    if (def) await admin.from("themes").upsert(themeCatalogRow(def), { onConflict: "id" })
  }
  return STORELIB_DEFAULT_ID
}

/**
 * The new install's row: a draft ("unpublished" means a site that was live
 * and was taken offline, and this one never was), before every website
 * already there. Two imports at once cannot make a sixth: the database
 * refuses, or the recount backs this one out (lib/website-builder/library-limit.ts).
 */
async function createInstall(
  admin: Admin,
  creatorId: string,
  fields: { theme_id: string; name: string; sort_order: number },
): Promise<{ id: string } | NextResponse> {
  const { data, error } = await admin
    .from("store_theme_installs")
    .insert({ creator_id: creatorId, ...fields, status: "draft", is_custom: true })
    .select("id")
    .single()
  if (isLibraryFullError(error)) {
    return NextResponse.json({ error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE }, { status: 400 })
  }
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create install" }, { status: 500 })
  }
  if (!(await keptWithinLimit(admin, creatorId, data.id as string))) {
    return NextResponse.json({ error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE }, { status: 400 })
  }
  return { id: data.id as string }
}

/**
 * Its settings, pages and files, or nothing: a website missing its pages
 * opens to an empty editor, which reads as loss. Any write that fails
 * removes the install again (its rows go with it) and says so. Null when
 * everything landed.
 */
async function fillInstall(
  admin: Admin,
  installId: string,
  settings: Record<string, unknown>,
  pages: { page_key: string; sections: unknown }[],
  files: { install_id: string; path: string; content: string }[],
): Promise<NextResponse | null> {
  const writes = [
    admin.from("store_theme_settings").insert({ install_id: installId, settings, draft_settings: settings }),
    pages.length > 0
      ? admin.from("store_theme_pages").insert(pages.map((p) => ({ install_id: installId, page_key: p.page_key, sections: p.sections })))
      : Promise.resolve({ error: null }),
    files.length > 0 ? admin.from("store_theme_custom_files").insert(files) : Promise.resolve({ error: null }),
  ]
  const failed = (await Promise.all(writes)).find((r) => r.error)
  if (!failed) return null
  await admin.from("store_theme_installs").delete().eq("id", installId)
  return NextResponse.json({ error: "Could not import this theme. Try again." }, { status: 500 })
}
