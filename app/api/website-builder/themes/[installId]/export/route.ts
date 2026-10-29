// ============================================================
// Theme export — packages an install into a .storelib-export zip
// ------------------------------------------------------------
// The zip contains:
//   manifest.json   — { format: "storelib-theme/v1", install, settings, pages, exported_at }
//   images/<sha>.<ext> — every distinct image referenced from settings
//                        and section blocks, downloaded once
//   manifest.json image_map field maps original_url -> images/<sha>.<ext>
// ============================================================
import { createAdminClient } from "@/lib/supabase/admin"
import { THEME_SCHEMA_FILE } from "@/lib/storelib-theme/theme-config"
import { readTwice, UNREACHABLE } from "@/lib/website-builder/owned-install"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import JSZip from "jszip"
import { DEFAULT_THEME_SOURCES } from "../../../../../../themes/default/sources.generated"
import crypto from "crypto"
import {
  CURRENT_THEME_PACKAGE_FORMAT,
  type ThemePackageManifest,
} from "@/lib/website-builder/theme-package-schema"
import { buildPackage, sha256, type PackageAsset } from "@/lib/storelib-theme"
import { kindLookup, repairChrome } from "@/lib/storelib-theme/section-groups"
import { packageFilesFromPages } from "@/lib/website-builder/theme-pages"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import type { SectionInstance } from "@/lib/website-builder/types"
import {
  MAX_BYTES,
  MAX_TOTAL_MEDIA_BYTES,
  collectMediaUrls,
  describeMedia,
  extensionOf,
  mediaTypeFor,
  rewriteMediaUrls,
  type MediaKind,
} from "@/lib/storelib-theme/media"
import { THEME_FORMAT, THEME_FORMAT_VERSION } from "@/lib/storelib-theme/types"
import { MAX_BYTES as SNAPSHOT_MAX_BYTES, SNAPSHOT_BUCKET, mobilePartner, snapshotFolder, snapshotsNewestFirst } from "@/lib/website-builder/snapshot"
import { isPackagedCover, renderOrigin, takeCover } from "@/lib/website-builder/cover-take"
import { fetchPublic } from "@/lib/api/public-fetch"
import { compatOf } from "@/lib/storelib-theme/compat/install"
import { exportShopifyTheme } from "@/lib/storelib-theme/compat/export"
import type { StoredSection } from "@/lib/storelib-theme/compat/page"
import { installFiles } from "@/lib/website-builder/compat-site"

type Params = { params: Promise<{ installId: string }> }

/** A site with no cover yet is photographed before it is packaged: a browser launch and two page loads. */
export const maxDuration = 60
/** How long into the request media may still be fetched, leaving the rest of maxDuration to build and send the ZIP. */
const MEDIA_WINDOW_MS = 40_000

/** The storage uploads are served from, asked even where it is not public (localhost in development). */
const STORAGE_ORIGINS: string[] = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? [new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin] : []
  } catch {
    return []
  }
})()

// Walk an arbitrary JSON value and collect every URL that points to an image.
/* Extensions, sizes and mime types all live in lib/storelib-theme/media.ts now,
   so the export and the import cannot drift into disagreeing about what a
   theme is allowed to carry. */

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "theme"
}

/** The install's newest cover pair as package assets, or nothing when it has none yet. */
async function packagedCover(userId: string, installId: string): Promise<{ ref: { desktop: string; phone?: string } | null; assets: { hash: string; asset: PackageAsset }[] }> {
  try {
    const bucket = createAdminClient().storage.from(SNAPSHOT_BUCKET)
    const folder = snapshotFolder(userId, installId)
    const { data } = await bucket.list(folder, { limit: 100 })
    const names = (data ?? []).map((f) => f.name)
    const newest = snapshotsNewestFirst(names)[0]
    if (!newest) return { ref: null, assets: [] }
    const phone = mobilePartner(newest, names)
    const read = async (name: string) => {
      const { data: blob } = await bucket.download(`${folder}/${name}`)
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null
    }
    const out: { hash: string; asset: PackageAsset }[] = []
    const desktop = await read(newest)
    if (!desktop || !isPackagedCover(desktop, SNAPSHOT_MAX_BYTES)) return { ref: null, assets: [] }
    const dHash = sha256(desktop)
    out.push({ hash: dHash, asset: { bytes: desktop, filename: "cover-desktop.webp", mime_type: "image/webp" } })
    let pHash: string | undefined
    const mobile = phone ? await read(phone) : null
    if (mobile && isPackagedCover(mobile, SNAPSHOT_MAX_BYTES)) {
      pHash = sha256(mobile)
      out.push({ hash: pHash, asset: { bytes: mobile, filename: "cover-phone.webp", mime_type: "image/webp" } })
    }
    return { ref: { desktop: dHash, ...(pHash ? { phone: pHash } : {}) }, assets: out }
  } catch {
    /* a package without a cover is still a whole theme */
    return { ref: null, assets: [] }
  }
}

// GET /api/website-builder/themes/[installId]/export
// Streams a .storelib-export zip back to the browser.
export async function GET(_req: Request, { params }: Params) {
  /*
    THE PICTURES AND VIDEOS STOP IN TIME TO ZIP. They are fetched one at a
    time, each allowed 20 seconds, inside a function that lives 60: three
    slow files and the platform ended the export with nothing at all. Past
    MEDIA_WINDOW_MS from the request's start the rest are left out, counted
    in X-Storelib-Media-Skipped like a file too big to carry, and the export
    still arrives.
  */
  const mediaUntil = Date.now() + MEDIA_WINDOW_MS
  const mediaWait = () => Math.max(0, Math.min(20_000, mediaUntil - Date.now()))
  const { installId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator, error: creatorReadErr } = await readTwice(() => supabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle())
  if (creatorReadErr) return NextResponse.json({ error: UNREACHABLE }, { status: 503 })
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const { data: install, error: installErr } = await supabase
    .from("store_theme_installs")
    .select("id, name, theme_id, status, sort_order, creator_id")
    .eq("id", installId)
    .eq("creator_id", creator.id)
    .maybeSingle()
  if (installErr || !install) return NextResponse.json({ error: "Theme not found" }, { status: 404 })

  const { data: settingsRow } = await supabase
    .from("store_theme_settings")
    .select("settings, draft_settings")
    .eq("install_id", installId)
    .maybeSingle()

  const { data: pages } = await supabase
    .from("store_theme_pages")
    .select("page_key, sections, draft_sections")
    .eq("install_id", installId)

  // Use draft_settings when available so creators can export work in progress
  const settings = settingsRow?.draft_settings ?? settingsRow?.settings ?? {}
  /**
   * THE PAGES AS THE CREATOR HAS THEM: the draft where there is one, as the
   * settings above. A package is what somebody hands an AI to edit, and a
   * header that differs from the one in the editor is the one it would edit.
   */
  const exportPages = (pages ?? []).map((p) => ({ page_key: p.page_key as string, sections: (p.draft_sections ?? p.sections ?? []) as unknown }))

  /*
    AN IMPORTED SHOPIFY THEME EXPORTS AS ONE: its own folders and names, the
    pages back as templates, every change made in the builder in them
    (lib/storelib-theme/compat/export.ts). Importing it again gives the same
    site.
  */
  if (compatOf(settings)) {
    const rows = await installFiles(createAdminClient(), installId, true)
    const out = exportShopifyTheme(rows, settings, Object.fromEntries(exportPages.map((p) => [p.page_key, p.sections as StoredSection[]])))
    const zip = new JSZip()
    for (const [path, body] of Object.entries(out.files)) zip.file(path, body)
    let missing = 0
    for (const [name, url] of Object.entries(out.media)) {
      if (mediaWait() < 1_000) { missing++; continue }
      try {
        const res = await fetchPublic(url, { maxBytes: 15 * 1024 * 1024, timeoutMs: mediaWait(), trustOrigins: STORAGE_ORIGINS })
        if (!res.ok) { missing++; continue }
        zip.file(`assets/${name}`, new Uint8Array(await res.arrayBuffer()))
      } catch {
        missing++
      }
    }
    const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })
    return new NextResponse(Buffer.from(body) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeFilename(install.name)}.zip"`,
        "Cache-Control": "no-store",
        ...(missing ? { "X-Storelib-Media-Skipped": String(missing) } : {}),
      },
    })
  }

  /**
   * ===========================================================================
   *  THE THEME, AS ONE FILE
   * ===========================================================================
   * A `.storelib-theme` package: the folder in docs/theme/01 with a manifest
   * that hashes every file and every asset (docs/theme/11). What is in it is
   * the theme and only the theme — no install id, no publish state, no
   * account data — so it imports into any account.
   *
   * Every image this theme points at is downloaded, stored under the hash of
   * its own bytes, and every reference to it rewritten to `asset://<hash>`.
   * A URL that cannot be fetched is left as it was rather than dropped: an
   * export that silently loses a picture is worse than one that keeps a link.
   *
   * `?legacy=1` still writes the older `manifest.json` + `images/` zip, for
   * anything that reads that format.
   */
  const legacyImages: Record<string, Buffer> = {}
  /**
   * EVERY KIND OF MEDIA, not only pictures.
   *
   * This used to match image extensions and nothing else, so the video
   * behind a hero was never fetched and its URL travelled untouched —
   * pointing at THIS creator's bucket. The imported site then served its
   * video off a stranger's storage: they paid the bandwidth, and tidying up
   * their own files broke somebody else's page with no way to find out why.
   */
  const urls = collectMediaUrls(settings, collectMediaUrls(exportPages))

  const legacy = new URL(_req.url).searchParams.get("legacy") === "1"

  const assets: Record<string, PackageAsset> = {}
  const urlToRef: Record<string, string> = {}
  const imageMap: Record<string, string> = {}
  /** What went in, and what would not fit, so the reply can say so. */
  const carried: Partial<Record<MediaKind, number>> = {}
  const skipped: string[] = []
  let mediaBytes = 0

  /**
   * ONE AT A TIME, LARGEST BUDGET FIRST — not Promise.all.
   *
   * Videos are tens of megabytes. Fetching six of them at once holds all six
   * in memory on a serverless function that has a few hundred megabytes, and
   * the budget below cannot be spent correctly by callers racing each other
   * to add to it.
   */
  for (const url of Array.from(urls).sort()) {
    const type = mediaTypeFor(url)
    if (!type) continue
    if (mediaWait() < 1_000) { skipped.push(url); continue }
    try {
      /*
        Only a public address, checked as it is connected to and at every
        redirect, and never more than this kind of file may weigh: a setting
        can hold any address at all, and what comes back goes into the
        download. See lib/api/public-fetch.ts.
      */
      const res = await fetchPublic(url, { maxBytes: MAX_BYTES[type.kind], timeoutMs: mediaWait(), trustOrigins: STORAGE_ORIGINS })
      if (!res.ok) { skipped.push(url); continue }

      /**
       * Checked BEFORE the body is read where the server says how big it is.
       * Reading a 400MB video to then decide it is too big is the failure
       * this is here to avoid, not a check to do afterwards.
       */
      const declared = Number(res.headers.get("content-length") ?? "0")
      if (declared > MAX_BYTES[type.kind]) { skipped.push(url); continue }

      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.byteLength > MAX_BYTES[type.kind]) { skipped.push(url); continue }
      if (mediaBytes + buf.byteLength > MAX_TOTAL_MEDIA_BYTES) { skipped.push(url); continue }
      mediaBytes += buf.byteLength

      const ext = extensionOf(url) || "bin"
      if (legacy) {
        const sha = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16)
        imageMap[url] = `images/${sha}.${ext}`
        legacyImages[`${sha}.${ext}`] = buf
        continue
      }
      const bytes = new Uint8Array(buf)
      const hash = sha256(bytes)
      assets[hash] = {
        bytes,
        filename: (url.split("/").pop() ?? `asset.${ext}`).split("?")[0].slice(0, 120),
        mime_type: type.mime,
      }
      urlToRef[url] = `asset://${hash}`
      carried[type.kind] = (carried[type.kind] ?? 0) + 1
    } catch {
      skipped.push(url)
    }
  }

  /**
   * ANYTHING THAT COULD NOT TRAVEL IS CLEARED, NOT LEFT AS IT WAS.
   *
   * The old comment here said an export that silently loses a picture is
   * worse than one that keeps a link. That is true between two copies of the
   * SAME account and false the moment a package changes hands, which is what
   * a package is for: the kept link is this creator's bucket, and it makes
   * the importer's site depend on storage they do not own and cannot see.
   * Emptied, the section takes the branch it already has for a picture
   * nobody has chosen yet.
   */
  for (const url of skipped) urlToRef[url] = ""

  if (legacy) {
    const zip = new JSZip()
    const imagesFolder = zip.folder("images")!
    for (const [name, buf] of Object.entries(legacyImages)) imagesFolder.file(name, buf)
    const manifest: ThemePackageManifest = {
      format: CURRENT_THEME_PACKAGE_FORMAT,
      exported_at: new Date().toISOString(),
      install: { name: install.name, theme_id: install.theme_id, sort_order: install.sort_order },
      settings: rewriteMediaUrls(settings, imageMap) as Record<string, unknown>,
      pages: rewriteMediaUrls(exportPages, imageMap) as { page_key: string; sections: unknown }[],
      image_map: imageMap,
    }
    zip.file("manifest.json", JSON.stringify(manifest, null, 2))
    const legacyBlob = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
    return new NextResponse(legacyBlob as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeFilename(install.name)}.storelib-export.zip"`,
        "Cache-Control": "no-store",
      },
    })
  }

  const files: Record<string, string> = {}
  /* The menus (Website settings, Navigation) are in here too, under `menus`, and travel as they are. */
  files["config/settings.json"] = JSON.stringify(rewriteMediaUrls(settings, urlToRef), null, 2) + "\n"

  /**
   * The source files. A section this creator edited in the code editor is
   * their file; one they never touched is the theme's, and it travels so the
   * package stands on its own in an account whose bundled theme has moved on.
   */
  const { data: savedFiles } = await supabase
    .from("store_theme_custom_files")
    .select("path, content")
    .eq("install_id", installId)
  /**
   * Published content only, and only where there IS any. An export is what
   * the site is, so it takes `content`; a file created in the code editor
   * and not yet published has an empty one, and letting that through would
   * put an empty file in the package where the theme's own belongs.
   */
  const saved = new Map(
    (savedFiles ?? [])
      .filter(r => typeof r.content === "string" && (r.content as string).trim() !== "")
      .map(r => [r.path as string, r.content as string]),
  )
  for (const [path, content] of Object.entries(DEFAULT_THEME_SOURCES)) files[path] = saved.get(path) ?? content
  for (const [path, content] of saved) if (path.endsWith(".storelib") && !(path in files)) files[path] = content
  /* The theme's own Theme settings, when it has them (lib/storelib-theme/theme-config.ts): an import reads them back. */
  const ownSchema = saved.get(THEME_SCHEMA_FILE)
  if (ownSchema) files[THEME_SCHEMA_FILE] = ownSchema

  /**
   * THE PAGES, WITH THE HEADER ONCE. The Header and Footer groups go in
   * sections/header-group.json and sections/footer-group.json, as Shopify
   * keeps them, exactly as the creator has them: the built-in header with
   * its settings and blocks, or the header section file they wrote (which is
   * in sections/ above). Each template holds its page's own sections. A
   * site saved with two headers is exported with one drawn and the other
   * hidden (lib/website-builder/theme-pages.ts).
   */
  const kinds = kindLookup(files, SECTION_SCHEMAS as never)
  const pagesToPackage = exportPages.map((page) => ({
    page_key: page.page_key,
    sections: repairChrome(rewriteMediaUrls(Array.isArray(page.sections) ? page.sections : [], urlToRef) as SectionInstance[], kinds).sections,
  }))
  Object.assign(files, packageFilesFromPages(pagesToPackage))

  /*
    THE COVER TRAVELS WITH THE THEME. The newest photograph of this website,
    desktop and phone, goes in as two package assets and theme.json names
    them, so whoever imports it (the creator again, or somebody else) sees
    this website on the card from the first moment, not a drawing of a
    theme's sample shop. The import photographs the new website as well, so
    this picture is only ever the first one.

    ALWAYS, NOT WHEN THERE HAPPENS TO BE ONE. A site nobody had photographed
    yet (or whose newest picture is an older PNG capture, which a package
    does not carry) used to export with no cover, and its import showed a
    drawing until a photograph was taken. So one is taken here first. A
    photograph that fails leaves the package without one; the export itself
    never fails for a picture.
  */
  let cover = await packagedCover(user.id, installId)
  if (!cover.ref) {
    try {
      await takeCover({ installId, userId: user.id, creatorId: creator.id as string }, renderOrigin(_req.url), { force: true })
      cover = await packagedCover(user.id, installId)
    } catch (e) {
      console.error("[cover] export: could not take a cover to package:", e instanceof Error ? e.message : e)
    }
  }
  for (const c of cover.assets) assets[c.hash] = c.asset

  const pkg = await buildPackage({
    theme: {
      format: THEME_FORMAT,
      format_version: THEME_FORMAT_VERSION,
      name: install.name,
      version: "1.0.0",
      engine: { min: 1 },
      source_theme_id: install.theme_id ?? undefined,
      ...(cover.ref ? { cover: cover.ref } : {}),
    },
    files,
    assets,
  }, { generated_at: new Date().toISOString() })

  const blob = Buffer.from(pkg)
  /*
    ═══════════════════════════════════════════════════════════════════════
     IT ENDS IN .zip, BECAUSE IT IS ONE
    ═══════════════════════════════════════════════════════════════════════
    The body has always been a zip — the folder in docs/theme/01 with a
    manifest beside it — and it was called `<name>.storelib-theme`. An
    extension no operating system recognises means a double click does
    nothing, Safari helpfully appends `.zip` to it anyway, and somebody who
    wants to look inside their own theme has to rename the file first.

    `.storelib-theme.zip` says both things: every unzip tool on every system
    opens it, and the name still says which kind of zip it is. The importer
    already accepted `.zip`.
  */
  const filename = `${safeFilename(install.name)}.storelib-theme.zip`
  return new NextResponse(blob as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      /**
       * WHAT CAME WITH IT, and what did not.
       *
       * The body is a zip, so there is nowhere in it to say "your 90MB
       * video was left out". A download that quietly drops the one thing
       * somebody was checking for is the failure worth avoiding here.
       */
      "X-Storelib-Media": describeMedia(carried),
      "X-Storelib-Media-Bytes": String(mediaBytes),
      ...(skipped.length > 0 ? { "X-Storelib-Media-Skipped": String(skipped.length) } : {}),
    },
  })
}
