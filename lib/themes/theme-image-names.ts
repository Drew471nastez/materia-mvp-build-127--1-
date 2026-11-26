/**
 * ===========================================================================
 *  WHERE A TEMPLATE'S SEO PICTURES ARE, AND WHAT THEIR FILES ARE CALLED
 * ===========================================================================
 * Round 30 (the owner: "image alt text and file names"). Each code
 * template's pictures cut by scripts/build-theme-seo-images.mjs sit in a
 * folder named by its address, /themes/materia/seo/<slug>/, each file named
 * for what the template is and what it is called:
 *
 *   /themes/materia/seo/caps-tees/t-shirt-store-website-template-caps-and-tees-hero.webp
 *
 * The stem is lib/themes/theme-seo.ts themeImageStem (the primary keyword,
 * then the name). The script records the stem it wrote each template's
 * files under in ./theme-image-stems.json, and every page names files by
 * that record, so a page never points at a file that was not written; when
 * a keyword or a name changes, tests/theme-seo-r58.test.ts says the record
 * is out of date until the script has run again.
 *
 * Small on purpose: the builder's preview (theme-preview.tsx) reads it, and
 * the marketplace's whole copy deck (theme-seo.ts) stays out of that bundle.
 */
import { CODE_THEME_PACKAGE } from "./marketplace-shared"
import STEMS from "./theme-image-stems.json"

export const SEO_IMAGE_ROOT = `/themes/${CODE_THEME_PACKAGE}/seo`

export type ThemeImageKind = `card-${number}` | "hero" | "phone" | "og" | "scroll"

/** Lower case words joined by hyphens: what a file name or an address is made of. */
export function slugWords(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** The stem a template's pictures were last written under, or null before they have been. */
export function writtenImageStem(slug: string): string | null {
  return (STEMS as Record<string, string>)[slug] ?? null
}

export const themeImageDirOf = (slug: string) => `${SEO_IMAGE_ROOT}/${slug}`

export function themeImagePathOf(slug: string, kind: ThemeImageKind, stem: string | null = writtenImageStem(slug)): string {
  return `${themeImageDirOf(slug)}/${stem ?? slug}-${kind}.${kind === "og" ? "jpg" : "webp"}`
}
