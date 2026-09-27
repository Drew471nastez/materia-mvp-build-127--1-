/**
 * Starting from a layout, switching, writing over it and going back to
 * blank (lib/email-campaigns/layouts.ts), as the composer uses it. The
 * browser side of the same story is scripts/check-email-composer.mjs.
 */
import { appliedLayout, blankBlocks, bodyKey, detectLayout, envelopeAfter, layoutEdited, needsConfirm, readAppliedLayout, trimTrailingEmpty } from "@/lib/email-campaigns/layouts"
import { starterDraft, STARTERS } from "@/lib/email-campaigns/starters"
import { newBlock, type Block } from "@/lib/email-campaigns/blocks"
import { cleanStoredHtml, toEditorHtml } from "@/lib/rich-text/html"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

const ctx = { name: "Ana & Co", storeUrl: "https://storelib.com/ana" }
const sale = starterDraft("sale", ctx)
const saleApplied = appliedLayout("sale", sale)

console.log("\nAs it came")
check("a layout just put in is not edited", !layoutEdited(saleApplied, sale.blocks))
check("new block ids do not count as an edit", !layoutEdited(saleApplied, starterDraft("sale", ctx).blocks))
const passedThroughEditor = sale.blocks.map((b) => (b.type === "rich" ? { ...b, html: cleanStoredHtml(toEditorHtml(b.html), { blocks: true }) } : b))
check("nor does the editor writing the same words back (a click in and out)", !layoutEdited(saleApplied, passedThroughEditor))
check("nor the empty text block the caret waits in at the end", !layoutEdited(saleApplied, [...sale.blocks, newBlock("rich")]))
check("every layout is stable through the editor's cleaning", STARTERS.every((s) => {
  const d = starterDraft(s.id, ctx)
  const again = d.blocks.map((b) => (b.type === "rich" ? { ...b, html: cleanStoredHtml(toEditorHtml(b.html), { blocks: true }) } : b))
  return bodyKey(again) === bodyKey(d.blocks)
}))

console.log("\nWritten over")
const typed: Block[] = sale.blocks.map((b, i) => (i === 0 && b.type === "rich" ? { ...b, html: b.html.replace("20% off everything", "30% off everything") } : b))
check("a changed word is an edit", layoutEdited(saleApplied, typed))
const relabelled: Block[] = sale.blocks.map((b) => (b.type === "button" ? { ...b, label: "Buy now" } : b))
check("so is a changed button", layoutEdited(saleApplied, relabelled))
check("so is a block added", layoutEdited(saleApplied, [...sale.blocks, newBlock("divider")]))

console.log("\nWhen a change asks first")
check("an empty email never asks", !needsConfirm(null, blankBlocks()) && !needsConfirm(saleApplied, blankBlocks()))
check("a layout as it came never asks", !needsConfirm(saleApplied, sale.blocks))
check("a layout written over asks", needsConfirm(saleApplied, typed))
check("an email written from nothing asks", needsConfirm(null, [newBlock("rich", { html: "<p>My own words</p>" })]))

console.log("\nThe subject and preview text")
const news = starterDraft("newsletter", ctx)
let env = envelopeAfter({ subject: "", previewText: "" }, null, sale)
check("an empty envelope takes the layout's", env.subject === sale.subject && env.previewText === sale.previewText, JSON.stringify(env))
env = envelopeAfter({ subject: sale.subject, previewText: sale.previewText }, saleApplied, news)
check("switching layouts carries the new layout's lines where the old one's were", env.subject === news.subject && env.previewText === news.previewText, JSON.stringify(env))
env = envelopeAfter({ subject: "Studio news", previewText: sale.previewText }, saleApplied, news)
check("a typed subject stays, the layout's preview text moves on", env.subject === "Studio news" && env.previewText === news.previewText, JSON.stringify(env))
env = envelopeAfter({ subject: sale.subject, previewText: "Mine" }, saleApplied, null)
check("going blank empties the layout's subject and keeps a typed preview", env.subject === "" && env.previewText === "Mine", JSON.stringify(env))
env = envelopeAfter({ subject: "Hello", previewText: "" }, null, starterDraft("letter", ctx))
check("the Letter, which has no subject, never empties one somebody typed", env.subject === "Hello", JSON.stringify(env))

console.log("\nA draft opened again")
check("an email still exactly a layout is known as it", detectLayout(passedThroughEditor, ctx)?.id === "sale")
check("one written over is not guessed at", detectLayout(typed, ctx) === null)
check("an empty one has none", detectLayout(blankBlocks(), ctx) === null)
check("a stored record is read back", readAppliedLayout(JSON.parse(JSON.stringify(saleApplied)))?.id === "sale")
check("a stored record that is not one is refused", readAppliedLayout({ id: "birthday", body: "", subject: "", previewText: "" }) === null && readAppliedLayout("sale") === null && readAppliedLayout(null) === null)

console.log("\nBlank")
check("blank is one empty text block", blankBlocks().length === 1 && blankBlocks()[0].type === "rich")
check("trailing empty text blocks are trimmed, one is always left", trimTrailingEmpty([newBlock("rich"), newBlock("rich")]).length === 1)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
