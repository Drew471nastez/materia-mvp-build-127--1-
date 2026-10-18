/**
 * Website translations done safely (round K3): what wins (the merchant's
 * own, then Storelib AI's, then the original), what a change to the
 * original does to each, translation memory, the glossary and Don't
 * translate, the theme editor's sidebar writing one language's text, and
 * the language and currency switch in the builder.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { aiMayWrite, isWordsField, localizeSections, needsReview, reusableTranslations, sourceHash, translatablesOf, translationMap, valueFor, type TranslationRow } from "@/lib/markets/translate"
import { applyGlossary, fieldTranslationState, isExcluded, protectedTerms, rulesFrom, validateRules, type TranslationRules } from "@/lib/markets/translation-rules"
import { cut, join as joinParts, wordsOf } from "@/lib/markets/translate-segments"
import { draftReusing } from "@/lib/markets/translate-ai"
import { saveTranslationRules } from "@/lib/markets/server"
import type { SchemaField, SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const row = (key: string, value: string, source: string, extra: Partial<TranslationRow> = {}): TranslationRow => ({ key, value, sourceHash: sourceHash(source), status: "approved", source: "manual", ...extra })
const state = (r: TranslationRow | undefined, source: string, excluded = false) => fieldTranslationState(r ? { value: r.value, sourceHash: r.sourceHash, source: r.source } : null, sourceHash(source), excluded)

async function main() {
  console.log("\nWhat wins: the merchant's own, then Storelib AI's, then the original")
  const fields: SchemaField[] = [
    { id: "heading", type: "text", label: "Heading" },
    { id: "body", type: "textarea", label: "Body" },
    { id: "cta", type: "text", label: "Button" },
    { id: "bg_gradient", type: "text", label: "Background gradient" },
  ] as SchemaField[]
  const sections = [{ id: "s1", type: "hero", settings: { heading: "Hello", body: "Our story", cta: "Shop now", bg_gradient: "linear-gradient(90deg, #fff, #000)" } }] as unknown as SectionInstance[]
  const fieldsOf = () => fields
  const ro = translationMap([row("section:s1:heading", "Salut", "Hello"), row("section:s1:body", "Povestea noastră", "Our story", { source: "ai" })])
  const drawn = localizeSections(sections, ro, fieldsOf, () => undefined, { approvedOnly: true, fresh: true })[0].settings as Record<string, unknown>
  check("manual shows", drawn.heading === "Salut")
  check("machine shows where there is no manual one", drawn.body === "Povestea noastră")
  check("nothing written: the original shows", drawn.cta === "Shop now")
  check("a gradient typed into a text box is not words: never listed, never laid over", drawn.bg_gradient === "linear-gradient(90deg, #fff, #000)" && !translatablesOf(sections, fieldsOf, () => undefined).some((t) => t.key === "section:s1:bg_gradient") && !isWordsField(fields[3]) && isWordsField(fields[0]))

  console.log("\nThe creator edits English (the original)")
  const aiRow = row("section:s1:body", "Povestea noastră", "Our story", { source: "ai" })
  const mine = row("section:s1:heading", "Salut", "Hello")
  check("Storelib AI's of that text may be written again, only that text", aiMayWrite(aiRow, "Our long story") && !aiMayWrite(aiRow, "Our story"))
  check("until then the new original shows, not a stale translation", valueFor(translationMap([aiRow]), "section:s1:body", { approvedOnly: true, fresh: true }, "Our long story") === null)
  check("the merchant's own is never Storelib AI's to rewrite", !aiMayWrite(mine, "Hello there") && !aiMayWrite(mine, "Hello"))
  check("it stays on the website as written and is flagged for review", valueFor(translationMap([mine]), "section:s1:heading", { approvedOnly: true, fresh: true }, "Hello there") === "Salut" && needsReview(mine, "Hello there"))
  check("the sidebar badges: Auto, Updating, Edited, Original changed", state(aiRow, "Our story") === "auto" && state(aiRow, "Our long story") === "updating" && state(mine, "Hello") === "edited" && state(mine, "Hello there") === "outdated")
  check("nothing written yet: Not translated; marked Don't translate: Kept as written", state(undefined, "Hi") === "missing" && state(undefined, "Hi", true) === "excluded" && state(mine, "Hello", true) === "edited")

  console.log("\nThe creator edits Romanian (a translation)")
  const sidebar = read("components/website-builder/editor/translation-editing.tsx")
  check("an edit is saved as the merchant's own (no ai flag), for the original as it is now", /items: \[\{ key, value, source, approved: true, rich \}\]/.test(sidebar) && !/items: \[\{ key, value, source, approved: true, rich, ai/.test(sidebar))
  check("it lands on the canvas at once and is saved after a short pause, one text per write", /patch\(key, value\.trim\(\) \? \{ v: value, h: sourceHash\(source\) \} : null\)/.test(sidebar) && /const SAVE_AFTER_MS = 600/.test(sidebar) && /pagehide/.test(sidebar))
  check("a control echoing what it was given is not an edit (never turns Auto into Edited by itself)", /if \(\(now\?\.v \?\? ""\) === value\) return/.test(sidebar))
  check("a failed save puts back what was there and says why", /* Changed on purpose (round V8): the error read the way the loose push compile narrows it. */ /patch\(key, before \?\? null\)\s*mark\(key, undefined, (r\.error|\(r as \{ error: string \}\)\.error)\)/.test(sidebar))
  const press = read("lib/markets/translation-press.ts")
  check("Reset to automatic replaces the merchant's own only on their press, and only with a translation that came back", /keepManual: !opts\.replaceManual/.test(press) && /if \(drafts\.size === 0\) return \{ ok: false/.test(press) && /replaceManual: replace/.test(sidebar))
  check("Translate now on a text with none never touches one the merchant wrote", /opts\.replaceManual \|\| map\.get\(i\.key\)\?\.source !== "manual"/.test(press))
  check("Keep mine keeps their words, stamped for the new original", /keepMine[\s\S]{0,400}patch\(key, \{ v: row\.v, h: sourceHash\(source\) \}\)/.test(sidebar))

  console.log("\nTranslation memory: the same words in the same language are reused, no call")
  const rows = [row("menu:main:0", "Magazin", "Shop", { source: "ai" }), row("section:s9:title", "Cumpără", "Buy", { source: "manual" })]
  const memory = reusableTranslations(rows)
  check("by the original's hash, the merchant's own first", memory.get(sourceHash("Shop")) === "Magazin" && memory.get(sourceHash("Buy")) === "Cumpără")
  const reused = await draftReusing([{ key: "menu:footer:0", source: "Shop" }, { key: "section:s2:cta", source: "Buy" }], rows, "en", "ro", "Mugs")
  check("every text already known: answered from memory with no translator at all", !reused.unavailable && reused.reused === 2 && reused.drafts.get("menu:footer:0") === "Magazin")
  check("a reset reuses only Storelib AI's own, never another of the merchant's words passed off as automatic", /r\.source === "ai"/.test(press) && /!keys\.has\(r\.key\)/.test(press))
  check("an open model's memory is never used where it dropped a word kept as written", /if \(!keep\.every\(\(k\) => !t\.includes\(k\) \|\| v\.includes\(k\)\)\) done\.delete\(t\)/.test(read("lib/markets/open-translate.ts")))

  console.log("\nGlossary and Don't translate")
  const rules: TranslationRules = rulesFrom({ glossary: [{ term: "Storelib Pro", keep: true }, { term: "Gift card", to: { ro: "Card cadou", fr: "Carte cadeau" } }, { term: "x" }], noTranslate: ["section:s1:heading", "bad key"], keepProductNames: true })
  check("terms are checked: too short dropped, a term with no translation is kept as written", rules.glossary.length === 2 && rules.glossary[0].keep === true && rules.glossary[1].to?.ro === "Card cadou")
  check("only real keys are kept", rules.noTranslate.length === 1 && rules.noTranslate[0] === "section:s1:heading")
  check("excluded: a listed key, and every product title when product names are kept", isExcluded(rules, "section:s1:heading") && isExcluded(rules, "product:a0000000-0000-4000-8000-0000000000a1:title") && !isExcluded(rules, "product:a0000000-0000-4000-8000-0000000000a1:description") && !isExcluded(null, "section:s1:heading"))
  check("glossary terms are kept away from the translator, only where the text has them", JSON.stringify(protectedTerms(rules, "ro", "Buy a Gift card for Storelib Pro")) === JSON.stringify(["Storelib Pro", "Gift card"]) && protectedTerms(rules, "de", "Gift card").length === 0)
  const parts = cut("Buy a Gift card for Storelib Pro today", ["Mugs", ...protectedTerms(rules, "ro")])
  check("cut keeps them as fixed parts", !wordsOf(parts).some((w) => /Gift card|Storelib Pro/.test(w)))
  const machine = joinParts(parts, (w) => ({ "Buy a": "Cumpără un", for: "pentru", today: "azi" })[w])
  check("and the fixed translation goes in afterwards; a kept term stays as written", applyGlossary(machine ?? "", rules, "ro") === "Cumpără un Card cadou pentru Storelib Pro azi")
  check("never inside another word, never inside a tag", applyGlossary('<a title="Gift cards">Gift card</a> Gift cardigan', rules, "ro") === '<a title="Gift cards">Card cadou</a> Gift cardigan')
  check("a glossary that is too long is refused", validateRules({ glossary: Array.from({ length: 201 }, (_, i) => ({ term: `term ${i}` })) }).ok === false)
  const ai = read("lib/markets/translate-ai.ts")
  check("both translators follow it: the open models through keep, the chat model through its rules, then applyGlossary", /keep: \[shopName, \.\.\.terms\]/.test(ai) && /Keep these terms exactly as written/.test(ai) && (ai.match(/applyGlossary\(/g) ?? []).length >= 2)
  const job = read("lib/markets/auto-translate.ts")
  check("the automatic run and Translate the rest skip excluded texts and pass the glossary", /!isExcluded\(rules, t\.key\) && aiMayWrite/.test(job) && /\{ deadlineAt, rules \}/.test(job) && /\{ deadlineAt, rules \}/.test(press))

  /* Marking a text Don't translate removes Storelib AI's translations of it, never the merchant's. */
  const calls: string[] = []
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    const self = new Proxy(q, {
      get(_t, prop: string) {
        if (prop === "then") {
          const result = table === "store_localization:select" ? { data: { translation_rules: { noTranslate: [] } }, error: null } : table === "store_localization:update" ? { data: [{ creator_id: "c1" }], error: null } : { data: [{ locale: "ro" }, { locale: "fr" }], error: null }
          return (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok)
        }
        return (...args: unknown[]) => {
          calls.push(`${table}.${prop}(${JSON.stringify(args)})`)
          if (prop === "maybeSingle") return Promise.resolve(table === "store_localization:select" ? { data: { translation_rules: { noTranslate: [] } }, error: null } : { data: null, error: null })
          return self
        }
      },
    })
    return self
  }
  const db = {
    from: (t: string) => ({
      select: (...a: unknown[]) => {
        calls.push(`${t}.select(${JSON.stringify(a)})`)
        return chain(`${t}:select`)
      },
      update: (v: unknown) => {
        calls.push(`${t}.update(${JSON.stringify(v)})`)
        return chain(`${t}:update`)
      },
      delete: () => {
        calls.push(`${t}.delete()`)
        return chain(`${t}:delete`)
      },
    }),
  }
  let saved: Awaited<ReturnType<typeof saveTranslationRules>> | null = null
  try {
    saved = await saveTranslationRules(db, "c1", { noTranslate: ["section:s1:heading"], glossary: [] })
  } catch (e) {
    /* revalidateTag outside a request: the writes before it are what is checked. */
    if (!/static generation store|revalidate/i.test(String(e))) throw e
  }
  check("newly excluded: Storelib AI's rows for that key deleted, the merchant's left", calls.some((c) => c.startsWith("site_translations.delete()")) && calls.some((c) => c === 'site_translations:delete.eq(["source","ai"])') && calls.some((c) => c.includes('in(["key",["section:s1:heading"]])')), calls.filter((c) => c.startsWith("site_translations")))
  check("saved with an update, never an insert that could change the store's default language", calls.some((c) => c.startsWith("store_localization.update(")) && !calls.some((c) => /upsert|insert/.test(c)) && (saved === null || saved.ok))

  console.log("\nThe theme editor's sidebar")
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("every setting goes through FieldEditor, which writes the translation in another language", /const translating = useTranslationEditing\(\)\s*const keyFor = useTranslationScope\(\)\s*if \(translating\) \{\s*return <TranslatedFieldEditor/.test(editor))
  check("a section's texts by the key the website lays over", /<TranslationScope keyFor=\{\(id\) => translationSectionKey\(section\.id, id\)\}>/.test(editor))
  check("a block's too, and a block the section has not saved yet has none", /const keyFor = virtual \? null : \(id: string\) => translationBlockKey\(section\.id, block\.id, id\)/.test(editor))
  check("the theme's texts as theme:<id>, never the store's name", /const themeTextKey = \(id: string\) => \(id === "brand_name" \? null : `theme:\$\{id\}`\)/.test(editor) && (editor.match(/<TranslationScope keyFor=\{themeTextKey\}>/g) ?? []).length === 2)
  check("what is not words is the same in every language and cannot be changed from there", /<SharedInAllLanguages><SectionDesignPanel/.test(editor) && (editor.match(/<SharedInAllLanguages>\s*<SectionColorSetting/g) ?? []).length === 2 && /<SharedInAllLanguages>\s*<ColorsPanel/.test(editor) && /<SharedInAllLanguages>\s*<TypographyPanel/.test(editor) && (editor.match(/<SharedInAllLanguages>\s*<BrandingTabPanel/g) ?? []).length === 2 && /* Changed on purpose (round AH, the owner: in another language only texts could be edited): the rest stays editable for every language, and only the menus' link titles, translated in Settings, are locked. */ /<SharedInAllLanguages locked note=\{tt\("Menu links are translated/.test(editor) && /<div inert className="pointer-events-none select-none opacity-50">/.test(sidebar))
  check("a theme setting shell dims only what is not words", /const shared = !isWordsField\(field\) && field\.type !== "color"/.test(editor) && (editor.match(/<ThemeFieldShell key=\{field\.id\} field=\{field\}>/g) ?? []).length === 2)
  check("the field shows its badge, the original as a hint, and the actions", /<TranslationBadge state=\{state\} \/>/.test(sidebar) && /data-translation-source=""/.test(sidebar) && /data-translation-reset=""/.test(sidebar) && /data-translation-keep=""/.test(sidebar) && /data-translation-accept=""/.test(sidebar) && /data-translation-auto=""/.test(sidebar) && /data-translation-exclude=/.test(sidebar))
  check("the same keys and the same words test as the website (isWordsField, shownText)", /keyFor && isWordsField\(field\) \? keyFor\(field\.id\) : null/.test(sidebar) && /const source = key \? shownText\(field, value\) : null/.test(sidebar))
  check("and the canvas previews the language being edited: one state for both", /const translationEditing = useTranslationEditor\(previewLang\)/.test(editor) && (editor.match(/<TranslationEditingProvider value=\{translationEditing\}>\{renderSidebarContent\(\)\}<\/TranslationEditingProvider>/g) ?? []).length === 2)

  console.log("\nThe language and currency switch in the builder")
  check("in the top bar beside the page switcher on a desktop", /\{!isMobileView && <PreviewLocaleButton model=\{localeModel\} \/>\}\s*\n\s*\{!isMobileView && \(\s*<PageSwitcher/.test(editor))
  check("at the top of the sidebar and of a phone's sheet", (editor.match(/<SidebarLanguageBar model=\{localeModel\} editing=\{translationEditing\} \/>/g) ?? []).length === 2)
  check("and in Website settings › General", /preview: localeModel,/.test(editor) && /<PreviewLocaleSelects model=\{ctx\.preview\} tone="dark" \/>/.test(read("components/website-builder/website-settings/general.tsx")))
  const sw = read("components/website-builder/preview-locale-switch.tsx")
  check("every language including hidden ones, and the currencies a visitor can be shown", /tt\("\{name\} \(hidden\)"/.test(sw) && /markets: marketOptions\.map/.test(editor))
  check("never the live site: no cookie, no address", !/document\.cookie|location\.assign|location\.href\s*=/.test(sw))
  check("remembered per tab and website", /sessionStorage\.setItem\(remembered\(installId\), next\)/.test(read("components/website-builder/use-preview-language.ts")) && /sessionStorage\.setItem\(`wb-preview-market:\$\{installId\}`, id\)/.test(read("components/website-builder/use-preview-market.ts")))

  console.log("\nReview list in Settings")
  const sheet = read("components/app/settings/translate-sheet.tsx")
  check("counts per filter: To do, Needs review, Edited", /tt\("To do \(\{count\}\)"/.test(sheet) && /tt\("Needs review \(\{count\}\)"/.test(sheet) && /tt\("Edited \(\{count\}\)"/.test(sheet))
  check("quick actions: Keep as is, Use automatic, Reset to automatic, and the field to edit", /tt\("Keep as is"\)/.test(sheet) && /tt\("Use automatic"\)/.test(sheet) && /tt\("Reset to automatic"\)/.test(sheet) && /replaceManual: true/.test(sheet))
  check("the summary counts the merchant's own and the ones kept as written", /row\.edited\+\+/.test(read("app/api/store/translations/route.ts")) && /row\.excluded\+\+/.test(read("app/api/store/translations/route.ts")))

  console.log("\nCost and safety")
  const auto = read("app/api/store/translations/auto/route.ts")
  check("one press translates up to 25 named texts, rate limited, owner only", /PER_FIELD_PRESS = 25/.test(press) && /bucket: "site-translations-field"/.test(auto) && /shopCaller\("website"\)/.test(auto))
  check("the translator's keys stay on the server: nothing client side reads them", !/OPENAI_API_KEY|TRANSLATE_LLM_KEY|HF_TOKEN|DEEPL/.test(sidebar + sw + sheet + read("components/app/settings/translation-glossary.tsx")))
  check("the rules are saved by the server for the caller's own store", /saveTranslationRules\(c\.db, c\.creatorId, body\.rules\)/.test(read("app/api/store/translations/rules/route.ts")))
  const sql = read("supabase/sql/run-now/213_translation_rules.sql")
  check("part 213: one column on part 136's server only table, checked, idempotent", /ADD COLUMN IF NOT EXISTS translation_rules jsonb NOT NULL DEFAULT '\{\}'::jsonb/.test(sql) && /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'store_localization_translation_rules_check'\)/.test(sql) && /REVOKE ALL ON public\.store_localization FROM PUBLIC, anon, authenticated/.test(sql) && /p213_translation_rules/.test(read("supabase/sql/run-now/99_check_after.sql")))
  const widget = read("lib/markets/widget-words.ts")
  check("one small API for widgets' words (K6): storeLanguages, translateUiString(s), over the live site's cached rows", /export async function storeLanguages/.test(widget) && /export async function translateUiString\(/.test(widget) && /export async function translateUiStrings/.test(widget) && /cachedTranslations\(creatorId, code\)/.test(widget) && /import "server-only"/.test(widget))
  check("K6 and others read languages through the existing helpers (no second list)", /export function editorLanguages/.test(read("lib/markets/model.ts")) && /export function publishedLanguages/.test(read("lib/markets/model.ts")))

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

void main()
