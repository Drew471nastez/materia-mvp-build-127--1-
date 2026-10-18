/**
 * Round 25 in the website builder.
 *
 *   THE PICTURE FIELD. A picture that cannot be loaded is one muted 13px
 *   line beside a thumbnail with a broken picture mark, not a sentence in
 *   the text colour. An imported theme's picture saved as its old store's
 *   address (shopify://shop_images/favicon.png, the favicon that "could not
 *   be loaded") is read through the theme's asset map, as the live site
 *   reads it: shown when the theme brought it, said at once when it did not.
 *
 *   THE COLOUR SCHEME FIELD. One row as tall as the sidebar's selects, the
 *   chosen scheme's swatch and name, opening a list one scheme a line, the
 *   way the font field opens; not twelve cards two to a row.
 *
 *   A PAGE SWITCH. Each page's sections kept once read (on a hover, at idle,
 *   the page left), forgotten when anything else writes a page; the header
 *   and footer from the page on screen; the save of the page left beside
 *   the read of the next; a save's three writes together. An imported
 *   theme's page left kept loaded, and the page under the pointer drawn
 *   ahead, so going to it loads nothing.
 *
 * The browser half (switch times on both kinds of theme at 1440 and at 390
 * with the CPU slowed, the theme's files asked for per switch, the fields
 * measured and photographed) is scripts/check-builder25.ts.
 *
 *   npx tsx tests/builder25.test.ts
 */
import { readFileSync } from "node:fs"
import { isLoadableAddress, pictureAddress, shopImageName } from "../lib/website-builder/picture-address"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(p, "utf8")

function main() {
  console.log("\nAn imported theme's picture, by its old store's address (lib/website-builder/picture-address.ts)\n")
  {
    check("the name is read out of the address, decoded", shopImageName("shopify://shop_images/fav%20icon.png?v=2") === "fav icon.png" && shopImageName("https://x.com/a.png") === null && shopImageName("") === null)
    const media = { "logo.png": "https://storelib.com/media/store-builder-images/u/imported/abc.png" }
    check("one the theme brought is drawn from its own copy", pictureAddress("shopify://shop_images/logo.png", media) === media["logo.png"])
    check("one it did not stays as it is, which the field reads as missing", pictureAddress("shopify://shop_images/favicon.png", media) === "shopify://shop_images/favicon.png" && !isLoadableAddress("shopify://shop_images/favicon.png"))
    check("any other value is drawn as it is", pictureAddress("https://cdn.example.com/a.png", media) === "https://cdn.example.com/a.png" && pictureAddress("/media/x.png", null) === "/media/x.png" && pictureAddress("//cdn.example.com/a.png") === "//cdn.example.com/a.png")
    check("an address a picture can be loaded from: http(s), scheme-less, a path, a picture in hand", ["https://a.b/c.png", "http://localhost:3000/c.png", "//a.b/c.png", "/media/c.png", "data:image/png;base64,AA", "blob:https://a.b/1"].every(isLoadableAddress) && !isLoadableAddress("javascript:alert(1)") && !isLoadableAddress("logo.png"))
    check("a map entry that is no address is not used", pictureAddress("shopify://shop_images/x.png", { "x.png": "javascript:1" }) === "shopify://shop_images/x.png")
  }

  console.log("\nThe picture field (components/website-builder/editor/image-picker.tsx)\n")
  {
    const picker = read("components/website-builder/editor/image-picker.tsx")
    check("an address no picture can be loaded from is missing at once, not after a try and a retry", /const unloadable = url !== null && !isLoadableAddress\(url\)/.test(picker) && /const broken = tries > 1 \|\| unloadable/.test(picker))
    check("the failed line is one muted 13px line, not medium weight in the text colour", /data-wb-image-problem="" title=\{brokenHelp\} className="line-clamp-2 pl-2 text-\[13px\] leading-\[18px\] text-muted-foreground">\{brokenLine\}/.test(picker) && !/text-\[12\.5px\] font-medium text-foreground">This picture could not be loaded/.test(picker))
    check("  beside a thumbnail with a broken picture mark", /data-wb-image-layer="missing"[^>]*>\s*<ImageOff/.test(picker) && /import \{[^}]*ImageOff[^}]*\} from "lucide-react"/.test(picker))
    check("  in a few words, the reason under the pointer", /const brokenLine = fromOldStore \? "Upload it again" : "Couldn't load it"/.test(picker) && /This picture was in the old store's files, which a theme does not bring\. Upload it again\./.test(picker))
    check("Website settings' box says it the same way", /<span data-wb-image-problem="" className="truncate text-\[13px\] leading-\[18px\] text-muted-foreground">\{fromOldStore \? brokenLine : "Couldn't load this picture"\}<\/span>/.test(picker))
    const control = read("components/website-builder/editor/controls/image-picker-control.tsx")
    check("the setting's field draws the picture from the theme's own copy, the saved value unchanged", /const drawn = shown \? pictureAddress\(shown, env\?\.pictureMedia\) : ""/.test(control) && /<WbImagePicker value=\{drawn \|\| undefined\} onChange=\{\(next\) => commit\(next \?\? ""\)\}/.test(control))
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("the editor hands the field an imported theme's asset map", /setCompatMedia\(assetAddresses\(files\)\)/.test(editor) && /pictureMedia: compatInstall \? compatMedia : null,/.test(editor))
    const canvas = read("components/website-builder/compat/compat-canvas.tsx")
    check("and the canvas draws such a picture from it, as the live site does", /imageUrl: \(v\) => \(\/\^https\?:\\\/\\\/\/\.test\(v\) \|\| v\.startsWith\("\/"\) \? v : media\[shopImageName\(v\) \?\? ""\] \?\? ""\)/.test(canvas))
  }

  console.log("\nThe colour scheme field (components/website-builder/editor/controls/color-scheme-control.tsx)\n")
  {
    const schemes = read("components/website-builder/editor/controls/color-scheme-control.tsx")
    check("no cards two to a row", !/grid-cols-2/.test(schemes) && !/role="radiogroup"/.test(schemes))
    check("one row as tall as the sidebar's selects: swatch, name, chevron", /data-scheme-field=""/.test(schemes) && /* Changed on purpose (round AJ: Edit inside the field, the chevron when there is no Edit) */ /"flex h-9 w-full items-center gap-2 rounded-md border border-border bg-background/.test(schemes) && /<Swatch scheme=\{chosen\} \/>/.test(schemes) && /<ChevronDown/.test(schemes))
    check("the list opens the way the font field's does: from the field at a computer, the sheet on a phone", /<FieldPopover\s*\n\s*float/.test(schemes) && /role="listbox"/.test(schemes) && /role="option"/.test(schemes) && /data-scheme-row=\{i\}/.test(schemes))
    check("  one scheme a line, the chosen one ticked, arrows and Enter", /flex h-10 cursor-pointer items-center gap-2\.5 rounded-lg px-1\.5/.test(schemes) && /\{on \? <Check/.test(schemes) && /e\.key === "ArrowDown" \|\| e\.key === "ArrowUp"/.test(schemes))
    check("a swatch is the scheme's background, Aa in its text colour, a dot of its button", /style=\{\{ background: scheme\.background, color: scheme\.text \}\}/.test(schemes) && /style=\{\{ background: scheme\.accent \}\}/.test(schemes))
    check("Storelib's own themes keep their select", /* Changed on purpose (checkout, currency and translation overhaul): Storelib's themes list their own schemes in the same field, with Edit. */ /nativeSchemes\(env\?\.themeSettings \?\? null\)/.test(schemes) && /<SchemeSelect list=\{schemes\}/.test(schemes))
  }

  console.log("\nA page switch (editor/[installId]/page.tsx)\n")
  {
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("each page is kept once read, a built one a moment only", /const PAGE_AHEAD_MS = 10 \* 60_000/.test(editor) && /const GENERATED_AHEAD_MS = 15_000/.test(editor) && /if \(data\.generated === true\) generatedPages\.current\.add\(page\)/.test(editor))
    check("  a switch opens from what was kept, a copy, and the reload button reads afresh", /return had\.then\(\(list\) => structuredClone\(list\), \(\) => fetchPageSections\(page\)\)/.test(editor) && /pageSectionsNow\(page, page === leaving\),/.test(editor))
    check("  the page left is kept as it stands once its save landed", /if \(page !== leaving\) keepPageLeft\(leaving, leavingSections, savedOk, leavingDirty\)/.test(editor) && /if \(!saved\) \{ pageCache\.current\.delete\(page\); return \}/.test(editor))
    check("  forgotten when anything else writes a page", /if \(events\.length > 0\) forgetPage\(\)/.test(editor) && /forgetPage\(pageKey\)\s*\n\s*setCustomPages\(prev => \[\.\.\.prev, newPage\]\)/.test(editor) && /setUnpublished\(true\)\s*\n\s*forgetPage\(key\)/.test(editor) && /Kept as it was left \(pageCache\)[^\n]*\n\s*forgetPage\(key\)/.test(editor))
    check("read ahead on a row's hover and at idle, the stored pages, a few", /onIntent=\{pageIntent\}/.test(editor) && (editor.match(/onIntent=\{pageIntent\}/g) ?? []).length === 2 && /const READ_AHEAD_PAGES = 6/.test(editor) && /requestIdleCallback\(run, \{ timeout: 4000 \}\)/.test(editor) && /conn\?\.saveData/.test(editor))
    const list = read("components/website-builder/page-switcher.tsx")
    check("  the page list says which row the pointer rests on (a mouse, or the keyboard)", /onPointerEnter=\{onIntent && !active \? \(e\) => \{ if \(e\.pointerType === "mouse"\) onIntent\(p\.key\) \} : undefined\}/.test(list) && /onIntent=\{onIntent\}/.test(list))
    check("the header and footer from the page on screen, not home read again", /const siteChrome = siteChromeOf\(leaving, leavingSections\)/.test(editor) && /siteChrome\s*\n\s*\? Promise\.resolve\(siteChrome\)/.test(editor) && /mergeWithHomeHeaderFooter\(loaded, siteChrome \?\? \(page !== "home" \? homeHF : chromeOf\(loaded\)\)\)/.test(editor))
    check("  a group deleted here is an empty group on the next page", /\.\.\.\(gone\.header && !c\.headerGroup \? \{ headerGroup: \[\] \} : \{\}\)/.test(editor))
    check("the save of the page left and the read of the next go together", /const saved: Promise<boolean> = leavingDirty \? saveDraft\(\{ quiet: true \}\) : Promise\.resolve\(true\)/.test(editor) && /const \[loaded, homeHF, savedOk\] = await Promise\.all\(\[/.test(editor) && !/if \(isDirty && !saving && !publishing\) \{\s*await saveDraft\(\{ quiet: true \}\)\s*\}\s*switchingPage\.current = true/.test(editor))
    check("a save's three writes go together", /const \[settingsRes, sectionsRes\] = await Promise\.all\(\[\s*putJsonWithRetry\(`\/api\/website-builder\/themes\/\$\{installId\}\/settings`[\s\S]{0,300}syncHeaderFooterToAllPages\("draft"\),\s*\]\)/.test(editor) && !/await syncHeaderFooterToAllPages\("draft"\)/.test(editor))
    check("an imported theme's page under the pointer is drawn ahead, at a computer, with the sections a press opens it with", /const warmCompatPage = useCallback/.test(editor) && /window\.innerWidth < 768\) return/.test(editor) && /mergeWithHomeHeaderFooter\(copy, chrome\)/.test(editor) && /warm=\{compatWarm\}/.test(editor))
  }

  console.log("\nKept pages (components/website-builder/compat/compat-canvas.tsx)\n")
  {
    const canvas = read("components/website-builder/compat/compat-canvas.tsx")
    check("the page left is kept, loaded, a few of them", /const KEEP_PAGES = 3/.test(canvas) && /const KEEP_PAGES_PHONE = 2/.test(canvas) && /if \(list\[0\]\.key !== list\[at\]\.key && !list\[0\]\.account && list\[0\]\.ready\) \{\s*list\[0\]\.stamp = stampRef\.current\s*keep\(list\[0\]\)/.test(canvas))
    check("going to a kept page brings it forward, nothing drawn or loaded", /if \(front\(\) && front\(\)!\.key !== docKey && !accountPath && slotsRef\.current\[1\]\?\.key !== docKey && bringKept\(docKey, list\)\) return/.test(canvas))
    check("  only one exactly as a draw would give it now", /x\.key === key && x\.stamp === stampRef\.current && holds\(x, list\)/.test(canvas) && /const stamp = `\$\{themeId\(compatTheme\)\}\|\$\{dataKey\}\|\$\{stockKey\}\|\$\{props\.siteUrl \?\? ""\}`/.test(canvas) && /prev\.some\(\(x\) => x\.stamp !== stamp\) \? prev\.filter\(\(x\) => x\.stamp === stamp\)/.test(canvas))
    check("  put at its top and settled before it comes forward, the page left fading off it", /if \(hit\.loaded\) win\?\.postMessage\(\{ storelib: 1, type: "scroll", top: 0, settle: true \}, "\*"\)/.test(canvas) && /window\.setTimeout\(\(\) => promote\(hit\.n\), BEHIND_CAP_MS\)/.test(canvas))
    check("a kept page hears only its own answers, and is out of sight once shown", /A kept page \(KEPT PAGES\): what it says about itself is noted, its requests answered, and nothing else of it is heard\./.test(canvas) && /role === "kept" \? KEPT_STYLE/.test(canvas))
    check("a page drawn ahead, in the language previewed, never a product page or the one in front", /warm\.pageKey === pageKey \|\| warm\.pageKey === "product"\) return/.test(canvas) && /const list = fields && map \? \(localizeSections\(warm\.sections/.test(canvas) && /html = draw\(list, pageFor\(warm\.pageKey, null\)\)/.test(canvas))
    check("a section of the same id on the next page is never swapped into the page being left", /if \(slot\.key !== docKey\) return/.test(canvas))
  }

  console.log("\nThe probe\n")
  {
    const probe = read("scripts/check-builder25.ts")
    check("times switches on both kinds of theme and counts the theme's files asked for", /const DAWN_CSS = Number\(process\.env\.DAWN_CSS \?\? 14\)/.test(probe) && /files\.push\(s\.assets\.length - before\)/.test(probe) && /Emulation\.setCPUThrottlingRate", \{ rate: 4 \}/.test(probe))
    check("measures the fields' line and the scheme list in a browser", /size === "13px"/.test(probe) && /one scheme a line/.test(probe) && /render-builder25\.tsx/.test(probe))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}
main()
