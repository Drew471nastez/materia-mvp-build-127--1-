/**
 * ===========================================================================
 *  AN OLDER THEME'S SCSS, COMPILED AS SHOPIFY COMPILED IT
 * ===========================================================================
 * Themes written before 2021 (Timber, Debut, Brooklyn, Minimal, Supply and
 * the many built on them) keep their stylesheet as `assets/theme.scss.liquid`
 * and link it as `theme.scss.css`: Shopify filled in the Liquid, compiled the
 * SCSS on its own servers and served CSS. Served as written, a browser reads
 * none of it and the whole theme, header first, draws unstyled.
 *
 * Here the Liquid is filled in by the site (lib/storelib-theme/compat/site.ts
 * themeAsset) and the SCSS compiled by Dart Sass. Server code only: the
 * asset route hands this to themeAsset, so no page ever loads the compiler.
 * A stylesheet that does not compile is served as written, with the reason
 * in a comment at the top, rather than not at all.
 */
import { compileString, Logger } from "sass"

const cache = new Map<string, string>()
const CACHE_MAX = 64

export function compileScss(source: string): string {
  const hit = cache.get(source)
  if (hit !== undefined) return hit
  let css: string
  try {
    css = compileString(source, { syntax: "scss", style: "compressed", logger: Logger.silent }).css
  } catch (e) {
    const why = String((e as Error).message ?? e).split("\n")[0].replace(/\*\//g, "* /").slice(0, 300)
    css = `/* This stylesheet could not be compiled: ${why} */\n${source}`
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(source, css)
  return css
}
