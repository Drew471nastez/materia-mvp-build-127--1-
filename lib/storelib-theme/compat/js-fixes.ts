/**
 * ===========================================================================
 *  TWO MATERIA SCRIPTS THAT DOWNLOADED WHAT THE PAGE ALREADY HAD (round 65)
 * ===========================================================================
 * A website keeps the theme files it was installed with, so a fix to
 * theme-packages/materia reaches it only when its owner takes a theme
 * release. These two cost every visitor of every installed Materia website
 * on every page view, so the fix is also made where an installed theme's
 * script is served (the asset route), the way css-fixes.ts mends a theme's
 * stylesheets. Each is one exact piece of the script as Materia shipped it;
 * a script that does not contain it (a newer Materia, a merchant's edit,
 * any other theme) is served exactly as it is.
 *
 *  hero-image-one.js  The hero's hidden <video> was given the hero photo as
 *                     its poster when the section had no video at all, so
 *                     the browser downloaded the photo's original file a
 *                     second time beside the sized one the page shows
 *                     (liam-bailey.storelib.com: 1.9MB on the front page).
 *                     The photo is now its poster only when there is a video.
 *  product-counters.js A product page fetched itself in full (480KB of HTML)
 *                     right after it loaded, to read the sold count it was
 *                     just drawn with. The page's own count is read from the
 *                     page; the minute's refresh still asks the server.
 */

interface JsFix {
  file: string
  find: string
  replace: string
}

export const THEME_JS_FIXES: readonly JsFix[] = [
  {
    file: "hero-image-one.js",
    find: "const posterPic=url(s.video_poster,true)||photo;",
    replace: "const posterPic=url(s.video_poster,true)||(videoURL?photo:'');",
  },
  {
    file: "product-counters.js",
    find: "const id=root.dataset.productCounterId,key=url.href;let entry=cache.get(key);",
    replace:
      "const id=root.dataset.productCounterId,key=url.href;let entry=cache.get(key);if(!entry&&url.pathname===location.pathname){entry={time:Date.now(),promise:Promise.resolve(document)};cache.set(key,entry);}",
  },
]

/** The script as it is served: an installed Materia script with the fixes above, any other exactly as it came. */
export function fixThemeJs(name: string, text: string): string {
  const file = name.split("/").pop() ?? name
  let out = text
  for (const fix of THEME_JS_FIXES) {
    if (fix.file !== file) continue
    const at = out.indexOf(fix.find)
    /* Exactly once, or not at all: a script that says it twice is not the one this was written for. */
    if (at < 0 || out.indexOf(fix.find, at + 1) >= 0) continue
    out = out.slice(0, at) + fix.replace + out.slice(at + fix.find.length)
  }
  return out
}

/**
 * What a plain file's address version adds when a fix above applies to it
 * (asset-version.ts plainAssetVersion), so the mended script is fetched anew
 * instead of the copy a browser holds for a year. Empty for every other file,
 * whose address stays exactly as it was.
 */
export function themeJsFixMark(text: string): string {
  for (const fix of THEME_JS_FIXES) if (text.includes(fix.find)) return "\0js-fix-r65"
  return ""
}
