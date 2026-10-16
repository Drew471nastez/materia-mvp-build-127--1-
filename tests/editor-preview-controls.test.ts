/**
 * ===========================================================================
 *  THE EDITOR'S PREVIEW LANGUAGE AND CURRENCY, FROM WEBSITE SETTINGS
 * ===========================================================================
 * Website settings › General has a Preview card: the canvas's language and
 * currency, switched with the same state and setters the theme's own
 * selectors on the page use, so the two agree both ways. One language and
 * one currency is one line, to Settings › Languages & Currency.
 *
 * With the canvas in another language, a section's or a block's panel says
 * so in one quiet line, its fields still in the original, with Edit
 * translation opening that language's sheet (?translate=).
 */
import { readFileSync } from "node:fs"
import { translationHref } from "@/components/website-builder/editor/preview-language-note"
import { previewControlsOf } from "@/components/website-builder/preview-controls"
import { stripComments } from "./_source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => stripComments(readFileSync(p, "utf8"))

const editor = code("app/website-builder/editor/[installId]/page.tsx")
const general = code("components/website-builder/website-settings/general.tsx")
const settings = code("components/website-builder/project-settings.tsx")
const panel = code("components/app/settings/markets-panel.tsx")
const note = code("components/website-builder/editor/preview-language-note.tsx")

console.log("\nGeneral › Preview")
check("drawn under Languages and currencies, from ctx.preview", /<LocalizationCard ctx=\{ctx\} fallbackLanguage=\{language\} \/>\s*<PreviewCard ctx=\{ctx\} \/>/.test(general) && /const p = ctx\.preview/.test(general))
check("nothing until both answers are in (not a flash of one line)", /if \(!p \|\| !p\.ready\) return null/.test(general))
check("one language and one currency: one line to Languages & Currency", /p\.languages\.length < 2 && p\.currencies\.length < 2/.test(general) && /ctx\.onNavigate\("\/app\/settings\?tab=markets"\)/.test(general) && /tt\("Add languages and currencies"\)/.test(general))
check("Language lists every language and says which are not published", /id="wb-preview-language" value=\{p\.locale\} onChange=\{\(e\) => p\.setLocale\(e\.target\.value\)\}/.test(general) && /tt\(" · Not published"\)/.test(general))
check("Currency lists the store currency and each market", /id="wb-preview-currency" value=\{p\.market\} onChange=\{\(e\) => p\.setMarket\(e\.target\.value\)\}/.test(general) && /tt\("Store currency"\)/.test(general))
check("each control only when there is something to pick", /p\.languages\.length > 1 &&/.test(general) && /p\.currencies\.length > 1 &&/.test(general))
check("drawn with the page's own select, not a new one", /className=\{inputClass\}/.test(general))
check("Website settings hands it on", /preview,\n\s*\}/.test(settings) && /preview\?: PreviewControls/.test(settings))

console.log("\nThe same state as the theme's selectors")
check("the editor passes it to Website settings", /preview=\{previewControls\}/.test(editor))
check("Language calls the setter the theme's selector calls", /setLocale: setPreviewLocale,/.test(editor) && /language: \(code: string\) => setPreviewLocale\(code\)/.test(editor))
check("Currency calls the one the theme's currency selector calls", /pickMarket: pickPreviewMarket,/.test(editor) && /currency: \(id: string\) => pickPreviewMarket\(id === "home" \? null : id\)/.test(editor))
check("from the canvas's own state and the markets the theme lists", /locale: previewLang\.locale,/.test(editor) && /marketId: previewMarket\.marketId,/.test(editor) && /options: marketOptions,/.test(editor))
{
  const calls: string[] = []
  const market = { id: "eu", name: "Europe", currency: "EUR", countries: ["FR", "DE"], rounding: "none" as never, adjustBps: 0 }
  const base = { ready: true, defaultLanguage: "en", languages: ["fr", "en", "es"], published: ["fr"], base: "USD", options: [market], setLocale: (c: string | null) => calls.push(`lang ${c}`), pickMarket: (id: string | null) => calls.push(`market ${id}`) }
  const c = previewControlsOf({ ...base, locale: null, marketId: null })
  check("the default language first, then the rest, each saying if it is published", JSON.stringify(c.languages) === JSON.stringify([{ code: "en", published: true }, { code: "fr", published: true }, { code: "es", published: false }]), c.languages)
  check("nothing picked: the default and the store currency are selected", c.locale === "en" && c.market === "home")
  check("the store currency first, then each market", JSON.stringify(c.currencies) === JSON.stringify([{ id: "home", currency: "USD", name: "" }, { id: "eu", currency: "EUR", name: "Europe" }]), c.currencies)
  const picked = previewControlsOf({ ...base, locale: "es", marketId: "eu" })
  check("picked on the page: selected here", picked.locale === "es" && picked.market === "eu")
  picked.setLocale("fr")
  picked.setMarket("home")
  picked.setMarket("eu")
  check("picked here: the same setters, the store currency as null", JSON.stringify(calls) === JSON.stringify(["lang fr", "market null", "market eu"]), calls)
  const single = previewControlsOf({ ...base, languages: [], published: [], options: [], locale: null, marketId: null })
  check("one language and one currency: one of each, so General draws one line", single.languages.length === 1 && single.currencies.length === 1)
}
check("both hooks say when their first answer is in", /finally \{\s*setReady\(true\)\s*\}/.test(code("components/website-builder/use-preview-language.ts")) && /finally \{\s*setReady\(true\)\s*\}/.test(code("components/website-builder/use-preview-market.ts")))

console.log("\nThe panel in another language")
check("the section's panel and the block's panel say so at the top", (editor.match(/<PreviewLanguageNote locale=\{previewLang\.locale\} onEdit=\{requestExit\} \/>/g) ?? []).length === 2)
check("only while another language is drawn", /if \(!locale\) return null/.test(note))
check("in one line, with Edit translation", /tt\("Showing \{language\}\. Fields show your original text\.", \{ language: languageName\(locale, activeLocale\(\)\) \}\)/.test(note) && /tt\("Edit translation"\)/.test(note))
check("Edit translation goes to that language's sheet", translationHref("es") === "/app/settings?tab=markets&translate=es" && translationHref("pt-BR") === "/app/settings?tab=markets&translate=pt-BR")
check("Languages & Currency opens it from the address, once", /url\.searchParams\.get\("translate"\)/.test(panel) && /url\.searchParams\.delete\("translate"\)/.test(panel) && /setTranslating\(code\)\n\s*\}, \[draft\]\)/.test(panel))
check("a language the website does not have opens nothing", /code !== draft\.defaultLanguage && !draft\.languages\.some\(\(l\) => l\.code === code\)/.test(panel))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
