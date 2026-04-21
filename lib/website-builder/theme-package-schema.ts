// ============================================================
// Theme package schema — the zip-exchange format
// ------------------------------------------------------------
// The website-builder has a working export/import flow that
// ships a .storelib-export.zip containing a manifest.json and
// an `images/` folder. Historically the manifest was parsed
// with hand-written type casts which meant malformed zips
// would silently create broken installs.
//
// This module defines a single Zod schema for the manifest,
// plus typed helpers that the API routes and any future
// tooling can share. The schema is BACK-COMPATIBLE with the
// existing `storelib-theme/v1` format (nothing to migrate) and
// forward-compatible with an optional `theme_pack` section
// that Stage 3 uses to ship schema packs alongside a store's
// own content.
// ============================================================

import { z } from "zod"

// ── Constants ─────────────────────────────────────────────────
export const THEME_PACKAGE_FORMATS = ["storelib-theme/v1", "storelib-theme/v2"] as const
export type ThemePackageFormat = (typeof THEME_PACKAGE_FORMATS)[number]

// v2 is a superset of v1 that adds the optional `theme_pack`
// section. v1 zips continue to import unchanged.
export const CURRENT_THEME_PACKAGE_FORMAT: ThemePackageFormat = "storelib-theme/v2"

// Per-image byte cap inside the zip. Total zip limit is enforced
// by the API route at 50 MB; this is a per-file safety belt so a
// single massive image can't dominate the upload.
export const MAX_IMAGE_BYTES_IN_ZIP = 15 * 1024 * 1024 // 15 MB

// Extensions we'll rewrite + re-upload from the `images/` folder.
// Anything else in the folder is ignored.
export const ALLOWED_IMAGE_EXTENSIONS = [
  "jpg", "jpeg", "png", "gif", "webp", "svg", "avif",
] as const

// ── Zod schemas ───────────────────────────────────────────────

// Install row — just the installer-level metadata; everything
// else (settings, pages) is stored in sibling tables.
const installSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  theme_id: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
}).passthrough()

// One page row — `sections` is an opaque JSON array by design;
// the renderer validates section shapes at render time, not at
// import time, so creators who hand-edit the export JSON don't
// get blocked by over-eager validation.
const pageSchema = z.object({
  page_key: z.string().min(1).max(80),
  sections: z.unknown(),
}).passthrough()

// Optional theme pack block (v2+). Mirrors the on-disk
// themes/default/ layout exactly:
//   { manifest: {…}, sections: { header: {…}, hero: {…} } }
// A pack ONLY needs to contain the sections it wants to override
// — any missing section falls back to the built-in default.
const themePackSchema = z.object({
  manifest: z.record(z.unknown()).optional(),
  sections: z.record(z.unknown()).optional(),
}).optional()

// The top-level manifest.json schema. `passthrough` is used on
// nested records so future-version fields don't break older
// code reading the same file.
export const themePackageManifestSchema = z.object({
  format: z.enum(THEME_PACKAGE_FORMATS),
  exported_at: z.string().optional(),
  install: installSchema.optional(),
  settings: z.record(z.unknown()).optional(),
  pages: z.array(pageSchema).optional(),
  image_map: z.record(z.string()).optional(),
  theme_pack: themePackSchema,
})

export type ThemePackageManifest = z.infer<typeof themePackageManifestSchema>

// ── Helpers ───────────────────────────────────────────────────

/** Parse + validate a manifest.json string. Returns a Result so
 *  API routes can branch cleanly on failure without throwing. */
export function parseThemePackageManifest(
  raw: string,
): { ok: true; manifest: ThemePackageManifest } | { ok: false; error: string } {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, error: "Could not parse manifest.json (invalid JSON)" }
  }
  const parsed = themePackageManifestSchema.safeParse(json)
  if (!parsed.success) {
    // Take the first validation issue only — the rest tend to be
    // cascades from the same root problem and just add noise.
    const first = parsed.error.issues[0]
    const path = first.path.length ? first.path.join(".") : "(root)"
    return { ok: false, error: `Invalid manifest.json at ${path}: ${first.message}` }
  }
  return { ok: true, manifest: parsed.data }
}

/** Predicate used by export routes to decide whether to write
 *  the theme_pack block (i.e. only when the install actually
 *  has custom schemas to ship). */
export function hasThemePackContent(pack: ThemePackageManifest["theme_pack"]): boolean {
  if (!pack) return false
  if (pack.manifest && Object.keys(pack.manifest).length > 0) return true
  if (pack.sections && Object.keys(pack.sections).length > 0) return true
  return false
}
