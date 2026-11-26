/**
 * ===========================================================================
 *  AN IMPORTED THEME'S FILE ADDRESS CHANGES WHEN WHAT IT SERVES CHANGES
 * ===========================================================================
 * A theme's stylesheets and scripts are served at
 * `/api/site-theme/assets/<install>/<version>/<name>` and cached for a year
 * (app/api/site-theme/assets/[installId]/[version]/[...name]/route.ts). The
 * version was the install's `published_at`, which was wrong both ways:
 *
 *   A live theme setting saved without Publish leaves `published_at` where
 *   it was, so a `.css.liquid` file drawn with the settings kept its old
 *   colours in every visitor's cache for a year.
 *
 *   Every Publish moved every address, so a visitor downloaded every file
 *   again although none of them had changed.
 *
 * The version is now a hash of what the file's output is made from: its own
 * text, and for a file drawn with Liquid (`.liquid`, or `x.scss.css` from
 * `x.scss.liquid`) the theme's settings and the files such a render can read
 * (the other assets, whose addresses it prints, the locales and the config).
 * Same input, same address, so an unchanged file stays cached across
 * publishes; a changed setting moves only the files drawn with settings.
 *
 * A version of this shape starts with `h-`. A `published_at` version is
 * digits and letters only, and a draft one starts with `draft` or is
 * `edit`, so the three never meet and the route still answers the old
 * addresses that cached pages may name.
 *
 * Server only (node:crypto). Pure apart from a bounded memo, so the tests
 * run it directly (tests/publishing-cache.test.ts).
 */
import { createHash } from "node:crypto"
import { themeJsFixMark } from "./js-fixes"

/**
 * Raised when what the route does to a file changes (css-fixes.ts, the SCSS
 * compiler, themeAsset in site.ts), so files already cached for a year under
 * the old output get new addresses on the next deploy.
 */
export const ASSET_RENDER_SALT = "1"

const PREFIX = "h-"
const CONTENT_VERSION = /^h-[0-9a-f]{16}$/

/** True for an address version made by `assetVersion`, rather than a `published_at` or a draft one. */
export function isContentVersion(version: string): boolean {
  return CONTENT_VERSION.test(version)
}

/*
  Hashed once per text: a theme's files are the same strings from one page
  to the next (compat-site.ts holds them). Bounded by the characters it
  keeps alive, not the count, since one file can be a megabyte.
*/
const memo = new Map<string, string>()
const MEMO_CHARS = 16_000_000
let memoChars = 0

/** sha256 of a text, hex. */
export function textHash(text: string): string {
  const hit = memo.get(text)
  if (hit !== undefined) return hit
  const h = createHash("sha256").update(text).digest("hex")
  if (text.length > MEMO_CHARS / 8) return h
  while (memoChars + text.length > MEMO_CHARS && memo.size) {
    const oldest = memo.keys().next().value as string
    memo.delete(oldest)
    memoChars -= oldest.length
  }
  memo.set(text, h)
  memoChars += text.length
  return h
}

/** The theme settings, as one hash. */
export function settingsDigest(settings: unknown): string {
  return textHash(JSON.stringify(settings ?? {}) ?? "")
}

/* What a Liquid file's render can read besides its own text and the settings: other assets (their addresses), locales (`t`), config (setting defaults, the asset map). */
const RENDER_READS = /^shopify\/(assets|locales|config)\//

/** One hash of every file a Liquid asset's render can read. Computed once per theme (compat-site.ts). */
export function themeDigest(rows: Record<string, string>): string {
  const parts: string[] = []
  for (const path of Object.keys(rows).sort()) if (RENDER_READS.test(path)) parts.push(`${path}\0${textHash(rows[path])}`)
  return textHash(parts.join("\n"))
}

/**
 * The text a served file is drawn from, and whether Liquid draws it, in the
 * order the route and themeAsset (lib/storelib-theme/compat/site.ts) look.
 */
export function assetSource(rows: Record<string, string>, name: string): { text: string; liquid: boolean } | null {
  const plain = rows[`shopify/assets/${name}`]
  if (typeof plain === "string" && plain !== "") return { text: plain, liquid: false }
  const scss = name.match(/^(.+\.scss)\.css$/)?.[1]
  if (scss) {
    const s = rows[`shopify/assets/${scss}.liquid`] ?? rows[`shopify/assets/${scss}`]
    if (typeof s === "string") return { text: s, liquid: true }
  }
  const liquid = rows[`shopify/assets/${name}.liquid`]
  if (typeof liquid === "string") return { text: liquid, liquid: true }
  return null
}

/** The version of a plain file's address: its text alone. */
export function plainAssetVersion(text: string): string {
  /* A script js-fixes.ts mends is a different file from the one first served at its old address, which browsers keep for a year: a new address for it alone (round 65). */
  return PREFIX + textHash(`${ASSET_RENDER_SALT}\0plain\0${textHash(text)}${themeJsFixMark(text)}`).slice(0, 16)
}

/**
 * The version of `name`'s address, or null when the install has no such
 * file. `digest` is the theme's themeDigest, passed lazily so a theme whose
 * pages name no Liquid asset never computes it.
 */
export function assetVersion(rows: Record<string, string>, name: string, settings: unknown, digest: () => string = () => themeDigest(rows)): string | null {
  const source = assetSource(rows, name)
  if (!source) return null
  if (!source.liquid) return plainAssetVersion(source.text)
  return PREFIX + textHash(`${ASSET_RENDER_SALT}\0liquid\0${textHash(source.text)}\0${settingsDigest(settings)}\0${digest()}`).slice(0, 16)
}
