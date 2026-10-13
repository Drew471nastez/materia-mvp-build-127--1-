/**
 * Translations that keep their word (lib/markets): what the merchant writes
 * is never replaced by Storelib AI, an approved AI draft stays labelled as
 * AI's, a translation stops showing once its original changes, collections
 * show in the page's language, and a card's description is the translated
 * one, made plain as the card's own is, in the editor and on the live site.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { localizeCards, localizeRecord, localizeSections, sourceHash, translationMap, valueFor, type TranslationRow } from "@/lib/markets/translate"
import { saveTranslations } from "@/lib/markets/server"
import { plainDescription } from "@/lib/products/plain-description"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const P1 = "a0000000-0000-4000-8000-0000000000a1"
const row = (key: string, value: string, source: string, extra: Partial<TranslationRow> = {}): TranslationRow => ({ key, value, sourceHash: sourceHash(source), status: "approved", source: "manual", ...extra })

async function main() {
  console.log("\nA translation shows only while it was written for the original as it is")
  const map = translationMap([row("section:s1:heading", "Bonjour", "Hello"), row(`product:${P1}:title`, "Tasse", "Mug")])
  check("the same original: shown", valueFor(map, "section:s1:heading", { approvedOnly: true, fresh: true }, "Hello") === "Bonjour")
  check("the original changed since: the new original shows instead", valueFor(map, "section:s1:heading", { approvedOnly: true, fresh: true }, "Hello there") === null)
  check("without fresh (the Translate sheet), it is still there to see and update", valueFor(map, "section:s1:heading", { approvedOnly: true }, "Hello there") === "Bonjour")
  const sections = [{ id: "s1", type: "rich_text", settings: { heading: "Hello there" }, blocks: [] }] as unknown as SectionInstance[]
  const laid = localizeSections(sections, map, () => [{ id: "heading", type: "text", label: "Heading" }] as never, () => undefined, { approvedOnly: true, fresh: true })
  check("a section whose heading was edited shows the edit, not the old translation", (laid[0].settings as { heading: string }).heading === "Hello there")
  check("a record whose title is unchanged is translated", localizeRecord({ title: "Mug" }, `product:${P1}`, ["title"], map, { approvedOnly: true, fresh: true }).title === "Tasse")
  check("the live site and imported themes lay them over this way", /const opts = \{ approvedOnly: true, fresh: true \}/.test(read("lib/markets/live.ts")) && /const opts = \{ approvedOnly: true, fresh: true \}/.test(read("lib/markets/compat.ts")))
  check("and so does the editor's preview, so both agree", (read("app/website-builder/editor/[installId]/page.tsx").match(/approvedOnly: true, fresh: true/g) ?? []).length >= 3 && /const opts = \{ approvedOnly: true, fresh: true \}/.test(read("components/website-builder/compat/compat-canvas.tsx")))

  console.log("\nA card's description")
  const html = "<p>Hand <strong>thrown</strong> stoneware.</p><p>Dishwasher safe.</p>"
  const cardMap = translationMap([row(`product:${P1}:title`, "Tasse", "Mug"), row(`product:${P1}:description`, "<p>Grès <strong>tourné</strong> à la main.</p><p>Va au lave-vaisselle.</p>", html)])
  const [card] = localizeCards([{ id: P1, settings: { title: "Mug", description: plainDescription(html), price: "$40.00" } }], cardMap, { approvedOnly: true, fresh: true })
  const s = card.settings as { title: string; description: string; price: string }
  check("the title, translated", s.title === "Tasse")
  check("the description, translated and plain like the card's own (never HTML in a card)", s.description === "Grès tourné à la main.\nVa au lave-vaisselle.", s.description)
  check("the price untouched", s.price === "$40.00")
  check("the live site's cards use the same function as the editor's", /const worded = localizeCards\(\[c\], map, opts\)\[0\]/.test(read("lib/markets/live.ts")) && /localizeCards\(\[\{ id: c\.id, settings: c\.settings \}\], map, opts\)/.test(read("lib/markets/compat.ts")))

  console.log("\nCollections in the page's language")
  const live = read("lib/markets/live.ts")
  check("the live site translates a collection's name and description", /collection\(c\) \{/.test(live) && /`collection:\$\{c\.id\}`/.test(live))
  check("its own page uses them", /const collection = localizer \? localizer\.collection\(inIt\.collection\) : inIt\.collection/.test(read("app/(site)/w/[username]/collections/[handle]/page.tsx")))
  check("every live page hands its language to the collections it lists", ["search/page.tsx", "products/page.tsx", "collections/page.tsx", "render-account.tsx", "collections/[handle]/page.tsx"].every((f) => /\{ cached: true, localizer \}/.test(read(`app/(site)/w/[username]/${f}`))))
  check("  where the page's data lays them over", /collections: collections && opts\.localizer \?/.test(read("lib/website-builder/published-site.ts")))
  check("imported themes too", /`collection:\$\{c\.id\}`/.test(read("lib/markets/compat.ts")))

  console.log("\nStorelib AI never replaces what the merchant wrote")
  const draft = read("app/api/store/translations/draft/route.ts")
  check("the merchant's own are never sent to AI, outdated or not", /if \(row\?\.source === "manual"\) return false/.test(draft))
  check("its write keeps the merchant's, read again just before writing", /saveTranslations\(c\.db, c\.creatorId, locale, items, c\.userId, \{ keepManual: true \}\)/.test(draft))
  /* The write, against a table where the merchant saved "Bonjour" a moment ago. */
  const written: Record<string, unknown>[] = []
  const db = {
    from: () => {
      const q: Record<string, unknown> = {}
      for (const m of ["select", "eq", "in", "delete"]) q[m] = () => q
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ key: "section:s1:heading" }], error: null }).then(ok)
      q.upsert = (rows: Record<string, unknown>[]) => { written.push(...rows); return Promise.resolve({ error: null }) }
      return q
    },
  }
  const out = await saveTranslations(db as never, "c1", "fr", [{ key: "section:s1:heading", value: "Salut", source: "Hello", approved: false, ai: true }, { key: "section:s2:heading", value: "Merci", source: "Thanks", approved: false, ai: true }], null, { keepManual: true }).catch((e) => ({ ok: false, error: String(e) }))
  check("the one the merchant wrote is left, the other is drafted", written.length === 1 && written[0].key === "section:s2:heading" && written[0].source === "ai", { written, out })
  const sheet = read("components/app/settings/translate-sheet.tsx")
  check("an AI draft approved as it stands stays Storelib AI's; edited, it is the merchant's", /ai: i\.ai && !changed\.includes\(i\.key\)/.test(sheet))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main()
